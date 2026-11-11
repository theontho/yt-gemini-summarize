# YouTube → Gemini Summarize

Browser extension (Chrome, Brave, Edge, Firefox; Manifest V3) that adds a **✦ Summarize** button to YouTube
videos and opens a new Gemini chat with `summarize https://www.youtube.com/watch?v=<id>`, sent automatically.

## Where the button appears

- **youtube.com**: inline after the title on watch pages (wraps with it), top-right on Shorts, and on every
  thumbnail (home, search, channels, playlists). Small thumbnails (watch-page sidebar, Shorts) get a round
  ✦ icon in the bottom-left corner instead of the labelled pill.
- **Other websites**: on YouTube embeds (inside the player, top-right), when hovering YouTube links
  (`youtube.com/watch|shorts|live|embed`, `youtu.be`, `youtube-nocookie.com`) and `lite-youtube` facades.
- **Right-click** any YouTube link → *Summarize video with Gemini*.
- **Toolbar popup**: summarize the current tab's video (or its first YouTube embed), see the last run's status
  (sent / failed, which model was actually used, link to the Gemini tab), and change settings.

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
Before sending it picks the configured model in Gemini's mode picker (default **Flash-Lite**; matched by the
name shown there, e.g. `Flash`, `Pro`; blank keeps Gemini's default; falls back to the default if not found).
It also records the models Gemini offers (and which your account can use) for the popup's model menu; models
that need sign-in or a paid plan are marked and fall back to Gemini's default. Settings (model, prompt template,
auto-send, buttons on other sites) live in the popup, which is also the options page.

## Development

```sh
npm install
npm test               # Playwright Chromium: YouTube search/watch, other-site links + embeds, Gemini send
npm run test:firefox   # Selenium + real Firefox
npm run lint && npm run build   # dist/*.zip
```

YouTube and Gemini change their DOM often; selectors live in `youtube.js` and `gemini.js`.
