const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const FALLBACK_MODELS = ["Flash-Lite", "Flash", "Pro"];
const CUSTOM = "__custom__";
let videoUrl = null;
let activeTab = null;

const STAGES = {
  opening: ["Opening Gemini…", "muted"],
  loading: ["Waiting for Gemini to load…", "muted"],
  model: ["Choosing model…", "muted"],
  inserted: ["Prompt typed (auto-send off)", "ok"],
  sent: ["Sent", "ok"],
  error: ["Failed", "err"],
};
const MODEL_RESULTS = {
  selected: ["switched", "ok"],
  already: ["", "ok"],
  default: ["Gemini default", "ok"],
  unavailable: ["not available on this account (sign in?) — used", "warn"],
  "not-found": ["not in Gemini's picker — used", "warn"],
  "no-menu": ["picker didn't open — used", "warn"],
  "no-picker": ["no model picker found", "warn"],
  failed: ["couldn't switch — used", "warn"],
};

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleString();
}

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c != null));
  return e;
}

function videoLink(url) {
  return el("a", { href: url, target: "_blank", textContent: url.replace("https://www.", "") });
}

async function settings() {
  return { ...YTS.DEFAULTS, ...(await api.storage.sync.get(YTS.DEFAULTS)) };
}

async function renderModels() {
  const s = await settings();
  const { models } = await api.storage.local.get("models");
  const seen = models?.list || [];
  const select = $("model");
  select.replaceChildren();
  select.append(el("option", { value: "", textContent: "Gemini default" }));
  const names = seen.length ? seen.map((m) => m.name) : FALLBACK_MODELS;
  for (const name of names) {
    const m = seen.find((x) => x.name === name);
    let text = m?.label || name;
    if (m?.hint) text += ` — ${m.hint}`;
    if (m && !m.enabled) text += " (needs sign-in/plan)";
    select.append(el("option", { value: name, textContent: text }));
  }
  select.append(el("option", { value: CUSTOM, textContent: "Other…" }));
  const known = s.model === "" || names.some((n) => n.toLowerCase() === s.model.toLowerCase());
  select.value = known ? names.find((n) => n.toLowerCase() === s.model.toLowerCase()) ?? "" : CUSTOM;
  $("customModel").hidden = known;
  $("customModel").value = known ? "" : s.model;
  const chosen = seen.find((m) => m.name.toLowerCase() === s.model.toLowerCase());
  $("modelNote").textContent = !seen.length
    ? "Model list refreshes after the first summary."
    : chosen && !chosen.enabled
      ? `${chosen.name} isn't available in your Gemini session; it'll fall back to Gemini's default.`
      : `Models as of ${ago(models.seenAt)}.`;
}

async function renderSettings() {
  const s = await settings();
  $("template").value = s.template;
  $("autoSend").checked = s.autoSend;
  $("otherSites").checked = s.otherSites;
  await renderModels();
}

async function renderLastRun() {
  const { lastRun: r } = await api.storage.local.get("lastRun");
  const box = $("lastRun");
  if (!r) {
    box.className = "value muted";
    box.textContent = "None yet";
    return;
  }
  box.className = "";
  const stale = !["sent", "inserted", "error"].includes(r.stage) && Date.now() - (r.updatedAt || r.startedAt) > 60000;
  const [stageText, stageCls] = stale ? ["Stopped (Gemini tab closed or stuck?)", "warn"] : STAGES[r.stage] || [r.stage, "muted"];
  const lines = [
    el("div", { className: "value" }, videoLink(r.url)),
    el("div", {}, el("span", { className: stageCls, textContent: stageText }), ` · ${ago(r.startedAt)}`),
  ];
  if (r.modelResult) {
    const [txt, cls] = MODEL_RESULTS[r.modelResult] || [r.modelResult, "muted"];
    const want = r.model || "default";
    const active = r.activeModel || "";
    const desc = r.modelResult === "already" || r.modelResult === "selected" ? `${active || want} ${txt}`.trim()
      : r.modelResult === "default" ? `${txt}${active ? ` (${active})` : ""}`
      : `${want}: ${txt} ${active}`.trim();
    lines.push(el("div", {}, "Model: ", el("span", { className: cls, textContent: desc })));
  }
  if (r.error) lines.push(el("div", { className: "err", textContent: r.error }));
  if (r.tabId >= 0) {
    const go = el("button", { className: "link", textContent: "Show Gemini tab" });
    go.addEventListener("click", async () => {
      try {
        const t = await api.tabs.update(r.tabId, { active: true });
        await api.windows.update(t.windowId, { focused: true });
        window.close();
      } catch {
        go.replaceWith(el("span", { className: "muted", textContent: "Tab closed" }));
      }
    });
    lines.push(el("div", {}, go));
  }
  box.replaceChildren(...lines);
}

async function detectVideo() {
  // ?tab=<id> targets a specific tab when the popup is opened as a page (tests, screenshots).
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  [activeTab] = forced ? [await api.tabs.get(forced)] : await api.tabs.query({ active: true, currentWindow: true });
  videoUrl = YTS.canonicalUrl(activeTab?.url);
  if (!videoUrl && activeTab?.id >= 0) {
    try {
      videoUrl = YTS.canonicalUrl(await api.tabs.sendMessage(activeTab.id, { type: "findVideo" }));
    } catch {
      // No content script here (browser page, YouTube non-video page, or site access not granted).
    }
  }
  const box = $("video");
  if (videoUrl) {
    box.className = "value";
    box.replaceChildren(videoLink(videoUrl));
    $("summarize").disabled = false;
  } else {
    box.className = "value muted";
    box.textContent = "No YouTube video found";
  }
}

let savedTimer;
async function save(patch) {
  await api.storage.sync.set(patch);
  $("saved").textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($("saved").textContent = ""), 1200);
}

$("summarize").addEventListener("click", async () => {
  if (!videoUrl) return;
  $("summarize").disabled = true;
  await api.runtime.sendMessage({ type: "summarize", url: videoUrl, tabId: activeTab?.id });
  window.close();
});
$("model").addEventListener("change", async () => {
  const custom = $("model").value === CUSTOM;
  $("customModel").hidden = !custom;
  if (custom) return $("customModel").focus();
  await save({ model: $("model").value });
  renderModels();
});
$("customModel").addEventListener("change", () => save({ model: $("customModel").value.trim() }));
$("template").addEventListener("change", () => save({ template: $("template").value.trim() || YTS.DEFAULTS.template }));
$("autoSend").addEventListener("change", () => save({ autoSend: $("autoSend").checked }));
$("otherSites").addEventListener("change", () => save({ otherSites: $("otherSites").checked }));
$("reset").addEventListener("click", async () => {
  await api.storage.sync.set(YTS.DEFAULTS);
  await renderSettings();
  save({});
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastRun) renderLastRun();
  if (area === "local" && changes.models) renderModels();
});

renderSettings();
renderLastRun();
detectVideo();
