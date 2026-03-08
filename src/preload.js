/**
 * MuseFlow Desktop - 预加载脚本（安全桥接）
 */
const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件选择
  selectVideo: () => ipcRenderer.invoke('select-video'),
  
  // 视频处理
  extractAudio: (videoPath) => ipcRenderer.invoke('extract-audio', videoPath),
  extractFrames: (videoPath) => ipcRenderer.invoke('extract-frames', videoPath),
  
  // ComfyUI
  openComfyUI: () => ipcRenderer.invoke('open-comfyui'),
  
  // 工作流（自动注入参数）
  generateWorkflowConfig: (config) => ipcRenderer.invoke('generate-workflow-config', config),
  openProjectFolder: (projectPath) => ipcRenderer.invoke('open-project-folder', projectPath),
  
  // 高级：获取已注入的工作流内容
  getInjectedWorkflow: (config) => ipcRenderer.invoke('get-injected-workflow', config),
  
  // 🚀 新增：自动打开 ComfyUI 并加载工作流（智能降级：API → UI注入 → 手动）
  autoOpenComfyUI: ({ workflowPath, projectPath, uiWorkflowPath, useAPI = true }) => 
    ipcRenderer.invoke('auto-open-comfyui', { workflowPath, projectPath, uiWorkflowPath, useAPI }),
  
  // 🎯 新增：通过 API 提交工作流（后台提交）
  submitWorkflowAPI: ({ workflowPath, projectPath }) => 
    ipcRenderer.invoke('submit-workflow-api', { workflowPath, projectPath }),
  
  // 🎬 新增：使用 Kimi 生成分镜脚本
  generateStoryboard: ({ imagePath, basePrompt, duration }) =>
    ipcRenderer.invoke('generate-storyboard', { imagePath, basePrompt, duration }),

  // 🎬 新增：生视频脚本策划（普通版/大师版）
  generateVideoScript: ({ imagePath, basePrompt, duration, shotCount, mode }) =>
    ipcRenderer.invoke('generate-video-script', { imagePath, basePrompt, duration, shotCount, mode }),

  // 🔮 新增：使用 Kimi 反推提示词
  analyzePrompt: ({ imagePath }) =>
    ipcRenderer.invoke('analyze-prompt', { imagePath }),

  // 平台信息
  platform: process.platform
});
