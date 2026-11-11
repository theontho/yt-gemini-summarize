# YouTube → Gemini Summarize

Browser extension (Chrome, Brave, Edge, Firefox; Manifest V3) that adds a **✦ Summarize** button to YouTube
videos and opens a new Gemini chat with `summarize https://www.youtube.com/watch?v=<id>`, sent automatically.

## Where the button appears

- **youtube.com**: below the title on watch pages, top-right on Shorts, and on every thumbnail
  (home, search, channel, playlists, watch-page sidebar).
- **Other websites**: on YouTube embeds (inside the player, top-right), when hovering YouTube links
  (`youtube.com/watch|shorts|live|embed`, `youtu.be`, `youtube-nocookie.com`) and `lite-youtube` facades.
- **Right-click** any YouTube link → *Summarize video with Gemini*.
- **Toolbar icon**: summarizes the current YouTube video, or the first YouTube embed on the page.

## Install

- **Chrome / Brave / Edge**: open `chrome://extensions` (`brave://extensions`, `edge://extensions`),
  enable Developer mode, *Load unpacked*, select this folder.
- **Firefox (140+)**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `manifest.json`
  (temporary until restart). For a permanent install, sign `npm run build`'s zip via AMO (unlisted).
  If buttons don't show, allow the extension's site access in `about:addons` → Permissions.

## How it works

The background script opens `gemini.google.com/app` in a new tab next to the current one and holds the prompt
for that tab id only (so other pages can't trigger prompts). `gemini.js` waits for the editor, inserts the
prompt, verifies it stuck, sends it, and only then clears it, retrying if Gemini re-renders while loading.
Options (prompt template, auto-send, buttons on other sites) are in the extension's options page.

## Development

```sh
npm install
npm test               # Playwright Chromium: YouTube search/watch, other-site links + embeds, Gemini send
npm run test:firefox   # Selenium + real Firefox
npm run lint && npm run build   # dist/*.zip
```

YouTube and Gemini change their DOM often; selectors live in `youtube.js` and `gemini.js`.
