/**
 * MuseFlow Desktop - 主进程
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');

// 引入工作流注入器和 ComfyUI 加载器
const WorkflowInjector = require('./workflowInjector');
const ComfyUILoader = require('./comfyui-loader');
const ComfyUIAPI = require('./comfyui-api');
const workflowInjector = new WorkflowInjector();
const comfyUILoader = new ComfyUILoader();
const comfyUIAPI = new ComfyUIAPI();

// 全局窗口引用
let mainWindow;

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'MuseFlow - AI MV 制作',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset', // macOS 风格
    show: false
  });

  // 加载本地 HTML 文件
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 开发工具
  // mainWindow.webContents.openDevTools();

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用初始化
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============ IPC 处理 ============

// 选择视频文件
ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 音视频分离
ipcMain.handle('extract-audio', async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(os.tmpdir(), 'museflow');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const audioPath = path.join(outputDir, `${baseName}_audio.wav`);
    
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(2)
      .on('end', () => {
        resolve(audioPath);
      })
      .on('error', (err) => {
        reject(err.message);
      })
      .save(audioPath);
  });
});

// 提取关键帧
ipcMain.handle('extract-frames', async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(os.tmpdir(), 'museflow', 'frames');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const frames = [];
    let frameCount = 0;
    
    // 获取视频信息
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err.message);
        return;
      }
      
      const duration = metadata.format.duration;
      const fps = metadata.streams[0].r_frame_rate;
      
      // 提取5帧
      const timestamps = [0.5, 1.5, 3, 5, 8].filter(t => t < duration);
      
      let completed = 0;
      timestamps.forEach((timestamp, index) => {
        const outputPath = path.join(outputDir, `${baseName}_frame_${index + 1}.jpg`);
        
        ffmpeg(videoPath)
          .seekInput(timestamp)
          .frames(1)
          .on('end', () => {
            frames.push({
              path: outputPath,
              timestamp: timestamp,
              index: index
            });
            completed++;
            if (completed === timestamps.length) {
              resolve({ frames, duration, fps });
            }
          })
          .on('error', (err) => {
            console.error('Frame extraction error:', err);
            completed++;
          })
          .save(outputPath);
      });
    });
  });
});

// 打开 ComfyUI
ipcMain.handle('open-comfyui', async () => {
  const comfyUIPath = '/Applications/ComfyUI.app';
  if (fs.existsSync(comfyUIPath)) {
    shell.openExternal('http://127.0.0.1:8000');
    exec(`open "${comfyUIPath}"`);
    return { success: true };
  } else {
    return { success: false, error: 'ComfyUI Desktop 未找到' };
  }
});

// 生成工作流配置（自动注入参数到 ComfyUI 工作流）
ipcMain.handle('generate-workflow-config', async (event, config) => {
  try {
    console.log('🚀 开始生成工作流配置...');
    console.log('📋 输入配置:', JSON.stringify(config, null, 2));
    
    // 使用 WorkflowInjector 生成完整项目包
    const result = workflowInjector.generatePackage({
      imagePath: config.selectedFrame,
      audioPath: config.audioPath,
      prompt: config.prompt,
      workflowType: config.workflowType || 'normal'
    });
    
    console.log('✅ 项目生成成功!');
    console.log('📁 项目目录:', result.outputDir);
    console.log('📄 生成文件:', JSON.stringify(result.files, null, 2));
    
    return { 
      success: true, 
      projectId: result.projectName,
      projectDir: result.outputDir,
      configPath: result.files.config,
      workflowPath: result.files.workflow,
      workflowUIPath: result.files.workflowUI,
      message: '✅ 工作流已自动注入参数！\n\n包含文件:\n- frame.jpg (首帧图)\n- audio.wav (音频)\n- workflow_xxx.json (API格式，用于提交)\n- workflow_xxx_ui.json (UI格式，用于界面加载)\n- config.json (项目配置)\n\n现在可以在 ComfyUI 中直接加载 workflow_xxx_ui.json 文件！'
    };
  } catch (error) {
    console.error('❌ 生成工作流配置失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 打开项目文件夹
ipcMain.handle('open-project-folder', async (event, projectPath) => {
  shell.openPath(projectPath);
});

// 获取已注入参数的工作流内容（用于预览或直接提交）
ipcMain.handle('get-injected-workflow', async (event, config) => {
  try {
    const workflow = workflowInjector.inject({
      imagePath: config.imagePath,
      audioPath: config.audioPath,
      prompt: config.prompt,
      workflowType: config.workflowType
    });
    
    return {
      success: true,
      workflow: workflow
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// 自动打开 ComfyUI 并加载工作流（带 loading 界面）- 方案二：API 提交
ipcMain.handle('auto-open-comfyui', async (event, { workflowPath, projectPath, uiWorkflowPath, useAPI = true }) => {
  try {
    console.log('🎬 [auto-open-comfyui] 收到请求');
    console.log('   workflowPath:', workflowPath);
    console.log('   projectPath:', projectPath);
    console.log('   uiWorkflowPath:', uiWorkflowPath);
    console.log('   useAPI:', useAPI);
    
    // 检查参数
    if (!workflowPath) {
      throw new Error('workflowPath 不能为空');
    }
    
    // 确定实际路径
    const actualUIPath = uiWorkflowPath || workflowPath.replace('.json', '_ui.json');
    const actualAPIPath = workflowPath; // API 格式路径
    
    console.log('📂 UI 工作流路径:', actualUIPath);
    console.log('📂 API 工作流路径:', actualAPIPath);
    
    // 检查文件是否存在
    if (!fs.existsSync(actualUIPath)) {
      throw new Error(`工作流文件不存在: ${actualUIPath}`);
    }
    
    const uiWorkflow = JSON.parse(fs.readFileSync(actualUIPath, 'utf-8'));
    const apiWorkflow = fs.existsSync(actualAPIPath) 
      ? JSON.parse(fs.readFileSync(actualAPIPath, 'utf-8'))
      : uiWorkflow;
    
    console.log('🎬 开始加载工作流到 ComfyUI...');
    console.log('📊 UI 节点数:', uiWorkflow.nodes ? uiWorkflow.nodes.length : 'N/A');
    
    // 优先尝试 API 提交方式（更可靠）
    if (useAPI) {
      console.log('🚀 尝试使用 API 提交工作流...');
      const apiResult = await comfyUIAPI.submitFullWorkflow({
        apiWorkflow: apiWorkflow,
        uiWorkflow: uiWorkflow,
        imagePath: null, // 文件已在工作流中引用
        audioPath: null
      });
      
      if (apiResult.success) {
        // API 提交成功，打开 ComfyUI 页面让用户查看进度
        console.log('✅ API 提交成功，打开 ComfyUI...');
        
        // 启动或激活 ComfyUI 窗口
        const { shell } = require('electron');
        shell.openExternal('http://127.0.0.1:8000');
        
        // 也尝试启动 ComfyUI Desktop（如果未运行）
        const status = await comfyUIAPI.checkStatus();
        if (!status.ok) {
          const comfyUIPath = '/Applications/ComfyUI.app';
          if (fs.existsSync(comfyUIPath)) {
            exec(`open "${comfyUIPath}"`);
          }
        }
        
        // 打开项目文件夹
        if (projectPath) {
          shell.openPath(projectPath);
        }
        
        return {
          success: true,
          method: 'api',
          workflowLoaded: true,
          promptId: apiResult.promptId,
          queueNumber: apiResult.queueNumber,
          message: apiResult.message,
          fallbackAvailable: false
        };
      }
      
      // API 提交失败，标记为需要降级
      const errorMsg = typeof apiResult.error === 'object' ? JSON.stringify(apiResult.error) : apiResult.error;
      console.log('⚠️ API 提交失败:', errorMsg);
      console.log('   完整结果:', JSON.stringify(apiResult, null, 2));
      return {
        success: false,
        method: 'api_failed',
        error: errorMsg,
        needsStart: apiResult.needsStart,
        canFallback: true,
        fallbackType: apiResult.needsStart ? 'manual' : 'ui_injection',
        message: errorMsg
      };
    }
    
    // 回退到 UI 注入方式
    console.log('🎨 使用 UI 注入方式加载工作流...');
    const result = await comfyUILoader.loadWorkflow(uiWorkflow, projectPath);
    
    console.log('✅ [auto-open-comfyui] UI 注入结果:', result);
    
    return {
      success: result.success,
      method: 'ui_injection',
      canRetry: result.canRetry,
      canFallback: !result.success,
      fallbackType: 'manual',
      workflowLoaded: result.workflowLoaded,
      message: result.success 
        ? '✅ ComfyUI 已准备就绪，工作流已自动加载！点击生成即可开始制作。' 
        : result.error || '加载失败'
    };
    
  } catch (error) {
    console.error('❌ [auto-open-comfyui] 错误:', error);
    console.error('   错误堆栈:', error.stack);
    return {
      success: false,
      error: error.message || '未知错误',
      canFallback: true,
      fallbackType: 'manual',
      stack: error.stack
    };
  }
});

// 方案三：仅通过 API 提交（不打开窗口，适合后台提交）
ipcMain.handle('submit-workflow-api', async (event, { workflowPath, projectPath }) => {
  try {
    console.log('🚀 [submit-workflow-api] API 提交工作流');
    
    if (!workflowPath || !fs.existsSync(workflowPath)) {
      throw new Error('工作流文件不存在');
    }
    
    const apiWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
    
    const result = await comfyUIAPI.submitFullWorkflow({
      apiWorkflow: apiWorkflow,
      imagePath: null,
      audioPath: null
    });
    
    // 打开项目文件夹
    if (projectPath && result.success) {
      const { shell } = require('electron');
      shell.openPath(projectPath);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ [submit-workflow-api] 错误:', error);
    return {
      success: false,
      error: error.message,
      canFallback: true
    };
  }
});

// ============ 多分镜脚本策划 - Kimi API ============

// 辅助函数：使用 https 发送请求（兼容性更好）
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// 使用 Kimi K2.5 生成分镜脚本
ipcMain.handle('generate-storyboard', async (event, { imagePath, basePrompt, duration }) => {
  try {
    console.log('🎬 [generate-storyboard] 开始生成分镜脚本');
    console.log('  图片路径:', imagePath);
    console.log('  基础提示词:', basePrompt);
    console.log('  视频时长:', duration);
    
    // 读取图片并转换为 base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // 构建 Kimi API 请求 - 使用内置 API Key
    const BUILT_IN_API_KEY = 'sk-eLtAygDQXm0ipASXotqxury96HDcvWkfvp9Iqw5zgoPU2ByZ';
    const apiKey = BUILT_IN_API_KEY;
    
    console.log('🔑 [generate-storyboard] 使用内置 API Key:', apiKey.substring(0, 10) + '...');
    
    // 使用兼容的请求方式（优先使用 fetch，否则使用 https）
    const requestFn = typeof fetch !== 'undefined' ? fetch : makeRequest;
    
    const response = await requestFn('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'kimi-k2.5',
        messages: [
          {
            role: 'system',
            content: '你是一名专业的AI视频分镜脚本策划师，擅长为Wan2.1模型设计数字人演唱视频的分镜脚本。'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `我是一名使用wan2.1生歌手数字人演唱视频的设计师，附件是我生视频的首帧图图像，请先分析这张图的【人物形象】，【图像背景】，【图像氛围】，【人物姿态】等，按照下面"提示词结构"帮我生成4段适用于wan2.1模型的生视频提示词，分别整理为段落【镜头1】，【镜头2】，【镜头3】，【镜头4】。

视频总时长约 ${duration} 秒，请将4个镜头均匀分配时间。

<提示词结构>
人物形象：描述首帧图图像中人物的形象，可能在做什么，如："人物开场即手持银色麦克风紧贴唇边进行演唱，面带灿烂微笑"
背景：要符合首帧图图像中的背景设计，里面可能有什么背景元素属于动态元素，如舞台灯光需要闪烁，烟雾需要慢慢扩散，海浪拍打沙滩，花丛中花儿摇曳等，如："舞台笼罩在暖黄色灯光与飘浮的彩色泡泡中，背景点缀着荧光棒星光，整体氛围专业且梦幻"
氛围：要符合首帧图图像中的图像氛围，如"整体氛围专业且梦幻"
简单描述动作/画面变化：人物动作/画面变化不要超过3个，人物主要是唱歌情景下，需要涉及在这个场景下人物常用的演唱自然肢体变化，如："一只手拿话筒，身体随旋律以肩部为轴心自然轻微摇摆，持麦的手根据音高变化流畅微调与嘴部的距离"
镜头运动：运镜不超过2个，如随着场景可以有缓慢的推镜，拉镜，平移，跟踪人物面部等，如"镜头从半身景别起幅，在5秒内以人物为中心平稳逆时针环绕20度并同步匀速拉远至全身景别，完整展现人物与环境的动态关系"
</提示词结构>

请严格按照以下JSON格式返回结果（不要包含markdown代码块标记）：
{
  "shots": [
    {
      "shotNumber": 1,
      "startTime": 0,
      "endTime": 2.5,
      "prompt": "完整的提示词文本..."
    },
    {
      "shotNumber": 2,
      "startTime": 2.5,
      "endTime": 5,
      "prompt": "完整的提示词文本..."
    },
    {
      "shotNumber": 3,
      "startTime": 5,
      "endTime": 7.5,
      "prompt": "完整的提示词文本..."
    },
    {
      "shotNumber": 4,
      "startTime": 7.5,
      "endTime": 10,
      "prompt": "完整的提示词文本..."
    }
  ]
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('✅ Kimi API 返回内容:', content.substring(0, 200) + '...');
    
    // 解析 JSON 结果
    let storyboard;
    try {
      // 尝试直接解析
      storyboard = JSON.parse(content);
    } catch {
      // 如果直接解析失败，尝试提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        storyboard = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析 Kimi 返回的 JSON 数据');
      }
    }
    
    return {
      success: true,
      shots: storyboard.shots
    };
    
  } catch (error) {
    console.error('❌ [generate-storyboard] 错误:', error);
    
    // 出错时返回模拟数据，确保用户体验不中断
    console.log('🔄 使用模拟数据作为 fallback');
    return generateMockStoryboard(duration);
  }
});

// 生成分镜脚本的模拟数据（用于测试或 API 失败时）
function generateMockStoryboard(duration = 10) {
  const segmentDuration = duration / 4;
  
  return {
    success: true,
    shots: [
      {
        shotNumber: 1,
        startTime: 0,
        endTime: segmentDuration,
        prompt: `人物形象：年轻虚拟歌手身穿时尚演出服，手持银色麦克风紧贴唇边深情演唱，面带自信微笑，眼神明亮有神。
背景：现代化舞台笼罩在炫彩LED灯光中，背景屏幕播放动态视觉特效，舞台两侧烟雾机缓缓释放轻薄烟雾。
氛围：整体氛围专业、梦幻且充满活力，演唱会现场感十足。
简单描述动作/画面变化：人物身体随音乐节奏轻微摇摆，手持麦克风自然升降配合音高变化，头部轻微点头打拍子。
镜头运动：镜头从中景起幅，缓慢推进至近景，聚焦人物面部表情。`
      },
      {
        shotNumber: 2,
        startTime: segmentDuration,
        endTime: segmentDuration * 2,
        prompt: `人物形象：虚拟歌手保持演唱姿态，一只手伸展与观众互动，表情更加投入热情。
背景：舞台灯光转为暖黄色调，背景星光粒子特效闪烁，彩色泡泡从舞台底部缓缓升起。
氛围：整体氛围温暖、浪漫且富有感染力，观众互动感强烈。
简单描述动作/画面变化：人物手臂自然张开伸展，身体向一侧轻微倾斜，头部跟随旋律轻柔摆动。
镜头运动：镜头从侧面环绕人物，顺时针旋转约30度，同时缓慢拉远展现全身姿态。`
      },
      {
        shotNumber: 3,
        startTime: segmentDuration * 2,
        endTime: segmentDuration * 3,
        prompt: `人物形象：虚拟歌手闭眼沉浸演唱，双手握持麦克风，表情深情专注。
背景：舞台灯光转为蓝紫色调，背景激光束交错闪烁，干冰烟雾在地面流动营造梦幻感。
氛围：整体氛围深情、沉浸且略带迷幻，情感高潮迭起。
简单描述动作/画面变化：人物闭眼投入演唱，双肩随音乐起伏，双手握麦靠近嘴边，身体轻微后仰。
镜头运动：镜头从低角度仰拍，缓慢上移配合人物姿态，最后轻微推近至面部特写。`
      },
      {
        shotNumber: 4,
        startTime: segmentDuration * 3,
        endTime: duration,
        prompt: `人物形象：虚拟歌手睁开双眼面向镜头，露出灿烂笑容，单手举起向观众致意，充满谢幕感。
背景：舞台灯光全开呈现彩虹渐变效果，礼花特效从背景绽放，整体画面明亮欢快。
氛围：整体氛围欢快、圆满且充满成就感，演唱会高潮谢幕时刻。
简单描述动作/画面变化：人物单手高举挥手致意，身体挺直自信站立，笑容满面，眼神与镜头交流。
镜头运动：镜头从近景缓慢拉远至全景，完整展现人物与舞台环境的壮观画面。`
      }
    ],
    isMock: true
  };
}

// ============ 反推提示词 - Kimi API ============

// 使用 Kimi 分析图像并反推生图提示词（男/女双版本）
ipcMain.handle('analyze-prompt', async (event, { imagePath }) => {
  try {
    console.log('🔮 [analyze-prompt] 开始分析图像反推生图提示词');
    console.log('  图片路径:', imagePath);

    // 读取图片并转换为 base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // 构建 Kimi API 请求 - 使用内置 API Key
    const BUILT_IN_API_KEY = 'sk-eLtAygDQXm0ipASXotqxury96HDcvWkfvp9Iqw5zgoPU2ByZ';
    const apiKey = BUILT_IN_API_KEY;

    console.log('🔑 [analyze-prompt] 使用内置 API Key:', apiKey.substring(0, 10) + '...');

    // 使用兼容的请求方式
    const requestFn = typeof fetch !== 'undefined' ? fetch : makeRequest;

    const response = await requestFn('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'kimi-k2.5',
        messages: [
          {
            role: 'system',
            content: '你是一名资深提示词大师，擅长分析图像并生成高质量、简洁精准的生图提示词。'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `你是一名资深提示词大师，你的任务是帮我反推使用 qwen2509 生图的有效提示词，附件是我想让你反推的图像。

请分析这张图像后输出男/女双性别版本的生图提示词，男女双性别提示词需要根据男女性别差异独立设计，仅保留生图风格一致即可，如男生可以是穿白衬衫，那女生版可以是穿白裙子。

提示词需要包括：
【人物形象】：包括面部妆容，服装造型，人物姿态，面部表情
【图像背景】：包括时间、地点、光照条件和氛围情绪
【图像色彩与风格或质感】

切记 qwen2509 生图模型的提示词要点是要"少即是多，准胜于全"，参考以下示例风格：
- 穿扎染T恤的年轻人倚着红墙，手捧桂花酒酿圆子，热气袅袅升腾，市井烟火，松弛感
- 一叶扁舟斜泊芦苇丛中，船头白鹭振翅欲起，远处山影淡如烟，水墨晕染，留白三分
- 灯笼纸透出蜜糖色的光，映在青砖地上像融化的琥珀

请直接返回以下格式的提示词文本：

【男生版】
（简洁的提示词，一句话或几句话，涵盖人物、背景、风格）

【女生版】
（简洁的提示词，一句话或几句话，与男生版风格一致但性别特征不同）

提示词要简洁有力，避免冗余描述，突出画面核心元素。`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const prompt = data.choices[0].message.content.trim();

    console.log('✅ Kimi API 返回提示词:', prompt.substring(0, 100) + '...');

    return {
      success: true,
      prompt: prompt,
      isMock: false
    };

  } catch (error) {
    console.error('❌ [analyze-prompt] 错误:', error);

    // 出错时返回默认提示词
    console.log('🔄 使用默认提示词作为 fallback');
    return {
      success: true,
      prompt: generateDefaultImagePrompt(),
      isMock: true
    };
  }
});

// ============ 生视频脚本策划 - Kimi API ============

// 使用 Kimi 生成视频脚本（普通版/大师版）
ipcMain.handle('generate-video-script', async (event, { imagePath, basePrompt, duration, shotCount, mode }) => {
  try {
    console.log(`🎬 [generate-video-script] 开始生成${mode === 'master' ? '分镜' : '单镜头'}脚本`);
    console.log('  图片路径:', imagePath);
    console.log('  音频时长:', duration);
    console.log('  模式:', mode);
    if (mode === 'master') {
      console.log('  分镜数:', shotCount);
    }

    // 读取图片并转换为 base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // 构建 Kimi API 请求 - 使用内置 API Key
    const BUILT_IN_API_KEY = 'sk-eLtAygDQXm0ipASXotqxury96HDcvWkfvp9Iqw5zgoPU2ByZ';
    const apiKey = BUILT_IN_API_KEY;

    console.log('🔑 [generate-video-script] 使用内置 API Key:', apiKey.substring(0, 10) + '...');

    // 使用兼容的请求方式
    const requestFn = typeof fetch !== 'undefined' ? fetch : makeRequest;

    if (mode === 'master') {
      // 大师版：生成多分镜脚本
      const segmentDuration = duration / shotCount;

      const response = await requestFn('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'kimi-k2.5',
          messages: [
            {
              role: 'system',
              content: '你是一名专业的AI视频分镜脚本策划师，擅长为Wan2.1模型设计数字人演唱视频的分镜脚本。'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `我是一名使用wan2.1生歌手数字人演唱视频的设计师，附件是我生视频的首帧图图像，请先分析这张图的【人物形象】，【图像背景】，【图像氛围】，【人物姿态】等，按照下面"提示词结构"帮我生成${shotCount}段适用于wan2.1模型的生视频提示词，分别整理为段落【镜头1】，【镜头2】...【镜头${shotCount}】。

视频总时长约 ${duration} 秒，请将${shotCount}个镜头均匀分配时间，每个镜头约 ${segmentDuration.toFixed(1)} 秒。

<提示词结构>
人物形象：描述首帧图图像中人物的形象，可能在做什么，如："人物开场即手持银色麦克风紧贴唇边进行演唱，面带灿烂微笑"
背景：要符合首帧图图像中的背景设计，里面可能有什么背景元素属于动态元素，如舞台灯光需要闪烁，烟雾需要慢慢扩散，海浪拍打沙滩，花丛中花儿摇曳等，如："舞台笼罩在暖黄色灯光与飘浮的彩色泡泡中，背景点缀着荧光棒星光，整体氛围专业且梦幻"
氛围：要符合首帧图图像中的图像氛围，如"整体氛围专业且梦幻"
简单描述动作/画面变化：人物动作/画面变化不要超过3个，人物主要是唱歌情景下，需要涉及在这个场景下人物常用的演唱自然肢体变化，如："一只手拿话筒，身体随旋律以肩部为轴心自然轻微摇摆，持麦的手根据音高变化流畅微调与嘴部的距离"
镜头运动：运镜不超过2个，如随着场景可以有缓慢的推镜，拉镜，平移，跟踪人物面部等，如"镜头从半身景别起幅，在5秒内以人物为中心平稳逆时针环绕20度并同步匀速拉远至全身景别，完整展现人物与环境的动态关系"
</提示词结构>

请严格按照以下JSON格式返回结果（不要包含markdown代码块标记）：
{
  "shots": [
    {
      "shotNumber": 1,
      "startTime": 0,
      "endTime": ${segmentDuration.toFixed(1)},
      "prompt": "完整的提示词文本..."
    },
    ...
  ]
}`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      console.log('✅ Kimi API 返回内容:', content.substring(0, 200) + '...');

      // 解析 JSON 结果
      let storyboard;
      try {
        storyboard = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          storyboard = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法解析 Kimi 返回的 JSON 数据');
        }
      }

      return {
        success: true,
        shots: storyboard.shots,
        isMock: false
      };

    } else {
      // 普通版：生成单镜头脚本
      const response = await requestFn('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'kimi-k2.5',
          messages: [
            {
              role: 'system',
              content: '你是一名专业的AI视频分镜脚本策划师，擅长为Wan2.1模型设计数字人演唱视频。'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `我是一名使用wan2.1生歌手数字人演唱视频的设计师，附件是我生视频的首帧图图像，请先分析这张图的【人物形象】，【图像背景】，【图像氛围】，【人物姿态】等，按照下面"提示词结构"帮我生成1段适用于wan2.1模型的生视频提示词。

视频总时长约 ${duration} 秒，这是一个单镜头视频。

<提示词结构>
人物形象：描述首帧图图像中人物的形象，可能在做什么，如："人物开场即手持银色麦克风紧贴唇边进行演唱，面带灿烂微笑"
背景：要符合首帧图图像中的背景设计，里面可能有什么背景元素属于动态元素，如舞台灯光需要闪烁，烟雾需要慢慢扩散等，如："舞台笼罩在暖黄色灯光与飘浮的彩色泡泡中，背景点缀着荧光棒星光，整体氛围专业且梦幻"
氛围：要符合首帧图图像中的图像氛围，如"整体氛围专业且梦幻"
简单描述动作/画面变化：人物动作/画面变化不要超过3个，人物主要是唱歌情景下，需要涉及在这个场景下人物常用的演唱自然肢体变化，如："一只手拿话筒，身体随旋律以肩部为轴心自然轻微摇摆，持麦的手根据音高变化流畅微调与嘴部的距离"
镜头运动：运镜不超过2个，如随着场景可以有缓慢的推镜，拉镜，平移，跟踪人物面部等，如"镜头从半身景别起幅，在5秒内以人物为中心平稳逆时针环绕20度并同步匀速拉远至全身景别，完整展现人物与环境的动态关系"
</提示词结构>

请直接返回一段完整的提示词文本，不需要JSON格式。提示词要详细且专业。`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const prompt = data.choices[0].message.content.trim();

      console.log('✅ Kimi API 返回提示词:', prompt.substring(0, 100) + '...');

      return {
        success: true,
        prompt: prompt,
        isMock: false
      };
    }

  } catch (error) {
    console.error('❌ [generate-video-script] 错误:', error);

    // 出错时返回默认数据
    console.log('🔄 使用默认数据作为 fallback');
    if (mode === 'master') {
      return generateMockStoryboard(duration, shotCount);
    } else {
      return {
        success: true,
        prompt: generateDefaultVideoScript(duration),
        isMock: true
      };
    }
  }
});

// 生成默认单镜头视频脚本
function generateDefaultVideoScript(duration) {
  return `人物形象：年轻虚拟歌手身穿时尚演出服，手持银色麦克风紧贴唇边深情演唱，面带自信微笑，眼神明亮有神。
背景：现代化舞台笼罩在炫彩LED灯光中，背景屏幕播放动态视觉特效，舞台两侧烟雾机缓缓释放轻薄烟雾，荧光棒星光点缀。
氛围：整体氛围专业、梦幻且充满活力，演唱会现场感十足。
简单描述动作/画面变化：人物身体随音乐节奏轻微摇摆，手持麦克风自然升降配合音高变化，头部轻微点头打拍子，始终保持与观众的视觉交流。
镜头运动：镜头从中景起幅，缓慢推进至近景，聚焦人物面部表情，最后轻微拉远至半身景别，完整展现演唱姿态。`;
}

// 生成默认生图提示词（男/女双版本）
function generateDefaultImagePrompt() {
  return `【男生版】
年轻男性歌手身穿黑色皮质演出服，手持银色麦克风，站在霓虹灯光笼罩的舞台上，眼神坚定地望向远方，背景是流动的紫色光带和漂浮的烟雾，赛博朋克风格，冷色调与暖光交织，电影级质感

【女生版】
年轻女性歌手身穿银色亮片长裙，手持水晶麦克风，站在星光点缀的梦幻舞台上，微笑着与观众互动，背景是柔和的粉色光束和缓缓升起的泡泡，梦幻流行风格，暖色调光影，唯美细腻质感`;
}

// 辅助函数：检查 ComfyUI 状态
async function checkComfyUIStatus() {
  try {
    const response = await fetch('http://127.0.0.1:8000/system_stats');
    return response.ok;
  } catch {
    return false;
  }
}

// 辅助函数：睡眠
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
