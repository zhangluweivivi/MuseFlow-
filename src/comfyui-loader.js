/**
 * MuseFlow Desktop - ComfyUI 加载窗口
 * 显示加载进度，等待工作流准备好
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

class ComfyUILoader {
  constructor() {
    this.loadingWindow = null;
    this.comfyWindow = null;
    this.workflowResolve = null;
    this.workflowReject = null;
    this.pageReady = false;
    this.workflowData = null;
    
    // 预先设置全局 IPC 监听器（确保不会错过事件）
    this.setupGlobalIPCListeners();
  }
  
  /**
   * 设置全局 IPC 监听器（在构造函数中调用，确保只设置一次）
   */
  setupGlobalIPCListeners() {
    // 移除旧的监听器，避免重复
    ipcMain.removeAllListeners('comfyui-page-ready');
    ipcMain.removeAllListeners('workflow-loaded-success');
    ipcMain.removeAllListeners('workflow-load-error');
    
    // 页面准备好事件
    ipcMain.on('comfyui-page-ready', () => {
      console.log('[ComfyUILoader] ✅ ComfyUI 页面已准备好');
      this.pageReady = true;
      
      // 如果有等待中的工作流数据，立即发送
      if (this.workflowData && this.comfyWindow && !this.comfyWindow.isDestroyed()) {
        console.log('[ComfyUILoader] 发送工作流到页面');
        this.comfyWindow.webContents.send('load-workflow', this.workflowData);
      }
    });
    
    // 工作流加载成功
    ipcMain.on('workflow-loaded-success', () => {
      console.log('[ComfyUILoader] ✅ 工作流加载成功');
      if (this.workflowResolve) {
        this.workflowResolve({ success: true, workflowLoaded: true });
        this.workflowResolve = null;
        this.workflowReject = null;
      }
    });
    
    // 工作流加载失败
    ipcMain.on('workflow-load-error', (event, error) => {
      console.error('[ComfyUILoader] ❌ 工作流加载失败:', error);
      if (this.workflowReject) {
        this.workflowReject({ success: false, error: error || '加载失败' });
        this.workflowResolve = null;
        this.workflowReject = null;
      }
    });

    // 工作流加载超时
    ipcMain.on('workflow-load-timeout', () => {
      console.error('[ComfyUILoader] ⏱️ 工作流加载超时');
      if (this.workflowReject) {
        this.workflowReject({ success: false, error: '工作流加载超时' });
        this.workflowResolve = null;
        this.workflowReject = null;
      }
    });
  }

  /**
   * 显示加载窗口
   */
  showLoadingWindow() {
    this.loadingWindow = new BrowserWindow({
      width: 500,
      height: 350,
      title: 'MuseFlow - 加载中',
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'loading-preload.js')
      }
    });

    this.loadingWindow.loadFile(path.join(__dirname, 'loading.html'));
    return this.loadingWindow;
  }

  /**
   * 更新加载状态
   */
  updateStatus(message, progress = null) {
    if (this.loadingWindow && !this.loadingWindow.isDestroyed()) {
      this.loadingWindow.webContents.send('loading-status', { message, progress });
    }
  }

  /**
   * 关闭加载窗口
   */
  closeLoadingWindow() {
    if (this.loadingWindow && !this.loadingWindow.isDestroyed()) {
      this.loadingWindow.close();
      this.loadingWindow = null;
    }
  }

  /**
   * 关闭 ComfyUI 窗口
   */
  closeComfyWindow() {
    if (this.comfyWindow && !this.comfyWindow.isDestroyed()) {
      this.comfyWindow.close();
      this.comfyWindow = null;
    }
  }

  /**
   * 使用 http 模块检查 ComfyUI 状态
   */
  async checkComfyUIStatus() {
    return new Promise((resolve) => {
      const request = http.get('http://127.0.0.1:8000/system_stats', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ ok: true, data: json });
          } catch {
            resolve({ ok: true, data: null });
          }
        });
      });
      
      request.on('error', () => {
        resolve({ ok: false, error: 'Connection failed' });
      });
      
      request.setTimeout(5000, () => {
        request.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });
    });
  }

  /**
   * 检查 ComfyUI 是否正在下载模型
   */
  async isComfyUIDownloading() {
    try {
      const result = await this.checkComfyUIStatus();
      if (result.ok && result.data) {
        if (result.data.downloading || (result.data.system && result.data.system.downloading)) {
          return true;
        }
      }
    } catch {
      // 无法连接
    }
    return false;
  }

  /**
   * 等待 ComfyUI 启动
   */
  async waitForComfyUI(maxRetries = 60) {
    let retries = maxRetries;
    
    while (retries > 0) {
      const result = await this.checkComfyUIStatus();
      if (result.ok) {
        return { ok: true };
      }
      
      await this.sleep(1000);
      retries--;
      
      if (retries % 10 === 0) {
        this.updateStatus(`等待 ComfyUI 响应... (${maxRetries - retries}/${maxRetries})`, 
          10 + (maxRetries - retries) * 1.3);
      }
    }
    
    return { ok: false, error: '连接超时' };
  }

  /**
   * 启动 ComfyUI Desktop 应用
   */
  async launchComfyUI() {
    const { exec } = require('child_process');
    const fs = require('fs');
    const comfyUIPath = '/Applications/ComfyUI.app';
    
    if (!fs.existsSync(comfyUIPath)) {
      return { ok: false, error: 'ComfyUI.app 未找到' };
    }
    
    console.log('[ComfyUILoader] 启动 ComfyUI Desktop...');
    exec(`open "${comfyUIPath}"`);
    
    // 等待启动
    this.updateStatus('正在启动 ComfyUI...', 40);
    const result = await this.waitForComfyUI(60);
    
    return result;
  }

  /**
   * 等待页面准备好（通过 IPC 事件）
   */
  async waitForPageReady(timeoutMs = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(() => {
        if (this.pageReady) {
          clearInterval(checkInterval);
          resolve({ ready: true });
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve({ ready: false, error: '等待页面准备好超时' });
        }
      }, 100);
    });
  }

  /**
   * 加载工作流到 ComfyUI
   */
  async loadWorkflow(workflowData, projectPath) {
    console.log('[ComfyUILoader] loadWorkflow 被调用');
    console.log('  projectPath:', projectPath);
    
    // 重置状态
    this.pageReady = false;
    this.workflowData = workflowData;
    
    // 1. 显示 loading 窗口
    this.showLoadingWindow();
    this.updateStatus('正在检测 ComfyUI 状态...', 10);
    
    try {
      // 2. 检查 ComfyUI 是否已运行
      let status = await this.waitForComfyUI(30);
      
      // 3. 如果未运行，尝试启动
      if (!status.ok) {
        this.updateStatus('ComfyUI 未运行，尝试启动...', 30);
        status = await this.launchComfyUI();
        
        if (!status.ok) {
          throw new Error('无法启动 ComfyUI: ' + status.error);
        }
      }
      
      this.updateStatus('✅ ComfyUI 已连接', 50);
      
      // 4. 创建 ComfyUI 窗口（隐藏）
      this.comfyWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        show: false,
        title: 'ComfyUI - MuseFlow',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
          preload: path.join(__dirname, 'comfyui-preload.js')
        }
      });
      
      this.updateStatus('正在加载 ComfyUI 界面...', 60);
      
      // 5. 加载 ComfyUI 页面
      await this.comfyWindow.loadURL('http://127.0.0.1:8000');
      
      this.updateStatus('等待页面初始化...', 70);
      
      // 6. 等待页面准备好（通过 IPC 事件）
      const pageStatus = await this.waitForPageReady(30000);

      if (!pageStatus.ready) {
        throw new Error('页面初始化超时（30秒），请检查 ComfyUI 是否正常加载');
      }
      
      this.updateStatus('正在注入工作流...', 85);
      
      // 7. 发送工作流数据（页面已准备好，会立即处理）
      this.comfyWindow.webContents.send('load-workflow', workflowData);
      
      this.updateStatus('等待工作流加载完成...', 90);
      
      // 8. 等待加载结果
      const result = await new Promise((resolve, reject) => {
        this.workflowResolve = resolve;
        this.workflowReject = reject;
        
        // 设置超时
        setTimeout(() => {
          reject({ success: false, error: '工作流加载超时（10秒）' });
        }, 10000);
      });
      
      // 9. 显示窗口
      if (result.success) {
        this.updateStatus('✅ 工作流加载成功！', 100);
        
        setTimeout(() => {
          if (this.comfyWindow && !this.comfyWindow.isDestroyed()) {
            this.comfyWindow.show();
          }
          this.closeLoadingWindow();
          
          // 打开项目文件夹
          if (projectPath && typeof projectPath === 'string') {
            const { shell } = require('electron');
            shell.openPath(projectPath);
          }
        }, 500);
      }
      
      return result;
      
    } catch (error) {
      console.error('[ComfyUILoader] 加载失败:', error);
      this.updateStatus(`❌ ${error.message || '加载失败'}`, 0);
      
      setTimeout(() => {
        if (this.comfyWindow && !this.comfyWindow.isDestroyed()) {
          this.comfyWindow.show();
        }
        this.closeLoadingWindow();
      }, 3000);
      
      return { 
        success: false, 
        error: error.message || '加载失败',
        canRetry: true 
      };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ComfyUILoader;
