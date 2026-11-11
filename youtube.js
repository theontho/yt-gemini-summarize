// youtube.com: buttons on the watch page, Shorts, and every video thumbnail in lists/grids/search/sidebars.
(() => {
  const { makeButton } = YTSUI;
  const THUMB_SEL = 'a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]';
  const IMG_SEL = "img, yt-image, yt-thumbnail-view-model, ytd-thumbnail, .yt-core-image";

  function addThumbButtons() {
    for (const a of document.querySelectorAll(THUMB_SEL)) {
      if (a.querySelector(":scope > yts-summarize")) continue;
      if (!a.querySelector(IMG_SEL) || a.closest("#movie_player, [data-yts]")) continue;
      if (getComputedStyle(a).position === "static") a.style.position = "relative";
      const btn = makeButton(() => a.href, { dim: true });
      Object.assign(btn.style, { position: "absolute", top: "6px", left: "6px", zIndex: "50" });
      a.appendChild(btn);
    }
  }

  const pageBtn = makeButton(() => location.href, { size: "large" });
  pageBtn.id = "yts-page-button";

  function placePageButton() {
    const path = location.pathname;
    if (path === "/watch" || path.startsWith("/live/")) {
      const target = document.querySelector("ytd-watch-metadata #title, #above-the-fold #title");
      if (target) {
        if (pageBtn.parentElement !== target) {
          pageBtn.removeAttribute("style");
          Object.assign(pageBtn.style, { display: "block", width: "fit-content", margin: "8px 0 0" });
          target.appendChild(pageBtn);
        }
        return;
      }
    }
    if (path === "/watch" || path.startsWith("/shorts/") || path.startsWith("/live/")) {
      if (pageBtn.parentElement !== document.body) {
        pageBtn.removeAttribute("style");
        Object.assign(pageBtn.style, { position: "fixed", top: "68px", right: "24px", zIndex: "2300" });
        document.body.appendChild(pageBtn);
      }
      return;
    }
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
  schedule();
})();
