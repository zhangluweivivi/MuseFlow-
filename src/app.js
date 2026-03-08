/**
 * MuseFlow Desktop - 前端应用逻辑
 */

// 全局状态
const state = {
  videoPath: null,
  audioPath: null,
  frames: [],
  selectedFrame: null,
  videoDuration: 0,
  storyboard: null,  // 多分镜脚本数据
  isMasterMode: false  // 是否大师版模式
};

// DOM 元素
const elements = {
  dropZone: document.getElementById('dropZone'),
  selectVideoBtn: document.getElementById('selectVideoBtn'),
  videoInfo: document.getElementById('videoInfo'),
  videoName: document.getElementById('videoName'),
  videoDuration: document.getElementById('videoDuration'),
  
  step2: document.getElementById('step2'),
  frameStatus: document.getElementById('frameStatus'),
  framesContainer: document.getElementById('framesContainer'),
  
  step3: document.getElementById('step3'),
  audioStatus: document.getElementById('audioStatus'),
  audioPlayerContainer: document.getElementById('audioPlayerContainer'),
  audioPlayer: document.getElementById('audioPlayer'),
  trimStart: document.getElementById('trimStart'),
  trimEnd: document.getElementById('trimEnd'),
  trimBtn: document.getElementById('trimBtn'),
  
  step4: document.getElementById('step4'),
  selectedFramePreview: document.getElementById('selectedFramePreview'),
  analyzePromptBtn: document.getElementById('analyzePromptBtn'),
  analyzeHint: document.getElementById('analyzeHint'),
  promptText: document.getElementById('promptText'),
  editPromptBtn: document.getElementById('editPromptBtn'),
  workflowSelect: document.getElementById('workflowSelect'),
  
  // 步骤5：生视频脚本策划
  step5: document.getElementById('step5'),
  storyboardStatus: document.getElementById('storyboardStatus'),
  generateScriptBtn: document.getElementById('generateScriptBtn'),
  generateScriptBtnText: document.getElementById('generateScriptBtnText'),
  scriptIntroText: document.getElementById('scriptIntroText'),
  normalScriptContainer: document.getElementById('normalScriptContainer'),
  normalDuration: document.getElementById('normalDuration'),
  normalScriptPrompt: document.getElementById('normalScriptPrompt'),
  storyboardContainer: document.getElementById('storyboardContainer'),
  masterDuration: document.getElementById('masterDuration'),
  shotCount: document.getElementById('shotCount'),
  
  generateBtn: document.getElementById('generateBtn'),
  openComfyUIBtn: document.getElementById('openComfyUIBtn'),
  logContent: document.getElementById('logContent')
};

// 日志函数
function log(message, type = 'info') {
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.logContent.appendChild(logItem);
  elements.logContent.scrollTop = elements.logContent.scrollHeight;
}

// 初始化
function init() {
  log('MuseFlow Desktop 已启动');
  setupEventListeners();
}

// 设置事件监听
function setupEventListeners() {
  // 文件选择按钮
  elements.selectVideoBtn.addEventListener('click', handleVideoSelect);
  
  // 拖放事件
  elements.dropZone.addEventListener('click', handleVideoSelect);
  elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('dragover');
  });
  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('dragover');
  });
  elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      processVideo(file.path);
    }
  });
  
  // 编辑提示词
  elements.editPromptBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.promptText.disabled = !elements.promptText.disabled;
    elements.editPromptBtn.textContent = elements.promptText.disabled ? '编辑' : '完成';
  });
  
  // 生成配置
  elements.generateBtn.addEventListener('click', generateWorkflowConfig);
  
  // 打开 ComfyUI
  elements.openComfyUIBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.openComfyUI();
    if (result.success) {
      log('ComfyUI 已启动');
    } else {
      log(`ComfyUI 启动失败: ${result.error}`, 'error');
    }
  });
  
  // 工作流选择提示
  const workflowHints = {
    normal: '普通版：单镜头生成，适合快速测试和简单场景',
    master: '大师版：支持4个分镜，AI自动生成不同镜头提示词，适合高质量MV制作'
  };
  
  elements.workflowSelect.addEventListener('change', (e) => {
    const workflowType = e.target.value;
    const hint = workflowHints[workflowType] || '';
    const hintEl = document.getElementById('workflowHint');
    if (hintEl) {
      hintEl.textContent = hint;
    }

    // 处理大师版模式
    state.isMasterMode = (workflowType === 'master');

    // 显示步骤5
    elements.step5.style.display = 'block';
    elements.step5.style.opacity = '1';
    elements.storyboardStatus.textContent = '待生成';

    // 重置脚本区域
    elements.normalScriptContainer.style.display = 'none';
    elements.storyboardContainer.style.display = 'none';
    elements.generateScriptBtn.style.display = 'block';

    if (state.isMasterMode) {
      // 大师版：计算分镜数量
      const audioDuration = parseFloat(elements.trimEnd.value) - parseFloat(elements.trimStart.value);
      const shotCount = Math.max(1, Math.round(audioDuration / 4));
      state.calculatedShotCount = shotCount;

      elements.scriptIntroText.textContent = `🎬 大师版工作流将生成 ${shotCount} 个分镜（音频时长 ${audioDuration.toFixed(1)}s / 4）`;
      elements.generateScriptBtnText.textContent = 'AI 智能生成分镜脚本';
      log(`🎬 已选择大师版工作流，将生成 ${shotCount} 个分镜`);
    } else {
      // 普通版
      const audioDuration = parseFloat(elements.trimEnd.value) - parseFloat(elements.trimStart.value);
      elements.scriptIntroText.textContent = `🎬 普通版工作流将生成单镜头脚本（音频时长 ${audioDuration.toFixed(1)}s）`;
      elements.generateScriptBtnText.textContent = 'AI 智能生成脚本';
      log('✅ 已选择普通版工作流，单镜头生成');
    }

    log(`已选择工作流: ${workflowType}`);
  });
  
  // 初始化提示
  const initialHint = workflowHints[elements.workflowSelect.value];
  const initialHintEl = document.getElementById('workflowHint');
  if (initialHintEl && initialHint) {
    initialHintEl.textContent = initialHint;
  }
  
  // 生视频脚本策划按钮
  elements.generateScriptBtn.addEventListener('click', generateVideoScript);

  // 反推提示词按钮
  elements.analyzePromptBtn.addEventListener('click', analyzePrompt);
}

// 选择视频
async function handleVideoSelect() {
  const videoPath = await window.electronAPI.selectVideo();
  if (videoPath) {
    processVideo(videoPath);
  }
}

// 处理视频
async function processVideo(videoPath) {
  state.videoPath = videoPath;
  
  // 更新 UI
  elements.videoName.textContent = videoPath.split('/').pop();
  elements.videoInfo.style.display = 'block';
  elements.dropZone.style.display = 'none';
  
  log(`已选择视频: ${videoPath}`);
  
  // 激活步骤2和3
  elements.step2.style.opacity = '1';
  elements.step3.style.opacity = '1';
  
  // 并行处理：抽帧和音频分离
  await Promise.all([
    extractFrames(),
    extractAudio()
  ]);
  
  // 激活步骤4
  elements.step4.style.opacity = '1';
  elements.generateBtn.disabled = false;

  // 生成提示词（简化版）
  generatePrompt();

  // 激活步骤5（生视频脚本策划）
  elements.step5.style.display = 'block';
  elements.step5.style.opacity = '1';
  elements.storyboardStatus.textContent = '待生成';

  // 根据当前工作流模式更新步骤5的显示
  const workflowType = elements.workflowSelect.value;
  state.isMasterMode = (workflowType === 'master');

  // 重置脚本区域
  elements.normalScriptContainer.style.display = 'none';
  elements.storyboardContainer.style.display = 'none';
  elements.generateScriptBtn.style.display = 'block';

  if (state.isMasterMode) {
    const audioDuration = parseFloat(elements.trimEnd.value) - parseFloat(elements.trimStart.value);
    const shotCount = Math.max(1, Math.round(audioDuration / 4));
    state.calculatedShotCount = shotCount;
    elements.scriptIntroText.textContent = `🎬 大师版工作流将生成 ${shotCount} 个分镜（音频时长 ${audioDuration.toFixed(1)}s / 4）`;
    elements.generateScriptBtnText.textContent = 'AI 智能生成分镜脚本';
  } else {
    const audioDuration = parseFloat(elements.trimEnd.value) - parseFloat(elements.trimStart.value);
    elements.scriptIntroText.textContent = `🎬 普通版工作流将生成单镜头脚本（音频时长 ${audioDuration.toFixed(1)}s）`;
    elements.generateScriptBtnText.textContent = 'AI 智能生成脚本';
  }

  log('🎬 步骤5已激活：请选择工作流后点击"AI 智能生成脚本"按钮');
}

// 提取关键帧
async function extractFrames() {
  elements.frameStatus.textContent = '处理中...';
  elements.frameStatus.classList.add('processing');
  
  try {
    const result = await window.electronAPI.extractFrames(state.videoPath);
    state.frames = result.frames;
    state.videoDuration = result.duration;
    
    // 更新时长显示
    elements.videoDuration.textContent = `${result.duration.toFixed(1)}秒`;
    
    // 渲染帧
    renderFrames();
    
    elements.frameStatus.textContent = '已完成';
    elements.frameStatus.classList.remove('processing');
    elements.frameStatus.classList.add('completed');
    
    log(`成功提取 ${result.frames.length} 帧关键帧`);
  } catch (error) {
    log(`抽帧失败: ${error}`, 'error');
    elements.frameStatus.textContent = '失败';
  }
}

// 渲染帧列表
function renderFrames() {
  elements.framesContainer.innerHTML = '';
  
  state.frames.forEach((frame, index) => {
    const frameEl = document.createElement('div');
    frameEl.className = 'frame-item';
    frameEl.innerHTML = `
      <img src="file://${frame.path}" alt="Frame ${index + 1}">
      <div class="frame-info">${frame.timestamp.toFixed(1)}s</div>
    `;
    
    frameEl.addEventListener('click', () => selectFrame(index));
    elements.framesContainer.appendChild(frameEl);
  });
}

// 选择帧
function selectFrame(index) {
  state.selectedFrame = state.frames[index];

  // 更新 UI
  document.querySelectorAll('.frame-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });

  // 更新预览
  elements.selectedFramePreview.innerHTML = `
    <img src="file://${state.selectedFrame.path}" alt="Selected Frame">
  `;

  // 显示反推提示词按钮
  elements.analyzePromptBtn.style.display = 'block';
  elements.analyzeHint.style.display = 'block';

  log(`已选择第 ${index + 1} 帧作为首帧图`);
  log('💡 提示：点击图像下方的"反推提示词（Kimi）"按钮，使用 AI 分析图像生成专业提示词');
}

// 提取音频
async function extractAudio() {
  elements.audioStatus.textContent = '处理中...';
  elements.audioStatus.classList.add('processing');
  
  try {
    const audioPath = await window.electronAPI.extractAudio(state.videoPath);
    state.audioPath = audioPath;
    
    // 更新音频播放器
    elements.audioPlayer.src = `file://${audioPath}`;
    elements.audioPlayerContainer.style.display = 'block';
    elements.trimEnd.value = Math.min(10, Math.floor(state.videoDuration));
    
    elements.audioStatus.textContent = '已完成';
    elements.audioStatus.classList.remove('processing');
    elements.audioStatus.classList.add('completed');
    
    log('音频分离完成');
  } catch (error) {
    log(`音频分离失败: ${error}`, 'error');
    elements.audioStatus.textContent = '失败';
  }
}

// 生成提示词
function generatePrompt() {
  const prompt = `现代化舞台场景，专业灯光效果，虚拟歌手表演，高清画质，
年轻虚拟歌手，精致五官，时尚服装，动态表演姿态，
欢快、活力、专业，现代流行、数字化、未来感，
8k uhd, highly detailed, cinematic lighting, professional music video production`;

  elements.promptText.value = prompt;
}

// 使用 Kimi 反推生图提示词
async function analyzePrompt() {
  if (!state.selectedFrame) {
    alert('请先选择首帧图');
    return;
  }

  elements.analyzePromptBtn.disabled = true;
  elements.analyzePromptBtn.innerHTML = '<span class="btn-icon">⏳</span>分析中...';

  log('🔮 正在使用 Kimi-k2.5 分析图像并反推生图提示词...');
  log('🎨 将生成适用于 qwen2509 的男/女双版本提示词');

  try {
    const result = await window.electronAPI.analyzePrompt({
      imagePath: state.selectedFrame.path
    });

    if (result.success) {
      elements.promptText.value = result.prompt;

      if (result.isMock) {
        log('⚠️ 使用默认提示词（API 可能未配置）');
        log('💡 提示：设置 MOONSHOT_API_KEY 环境变量可使用真实 Kimi API');
      } else {
        log('✅ Kimi-k2.5 成功反推生图提示词！');
        log('🎨 已生成男/女双性别版本，风格保持一致');
      }

      log('📝 提示词已填充到输入框，你可以编辑后使用');
      log('💡 提示：使用 qwen2509 生图时，建议遵循"少即是多，准胜于全"原则');
    } else {
      throw new Error(result.error || '分析失败');
    }
  } catch (error) {
    log(`❌ 提示词分析失败: ${error}`, 'error');
    alert('提示词分析失败，请查看日志');
  } finally {
    elements.analyzePromptBtn.disabled = false;
    elements.analyzePromptBtn.innerHTML = '<span class="btn-icon">🔮</span>反推提示词（kimi-k2.5）';
  }
}

// 生视频脚本策划（普通版/大师版）
async function generateVideoScript() {
  if (!state.selectedFrame) {
    alert('请先选择首帧图');
    return;
  }

  elements.generateScriptBtn.disabled = true;
  elements.generateScriptBtnText.textContent = 'AI 生成中...';
  elements.storyboardStatus.textContent = '生成中...';
  elements.storyboardStatus.classList.add('processing');

  // 计算音频时长
  const trimStart = parseFloat(elements.trimStart.value) || 0;
  const trimEnd = parseFloat(elements.trimEnd.value) || 10;
  const audioDuration = trimEnd - trimStart;

  try {
    if (state.isMasterMode) {
      // 大师版：生成多分镜脚本
      const shotCount = state.calculatedShotCount || Math.max(1, Math.round(audioDuration / 4));
      log(`🎬 正在使用 Kimi-k2.5 生成 ${shotCount} 个分镜的脚本...`);
      log(`⏳ 音频时长: ${audioDuration.toFixed(1)}s，每个分镜约 ${(audioDuration / shotCount).toFixed(1)}s`);

      const result = await window.electronAPI.generateVideoScript({
        imagePath: state.selectedFrame.path,
        basePrompt: elements.promptText.value,
        duration: audioDuration,
        shotCount: shotCount,
        mode: 'master'
      });

      if (result.success) {
        state.storyboard = result.shots;

        // 清空并重新生成分镜容器
        elements.storyboardContainer.innerHTML = `
          <div class="script-info">
            <span class="script-duration">音频时长: <strong id="masterDuration">${audioDuration.toFixed(1)}</strong> 秒</span>
            <span class="script-type">大师版 - <strong id="shotCount">${shotCount}</strong> 个分镜</span>
          </div>
        `;

        // 动态生成分镜HTML
        result.shots.forEach((shot, index) => {
          const shotEl = document.createElement('div');
          shotEl.className = 'storyboard-item';
          shotEl.dataset.shot = index + 1;
          shotEl.innerHTML = `
            <div class="shot-header">
              <span class="shot-number">镜头 ${index + 1}</span>
              <div class="shot-time">
                <input type="number" class="shot-start" value="${shot.startTime.toFixed(1)}" min="0" step="0.5"> ~
                <input type="number" class="shot-end" value="${shot.endTime.toFixed(1)}" min="0" step="0.5"> 秒
              </div>
            </div>
            <textarea class="shot-prompt" rows="4" placeholder="镜头${index + 1}的提示词...">${shot.prompt}</textarea>
          `;
          elements.storyboardContainer.appendChild(shotEl);
        });

        elements.storyboardContainer.style.display = 'block';
        elements.storyboardStatus.textContent = '已完成';
        elements.storyboardStatus.classList.remove('processing');
        elements.storyboardStatus.classList.add('completed');

        if (result.isMock) {
          log('⚠️ 使用模拟数据生成分镜');
        } else {
          log('✅ Kimi-k2.5 成功生成分镜脚本！');
        }

        log(`📋 已生成 ${result.shots.length} 个分镜的提示词`);
        result.shots.forEach((shot, i) => {
          log(`   镜头${i + 1}: ${shot.startTime.toFixed(1)}s ~ ${shot.endTime.toFixed(1)}s`);
        });
      } else {
        throw new Error(result.error || '生成失败');
      }
    } else {
      // 普通版：生成单镜头脚本
      log(`🎬 正在使用 Kimi-k2.5 生成单镜头脚本...`);
      log(`⏳ 音频时长: ${audioDuration.toFixed(1)}s`);

      const result = await window.electronAPI.generateVideoScript({
        imagePath: state.selectedFrame.path,
        basePrompt: elements.promptText.value,
        duration: audioDuration,
        mode: 'normal'
      });

      if (result.success) {
        elements.normalDuration.textContent = audioDuration.toFixed(1);
        elements.normalScriptPrompt.value = result.prompt;
        elements.normalScriptContainer.style.display = 'block';
        elements.storyboardStatus.textContent = '已完成';
        elements.storyboardStatus.classList.remove('processing');
        elements.storyboardStatus.classList.add('completed');

        if (result.isMock) {
          log('⚠️ 使用默认提示词');
        } else {
          log('✅ Kimi-k2.5 成功生成视频脚本！');
        }

        log(`📝 已生成单镜头提示词（适配 ${audioDuration.toFixed(1)}s 音频）`);
      } else {
        throw new Error(result.error || '生成失败');
      }
    }
  } catch (error) {
    log(`❌ 脚本生成失败: ${error}`, 'error');
    elements.storyboardStatus.textContent = '失败';
    alert('脚本生成失败，请查看日志');
  } finally {
    elements.generateScriptBtn.disabled = false;
    elements.generateScriptBtnText.textContent = state.isMasterMode ? 'AI 智能生成分镜脚本' : 'AI 智能生成脚本';
  }
}

// 收集分镜数据
function collectStoryboardData() {
  const shots = [];
  document.querySelectorAll('.storyboard-item').forEach((el, index) => {
    shots.push({
      shotNumber: index + 1,
      startTime: parseFloat(el.querySelector('.shot-start').value) || 0,
      endTime: parseFloat(el.querySelector('.shot-end').value) || 0,
      prompt: el.querySelector('.shot-prompt').value || ''
    });
  });
  return shots;
}

// 生成工作流配置（自动注入参数）
async function generateWorkflowConfig() {
  if (!state.selectedFrame || !state.audioPath) {
    alert('请先选择首帧图并等待音频处理完成');
    return;
  }
  
  // 大师版需要检查分镜数据
  if (state.isMasterMode) {
    const storyboardData = collectStoryboardData();
    if (!storyboardData.every(s => s.prompt.trim())) {
      const confirmContinue = confirm('多分镜提示词未完全填写，是否继续生成？\n\n点击"确定"使用当前内容，点击"取消"返回填写。');
      if (!confirmContinue) return;
    }
    state.storyboard = storyboardData;
  }
  
  elements.generateBtn.disabled = true;
  elements.generateBtn.textContent = '生成中...';
  
  try {
    const config = {
      selectedFrame: state.selectedFrame.path,
      audioPath: state.audioPath,
      prompt: elements.promptText.value,
      workflowType: elements.workflowSelect.value,
      trimStart: parseFloat(elements.trimStart.value) || 0,
      trimEnd: parseFloat(elements.trimEnd.value) || 10,
      storyboard: state.storyboard  // 多分镜数据（大师版使用）
    };
    
    log('🚀 正在生成工作流配置...');
    if (state.isMasterMode) {
      log('🎬 大师版模式：注入4个分镜的提示词');
    }
    log('📋 正在将参数注入到 ComfyUI 工作流...');
    
    const result = await window.electronAPI.generateWorkflowConfig(config);
    
    if (result.success) {
      log(`✅ 项目创建成功: ${result.projectId}`);
      log(`📁 项目路径: ${result.projectDir}`);
      log(`📄 工作流文件: ${result.workflowPath}`);
      log('🎯 工作流参数已自动注入：');
      log('   - ✅ LoadImage 节点：首帧图');
      log('   - ✅ LoadAudio 节点：音频');
      if (state.isMasterMode) {
        log('   - ✅ 4个分镜的提示词已分别注入');
        log('   - ✅ 大师版工作流支持镜头切换');
      } else {
        log('   - ✅ 单镜头提示词已注入');
      }
      
      // 保存项目信息供后续使用
      state.lastProject = {
        projectId: result.projectId,
        projectDir: result.projectDir,
        workflowPath: result.workflowPath,
        workflowUIPath: result.workflowUIPath
      };
      
      // 显示成功信息并提供两种选择
      const userChoice = confirm(
        `🎉 项目创建成功！\n\n` +
        `项目ID: ${result.projectId}\n\n` +
        `✅ 工作流参数已自动注入！\n\n` +
        `📁 项目路径: ${result.projectDir}\n\n` +
        `文件说明:\n` +
        `• workflow_${config.workflowType}_ui.json - UI格式工作流\n` +
        `• workflow_${config.workflowType}.json - API格式工作流\n` +
        `• frame.jpg - 首帧图\n` +
        `• audio.wav - 音频文件\n\n` +
        `点击"确定"打开项目文件夹\n` +
        `点击"取消"尝试自动打开 ComfyUI (可能失败)`
      );

      if (userChoice) {
        // 仅打开项目文件夹（推荐，最稳定）
        await window.electronAPI.openProjectFolder(result.projectDir);
        log('📂 已打开项目文件夹');
      } else {
        // 尝试自动打开 ComfyUI（可能失败）
        log('🚀 尝试自动打开 ComfyUI...');
        await autoOpenComfyUI(result.workflowPath, result.projectDir, result.workflowUIPath);
      }
    } else {
      throw new Error(result.error || '生成失败');
    }
  } catch (error) {
    log(`❌ 生成失败: ${error}`, 'error');
    alert('生成失败，请查看日志');
  } finally {
    elements.generateBtn.disabled = false;
    elements.generateBtn.innerHTML = '<span class="btn-icon">🚀</span>生成 ComfyUI 配置';
  }
}

// 自动打开 ComfyUI 并加载工作流（三级降级策略）
async function autoOpenComfyUI(workflowPath, projectPath, uiWorkflowPath) {
  log('🚀 正在自动打开 ComfyUI...');
  log('⏳ 尝试通过 API 提交工作流（最可靠的方式）...');
  
  try {
    // 方案二：尝试 API 提交（默认优先）
    const result = await window.electronAPI.autoOpenComfyUI({
      workflowPath,
      projectPath,
      uiWorkflowPath,
      useAPI: true
    });
    
    if (result.success) {
      // 方案二成功：API 提交成功
      log('✅ 方案二成功：API 提交工作流到队列！');
      log(`📋 队列编号: #${result.queueNumber}`);
      
      alert(
        `🎉 工作流已成功提交！\n\n` +
        `✅ 提交方式: API 直接提交\n` +
        `📋 队列编号: #${result.queueNumber}\n\n` +
        `ComfyUI 页面已打开，请在浏览器中查看生成进度。\n` +
        `项目文件夹也已打开，包含所有生成文件。`
      );
      return { success: true, method: 'api' };
    }
    
    // 方案二失败，进入降级流程
    log(`⚠️ 方案二失败: ${result.message}`, 'warning');
    
    // 判断降级策略
    if (result.canFallback) {
      if (result.fallbackType === 'ui_injection' && result.method === 'api_failed') {
        // API 失败但 ComfyUI 在运行，尝试 UI 注入
        log('🔄 降级到方案二（备用）：UI 注入方式...');
        return await tryUIInjection(workflowPath, projectPath, uiWorkflowPath);
      } else {
        // 需要降级到方案三：手动导入
        log('🔄 降级到方案三：提示用户手动导入...');
        return await promptManualImport(projectPath, uiWorkflowPath);
      }
    }
    
    throw new Error(result.error || '未知的加载失败');
    
  } catch (error) {
    log(`❌ 自动处理失败: ${error}`, 'error');
    return await promptManualImport(projectPath, uiWorkflowPath, error.message);
  }
}

// 尝试 UI 注入方式（方案二备用）
async function tryUIInjection(workflowPath, projectPath, uiWorkflowPath) {
  log('🎨 尝试通过 UI 注入加载工作流...');
  
  try {
    const result = await window.electronAPI.autoOpenComfyUI({
      workflowPath,
      projectPath,
      uiWorkflowPath,
      useAPI: false // 不使用 API，使用 UI 注入
    });
    
    if (result.success) {
      log('✅ UI 注入成功！');
      
      if (result.workflowLoaded) {
        alert(
          `🎉 全自动配置完成！\n\n` +
          `✅ ComfyUI 已打开\n` +
          `✅ 工作流已自动加载\n` +
          `✅ 所有参数已配置\n\n` +
          `请在 ComfyUI 界面中点击 "Queue Prompt" 开始生成！`
        );
      }
      return { success: true, method: 'ui_injection' };
    }
    
    // UI 注入也失败，降级到手动
    log('⚠️ UI 注入也失败，降级到手动导入...', 'warning');
    return await promptManualImport(projectPath, uiWorkflowPath, result.error);
    
  } catch (error) {
    log(`❌ UI 注入失败: ${error}`, 'error');
    return await promptManualImport(projectPath, uiWorkflowPath, error.message);
  }
}

// 方案三：提示用户手动导入
async function promptManualImport(projectPath, uiWorkflowPath, errorMsg = '') {
  const workflowFileName = uiWorkflowPath ? uiWorkflowPath.split('/').pop() : 'workflow_xxx_ui.json';
  
  log('📂 打开项目文件夹，准备手动导入流程...');
  await window.electronAPI.openProjectFolder(projectPath);
  
  const errorDetail = errorMsg ? `\n❌ 错误信息: ${errorMsg}\n` : '';
  
  const userChoice = confirm(
    `⚠️ 自动加载失败${errorDetail}\n\n` +
    `🎯 方案三：手动导入工作流\n\n` +
    `项目文件夹已打开，请按以下步骤操作：\n\n` +
    `1️⃣ 确保 ComfyUI 已启动\n` +
    `   • 如未启动，请打开 ComfyUI Desktop\n` +
    `   • 等待加载完成（首次可能需要下载模型）\n\n` +
    `2️⃣ 在 ComfyUI 中加载工作流\n` +
    `   • 点击 "Load" 按钮\n` +
    `   • 选择文件: ${workflowFileName}\n\n` +
    `3️⃣ 点击生成\n` +
    `   • 点击 "Queue Prompt" 开始生成\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 提示: 如需重试自动加载，请确保 ComfyUI 完全启动后重新点击"生成配置"\n\n` +
    `点击"确定"关闭此提示，点击"取消"查看帮助文档`
  );
  
  if (!userChoice) {
    // 用户想查看帮助，可以打开帮助页面或显示更多信息
    alert(
      `📖 常见问题解决:\n\n` +
      `1. ComfyUI 无法启动:\n` +
      `   • 检查 /Applications/ComfyUI.app 是否存在\n` +
      `   • 尝试手动启动 ComfyUI Desktop\n\n` +
      `2. 模型下载中:\n` +
      `   • 首次启动 ComfyUI 会自动下载模型\n` +
      `   • 请等待下载完成（可能需要几分钟）\n\n` +
      `3. 工作流加载失败:\n` +
      `   • 确保工作流模板文件存在\n` +
      `   • 检查 ComfyUI 自定义节点是否安装完整\n\n` +
      `4. 联系支持:\n` +
      `   • 如果问题持续，请检查日志输出`
    );
  }
  
  return { success: false, method: 'manual', userAcknowledged: true };
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
