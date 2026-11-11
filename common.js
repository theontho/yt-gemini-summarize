// Shared helpers for background and content scripts.
(() => {
  const ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const YT_HOST_RE = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/i;

  function videoId(input, base) {
    if (!input) return null;
    let u;
    try {
      u = new URL(input, base || (typeof location !== "undefined" ? location.href : undefined));
    } catch {
      return null;
    }
    const host = u.hostname.toLowerCase();
    let id = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = u.pathname.split("/")[1];
    } else if (YT_HOST_RE.test(host)) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "watch") id = u.searchParams.get("v");
      else if (["shorts", "live", "embed", "v", "e"].includes(parts[0])) id = parts[1];
      else if (parts[0] === "attribution_link") return videoId(u.searchParams.get("u"), "https://www.youtube.com");
    }
    return id && ID_RE.test(id) ? id : null;
  }

  const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

  function canonicalUrl(input, base) {
    const id = videoId(input, base);
    return id ? watchUrl(id) : null;
  }

  const DEFAULTS = { template: "summarize {url}", autoSend: true, otherSites: true };

  globalThis.YTS = { videoId, watchUrl, canonicalUrl, DEFAULTS };
})();
