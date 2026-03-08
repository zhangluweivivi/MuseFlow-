/**
 * ComfyUI Preload Script
 * 用于在 ComfyUI 页面中自动加载 MuseFlow 生成的工作流
 */

const { ipcRenderer } = require('electron');

// 当页面加载完成时
document.addEventListener('DOMContentLoaded', () => {
  console.log('[MuseFlow] ComfyUI 页面已加载，等待注入工作流...');
  
  // 通知主进程页面已准备好
  ipcRenderer.send('comfyui-page-ready');
  
  // 监听来自主进程的工作流数据
  ipcRenderer.on('load-workflow', (event, workflowData) => {
    console.log('[MuseFlow] 收到工作流数据，准备加载...');
    
    loadWorkflowIntoComfyUI(workflowData);
  });
});

// 尝试加载工作流到 ComfyUI
function loadWorkflowIntoComfyUI(workflow) {
  let attempts = 0;
  const maxAttempts = 200; // 最多尝试 20 秒

  const tryLoad = () => {
    attempts++;

    // 检查 ComfyUI 是否已加载
    if (typeof app !== 'undefined' && app.graph && app.loadGraphData) {
      console.log('[MuseFlow] ComfyUI app 对象已找到，尝试加载工作流...');
      try {
        app.loadGraphData(workflow);
        console.log('[MuseFlow] ✅ 工作流已成功加载到 ComfyUI');

        // 通知主进程
        ipcRenderer.send('workflow-loaded-success');

        // 显示成功提示
        showNotification('✅ MuseFlow 工作流已自动加载！所有参数已配置好，点击生成即可。', 'success');
        return true;
      } catch (error) {
        console.error('[MuseFlow] 加载工作流失败:', error);
        ipcRenderer.send('workflow-load-error', error.message || String(error));
        return false;
      }
    }

    // 调试输出
    if (attempts % 50 === 0) {
      console.log(`[MuseFlow] 等待 ComfyUI 加载中... (${attempts}/${maxAttempts})`);
      console.log(`[MuseFlow] app 存在: ${typeof app !== 'undefined'}`);
      if (typeof app !== 'undefined') {
        console.log(`[MuseFlow] app.graph 存在: ${!!app.graph}`);
        console.log(`[MuseFlow] app.loadGraphData 存在: ${!!app.loadGraphData}`);
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(tryLoad, 100);
    } else {
      const errorMsg = '等待 ComfyUI 加载超时（20秒）';
      console.error('[MuseFlow]', errorMsg);
      ipcRenderer.send('workflow-load-error', errorMsg);
    }

    return false;
  };

  tryLoad();
}

// 显示通知
function showNotification(message, type = 'info') {
  // 创建自定义通知元素
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#22c55e' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // 5秒后自动移除
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 8000);
}

// 暴露 API 给主进程调用
window.museflowAPI = {
  loadWorkflow: loadWorkflowIntoComfyUI
};
