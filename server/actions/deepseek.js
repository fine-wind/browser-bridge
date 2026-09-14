// ============================================================
// DeepSeek 通道动作 — 基于 browser-agent 移植
// ============================================================

import { CDPController } from './cdp.js';

export class DeepSeekController {
  constructor() {
    this.ctrl = new CDPController();
  }

  async openChat() {
    try {
      await this.ctrl.connect();
      await this.ctrl.navigate('https://chat.deepseek.com', 'domcontentloaded');
      return { success: true, url: 'https://chat.deepseek.com' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async sendMessage(text) {
    try {
      await this.ctrl.connect();
      await this.ctrl.waitForSelector('.deepseek-chat-input, [placeholder*="发送"]', 10000, this.ctrl.getState().DOM, this.ctrl.getState().Runtime);
      await this.ctrl.type('.deepseek-chat-input, [placeholder*="发送"]', text, true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async waitForReply(timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await this.ctrl.connect();
        const result = await this.ctrl.evaluate(`
          (function() {
            var replies = document.querySelectorAll('.deepseek-message-ai, .prose, [class*="message"]');
            if (replies.length > 0) {
              var lastReply = replies[replies.length - 1];
              return { found: true, text: (lastReply.textContent || '').trim().substring(0, 5000) };
            }
            return { found: false };
          })()
        `);
        if (result?.found) return { success: true, content: result.text };
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    return { success: false };
  }

  async getConversationHistory() {
    try {
      await this.ctrl.connect();
      const result = await this.ctrl.evaluate(`
        (function() {
          var messages = [];
          var elements = document.querySelectorAll('.deepseek-message-user, .deepseek-message-ai, [class*="message"]');
          elements.forEach(function(el, idx) {
            var isUser = el.classList.contains('deepseek-message-user') || el.closest('[class*="user"]') !== null;
            messages.push({
              id: 'msg_' + idx,
              role: isUser ? 'user' : 'assistant',
              content: (el.textContent || '').trim().substring(0, 2000),
              timestamp: Date.now()
            });
          });
          return { messages: messages };
        })()
      `);
      return { success: true, messages: result?.messages || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async newChat() {
    try {
      await this.ctrl.connect();
      await this.ctrl.click('.new-chat-btn, [aria-label*="新建"], text:"新建对话"', 5000);
      await new Promise(r => setTimeout(r, 1000));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async checkLoginStatus() {
    try {
      await this.ctrl.connect();
      const result = await this.ctrl.evaluate(`
        (function() {
          var userInfo = document.querySelector('.user-info, [class*="avatar"], [class*="profile"]');
          return { isLoggedIn: !!userInfo, url: window.location.href };
        })()
      `);
      return { isLoggedIn: result?.isLoggedIn || false, url: result?.url || '' };
    } catch {
      return { isLoggedIn: false, url: '' };
    }
  }

  async exportConversation() {
    try {
      const history = await this.getConversationHistory();
      if (!history.success) return { success: false };
      return {
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          messageCount: history.messages?.length || 0,
          messages: history.messages
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// ===== 动作注册 =====

export const deepseekActions = {
  deepseek_open_chat: {
    schema: {},
    handler: async () => {
      const ds = new DeepSeekController();
      return await ds.openChat();
    }
  },
  deepseek_send_message: {
    schema: { text: 'string' },
    handler: async (args) => {
      const ds = new DeepSeekController();
      return await ds.sendMessage(args.text);
    }
  },
  deepseek_wait_reply: {
    schema: { timeout: 'number' },
    handler: async (args) => {
      const ds = new DeepSeekController();
      return await ds.waitForReply(args.timeout);
    }
  },
  deepseek_get_history: {
    schema: {},
    handler: async () => {
      const ds = new DeepSeekController();
      return await ds.getConversationHistory();
    }
  },
  deepseek_new_chat: {
    schema: {},
    handler: async () => {
      const ds = new DeepSeekController();
      return await ds.newChat();
    }
  },
  deepseek_check_login: {
    schema: {},
    handler: async () => {
      const ds = new DeepSeekController();
      return await ds.checkLoginStatus();
    }
  },
  deepseek_export: {
    schema: {},
    handler: async () => {
      const ds = new DeepSeekController();
      return await ds.exportConversation();
    }
  }
};
