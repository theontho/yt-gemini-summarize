if (typeof importScripts === "function" && typeof YTS === "undefined") importScripts("common.js");

const api = globalThis.browser ?? globalThis.chrome;
const GEMINI_URL = "https://gemini.google.com/app";
const PENDING_TTL_MS = 10 * 60 * 1000;
const memoryPending = new Map();
const session = api.storage.session;

async function setPending(tabId, value) {
  if (session) await session.set({ [`pending:${tabId}`]: value });
  else memoryPending.set(tabId, value);
}

async function peekPending(tabId) {
  const key = `pending:${tabId}`;
  const value = session ? (await session.get(key))[key] : memoryPending.get(tabId);
  if (!value || Date.now() - value.created > PENDING_TTL_MS) return null;
  return value;
}

async function clearPending(tabId) {
  if (session) await session.remove(`pending:${tabId}`);
  else memoryPending.delete(tabId);
}

async function settings() {
  return { ...YTS.DEFAULTS, ...(await api.storage.sync.get(YTS.DEFAULTS)) };
}

async function summarize(rawUrl, fromTab) {
  const url = YTS.canonicalUrl(rawUrl);
  if (!url) return false;
  const { template, model, autoSend } = await settings();
  const prompt = (template || YTS.DEFAULTS.template).includes("{url}")
    ? template.replaceAll("{url}", url)
    : `${template} ${url}`;
  const props = { url: GEMINI_URL, active: true };
  if (fromTab && fromTab.id >= 0) {
    props.index = fromTab.index + 1;
    props.openerTabId = fromTab.id;
    if (fromTab.windowId >= 0) props.windowId = fromTab.windowId;
  }
  const tab = await api.tabs.create(props);
  await setPending(tab.id, { prompt, model, autoSend, created: Date.now() });
  await api.storage.local.set({
    lastRun: { url, prompt, model, autoSend, tabId: tab.id, startedAt: Date.now(), stage: "opening" },
  });
  return true;
}

// Status reported by gemini.js for the tab it is driving.
async function updateRun(tabId, patch) {
  const { lastRun } = await api.storage.local.get("lastRun");
  if (!lastRun || lastRun.tabId !== tabId) return;
  await api.storage.local.set({ lastRun: { ...lastRun, ...patch, updatedAt: Date.now() } });
}

async function tabForMessage(msg, sender) {
  if (sender.tab) return sender.tab;
  if (msg.tabId >= 0) return api.tabs.get(msg.tabId).catch(() => undefined);
  return undefined;
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "summarize") {
    tabForMessage(msg, sender)
      .then((tab) => summarize(msg.url, tab))
      .then(sendResponse, () => sendResponse(false));
    return true;
  }
  if (msg?.type === "status" && sender.tab) {
    updateRun(sender.tab.id, msg.patch).then(() => sendResponse(true), () => sendResponse(false));
    return true;
  }
  if (msg?.type === "models" && Array.isArray(msg.list)) {
    api.storage.local.set({ models: { list: msg.list, seenAt: Date.now() } }).then(() => sendResponse(true));
    return true;
  }
  if (msg?.type === "peekPrompt" && sender.tab) {
    peekPending(sender.tab.id).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type === "ackPrompt" && sender.tab) {
    clearPending(sender.tab.id).then(() => sendResponse(true), () => sendResponse(false));
    return true;
  }
  return false;
});

const LINK_PATTERNS = [
  "*://*.youtube.com/watch*",
  "*://*.youtube.com/shorts/*",
  "*://*.youtube.com/live/*",
  "*://*.youtube.com/embed/*",
  "*://*.youtube-nocookie.com/embed/*",
  "*://youtu.be/*",
];

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: "yts-link",
      title: "Summarize video with Gemini",
      contexts: ["link"],
      targetUrlPatterns: LINK_PATTERNS,
    });
    api.contextMenus.create({
      id: "yts-page",
      title: "Summarize this video with Gemini",
      contexts: ["page", "frame", "video"],
      documentUrlPatterns: LINK_PATTERNS,
    });
  });
});

api.tabs.onRemoved.addListener((tabId) => clearPending(tabId));

api.contextMenus.onClicked.addListener((info, tab) => {
  const candidates = info.menuItemId === "yts-link"
    ? [info.linkUrl]
    : [info.frameUrl, info.pageUrl, tab?.url];
  const url = candidates.find((c) => YTS.canonicalUrl(c));
  if (url) summarize(url, tab);
});
