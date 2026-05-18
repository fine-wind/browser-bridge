// ============================================================
// 代码虾 Browser Bridge - Background Script (Firefox 扩展)
// WebSocket 客户端，连接后端服务
// 标签页管理器 + 多页面并发 + 智能复用已打开页面
// ============================================================

const WS_PORT = 19876;
let ws = null;
let reconnectTimer = null;

// ============================================================
// 标签页管理器
// ============================================================
const TabManager = {
  _tabs: new Map(), // tabId -> { url, title, groupId, openedAt, id }

  /** 注册一个标签页 */
  register(tabId, info) {
    this._tabs.set(tabId, {
      tabId,
      url: info.url,
      title: info.title || "",
      groupId: info.groupId || "default",
      id: info.id || `tab_${tabId}`,
      openedAt: Date.now(),
    });
    this._syncInfo();
  },

  /** 更新标签页信息（比如加载完成后更新标题） */
  async refresh(tabId) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab && this._tabs.has(tabId)) {
        const info = this._tabs.get(tabId);
        info.url = tab.url || info.url;
        info.title = tab.title || info.title;
        this._tabs.set(tabId, info);
      }
    } catch (e) {
      // 标签可能已关闭
      this._tabs.delete(tabId);
    }
    this._syncInfo();
  },

  /** 按 id 查找标签页（你指定的那个 id） */
  findById(id) {
    for (const [tabId, info] of this._tabs) {
      if (info.id === id) return { ...info, tabId };
    }
    return null;
  },

  /** 按 groupId 查找 */
  findByGroup(groupId) {
    const result = [];
    for (const [tabId, info] of this._tabs) {
      if (info.groupId === groupId) result.push({ ...info, tabId });
    }
    return result;
  },

  /** 获取最新打开的某个 id 的标签页 */
  getLatest(id) {
    let latest = null;
    for (const [tabId, info] of this._tabs) {
      if (info.id === id && (!latest || info.openedAt > latest.openedAt)) {
        latest = { ...info, tabId };
      }
    }
    return latest;
  },

  /** 获取所有打开的标签页 */
  getAll() {
    return Array.from(this._tabs.values());
  },

  /** 获取状态快照 */
  getStatus() {
    return {
      openTabs: Array.from(this._tabs.entries()).map(([tid, info]) => ({
        tabId: tid,
        id: info.id,
        title: info.title,
        url: info.url,
        groupId: info.groupId,
        openedAt: info.openedAt,
      })),
    };
  },

  /** 移除 */
  remove(tabId) {
    this._tabs.delete(tabId);
    this._syncInfo();
  },

  /** 按 groupId 移除 */
  removeGroup(groupId) {
    const removed = [];
    for (const [tabId, info] of this._tabs) {
      if (info.groupId === groupId) {
        removed.push(tabId);
        this._tabs.delete(tabId);
      }
    }
    this._syncInfo();
    return removed;
  },

  /** 清除所有 */
  clear() {
    this._tabs.clear();
    this._syncInfo();
  },

  /** 通知后端标签页变化 */
  _syncInfo() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "tab_status",
        tabs: Array.from(this._tabs.entries()).map(([tid, info]) => ({
          tabId: tid, id: info.id, title: info.title,
          url: info.url, groupId: info.groupId,
        })),
      }));
    }
  },
};

// ============================================================
// WebSocket 连接
// ============================================================

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  console.log("🐚 正在连接后端服务 ws://localhost:" + WS_PORT);

  ws = new WebSocket("ws://localhost:" + WS_PORT);

  ws.onopen = () => {
    console.log("✅ WebSocket 已连接");
    ws.send(JSON.stringify({ type: "connected" }));
    TabManager._syncInfo();
  };

  ws.onclose = () => {
    console.log("🔌 WebSocket 已断开，5秒后重连...");
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {};

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "task") {
        await handleTask(msg);
      }
    } catch (e) {
      console.error("⚠️ 消息处理失败:", e);
    }
  };
}

// 监听标签页关闭 — 自动从注册表移除
browser.tabs.onRemoved.addListener((tabId) => {
  if (TabManager._tabs.has(tabId)) {
    console.log(`🗑️ 标签页已关闭: ${tabId} (${TabManager._tabs.get(tabId)?.id})`);
    TabManager.remove(tabId);
  }
});

// 监听标签页更新 — 刷新标题/URL
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && TabManager._tabs.has(tabId)) {
    TabManager.refresh(tabId);
  }
});

// ============================================================
// 任务调度
// ============================================================

async function handleTask(msg) {
  const { taskId, action, payload } = msg;
  console.log(`📩 任务: ${action} (${taskId})`, payload);

  try {
    let result;
    switch (action) {
      case "list_tabs":
        // 列出所有已打开的标签页
        result = TabManager.getStatus();
        break;

      case "scan_tabs":
        result = await scanAllBrowserTabs(payload);
        break;

      case "search":
        result = await executeSearch(payload);
        break;

      case "open_pages":
        result = await openMultiplePages(payload);
        break;

      case "open_url":
        // 直接打开一个 URL 并返回内容
        result = await openSinglePageAndGetContent(payload);
        break;

      case "get_page_content":
        result = await getPageContent(payload);
        break;

      case "click_element":
        result = await clickElement(payload);
        break;

      case "type_text":
        result = await typeText(payload);
        break;

      case "extract_data":
        result = await extractData(payload);
        break;

      case "scroll_page":
        result = await scrollPage(payload);
        break;

      case "close_tab":
        result = await closeTab(payload);
        break;

      case "close_all_tabs":
        result = await closeAllTabs(payload);
        break;

      case "execute_script":
        result = await executeScript(payload);
        break;

      case "ping":
        result = { pong: true };
        break;

      default:
        throw new Error(`未知任务: ${action}`);
    }

    sendResponse(taskId, "task_result", { taskId, action, result });
  } catch (e) {
    sendResponse(taskId, "task_error", { taskId, action, error: e.message });
  }
}

// ============================================================
// Action: scan_tabs — 扫描浏览器所有标签页
// ============================================================

async function scanAllBrowserTabs({ groupId = "browser", filterUrl, filterTitle }) {
  const allTabs = await browser.tabs.query({});
  const results = [];

  for (const tab of allTabs) {
    // 跳过 about: 和 moz-extension: 页面
    if (tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;

    // 可选过滤
    if (filterUrl && !tab.url.includes(filterUrl)) continue;
    if (filterTitle && !tab.title.includes(filterTitle)) continue;

    // 注册到管理器
    const id = `browser_${tab.id}`;
    TabManager.register(tab.id, {
      url: tab.url,
      title: tab.title,
      id,
      groupId,
    });

    results.push({
      tabId: tab.id,
      id,
      title: tab.title,
      url: tab.url,
      groupId,
      active: tab.active,
    });
  }

  return {
    scanned: results.length,
    tabs: results,
    openTabs: TabManager.getStatus(),
  };
}

// ============================================================
// Action: search — 搜索（自动复用已打开页面）
// ============================================================

async function executeSearch({ query, engine = "google", count = 5 }) {
  const searchUrls = {
    google: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${count}`,
    baidu: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${count}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}`,
    duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  };

  const url = searchUrls[engine] || searchUrls.google;

  // 检查是否有可复用的搜索标签页
  const existingTab = await findExistingTab(url, engine);
  if (existingTab) {
    // 复用已有标签页
    await browser.tabs.update(existingTab.tabId, { url, active: false });
    await waitForTabComplete(existingTab.tabId);
    const results = await browser.tabs.sendMessage(existingTab.tabId, {
      type: "extract_search_results", engine, count,
    });
    return { engine, query, url, tabId: existingTab.tabId, cached: true, results: results || [] };
  }

  // 新建标签页
  const tab = await browser.tabs.create({ url, active: false });
  TabManager.register(tab.id, { url, id: `search_${engine}_${Date.now()}`, groupId: "search" });
  await waitForTabComplete(tab.id);
  await TabManager.refresh(tab.id);

  const results = await browser.tabs.sendMessage(tab.id, {
    type: "extract_search_results", engine, count,
  });

  return { engine, query, url, tabId: tab.id, cached: false, results: results || [] };
}

/** 查找是否有同域名标签页 */
async function findExistingTab(url, engine) {
  // 查找是否有打开的搜索引擎标签页
  return null; // 为简化，每次都开新的
}

// ============================================================
// Action: open_pages — 同时打开多个页面
// ============================================================

async function openMultiplePages({ pages, groupId }) {
  const results = [];

  for (const page of pages) {
    try {
      const tab = await browser.tabs.create({ url: page.url, active: false });
      const tabId = tab.id;
      TabManager.register(tabId, { url: page.url, id: page.id, groupId });

      await waitForTabComplete(tabId);
      await TabManager.refresh(tabId);

      const info = TabManager._tabs.get(tabId);
      const content = await browser.tabs.sendMessage(tabId, {
        type: "extract_page_text",
      });

      results.push({
        id: page.id,
        url: info?.url || page.url,
        tabId,
        title: info?.title || tab.title,
        content: content?.text || "",
        status: "loaded",
      });
    } catch (e) {
      results.push({
        id: page.id,
        url: page.url,
        error: e.message,
        status: "error",
      });
    }
  }

  return { groupId, pages: results, openTabs: TabManager.getStatus() };
}

// ============================================================
// Action: open_url — 直接打开一个 URL，返回内容并存为标签
// ============================================================

async function openSinglePageAndGetContent({ url, id, groupId = "browse" }) {
  // 先查看是否已有同 id 的标签页，有则复用
  const existing = id ? TabManager.findById(id) : null;
  let tabId;

  if (existing) {
    tabId = existing.tabId;
    await browser.tabs.update(tabId, { url, active: false });
    await waitForTabComplete(tabId);
  } else {
    const tab = await browser.tabs.create({ url, active: false });
    tabId = tab.id;
    TabManager.register(tabId, { url, id: id || `page_${tabId}`, groupId });
    await waitForTabComplete(tabId);
  }

  await TabManager.refresh(tabId);
  const info = TabManager._tabs.get(tabId);
  const content = await browser.tabs.sendMessage(tabId, {
    type: "extract_page_text",
  });

  return {
    id: id || `page_${tabId}`,
    tabId,
    title: info?.title || "",
    url: info?.url || url,
    content: content?.text || "",
    openTabs: TabManager.getStatus(),
  };
}

// ============================================================
// Action: get_page_content — 获取内容（支持 tabId / id / url 查找）
// ============================================================

async function getPageContent({ tabId, id, url, groupId }) {
  let targetTabId = tabId;

  // 按 id 查找
  if (!targetTabId && id) {
    const found = TabManager.findById(id);
    if (found) targetTabId = found.tabId;
  }

  // 按 groupId 查找，取第一个
  if (!targetTabId && groupId) {
    const group = TabManager.findByGroup(groupId);
    if (group.length > 0) targetTabId = group[0].tabId;
  }

  // 按 url 查找
  if (!targetTabId && url) {
    const tabs = await browser.tabs.query({});
    const match = tabs.find(t => t.url?.includes(url));
    if (match) targetTabId = match.id;
  }

  if (!targetTabId) throw new Error("未找到对应的标签页，可使用 list_tabs 查看当前打开的页面");

  // 刷新一下内容
  const content = await browser.tabs.sendMessage(targetTabId, {
    type: "extract_page_text",
  });

  await TabManager.refresh(targetTabId);
  const info = TabManager._tabs.get(targetTabId);

  return {
    tabId: targetTabId,
    id: info?.id,
    title: info?.title || "",
    url: info?.url || "",
    content: content?.text || "",
    openTabs: TabManager.getStatus(),
  };
}

// ============================================================
// 以下为各类操作（click, type, extract, scroll, eval, close 等）
// 这些操作优先通过 id / groupId 查找标签页
// ============================================================

async function resolveTab({ tabId, id, groupId }) {
  if (tabId) return tabId;
  if (id) {
    const found = TabManager.findById(id);
    if (found) return found.tabId;
  }
  if (groupId) {
    const group = TabManager.findByGroup(groupId);
    if (group.length > 0) return group[0].tabId;
  }
  throw new Error("未找到标签页，先用 list_tabs 查看当前打开的页面");
}

async function clickElement({ tabId, id, groupId, selector, selectorType = "css" }) {
  const resolvedTabId = await resolveTab({ tabId, id, groupId });
  const result = await browser.tabs.sendMessage(resolvedTabId, {
    type: "execute_action", action: "click", selector, selectorType,
  });
  await sleep(2000);
  await TabManager.refresh(resolvedTabId);
  return { tabId: resolvedTabId, selector, clicked: true, pageChanged: result?.pageChanged };
}

async function typeText({ tabId, id, groupId, selector, text, selectorType = "css" }) {
  const resolvedTabId = await resolveTab({ tabId, id, groupId });
  await browser.tabs.sendMessage(resolvedTabId, {
    type: "execute_action", action: "type", selector, text, selectorType,
  });
  return { tabId: resolvedTabId, inserted: true };
}

async function extractData({ tabId, id, groupId, rules }) {
  const resolvedTabId = await resolveTab({ tabId, id, groupId });
  const result = await browser.tabs.sendMessage(resolvedTabId, {
    type: "execute_action", action: "extract", rules,
  });
  return { tabId: resolvedTabId, data: result?.data || {} };
}

async function scrollPage({ tabId, id, groupId, direction = "down", amount = 500 }) {
  const resolvedTabId = await resolveTab({ tabId, id, groupId });
  await browser.tabs.sendMessage(resolvedTabId, {
    type: "execute_action", action: "scroll", direction, amount,
  });
  return { tabId: resolvedTabId, scrolled: true };
}

async function executeScript({ tabId, id, groupId, code }) {
  const resolvedTabId = await resolveTab({ tabId, id, groupId });
  
  // 尝试用 sendMessage 走 content script
  try {
    const response = await browser.tabs.sendMessage(resolvedTabId, {
      type: "execute_action", action: "eval", code,
    });
    if (response && response.data !== undefined) {
      return { tabId: resolvedTabId, evalResult: response.data };
    }
  } catch (e) {
    // content script 无响应，走原生注入
  }
  
  // 原生注入（不依赖 content script）
  const results = await browser.tabs.executeScript(resolvedTabId, { code });
  return { tabId: resolvedTabId, evalResult: results?.[0] ?? null };
}

async function closeTab({ tabId, id, groupId }) {
  let tabIds = [];

  if (id) {
    const found = TabManager.findById(id);
    if (found) tabIds.push(found.tabId);
  } else if (groupId) {
    const group = TabManager.findByGroup(groupId);
    tabIds = group.map(g => g.tabId);
  } else if (tabId) {
    tabIds.push(tabId);
  }

  if (tabIds.length === 0) throw new Error("未找到要关闭的标签页");

  await browser.tabs.remove(tabIds);
  for (const tid of tabIds) TabManager.remove(tid);

  return { closedCount: tabIds.length, openTabs: TabManager.getStatus() };
}

async function closeAllTabs(_payload) {
  const allTabIds = [...TabManager._tabs.keys()];
  if (allTabIds.length > 0) await browser.tabs.remove(allTabIds);
  TabManager.clear();
  return { closedCount: allTabIds.length, openTabs: [] };
}

// ============================================================
// 工具函数
// ============================================================

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);

    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        browser.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    };

    browser.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function sendResponse(taskId, type, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, taskId, ...data }));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWS, 5000);
}

// ============================================================
// 监听来自 popup 的消息
// ============================================================

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "get_status":
      sendResponse({
        connected: ws?.readyState === WebSocket.OPEN,
        tabs: TabManager.getStatus(),
      });
      return true;
    case "reconnect":
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connectWS();
      sendResponse({ reconnecting: true });
      return true;
  }
});

// ============================================================
// 启动
// ============================================================

connectWS();
browser.runtime.onStartup.addListener(() => connectWS());
