/**
 * MuseFlow Desktop - ComfyUI 工作流注入器
 * 自动将生成的文件注入到 ComfyUI 工作流中
 */

const fs = require('fs');
const path = require('path');

class WorkflowInjector {
  constructor() {
    // 工作流模板路径：只支持两个版本
    this.workflowTemplates = {
      normal: '/Users/zlw/Desktop/MuseFlow-Desktop/InfiniteTalk20251121.json',  // 普通版
      master: '/Users/zlw/Desktop/MuseFlow-Desktop/最终版_AI歌手大师版+humo+infinite talk+lynx多分镜.json'  // 大师版
    };
    // 默认工作流类型
    this.defaultWorkflowType = 'normal';
  }

  /**
   * 注入参数到工作流
   * @param {Object} config - 配置对象
   * @param {string} config.imagePath - 首帧图路径
   * @param {string} config.audioPath - 音频路径
   * @param {string} config.prompt - 正向提示词
   * @param {string} config.workflowType - 'full' 或 'simple'
   * @returns {Object} - 注入后的工作流
   */
  inject(config) {
    const workflowType = config.workflowType || this.defaultWorkflowType;
    const templatePath = this.workflowTemplates[workflowType] || this.workflowTemplates[this.defaultWorkflowType];
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`工作流模板不存在: ${templatePath}`);
    }

    // 读取工作流
    const workflow = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    
    console.log(`正在注入参数到 ${config.workflowType} 工作流...`);
    
    // 修复节点类型名称（处理大小写不匹配）
    this._fixNodeTypeNames(workflow);
    
    // 根据工作流类型选择注入策略
    if (workflow.nodes) {
      // UI 格式工作流 - 先转换为 API 格式
      console.log('  检测到 UI 格式工作流，正在转换为 API 格式...');
      const apiWorkflow = this._convertUIToAPI(workflow);
      this._injectToAPIFormat(apiWorkflow, config);
      return apiWorkflow;
    } else {
      // API 格式工作流
      this._injectToAPIFormat(workflow, config);
      return workflow;
    }
  }

  /**
   * 将 UI 格式工作流转换为 API 格式
   * UI 格式: { nodes: [...], links: [...] }
   * API 格式: { "node_id": { inputs: {...}, class_type: "..." } }
   */
  _convertUIToAPI(uiWorkflow) {
    const apiWorkflow = {};
    const nodes = uiWorkflow.nodes || [];
    
    nodes.forEach(node => {
      const nodeId = node.id.toString();
      const nodeType = node.type || node.class_type;
      
      if (!nodeType) {
        console.log(`  ⚠️  跳过节点 ${nodeId}: 缺少类型信息`);
        return;
      }
      
      // 创建 API 格式的节点
      apiWorkflow[nodeId] = {
        class_type: nodeType,
        inputs: {}
      };
      
      // 转换 widgets_values 到 inputs
      if (node.widgets_values && node.inputs) {
        node.inputs.forEach((input, index) => {
          if (input.widget && input.widget.name) {
            const widgetName = input.widget.name;
            if (node.widgets_values[index] !== undefined) {
              apiWorkflow[nodeId].inputs[widgetName] = node.widgets_values[index];
            }
          }
        });
      }
      
      // 处理 links (连接关系)
      if (node.inputs) {
        node.inputs.forEach(input => {
          if (input.link !== undefined) {
            // 找到对应的 link
            const link = this._findLink(uiWorkflow.links, input.link);
            if (link) {
              // link: [id, fromNode, fromSlot, toNode, toSlot, type]
              const fromNodeId = link[1].toString();
              const fromSlot = link[2];
              apiWorkflow[nodeId].inputs[input.name] = [fromNodeId, fromSlot];
            }
          }
        });
      }
    });
    
    console.log(`  ✅ 转换完成: ${Object.keys(apiWorkflow).length} 个节点`);
    return apiWorkflow;
  }
  
  /**
   * 在工作流的 links 中查找指定 id 的 link
   */
  _findLink(links, linkId) {
    if (!links) return null;
    return links.find(link => link[0] === linkId);
  }

  /**
   * 注入到 UI 格式工作流
   */
  _injectToUIFormat(workflow, config) {
    const nodes = workflow.nodes || [];
    
    // 收集所有的 TextEncode 节点（用于多分镜注入）
    const textEncodeNodes = [];
    
    nodes.forEach(node => {
      const nodeType = node.type || node.class_type;
      
      // 1. 注入首帧图 - LoadImage 节点
      if (nodeType === 'LoadImage' && node.widgets_values) {
        // 通常 LoadImage 的第一个 widget 是图像路径
        if (node.widgets_values.length > 0) {
          const oldValue = node.widgets_values[0];
          node.widgets_values[0] = config.imagePath;
          console.log(`  ✅ 节点 ${node.id} (LoadImage): ${oldValue} -> ${config.imagePath}`);
        }
      }
      
      // 2. 注入音频 - LoadAudio 节点
      else if (nodeType === 'LoadAudio' && node.widgets_values) {
        if (node.widgets_values.length > 0) {
          const oldValue = node.widgets_values[0];
          node.widgets_values[0] = config.audioPath;
          console.log(`  ✅ 节点 ${node.id} (LoadAudio): ${oldValue} -> ${config.audioPath}`);
        }
      }
      
      // 3. 收集 TextEncode 节点（用于后续多分镜注入）
      else if ((nodeType === 'WanVideoTextEncode' || nodeType === 'WanVideoTextEncodeCached' || 
                nodeType === 'CLIPTextEncode') && node.widgets_values) {
        textEncodeNodes.push(node);
      }
    });
    
    // 4. 注入提示词（支持多分镜）
    this._injectPromptsToTextEncodeNodes(textEncodeNodes, config);
  }
  
  /**
   * 注入提示词到 TextEncode 节点（支持多分镜）
   */
  _injectPromptsToTextEncodeNodes(nodes, config) {
    const hasStoryboard = config.storyboard && config.storyboard.length > 0;
    
    if (hasStoryboard) {
      console.log(`  🎬 多分镜模式：找到 ${nodes.length} 个 TextEncode 节点，注入 ${config.storyboard.length} 个分镜提示词`);
    }
    
    nodes.forEach((node, index) => {
      const nodeType = node.type || node.class_type;
      
      // 多分镜模式：按顺序注入不同的提示词
      if (hasStoryboard && index < config.storyboard.length) {
        const shot = config.storyboard[index];
        const promptText = shot.prompt || config.prompt;
        
        if (nodeType === 'WanVideoTextEncode' && node.widgets_values.length >= 2) {
          node.widgets_values[0] = promptText;
          node.widgets_values[1] = this._getNegativePrompt();
          console.log(`  ✅ 节点 ${node.id} (WanVideoTextEncode): 已注入镜头${index + 1}提示词`);
        } else if (nodeType === 'WanVideoTextEncodeCached' && node.widgets_values.length >= 4) {
          node.widgets_values[2] = promptText;
          node.widgets_values[3] = this._getNegativePrompt();
          console.log(`  ✅ 节点 ${node.id} (WanVideoTextEncodeCached): 已注入镜头${index + 1}提示词`);
        } else if (nodeType === 'CLIPTextEncode' && node.widgets_values.length >= 1) {
          // CLIPTextEncode 通常只有一个 text widget
          node.widgets_values[0] = promptText;
          console.log(`  ✅ 节点 ${node.id} (CLIPTextEncode): 已注入镜头${index + 1}提示词`);
        }
      }
      // 单镜头模式或超出分镜数量：注入相同的基础提示词
      else {
        if (nodeType === 'WanVideoTextEncode' && node.widgets_values.length >= 2) {
          node.widgets_values[0] = config.prompt;
          node.widgets_values[1] = this._getNegativePrompt();
          console.log(`  ✅ 节点 ${node.id} (WanVideoTextEncode): 已注入基础提示词`);
        } else if (nodeType === 'WanVideoTextEncodeCached' && node.widgets_values.length >= 4) {
          node.widgets_values[2] = config.prompt;
          node.widgets_values[3] = this._getNegativePrompt();
          console.log(`  ✅ 节点 ${node.id} (WanVideoTextEncodeCached): 已注入基础提示词`);
        } else if (nodeType === 'CLIPTextEncode' && node.widgets_values.length >= 1) {
          node.widgets_values[0] = config.prompt;
          console.log(`  ✅ 节点 ${node.id} (CLIPTextEncode): 已注入基础提示词`);
        }
      }
    });
  }

  /**
   * 注入到 API 格式工作流
   */
  _injectToAPIFormat(workflow, config) {
    // 收集所有的 TextEncode 节点（用于多分镜注入）
    const textEncodeNodes = [];
    
    for (const [nodeId, node] of Object.entries(workflow)) {
      const nodeType = node.class_type;
      
      // 1. 注入首帧图
      if (nodeType === 'LoadImage' && node.inputs) {
        if (node.inputs.image !== undefined) {
          node.inputs.image = config.imagePath;
          console.log(`  ✅ 节点 ${nodeId} (LoadImage): -> ${config.imagePath}`);
        }
      }
      
      // 2. 注入音频
      else if (nodeType === 'LoadAudio' && node.inputs) {
        if (node.inputs.audio !== undefined) {
          node.inputs.audio = config.audioPath;
          console.log(`  ✅ 节点 ${nodeId} (LoadAudio): -> ${config.audioPath}`);
        }
      }
      
      // 3. 收集 TextEncode 节点
      else if ((nodeType === 'WanVideoTextEncode' || nodeType === 'CLIPTextEncode' ||
                nodeType === 'WanVideoTextEncodeCached') && node.inputs) {
        textEncodeNodes.push({ nodeId, node, nodeType });
      }
    }
    
    // 4. 注入提示词（支持多分镜）
    this._injectPromptsToAPITextEncodeNodes(textEncodeNodes, config);
  }
  
  /**
   * 注入提示词到 API 格式的 TextEncode 节点（支持多分镜）
   */
  _injectPromptsToAPITextEncodeNodes(nodes, config) {
    const hasStoryboard = config.storyboard && config.storyboard.length > 0;
    
    if (hasStoryboard) {
      console.log(`  🎬 多分镜模式：找到 ${nodes.length} 个 TextEncode 节点，注入 ${config.storyboard.length} 个分镜提示词`);
    }
    
    nodes.forEach((item, index) => {
      const { nodeId, node, nodeType } = item;
      
      // 多分镜模式：按顺序注入不同的提示词
      if (hasStoryboard && index < config.storyboard.length) {
        const shot = config.storyboard[index];
        const promptText = shot.prompt || config.prompt;
        
        if (node.inputs.text !== undefined) {
          node.inputs.text = promptText;
          console.log(`  ✅ 节点 ${nodeId} (${nodeType}): 已注入镜头${index + 1}提示词`);
        }
        if (node.inputs.negative !== undefined) {
          node.inputs.negative = this._getNegativePrompt();
        }
      }
      // 单镜头模式或超出分镜数量：注入相同的基础提示词
      else {
        if (node.inputs.text !== undefined) {
          node.inputs.text = config.prompt;
          console.log(`  ✅ 节点 ${nodeId} (${nodeType}): 已注入基础提示词`);
        }
        if (node.inputs.negative !== undefined) {
          node.inputs.negative = this._getNegativePrompt();
        }
      }
    });
  }

  /**
   * 获取负面提示词
   */
  _getNegativePrompt() {
    return '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，' +
           '画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，' +
           '残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，' +
           '毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，' +
           '三条腿，背景人很多，倒着走';
  }

  /**
   * 替换/修复节点类型映射
   * 将工作流中的节点名映射到已安装的节点名（处理大小写差异）
   */
  _nodeTypeMapping = {
    // 原工作流节点名: 已安装的节点名
    'FaceSegmentation': 'faceSegmentation',  // 大小写差异
    'AudioSeparation': 'AudioSeparation',    // 保留，检查是否已安装
    'RecordAudio': 'RecordAudio'             // 保留
  };

  /**
   * 修复节点类型名称（处理大小写不匹配问题）
   */
  _fixNodeTypeNames(workflow) {
    const nodes = workflow.nodes || [];
    let fixedCount = 0;
    
    nodes.forEach(node => {
      const nodeType = node.type || node.class_type || '';
      
      // 检查是否需要替换
      if (this._nodeTypeMapping[nodeType]) {
        const newType = this._nodeTypeMapping[nodeType];
        if (nodeType !== newType) {
          console.log(`  🔧 修复节点类型: ${nodeType} -> ${newType}`);
          node.type = newType;
          if (node.class_type) {
            node.class_type = newType;
          }
          fixedCount++;
        }
      }
    });
    
    if (fixedCount > 0) {
      console.log(`  ✅ 已修复 ${fixedCount} 个节点类型名称`);
    }
    
    return workflow;
  }

  /**
   * 移除确实无法替代的节点（如 AudioSeparation 如果确实缺失）
   */
  _removeProblematicNodes(workflow) {
    const nodes = workflow.nodes || [];
    const links = workflow.links || [];
    
    // 这些节点如果确实缺失才移除
    const optionalRemoveTypes = ['AudioSeparation', 'AudioSep'];
    
    const removedNodeIds = new Set();
    
    nodes.forEach(node => {
      const nodeType = node.type || node.class_type || '';
      if (optionalRemoveTypes.some(type => nodeType.includes(type))) {
        // 暂时不移除，让用户自己决定是否需要这个功能
        console.log(`  ⚠️  发现可选节点: ${nodeType} (ID: ${node.id}) - 如果运行时报错再移除`);
      }
    });
    
    return workflow;
  }

  /**
   * 保存注入后的工作流
   */
  save(workflow, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), 'utf-8');
    console.log(`✅ 工作流已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * 生成可直接导入 ComfyUI 的完整配置包
   * 同时生成 API 格式（用于提交）和 UI 格式（用于界面加载）
   */
  generatePackage(config) {
    const timestamp = Date.now();
    const projectName = `museflow_project_${timestamp}`;
    const outputDir = path.join(require('os').homedir(), 'Documents', 'MuseFlow', 'projects', projectName);
    
    // 创建项目目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. 复制文件
    const files = {
      image: path.join(outputDir, 'frame.jpg'),
      audio: path.join(outputDir, 'audio.wav'),
      workflow: path.join(outputDir, `workflow_${config.workflowType}.json`),
      workflowUI: path.join(outputDir, `workflow_${config.workflowType}_ui.json`),
      config: path.join(outputDir, 'config.json')
    };

    fs.copyFileSync(config.imagePath, files.image);
    fs.copyFileSync(config.audioPath, files.audio);

    // 2. 读取原始 UI 格式工作流并注入参数
    const workflowType = config.workflowType || this.defaultWorkflowType;
    const templatePath = this.workflowTemplates[workflowType] || this.workflowTemplates[this.defaultWorkflowType];
    const uiWorkflow = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    
    // 修复节点类型名称（处理大小写不匹配，如 FaceSegmentation -> faceSegmentation）
    this._fixNodeTypeNames(uiWorkflow);
    
    // 移除有问题的节点（如 AudioSeparation）
    this._removeProblematicNodes(uiWorkflow);
    
    // 注入到 UI 格式
    this._injectToUIFormat(uiWorkflow, config);
    
    // 保存 UI 格式（用于 ComfyUI 界面加载）
    this.save(uiWorkflow, files.workflowUI);
    
    // 转换为 API 格式并保存（用于 API 提交）
    const apiWorkflow = this._convertUIToAPI(uiWorkflow);
    this.save(apiWorkflow, files.workflow);

    // 3. 保存配置
    const projectConfig = {
      projectName,
      createdAt: new Date().toISOString(),
      files: {
        image: files.image,
        audio: files.audio,
        workflow: files.workflow,
        workflowUI: files.workflowUI
      },
      parameters: {
        prompt: config.prompt,
        workflowType: config.workflowType
      },
      instructions: {
        step1: '在 ComfyUI 中打开 workflow_xxx_ui.json 文件（界面格式）',
        step2: '或通过 API 使用 workflow_xxx.json（API 格式）',
        step3: '点击生成按钮开始制作'
      }
    };
    
    fs.writeFileSync(files.config, JSON.stringify(projectConfig, null, 2), 'utf-8');

    return {
      projectName,
      outputDir,
      files,
      config: projectConfig,
      uiWorkflow: uiWorkflow,  // 返回 UI 格式供自动加载使用
      apiWorkflow: apiWorkflow  // 返回 API 格式供提交使用
    };
  }
}

module.exports = WorkflowInjector;
