/**
 * Loading Window Preload
 */

const { ipcRenderer } = require('electron');

// 暴露安全的 API
window.loadingAPI = {
  onStatusUpdate: (callback) => {
    ipcRenderer.on('loading-status', (event, data) => {
      callback(data);
    });
  }
};
