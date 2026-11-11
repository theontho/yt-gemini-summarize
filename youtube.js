// youtube.com: buttons on the watch page, Shorts, and every video thumbnail in lists/grids/search/sidebars.
(() => {
  const { makeButton } = YTSUI;
  const THUMB_SEL = 'a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]';
  const IMG_SEL = "img, yt-image, yt-thumbnail-view-model, ytd-thumbnail, .yt-core-image";
  const COMPACT_MAX_WIDTH = 240;
  const COMPACT_CONTEXT_SEL = [
    "#secondary", "#related", "ytd-watch-next-secondary-results-renderer",
    "ytd-reel-shelf-renderer", "ytd-reel-item-renderer", "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2", "ytd-rich-shelf-renderer[is-shorts]",
  ].join(", ");

  // Small thumbnails (watch-page sidebar, Shorts shelves) get a round icon in the bottom-left corner,
  // clear of the duration badge (bottom-right) and the title overlay on Shorts (top).
  function layoutThumbButton(a, btn) {
    const width = a.clientWidth;
    if (!width) return;
    const compact = width < COMPACT_MAX_WIDTH || a.pathname.startsWith("/shorts/") || !!a.closest(COMPACT_CONTEXT_SEL);
    if (compact === btn.hasAttribute("data-compact") && btn.style.left) return;
    btn.toggleAttribute("data-compact", compact);
    Object.assign(btn.style, compact
      ? { top: "auto", bottom: "6px", left: "6px" }
      : { top: "6px", bottom: "auto", left: "6px" });
  }

  function addThumbButtons() {
    for (const a of document.querySelectorAll(THUMB_SEL)) {
      let btn = a.querySelector(":scope > yts-summarize");
      if (!btn) {
        if (!a.querySelector(IMG_SEL) || a.closest("#movie_player, [data-yts]")) continue;
        if (getComputedStyle(a).position === "static") a.style.position = "relative";
        btn = makeButton(() => a.href, { dim: true });
        Object.assign(btn.style, { position: "absolute", zIndex: "50" });
        a.appendChild(btn);
      }
      layoutThumbButton(a, btn);
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    ytd-watch-metadata #title h1.yts-inline > yt-formatted-string { display: inline; }
    #yts-page-button.yts-inline { display: inline-block; vertical-align: middle; margin: -4px 0 0 10px; }
  `;
  document.documentElement.appendChild(style);

  const pageBtn = makeButton(() => location.href);
  pageBtn.id = "yts-page-button";

  function placeFloating() {
    if (pageBtn.parentElement === document.body) return;
    pageBtn.removeAttribute("style");
    pageBtn.className = "";
    pageBtn.dataset.size = "large";
    Object.assign(pageBtn.style, { position: "fixed", top: "68px", right: "24px", zIndex: "2300" });
    document.body.appendChild(pageBtn);
  }

  function placePageButton() {
    const path = location.pathname;
    const isVideo = path === "/watch" || path.startsWith("/live/");
    if (isVideo) {
      // Inline after the title text so it wraps with the title instead of taking its own line.
      const h1 = document.querySelector("ytd-watch-metadata #title h1, #above-the-fold #title h1");
      if (h1) {
        h1.classList.add("yts-inline");
        if (pageBtn.parentElement !== h1 || h1.lastElementChild !== pageBtn) {
          pageBtn.removeAttribute("style");
          delete pageBtn.dataset.size;
          pageBtn.className = "yts-inline";
          h1.appendChild(pageBtn);
        }
        return;
      }
    }
    if (isVideo || path.startsWith("/shorts/")) return placeFloating();
    pageBtn.remove();
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    addThumbButtons();
    placePageButton();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 300);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("yt-navigate-finish", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("resize", schedule);
  schedule();
})();
