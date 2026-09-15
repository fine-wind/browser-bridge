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
    case "brave": return extractBrave(count);
    case "yandex": return extractYandex(count);
    case "ecosia": return extractEcosia(count);
    case "startpage": return extractStartpage(count);
    case "qwant": return extractQwant(count);
    case "swisscows": return extractSwisscows(count);
    case "mojeek": return extractMojeek(count);
    case "gigablast": return extractGeneric(count);
    case "kagi": return extractKagi(count);
    case "presearch": return extractPresearch(count);
    case "searxng": return extractSearXNG(count);
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
  // Bing 搜索结果选择器（支持新版布局）
  const selectors = [
    '#b_results > li.b_algo',
    'li.b_algo',
    '.b_algo',
    '[data-se="1"]', '[data-se="2"]', '[data-se="3"]',
    'article.searchResult',
    '.webResult',
    '.b_main .b_algo',
    'ol#b_results > li'
  ];

  let results = [];
  for (const sel of selectors) {
    results = [...document.querySelectorAll(sel)];
    if (results.length > 0) break;
  }

  return results
    .slice(0, count)
    .map(item => {
      const link = item.querySelector('h2 a, a[href^="http"]');
      const titleEl = item.querySelector('h2 a, h2, .title a');
      const snippetEl = item.querySelector('.b_caption p, .b_lineclamp, .b_lineclamp2, .b_caption, p, .snippet');
      return {
        title: (titleEl || link)?.textContent?.trim() || '',
        url: link?.href || '',
        snippet: snippetEl?.textContent?.trim() || '',
      };
    })
    .filter(r => r.title && r.url);
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

function extractBrave(count) {
  // Brave Search 使用 div[data-rank] 包裹每条结果
  return [...document.querySelectorAll("div[data-rank]")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http'], a[href^='/url']");
      const title = item.querySelector("h3 a, [data-component='title'], a[data-component='title']");
      const snippet = item.querySelector("[data-component='snippet'], .snippet, p");
      let url = link?.href || "";
      // Brave 的 /url 开头链接需要解码
      if (url.startsWith("/url")) {
        try { url = new URL(url, window.location.origin).href; } catch (e) {}
      }
      return {
        title: title?.textContent?.trim() || link?.textContent?.trim() || "",
        url,
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractYandex(count) {
  return [...document.querySelectorAll("li[data-morphid], .search-item__content, .organic-item")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h2 a, .organic-item__title a, .link");
      const snippet = item.querySelector(".snippet, .text, .snippet__text");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractEcosia(count) {
  return [...document.querySelectorAll("div.result, li.result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3 a, .result__title a");
      const snippet = item.querySelector(".result__snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractStartpage(count) {
  return [...document.querySelectorAll("div.web-result, article.web-result, .w-gl__result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3 a, .title, a[class*='title']");
      const snippet = item.querySelector(".r, .snippet, p[class*='snippet']");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractQwant(count) {
  return [...document.querySelectorAll("article.result, .result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h2 a, .result-title, .title");
      const snippet = item.querySelector(".result-body, .snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractSwisscows(count) {
  return [...document.querySelectorAll("article.result, .result-row")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h2 a, .title, a[data-type='url']");
      const snippet = item.querySelector(".text, .snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractMojeek(count) {
  return [...document.querySelectorAll("article.snippet, .result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3 a, .result__title a");
      const snippet = item.querySelector(".snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractKagi(count) {
  return [...document.querySelectorAll("div.k-searchresult, article.search-result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3 a, .k-title, a[class*='title']");
      const snippet = item.querySelector(".k-snippet, .snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractPresearch(count) {
  return [...document.querySelectorAll("div.result, article.result")]
    .slice(0, count)
    .map(item => {
      const link = item.querySelector("a[href^='http']");
      const title = item.querySelector("h3 a, .title, a[class*='title']");
      const snippet = item.querySelector(".snippet, p");
      return {
        title: (title || link)?.textContent?.trim() || "",
        url: link?.href || "",
        snippet: snippet?.textContent?.trim() || "",
      };
    })
    .filter(r => r.title && r.url);
}

function extractSearXNG(count) {
  // SearXNG JSON API 返回格式
  const jsonResult = document.querySelector("pre");
  if (jsonResult) {
    try {
      const data = JSON.parse(jsonResult.textContent);
      return (data.results || []).slice(0, count).map(r => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.content || "",
      }));
    } catch (e) {
      // fall through to generic
    }
  }
  return extractGeneric(count);
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
    // 只按关键词判噪音；不要递归判 display:none/visibility:hidden
    // （很多站点顶层容器初始是隐藏的，整页会被判空——这是历史 bug）
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const cls = getClassName(cur).toLowerCase();
      const id = ((typeof cur.id === "string" ? cur.id : "")).toLowerCase();
      for (const kw of NOISE_KEYWORDS) {
        if (cls.includes(kw) || id.includes(kw)) return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  // 修复bug2: 统一获取className的helper函数
  function getClassName(el) {
    if (!el) return "";
    try {
      if (el.className && typeof el.className === "string") return el.className;
      if (el.className && el.className.baseVal !== undefined) return el.className.baseVal;
      return "";
    } catch (e) {
      return "";
    }
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
        // 元素自身：script/style/svg 等一律跳过，否则内联脚本会被当成正文
        if (SKIP_TAGS.has(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        if (isHidden(el)) return NodeFilter.FILTER_REJECT;
        if (isNoiseAncestor(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  // 收集文本并保留段落结构
  const lines = [];
  let lastParent = null;

  while (walker.nextNode()) {
    // 注意：TreeWalker 没有 nodeValue 属性，必须用 currentNode.nodeValue。
    // 老代码写 walker.nodeValue（永远是 undefined），导致正文永远提取为空。
    const raw = walker.currentNode.nodeValue || "";
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
        // 统一响应结构：background 侧读 result.data，两边必须一致
        result = { data: doExtract(rules) };
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
    // 修复bug3: 使用 Function 构造器替代 new Function（兼容CSP）
    const fn = new Function(`"use strict"; return (${code})`)();
    return { data: fn === undefined ? null : (typeof fn === 'object' ? JSON.stringify(fn) : String(fn)) };
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
