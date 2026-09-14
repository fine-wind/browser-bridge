// ============================================================
// CDP 通道动作 — 基于 browser-agent 移植
// ============================================================

import CDP from 'chrome-remote-interface';

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_CDP_HOST = '127.0.0.1';

let browserState = null;
let cdpClient = null;

export class CDPController {
  constructor(options = {}) {
    this.cdpHost = options.host || DEFAULT_CDP_HOST;
    this.cdpPort = options.port || DEFAULT_CDP_PORT;
  }

  async connect() {
    if (browserState) return browserState;

    const targets = await CDP.List({ host: this.cdpHost, port: this.cdpPort });
    const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-devtools'));

    if (!pageTarget) {
      throw new Error('Chrome 未启动，请以 --remote-debugging-port=' + this.cdpPort + ' 启动 Chrome');
    }

    const wsMatch = pageTarget.webSocketDebuggerUrl.match(/:\/\/([^:]+):(\d+)/);
    if (!wsMatch) {
      throw new Error('无法解析调试器URL: ' + pageTarget.webSocketDebuggerUrl);
    }

    cdpClient = await CDP({ host: wsMatch[1], port: parseInt(wsMatch[2], 10) });
    const { Page, Runtime, DOM, Input, Target } = await cdpClient;

    await Page.enable();
    await DOM.enable();
    await Runtime.enable();

    browserState = { Page, Runtime, DOM, Input, Target, currentPageId: pageTarget.id };
    return browserState;
  }

  getState() {
    if (!browserState) {
      throw new Error('未连接到 Chrome，请先调用 connect()');
    }
    return browserState;
  }

  async listTargets() {
    return await CDP.List({ host: this.cdpHost, port: this.cdpPort });
  }

  async navigate(url, waitUntil = 'load') {
    const { Page, Runtime } = this.getState();
    await Page.navigate({ url });

    if (waitUntil === 'load') {
      await new Promise(resolve => Page.once('LoadEventFired', resolve));
    } else if (waitUntil === 'domcontentloaded') {
      await new Promise(resolve => Page.once('DOMContentLoaded', resolve));
    } else {
      await this.waitForNetworkIdle(waitUntil === 'networkidle0' ? 0 : 2);
    }

    const result = await Runtime.evaluate({ expression: 'document.title + "|" + window.location.href', returnByValue: true });
    const parts = String(result.value).split('|');
    return { title: parts[0] || '', url: parts[1] || url };
  }

  async screenshot() {
    const { Page } = this.getState();
    const result = await Page.captureScreenshot({ format: 'png' });
    return { image: result.data };
  }

  async getDOM(depth = 3) {
    const { DOM } = this.getState();
    const docResult = await DOM.getDocument({ depth: 0 });
    const flatResult = await DOM.getFlattenedDocument({ nodeId: docResult.root.nodeId, depth: depth + 2 });

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD']);
    const KEPT_ATTRS = new Set(['id', 'class', 'type', 'name', 'placeholder', 'aria-label', 'role', 'href', 'src', 'alt', 'title', 'value']);

    return await this.walkDOM(flatResult.root, KEPT_ATTRS, SKIP_TAGS, depth, 1);
  }

  async evaluate(expression) {
    const { Runtime } = this.getState();
    const result = await Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
    return result.result;
  }

  async click(selector, timeout = 10000) {
    const { DOM, Runtime, Input } = this.getState();
    const node = await this.waitForSelector(selector, timeout, DOM, Runtime);
    if (!node) return { success: false };

    if (node._jsRef) {
      const jsExpr = `(function(){
        var el = window.__cdp_last_element;
        if (!el) return { ok: false };
        el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
        el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
        el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
        return { ok: true, tag: el.tagName };
      })()`;
      const r = await Runtime.evaluate({ expression: jsExpr, returnByValue: true });
      return r.result?.value?.ok ? { success: true } : { success: false };
    }

    const box = await DOM.getBox({ nodeId: node.nodeId });
    const { x, y, width, height } = box.rect;
    await Input.dispatchMouseEvent({ type: 'mousePressed', x: x + width/2, y: y + height/2, button: 'left' });
    await new Promise(r => setTimeout(r, 50));
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x: x + width/2, y: y + height/2, button: 'left' });
    return { success: true };
  }

  async type(selector, text, clear = true) {
    const { Runtime, Input } = this.getState();
    const node = await this.waitForSelector(selector, 10000, this.getState().DOM, Runtime);
    if (!node) return { success: false };

    await Input.insertText({ text });
    return { success: true };
  }

  async scroll(direction, amount = 300) {
    const { Runtime } = this.getState();
    let x = 0, y = 0;
    if (direction === 'down') y = amount;
    else if (direction === 'up') y = -amount;
    else if (direction === 'right') x = amount;
    else if (direction === 'left') x = -amount;
    await Runtime.evaluate({ expression: `window.scrollBy(${x}, ${y}); 'ok'`, returnByValue: true });
    return { success: true };
  }

  async switchTab(targetId) {
    const { Target } = this.getState();
    await Target.activateTarget({ targetId });
    return { success: true, tabId: targetId };
  }

  async newTab(url) {
    const { Target } = this.getState();
    const newTarget = await Target.createTarget({ url: url || 'about:blank' });
    await new Promise(r => setTimeout(r, 500));
    return { tabId: newTarget.targetId, url: url || 'about:blank', title: 'New Tab' };
  }

  async getCurrentPageInfo() {
    const { Runtime } = this.getState();
    const result = await Runtime.evaluate({ expression: '({ url: window.location.href, title: document.title })', returnByValue: true });
    const data = result.result?.value;
    return { success: true, url: data?.url || '', title: data?.title || '' };
  }

  async disconnect() {
    if (cdpClient) {
      try { await cdpClient.close(); } catch {}
      cdpClient = null;
      browserState = null;
    }
  }

  // ===== 私有方法 =====

  async waitForSelector(selector, timeout, DOM, Runtime) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await this.resolveSelector(selector, DOM, Runtime);
      if (result) return result;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  async resolveSelector(selector, DOM, Runtime) {
    const textMatch = selector.match(/^text:["'](.+)["']$/);
    if (textMatch) {
      const r = await Runtime.evaluate({
        expression: `(function(txt){
          var all=document.querySelectorAll('*');
          for(var i=0;i<all.length;i++){
            var el=all[i];
            if(el.tagName==='SCRIPT'||el.tagName==='STYLE')continue;
            var rect=el.getBoundingClientRect();
            if(rect.width===0&&rect.height===0)continue;
            if(el.textContent&&el.textContent.trim()===txt.trim()){
              window.__cdp_last_element=el;
              return{found:true};
            }
          }
          return null;
        })(${JSON.stringify(textMatch[1])})`,
        returnByValue: true
      });
      if (r.result?.value?.found) return { _jsRef: true };
      return null;
    }

    if (selector.startsWith('//')) {
      const r = await Runtime.evaluate({
        expression: `(function(xpath){
          var r=document.evaluate(xpath,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null);
          var el=r.singleNodeValue;
          if(!el||el===document)return null;
          window.__cdp_last_element=el;
          return{found:true};
        })(${JSON.stringify(selector)})`,
        returnByValue: true
      });
      if (r.result?.value?.found) return { _jsRef: true };
      return null;
    }

    try {
      const domResult = await DOM.querySelector({ nodeId: 1, selector });
      if (domResult.nodeId) return domResult;
    } catch {}
    return null;
  }

  async waitForNetworkIdle(threshold = 2, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let pending = 0;
      const { Page } = this.getState();
      const check = () => { if (pending <= threshold) { clearTimeout(t); resolve(); } };
      Page.networkRequestWillBeSent(() => { pending++; });
      Page.networkLoadingFinished(() => { pending--; check(); });
      const t = setTimeout(() => {
        pending <= threshold ? resolve() : reject(new Error(`网络空闲超时: ${pending} pending`));
      }, timeoutMs);
      check();
    });
  }

  async walkDOM(parentNode, keptAttrs, skipTags, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) return '';
    let html = '';
    const children = parentNode.children || [];
    for (const child of children) {
      if (currentDepth > maxDepth) break;
      if (child.nodeType !== 1) {
        if (child.nodeType === 3 && child.textContent?.trim()) {
          html += child.textContent.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        continue;
      }
      const tagName = (child.nodeName || '').toUpperCase();
      if (skipTags.has(tagName)) continue;
      html += `<${tagName.toLowerCase()}`;
      if (child.attributes) {
        for (let i = 0; i < child.attributes.length; i += 2) {
          const attrName = child.attributes[i];
          const attrValue = child.attributes[i + 1];
          if (keptAttrs.has(attrName)) {
            html += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
          }
        }
      }
      html += '>';
      if (child.children?.length > 0) {
        html += await this.walkDOM(child, keptAttrs, skipTags, maxDepth, currentDepth + 1);
      }
      html += `</${tagName.toLowerCase()}>`;
    }
    return html;
  }
}

// ===== 动作注册 =====

export const cdpActions = {
  browser_navigate: {
    schema: { url: 'string', waitUntil: 'string' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.navigate(args.url, args.waitUntil);
    }
  },
  browser_click: {
    schema: { selector: 'string', timeout: 'number' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.click(args.selector, args.timeout);
    }
  },
  browser_type: {
    schema: { selector: 'string', text: 'string', clear: 'boolean' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.type(args.selector, args.text, args.clear);
    }
  },
  browser_screenshot: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.screenshot();
    }
  },
  browser_get_dom: {
    schema: { depth: 'number' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      const html = await ctrl.getDOM(args.depth);
      const elementCount = (html.match(/<[a-z][^>]*>/gi) || []).length;
      return { html, elementCount };
    }
  },
  browser_evaluate: {
    schema: { expression: 'string' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.evaluate(args.expression);
    }
  },
  browser_get_tabs: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      const targets = await ctrl.listTargets();
      const pages = targets.filter(t => t.type === 'page' && !t.url.startsWith('chrome-devtools'));
      return { tabs: pages.map(t => ({ id: t.id, url: t.url, title: t.title })) };
    }
  },
  browser_switch_tab: {
    schema: { tabId: 'string' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.switchTab(args.tabId);
    }
  },
  browser_new_tab: {
    schema: { url: 'string' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.newTab(args?.url);
    }
  },
  browser_scroll: {
    schema: { direction: 'string', amount: 'number' },
    handler: async (args) => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.scroll(args.direction, args.amount);
    }
  },
  browser_get_page_info: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      await ctrl.connect();
      return await ctrl.getCurrentPageInfo();
    }
  },
  browser_back: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      await ctrl.connect();
      const { Runtime, Page } = ctrl.getState();
      await Runtime.evaluate({ expression: 'window.history.back()' });
      await new Promise(resolve => Page.once('LoadEventFired', resolve));
      return await ctrl.getCurrentPageInfo();
    }
  },
  browser_forward: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      await ctrl.connect();
      const { Runtime, Page } = ctrl.getState();
      await Runtime.evaluate({ expression: 'window.history.forward()' });
      await new Promise(resolve => Page.once('LoadEventFired', resolve));
      return await ctrl.getCurrentPageInfo();
    }
  },
  browser_reload: {
    schema: {},
    handler: async () => {
      const ctrl = new CDPController();
      await ctrl.connect();
      const { Page } = ctrl.getState();
      await Page.reload();
      await new Promise(resolve => Page.once('LoadEventFired', resolve));
      return await ctrl.getCurrentPageInfo();
    }
  }
};
