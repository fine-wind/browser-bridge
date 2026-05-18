// ============================================================
// 代码虾 Browser Bridge - Content Script
// 注入到页面中，提供页面操作能力
// 支持：文本提取、点击、输入、滚动、自定义脚本、数据提取
// ============================================================

console.log("🐚 浏览器桥内容脚本已加载:", window.location.hostname);

// 监听来自 background 的消息
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "extract_search_results":
      sendResponse(extractSearchResults(msg.engine, msg.count));
      return true;

    case "extract_page_text":
      sendResponse(extractPageText());
      return true;

    case "execute_action":
      handleAction(msg, sendResponse);
      return true;

    default:
      sendResponse({ error: "未知消息类型" });
      return true;
  }
});

// ============================================================
// 提取搜索结果
// ============================================================

function extractSearchResults(engine, count) {
  switch (engine) {
    case "google": return extractGoogle(count);
    case "baidu": return extractBaidu(count);
    case "bing": return extractBing(count);
    case "duckduckgo": return extractDDG(count);
    default: return extractGeneric(count);
  }
}

function extractGoogle(count) {
  return [...document.querySelectorAll("div.g, div[data-hveid]")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3");
      const snippet = item.querySelector("div[data-sncf], div.VwiC3b, span.st");
      return {
        title: title?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractBaidu(count) {
  return [...document.querySelectorAll("#content_left .result, .result-op")]
    .slice(0, count)
    .map(item => {
      const title = item.querySelector("h3 a, .t a");
      const snippet = item.querySelector(".c-abstract, .c-span-last");
      return {
        title: title?.textContent?.trim() || "",
        url: title?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title);
}

function extractBing(count) {
  return [...document.querySelectorAll("#b_results > li.b_algo")]
    .slice(0, count)
    .map(item => {
      const title = item.querySelector("h2 a");
      const snippet = item.querySelector(".b_caption p");
      return {
        title: title?.textContent?.trim() || "",
        url: title?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title);
}

function extractDDG(count) {
  return [...document.querySelectorAll("article[data-testid='result']")]
    .slice(0, count)
    .map(item => {
      const title = item.querySelector("h2 a, a[data-testid='result-title-a']");
      const snippet = item.querySelector("[data-testid='result-snippet']");
      return {
        title: title?.textContent?.trim() || "",
        url: title?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title);
}

function extractGeneric(count) {
  return [...document.querySelectorAll("a[href^='http']")]
    .filter(a => a.textContent.trim().length > 5)
    .slice(0, count)
    .map(a => ({
      title: a.textContent.trim(),
      url: a.href,
      snippet: a.parentElement?.textContent.replace(a.textContent, "").trim().slice(0, 150) || "",
    }));
}

// ============================================================
// 提取页面正文（省 token 模式）
// 仅保留可见文本，去样式/脚本/广告/导航/页脚等噪音
// ============================================================

function extractPageText() {
  const title = document.title;

  // 块级标签 — 用于段落分隔
  const BLOCK_TAGS = new Set([
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "section", "td", "th", "pre", "br", "hr"
  ]);

  // 直接跳过的标签
  const SKIP_TAGS = new Set([
    "script", "style", "noscript", "iframe", "svg", "canvas",
    "nav", "header", "footer", "aside"
  ]);

  // 噪音关键词（class/id 匹配）
  const NOISE_KEYWORDS = [
    "sidebar", "nav", "menu", "menubar", "footer", "header",
    "cookie", "ad-", "advertisement", "advert", "ads",
    "popup", "modal", "overlay", "backdrop",
    "banner", "toolbar", "widget", "social", "share",
    "comment", "comment-", "related", "recommend"
  ];

  function isHidden(el) {
    const style = window.getComputedStyle(el);
    return style.display === "none" || style.visibility === "hidden";
  }

  function isNoiseAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return true;
      if (isHidden(cur)) return true;
      const cls = (cur.className || "").toLowerCase();
      const id = (cur.id || "").toLowerCase();
      for (const kw of NOISE_KEYWORDS) {
        if (cls.includes(kw) || id.includes(kw)) return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  // 取正文区域
  function getMainRegion() {
    return (
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.querySelector(".content, #content, .post, .article, .entry-content")
    );
  }

  const root = getMainRegion() || document.body;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (isNoiseAncestor(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  // 收集文本并保留段落结构
  const lines = [];
  let lastParent = null;

  while (walker.nextNode()) {
    const raw = walker.nodeValue || "";
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;

    const parent = walker.currentNode.parentElement;

    // 跨块级元素时加空行分隔段落
    if (lastParent && parent !== lastParent) {
      let p = parent;
      let lp = lastParent;
      let hasBlock = false;
      while (p && p !== root) {
        if (BLOCK_TAGS.has(p.tagName.toLowerCase())) { hasBlock = true; break; }
        p = p.parentElement;
      }
      if (!hasBlock) {
        while (lp && lp !== root) {
          if (BLOCK_TAGS.has(lp.tagName.toLowerCase())) { hasBlock = true; break; }
          lp = lp.parentElement;
        }
      }
      if (hasBlock) lines.push("");
    }

    lines.push(text);
    lastParent = parent;
  }

  const output = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = output.length > 30000 ? output.slice(0, 30000) + "\n\n... (已截断)" : output;

  return {
    title,
    url: window.location.href,
    text: truncated,
    wordCount: truncated.length,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// 执行动作
// ============================================================

async function handleAction(msg, sendResponse) {
  const { action, selector, selectorType = "css", text, rules, code, direction, amount } = msg;

  try {
    let result;

    switch (action) {
      case "click":
        result = await doClick(selector, selectorType);
        break;
      case "type":
        result = doType(selector, text, selectorType);
        break;
      case "extract":
        result = doExtract(rules);
        break;
      case "scroll":
        result = doScroll(direction, amount);
        break;
      case "eval":
        result = doEval(code);
        break;
      default:
        throw new Error(`未知动作: ${action}`);
    }

    sendResponse(result);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

/** 点击元素 */
async function doClick(selector, type) {
  const el = findElement(selector, type);
  if (!el) throw new Error(`未找到元素: ${selector}`);

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(300);

  // 判断是否是链接，点击后可能跳转
  const isLink = el.tagName === "A" || el.closest("a");
  const href = isLink ? (el.href || el.closest("a")?.href) : null;

  el.click();

  // 如果是链接且跳转到不同页面
  if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
    return { clicked: true, pageChanged: true, href };
  }

  return { clicked: true, pageChanged: false };
}

/** 在输入框输入 */
function doType(selector, text, type) {
  const el = findElement(selector, type);
  if (!el) throw new Error(`未找到输入框: ${selector}`);

  el.focus();
  el.value = "";
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  return { typed: true, target: selector };
}

/** 按规则提取数据 */
function doExtract(rules) {
  const data = {};
  for (const rule of rules || []) {
    const { name, selector, type = "text", attr } = rule;
    const elements = [...document.querySelectorAll(selector)];

    data[name] = elements.map(el => {
      switch (type) {
        case "text": return el.textContent.trim();
        case "html": return el.innerHTML;
        case "attr": return el.getAttribute(attr) || "";
        case "href": return el.href || el.getAttribute("href") || "";
        case "src": return el.src || el.getAttribute("src") || "";
        default: return el.textContent.trim();
      }
    });
  }
  return data;
}

/** 滚动页面 */
function doScroll(direction, amount) {
  const x = direction === "right" ? (amount || 500) : direction === "left" ? -(amount || 500) : 0;
  const y = direction === "down" ? (amount || 500) : direction === "up" ? -(amount || 500) : 0;
  window.scrollBy({ left: x, top: y, behavior: "smooth" });
  return { scrolled: true, x, y };
}

/** 执行自定义 JS */
function doEval(code) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(code);
    const result = fn();
    return { data: result === undefined ? null : (typeof result === 'object' ? JSON.stringify(result) : String(result)) };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

// ============================================================
// 工具函数
// ============================================================

function findElement(selector, type) {
  if (type === "xpath") {
    return document.evaluate(selector, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  if (type === "text") {
    return [...document.querySelectorAll("a, button, span, div")]
      .find(el => el.textContent.trim() === selector);
  }
  return document.querySelector(selector);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
