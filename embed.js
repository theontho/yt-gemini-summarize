// Inside YouTube embed iframes on any website.
(async () => {
  const { makeButton, settings } = YTSUI;
  if (window !== window.top && !(await settings()).otherSites) return;

  const currentUrl = () =>
    YTS.canonicalUrl(document.querySelector("a.ytp-title-link[href]")?.href) || YTS.canonicalUrl(location.href) || "";

  const btn = makeButton(currentUrl, { dim: true });
  Object.assign(btn.style, { position: "fixed", top: "56px", right: "12px", zIndex: "2147483647" });

  // Attach outside #movie_player: newer embeds draw a cued overlay above everything inside the player.
  function place() {
    if (!document.body || !currentUrl()) return false;
    const host = document.fullscreenElement || document.body;
    if (btn.parentElement !== host) host.appendChild(btn);
    return true;
  }

  document.addEventListener("fullscreenchange", place);
  if (!place()) {
    const obs = new MutationObserver(() => place() && obs.disconnect());
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  }
})();
