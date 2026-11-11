// gemini.google.com: if this tab was opened by the extension, type the prompt into a new chat and send it.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const EDITOR_SEL = [
    'rich-textarea .ql-editor[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    "textarea",
  ];
  const SEND_SEL = [
    "button.send-button",
    'button[data-test-id="send-button"]',
    'button[aria-label*="Send" i]',
    'button[mattooltip*="Send" i]',
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(find, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const el = find();
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  const findEditor = () => EDITOR_SEL.map((s) => document.querySelector(s)).find(Boolean);
  const findSend = () =>
    SEND_SEL.flatMap((s) => [...document.querySelectorAll(s)]).find(
      (b) => !b.disabled && b.getAttribute("aria-disabled") !== "true" && b.offsetParent !== null,
    );
  const editorText = (el) => (el.value ?? el.innerText ?? "").trim();

  function insert(editor, text) {
    editor.focus();
    if (editor.tagName === "TEXTAREA") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
    if (!editorText(editor).includes(text)) {
      editor.textContent = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }

  // Matches a model name against labels like "3.5 Flash-Lite" without "Flash" matching "Flash-Lite".
  function namesModel(text, model) {
    const want = model.trim().toLowerCase();
    return (text || "")
      .split(/\n|,/)
      .map((l) => l.trim().toLowerCase())
      .some((l) => l === want || l.endsWith(` ${want}`) || l.endsWith(`currently ${want}`));
  }

  const report = (patch) => api.runtime.sendMessage({ type: "status", patch }).catch(() => {});
  const isDisabled = (el) => el.getAttribute("aria-disabled") === "true" || el.matches("[disabled], .disabled");
  const MENU_ITEM_SEL = '[role="menuitemradio"], [data-test-id^="bard-mode-option"]';

  // "Quick answers\n3.5 Flash-Lite" -> { name: "Flash-Lite", label: "3.5 Flash-Lite" }
  function describeItem(el) {
    const lines = el.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const label = lines[lines.length - 1] || "";
    return {
      name: label.replace(/^[\d.]+\s+/, ""),
      label,
      hint: lines.length > 1 ? lines[0] : "",
      enabled: !isDisabled(el),
      current: el.getAttribute("aria-checked") === "true",
    };
  }

  async function closeMenu(picker) {
    if (picker.getAttribute("aria-expanded") !== "true") return;
    picker.click();
    await sleep(300);
    if (picker.getAttribute("aria-expanded") === "true") {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  }

  // Opens Gemini's mode picker, records the available models, and picks the requested one.
  async function selectModel(model) {
    const picker = await waitFor(
      () => document.querySelector('[data-test-id="bard-mode-menu-button"], bard-mode-switcher button'),
      5000,
    );
    if (!picker) return { modelResult: model ? "no-picker" : "default" };
    picker.click();
    const items = await waitFor(() => {
      const found = [...document.querySelectorAll(MENU_ITEM_SEL)].filter((el) => el.offsetParent !== null);
      return found.length ? found : null;
    }, 3000);
    const list = (items || []).map(describeItem);
    if (list.length) api.runtime.sendMessage({ type: "models", list }).catch(() => {});
    const activeName = () =>
      (picker.getAttribute("aria-label") || "").replace(/^.*currently\s*/i, "") || picker.innerText.trim();
    if (!model?.trim()) {
      await closeMenu(picker);
      return { modelResult: "default", activeModel: activeName() };
    }
    const index = list.findIndex((m) => namesModel(`${m.label}`, model) || namesModel(m.name, model));
    if (index < 0) {
      await closeMenu(picker);
      return { modelResult: items ? "not-found" : "no-menu", activeModel: activeName() };
    }
    if (namesModel(picker.getAttribute("aria-label"), model) || list[index].current) {
      await closeMenu(picker);
      return { modelResult: "already", activeModel: activeName() };
    }
    if (!list[index].enabled) {
      await closeMenu(picker);
      return { modelResult: "unavailable", activeModel: activeName() };
    }
    items[index].click();
    await sleep(600);
    await closeMenu(picker);
    const ok = namesModel(picker.getAttribute("aria-label"), model);
    return { modelResult: ok ? "selected" : "failed", activeModel: activeName() };
  }

  async function sendAndConfirm(prompt) {
    const send = await waitFor(findSend, 8000);
    const editor = findEditor();
    if (send) send.click();
    else editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    return !!(await waitFor(() => {
      const e = findEditor();
      return !e || !editorText(e).includes(prompt);
    }, 5000));
  }

  // Gemini can re-render its editor while booting, so verify each step and only ack once it stuck.
  async function run() {
    const first = await api.runtime.sendMessage({ type: "peekPrompt" });
    if (!first?.prompt) return;
    report({ stage: "loading" });
    let modelDone = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const editor = await waitFor(findEditor, 45000);
      if (!editor) {
        report({ stage: "error", error: "Gemini's prompt box never appeared (signed out, blocked or page changed?)" });
        return;
      }
      await sleep(attempt ? 1000 : 800);
      const pending = await api.runtime.sendMessage({ type: "peekPrompt" });
      if (!pending?.prompt) return;
      if (!modelDone) {
        report({ stage: "model", ...(await selectModel(pending.model)) });
        modelDone = true;
      }
      const current = findEditor();
      if (!current) continue;
      insert(current, pending.prompt);
      await sleep(500);
      const after = findEditor();
      if (!after || !editorText(after).includes(pending.prompt)) continue;
      if (pending.autoSend && !(await sendAndConfirm(pending.prompt))) continue;
      await api.runtime.sendMessage({ type: "ackPrompt" });
      report({ stage: pending.autoSend ? "sent" : "inserted", error: null });
      return;
    }
    report({ stage: "error", error: "Couldn't type or send the prompt in Gemini" });
  }

  run();
})();
