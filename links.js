// Other websites: hover button on YouTube links and lite-youtube style facades; toolbar lookup for embeds.
(async () => {
  const { makeButton, settings, api } = YTSUI;
  const FACADE_SEL = "lite-youtube[videoid], [data-youtube-id], [data-ytid]";

  function facadeUrl(el) {
    const id = el.getAttribute("videoid") || el.getAttribute("data-youtube-id") || el.getAttribute("data-ytid");
    return id ? YTS.watchUrl(id) : null;
  }

  function targetUrl(el) {
    if (!el) return null;
    if (el.matches("a[href]")) return YTS.canonicalUrl(el.href);
    return facadeUrl(el) && YTS.canonicalUrl(facadeUrl(el));
  }

  if (window === window.top) {
    api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "findVideo") return false;
      const candidates = [
        ...[...document.querySelectorAll("iframe[src], iframe[data-src]")].map((f) => f.src || f.dataset.src),
        ...[...document.querySelectorAll(FACADE_SEL)].map(facadeUrl),
        document.querySelector('meta[property="og:video:url"], meta[property="og:video"]')?.content,
        document.querySelector('link[rel="canonical"]')?.href,
      ];
      sendResponse(candidates.map((c) => YTS.canonicalUrl(c)).find(Boolean) || null);
      return false;
    });
  }

  if (!(await settings()).otherSites) return;

  let current = null;
  let hideTimer = 0;
  const btn = makeButton(() => targetUrl(current) || "");
  Object.assign(btn.style, { position: "absolute", zIndex: "2147483647", display: "none" });

  function show(el) {
    clearTimeout(hideTimer);
    if (current === el && btn.style.display !== "none") return;
    current = el;
    if (!btn.isConnected) document.documentElement.appendChild(btn);
    const rects = el.getClientRects();
    const box = el.getBoundingClientRect();
    btn.style.display = "inline-block";
    if (box.height > 60 || !rects.length) {
      btn.style.left = `${box.left + scrollX + 6}px`;
      btn.style.top = `${box.top + scrollY + 6}px`;
    } else {
      const last = rects[rects.length - 1];
      const width = btn.offsetWidth || 100;
      const height = btn.offsetHeight || 22;
      const left = Math.min(Math.max(0, last.left), document.documentElement.clientWidth - width - 4);
      const top = last.top - height - 2 >= 0 ? last.top - height - 2 : last.bottom + 2;
      btn.style.left = `${left + scrollX}px`;
      btn.style.top = `${top + scrollY}px`;
    }
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      btn.style.display = "none";
      current = null;
    }, 500);
  }

  document.addEventListener("mouseover", (e) => {
    if (e.composedPath().includes(btn)) return clearTimeout(hideTimer);
    const el = e.target.closest?.(`a[href], ${FACADE_SEL}`);
    if (el && targetUrl(el)) show(el);
    else if (current && !current.contains(e.target)) scheduleHide();
  }, true);

  document.addEventListener("mouseout", (e) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to && (current.contains(to) || to === btn)) return;
    scheduleHide();
  }, true);

  window.addEventListener("scroll", () => current && show(current), { passive: true, capture: true });
})();
