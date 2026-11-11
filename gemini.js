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
    for (let attempt = 0; attempt < 6; attempt++) {
      const editor = await waitFor(findEditor, 45000);
      if (!editor) return;
      await sleep(attempt ? 1000 : 800);
      const pending = await api.runtime.sendMessage({ type: "peekPrompt" });
      if (!pending?.prompt) return;
      const current = findEditor();
      if (!current) continue;
      insert(current, pending.prompt);
      await sleep(500);
      const after = findEditor();
      if (!after || !editorText(after).includes(pending.prompt)) continue;
      if (pending.autoSend && !(await sendAndConfirm(pending.prompt))) continue;
      await api.runtime.sendMessage({ type: "ackPrompt" });
      return;
    }
  }

  run();
})();
