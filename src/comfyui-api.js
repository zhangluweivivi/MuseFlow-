/**
 * MuseFlow Desktop - ComfyUI API 提交器
 * 通过 ComfyUI REST API 直接提交工作流
 */

const http = require('http');
const fs = require('fs');

class ComfyUIAPI {
  constructor(baseURL = 'http://127.0.0.1:8000') {
    this.baseURL = baseURL;
  }

  /**
   * 检查 ComfyUI 是否运行
   */
  async checkStatus() {
    return new Promise((resolve) => {
      const request = http.get(`${this.baseURL}/system_stats`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ 
              ok: true, 
              data: json,
              status: 'running',
              message: 'ComfyUI 运行中'
            });
          } catch {
            resolve({ ok: true, data: null, status: 'running' });
          }
        });
      });
      
      request.on('error', (err) => {
        resolve({ 
          ok: false, 
          error: err.message,
          status: 'stopped',
          message: 'ComfyUI 未运行'
        });
      });
      
      request.setTimeout(5000, () => {
        request.destroy();
        resolve({ 
          ok: false, 
          error: '连接超时',
          status: 'timeout',
          message: '连接 ComfyUI 超时'
        });
      });
    });
  }

  /**
   * 提交工作流到 ComfyUI
   * @param {Object} workflow - API 格式的工作流
   * @param {Object} options - 可选参数
   * @returns {Promise<Object>}
   */
  async submitWorkflow(workflow, options = {}) {
    const promptPayload = {
      prompt: workflow,
      client_id: options.clientId || `museflow_${Date.now()}`,
      extra_data: {
        extra_pnginfo: {
          workflow: options.uiWorkflow || workflow
        }
      }
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(promptPayload);
      
      const request = http.request(`${this.baseURL}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({
                success: true,
                promptId: response.prompt_id,
                number: response.number,
                nodeErrors: response.node_errors || {},
                message: `工作流已提交到队列，编号 #${response.number}`
              });
            } else {
              reject(new Error(response.error || `提交失败: HTTP ${res.statusCode}`));
            }
          } catch (err) {
            reject(new Error(`解析响应失败: ${err.message}`));
          }
        });
      });

      request.on('error', (err) => {
        reject(new Error(`请求失败: ${err.message}`));
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('提交超时'));
      });

      request.write(postData);
      request.end();
    });
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus() {
    return new Promise((resolve) => {
      const request = http.get(`${this.baseURL}/queue`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ ok: true, data: json });
          } catch {
            resolve({ ok: false, error: '解析失败' });
          }
        });
      });

      request.on('error', () => resolve({ ok: false }));
      request.setTimeout(5000, () => {
        request.destroy();
        resolve({ ok: false, error: '超时' });
      });
    });
  }

  /**
   * 上传文件到 ComfyUI
   * @param {string} filePath - 本地文件路径
   * @param {string} type - 文件类型 (image, audio, etc.)
   */
  async uploadFile(filePath, type = 'image') {
    return new Promise((resolve, reject) => {
      const boundary = `----MuseFlowBoundary${Date.now()}`;
      const fileName = filePath.split('/').pop();
      const fileData = fs.readFileSync(filePath);

      const formData = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="image"; filename="${fileName}"`,
        'Content-Type: application/octet-stream',
        '',
        fileData,
        `--${boundary}--`,
        ''
      ].join('\r\n');

      const request = http.request(`${this.baseURL}/upload/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(formData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({
                success: true,
                name: response.name,
                subfolder: response.subfolder,
                type: response.type
              });
            } else {
              reject(new Error(response.error || '上传失败'));
            }
          } catch (err) {
            reject(new Error('解析上传响应失败'));
          }
        });
      });

      request.on('error', (err) => reject(new Error(`上传失败: ${err.message}`)));
      request.setTimeout(60000, () => {
        request.destroy();
        reject(new Error('上传超时'));
      });

      request.write(formData);
      request.end();
    });
  }

  /**
   * 完整流程：检查状态、上传文件、提交工作流
   * @param {Object} params
   * @param {Object} params.apiWorkflow - API格式工作流
   * @param {Object} params.uiWorkflow - UI格式工作流（可选）
   * @param {string} params.imagePath - 图片路径
   * @param {string} params.audioPath - 音频路径
   */
  async submitFullWorkflow(params) {
    const results = {
      success: false,
      steps: []
    };

    try {
      // 1. 检查 ComfyUI 状态
      results.steps.push({ step: 'check', status: 'running', message: '检查 ComfyUI 状态...' });
      const status = await this.checkStatus();
      
      if (!status.ok) {
        results.steps.push({ step: 'check', status: 'failed', message: status.message });
        return { ...results, error: status.message, needsStart: true };
      }
      results.steps.push({ step: 'check', status: 'success', message: status.message });

      // 2. 提交工作流
      results.steps.push({ step: 'submit', status: 'running', message: '提交工作流到队列...' });
      const submitResult = await this.submitWorkflow(params.apiWorkflow, {
        uiWorkflow: params.uiWorkflow
      });
      
      results.steps.push({ 
        step: 'submit', 
        status: 'success', 
        message: submitResult.message,
        promptId: submitResult.promptId,
        number: submitResult.number
      });

      // 检查是否有节点错误
      if (Object.keys(submitResult.nodeErrors).length > 0) {
        results.steps.push({
          step: 'validation',
          status: 'warning',
          message: `部分节点可能有问题: ${Object.keys(submitResult.nodeErrors).join(', ')}`,
          errors: submitResult.nodeErrors
        });
      }

      return {
        ...results,
        success: true,
        promptId: submitResult.promptId,
        queueNumber: submitResult.number,
        message: `✅ 工作流已成功提交到 ComfyUI！\n队列编号: #${submitResult.number}\n请打开 ComfyUI 查看生成进度。`
      };

    } catch (error) {
      results.steps.push({ step: 'submit', status: 'failed', message: error.message });
      return {
        ...results,
        success: false,
        error: error.message,
        canRetry: true
      };
    }
  }
}

module.exports = ComfyUIAPI;
