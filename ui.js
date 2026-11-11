// Shared button factory for content scripts. Buttons live in a shadow root so page CSS can't break them.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const CSS = `
    :host { all: initial; display: inline-block; }
    button {
      all: unset; box-sizing: border-box; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px;
      font: 600 12px/1 "Google Sans", Roboto, Arial, sans-serif;
      color: #fff; padding: 5px 9px; border-radius: 999px;
      background: linear-gradient(90deg, #4285f4, #9b72cb 60%, #d96570);
      box-shadow: 0 1px 4px rgba(0,0,0,.35); white-space: nowrap;
      transition: opacity .15s, transform .15s;
    }
    button:hover { transform: scale(1.05); }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
    :host([data-size="large"]) button { font-size: 14px; padding: 8px 14px; }
    :host([data-dim]) button { opacity: .78; }
    :host([data-compact]) button {
      width: 24px; height: 24px; padding: 0; gap: 0; justify-content: center;
      border-radius: 50%; font-size: 13px;
    }
    :host([data-compact]) .label { display: none; }
    /* Inside the watch-page title, which clips at its box: keep shadow and hover within the host's margins. */
    :host([data-inline]) button { box-shadow: 0 1px 2px rgba(0,0,0,.3); }
    :host([data-inline]) button:hover { transform: none; filter: brightness(1.1); }
    :host([data-dim]) button:hover { opacity: 1; }
  `;

  function summarize(url) {
    const canonical = YTS.canonicalUrl(url);
    if (!canonical) return;
    api.runtime.sendMessage({ type: "summarize", url: canonical }).catch?.(() => {});
  }

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // getUrl is evaluated at click time because YouTube recycles elements across navigations.
  function makeButton(getUrl, { size, dim, label = "Summarize" } = {}) {
    const host = document.createElement("yts-summarize");
    host.setAttribute("data-yts", "");
    if (size) host.dataset.size = size;
    if (dim) host.dataset.dim = "";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Summarize with Gemini";
    button.append("✦", Object.assign(document.createElement("span"), { className: "label", textContent: label }));
    root.append(style, button);
    for (const type of ["pointerdown", "mousedown", "mouseup", "pointerup", "touchstart", "dblclick"]) {
      host.addEventListener(type, (e) => e.stopPropagation(), true);
    }
    host.addEventListener("click", (e) => {
      stop(e);
      summarize(getUrl());
    }, true);
    host.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        stop(e);
        summarize(getUrl());
      }
    }, true);
    return host;
  }

  async function settings() {
    try {
      return { ...YTS.DEFAULTS, ...(await api.storage.sync.get(YTS.DEFAULTS)) };
    } catch {
      return { ...YTS.DEFAULTS };
    }
  }

  globalThis.YTSUI = { makeButton, summarize, settings, api };
})();
