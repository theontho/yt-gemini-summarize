// youtube.com: buttons on the watch page, Shorts, and every video thumbnail in lists/grids/search/sidebars.
(() => {
  const { makeButton, api } = YTSUI;

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "findVideo") return false;
    sendResponse(YTS.canonicalUrl(location.href));
    return false;
  });
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
  function isCompact(a, width) {
    return width < COMPACT_MAX_WIDTH || a.pathname.startsWith("/shorts/") || !!a.closest(COMPACT_CONTEXT_SEL);
  }

  function layoutThumbButton(btn, width, compact) {
    if (!width) return;
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
      layoutThumbButton(btn, a.clientWidth, isCompact(a, a.clientWidth));
    }
  }

  // Hover autoplay draws a separate floating player (ytd-video-preview) over Shorts thumbnails,
  // covering the thumbnail's button, so the preview gets its own button for whatever it is playing.
  const PREVIEW_LINK_SEL = 'a.ytdVideoPreviewMediaContainerLink[href], a[href*="/watch?v="], a[href*="/shorts/"]';
  function addPreviewButtons() {
    for (const preview of document.querySelectorAll("ytd-video-preview")) {
      const link = () => preview.querySelector(PREVIEW_LINK_SEL);
      let btn = preview.querySelector(":scope > yts-summarize");
      if (!btn) {
        btn = makeButton(() => link()?.href || "", { dim: true });
        Object.assign(btn.style, { position: "absolute", zIndex: "2100" });
        preview.appendChild(btn);
      }
      const a = link();
      btn.style.display = a && YTS.canonicalUrl(a.href) ? "" : "none";
      if (a) layoutThumbButton(btn, preview.clientWidth, isCompact(a, preview.clientWidth));
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    ytd-watch-metadata #title h1.yts-inline > yt-formatted-string { display: inline; }
    /* No negative margins: the title clips at its line box (overflow: hidden), so the button must stay
       inside it; middle alignment grows the line box if the button is taller than the text. */
    #yts-page-button.yts-inline { display: inline-block; vertical-align: middle; margin: 2px 0 4px 10px; }
  `;
  document.documentElement.appendChild(style);

  const pageBtn = makeButton(() => location.href);
  pageBtn.id = "yts-page-button";

  function placeFloating() {
    if (pageBtn.parentElement === document.body) return;
    pageBtn.removeAttribute("style");
    pageBtn.className = "";
    delete pageBtn.dataset.inline;
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
          pageBtn.dataset.inline = "";
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
    addPreviewButtons();
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
  document.addEventListener("mouseover", (e) => e.target.closest?.(THUMB_SEL) && schedule(), { passive: true });
  schedule();
})();
