const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

(async () => {
  const s = { ...YTS.DEFAULTS, ...(await api.storage.sync.get(YTS.DEFAULTS)) };
  $("template").value = s.template;
  $("autoSend").checked = s.autoSend;
  $("otherSites").checked = s.otherSites;
})();

$("save").addEventListener("click", async () => {
  await api.storage.sync.set({
    template: $("template").value.trim() || YTS.DEFAULTS.template,
    autoSend: $("autoSend").checked,
    otherSites: $("otherSites").checked,
  });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});
