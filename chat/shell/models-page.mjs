// Settings > Models: every model the app can use, on one page, in one order, with one kind of row:
//   Language model (where replies run, the on-device chat models) · Ready for offline use · Connected provider · Voice · Other models · Memory and storage.
// The rows come from chat/models/models-view.mjs (the same words the composer pickers use). Actions go through app.models (the chat model controller), the voice picker
// controller and the memory manager; nothing here reads or writes the legacy model form, which stays in the page, hidden, only because local-models.js still renders into it.

import { rowParts, renderRowText } from "./model-row.mjs";
import { buildOfflineSection } from "./offline-section.mjs";
import { siteLinks } from "../site/site-links.mjs";
import { languageRows, voiceRows, otherRows, stateLine, toggleAction, ACTION_LABEL, sizeText } from "../models/models-view.mjs";

export function buildModelsPage({ app, h, row, btn, moved, chooseVoice, voiceHint }) {
  const lm = () => app.models;
  // the page's own confirmation dialog (index.html), never the browser's
  const ask = (title, message, label) => (app.dialogs ? app.dialogs.confirm(title, message, label, { danger: true }) : Promise.resolve(false));
  const w = h("div", { class: "set-models" }, h("h2", { text: "Models" }));

  // The provider form (its element ids are used by the page's API code) moves into its own section below.
  const apiSettings = moved.providerSettings.querySelector("#apiSettings");
  if (apiSettings) apiSettings.remove();
  moved.providerSettings.remove();

  const rowEl = (vm, { controls = [], extraDesc = [] } = {}) =>
    h("div", { class: "set-row model-row", "data-model": vm.id, "data-kind": vm.kind, "data-state": vm.state }, renderRowText(h, rowParts(vm, extraDesc)), h("div", { class: "set-control" }, controls));

  // ---------------------------------------------------------------- 1. Language model
  const langSection = h("section", { id: "languageModelSection", "aria-labelledby": "langHead" }, h("h3", { class: "set-sub", id: "langHead", text: "Language model" }),
    h("p", { class: "set-desc", text: "Writes the replies in your chats." }));
  const seg = h("div", { class: "set-seg", role: "group", "aria-label": "Where replies run", id: "replyModeSeg" });
  const segLocal = btn("On this device", () => { lm()?.setMode("local"); paintLanguage(); paintProvider(); });
  const segApi = btn("Connected provider", () => { lm()?.setMode("api"); paintLanguage(); paintProvider(); });
  seg.append(segLocal, segApi);
  const installed = h("div", { class: "set-card", id: "installedModels" });
  const langDetails = h("p", { class: "set-desc", id: "languageDetails" });
  const langStatus = h("div", { class: "set-note", id: "languageStatus", role: "status", "aria-live": "polite" });
  const langProgress = h("progress", { max: "1", id: "languageProgress", hidden: true, "aria-label": "Model download progress" });
  const readiness = h("ul", { class: "readiness", id: "modelReadiness", "aria-label": "Readiness of private chat on this device" },
    h("li", { "data-k": "downloaded", text: "Downloaded to this device" }), h("li", { "data-k": "loaded", text: "Loaded in memory, ready to answer" }), h("li", { "data-k": "offline", text: "Ready for offline use (app and model saved)" }));
  const gpuBox = h("div", { class: "gpu-help", id: "languageDeviceHelp", hidden: true });
  const hint = h("p", { class: "hint-text", id: "languageHint" });
  const reloadRow = h("div", { class: "set-note", hidden: true }, "The app has an update. ", btn("Save draft and reload", () => lm()?.reloadApp()));
  const diag = h("pre", { id: "languageDiagnostics" });
  const copyBtn = btn("Copy device details", async () => { const ok = await lm()?.copyDetails(); copyBtn.textContent = ok ? "Copied" : "Copy device details"; setTimeout(() => { copyBtn.textContent = "Copy device details"; }, 1500); });
  const details = h("details", { id: "advancedModels" }, h("summary", { text: "Details and repair" }),
    h("div", { class: "set-actions" },
      btn("Restart model engine", () => lm()?.restartEngine()),
      btn("Verify / repair", () => lm()?.repair()),
      btn("Remove this download", async () => { if (await ask("Remove this download?", "Your conversations will be kept. You can download the model again later.", "Remove")) lm()?.removeSelected(); }, "danger"),
      copyBtn),
    diag,
    // the Help sections for a stuck download and a load failure, drawn only when this copy has a Help page (chat/site/site-links.mjs)
    siteLinks().has("help") ? h("p", { class: "hint-text" }, "Trouble? ", h("a", { href: siteLinks().href("help", "stalled-download"), target: "_blank", rel: "noopener", text: "Download stuck" }), " · ", h("a", { href: siteLinks().href("help", "load-failure"), target: "_blank", rel: "noopener", text: "Load failure" })) : null);
  langSection.append(row("Where replies run", "On this device, or an outside provider you choose.", seg), installed, langDetails, langStatus, langProgress, readiness, gpuBox, hint, reloadRow, details);

  async function useAndLoad(vm) { const L = lm(); L.setMode("local"); await L.selectTier(vm.id); await L.ensureReady().catch(() => {}); }
  function languageActions(vm, L) {
    const controls = [];
    const act = toggleAction(vm), canRun = L.supported !== false;
    if (canRun && ACTION_LABEL[act]) {
      const run = { download: () => useAndLoad(vm), load: () => useAndLoad(vm), retry: () => useAndLoad(vm), cancel: () => L.cancelDownload(), unload: () => L.freeMemory().catch((e) => app.toast?.(e.message)) }[act];
      if (run) controls.push(btn(ACTION_LABEL[act], run, act === "unload" || act === "cancel" ? "" : "primary"));
    }
    if (!vm.inUse && vm.installed && canRun) controls.push(btn("Use", () => { L.setMode("local"); L.selectTier(vm.id); }));
    if (vm.bytesOnDevice > 0 && vm.state !== "downloading") controls.push(btn("Remove", async () => { if (!await ask("Remove " + vm.label + "?", "It is deleted from this device. Your chats are kept, and you can download it again later.", "Remove")) return; try { await L.removeTier(vm.id); await L.inspectAll(); } catch (e) { app.toast?.(e.message); } paintLanguage(); }, "danger"));
    return controls;
  }
  function paintLanguage() {
    const L = lm();
    segLocal.setAttribute("aria-pressed", String(L?.mode === "local")); segApi.setAttribute("aria-pressed", String(L?.mode === "api"));
    installed.textContent = "";
    if (!L || !L.state) { installed.append(h("div", { class: "set-row" }, h("div", { class: "set-text" }, h("div", { class: "set-desc", text: "Checking this device…" })))); return; }
    const rows = languageRows(L.state, { mode: L.mode, hide: L.qualityAvailable === false ? ["default"] : [] });
    for (const vm of rows) installed.append(rowEl(vm, { controls: languageActions(vm, L) }));
    const total = rows.reduce((n, r) => n + (r.bytesOnDevice || 0), 0);
    installed.append(h("div", { class: "set-row" }, h("div", { class: "set-text" }, h("div", { class: "set-label", text: "Total on this device" }), h("div", { class: "set-desc", text: total < 1e5 ? "Nothing downloaded" : sizeText(total) })), h("div", { class: "set-control" })));
    const v = L.view;
    langDetails.textContent = L.mode === "local" ? v.details : "";
    langStatus.textContent = L.mode === "local" ? v.status : "Replies come from your connected provider."; langStatus.dataset.error = String(v.statusError && L.mode === "local");
    langProgress.hidden = v.progress == null; if (v.progress != null) langProgress.value = v.progress;
    for (const li of readiness.children) { const yes = v.readiness[li.dataset.k]; li.classList.toggle("yes", yes); li.classList.toggle("no", !yes); li.setAttribute("aria-label", li.textContent + ": " + (yes ? "yes" : "not yet")); }
    readiness.hidden = L.mode !== "local";
    gpuBox.hidden = !v.gpuHelp || L.mode !== "local"; gpuBox.textContent = "";
    if (v.gpuHelp) { gpuBox.append(h("p", { class: "gpu-help-lead", text: v.gpuHelp.lead }), h("p", { class: "muted", text: "Things to try:" }), h("ol", {}, v.gpuHelp.steps.map((s) => h("li", { text: s })))); }
    details.hidden = L.mode !== "local";
    hint.textContent = L.mode === "local" ? v.setupHint : ""; reloadRow.hidden = !v.can.reload; diag.textContent = v.diagnostics;
  }
  window.addEventListener("local-model-state", () => { if (w.isConnected || document.body.classList.contains("settings-open")) { paintLanguage(); paintProvider(); } });

  // ---------------------------------------------------------------- 2. Connected provider
  const providerSection = h("section", { id: "providerSection", "aria-labelledby": "provHead" }, h("h3", { class: "set-sub", id: "provHead", text: "Connected provider" }));
  const provSwitch = h("div", { id: "providerSwitch" });
  providerSection.append(provSwitch);
  if (apiSettings) providerSection.append(apiSettings);
  function paintProvider() {
    const L = lm(); provSwitch.textContent = "";
    if (L?.mode !== "api") provSwitch.append(row("Use a connected provider", "Replies come from a service you choose, with your own key. Nothing is sent until you do.", btn("Use a provider", () => { L?.setMode("api"); paintLanguage(); paintProvider(); })));
  }

  // ---------------------------------------------------------------- 3. Voice
  const voiceCard = h("div", { class: "set-card", id: "voiceCard" });
  const voiceSection = h("section", { id: "voiceSection", "aria-labelledby": "voiceHead" }, h("h3", { class: "set-sub", id: "voiceHead", text: "Voice" }),
    h("p", { class: "set-desc", text: "How replies are read aloud." }), voiceCard);
  let vctl = null, voffs = null;
  function paintVoice(snap) {
    voiceCard.textContent = "";
    if (!snap) { voiceCard.append(row("Voice", "System voice (the one your device provides).", null)); return; }
    if (snap.notice) voiceCard.append(h("div", { class: "set-note " + snap.notice.kind, role: "status", text: snap.notice.text }));
    for (const vm of voiceRows(snap)) {
      const controls = [];
      if (vm.kind === "system") { if (!vm.inUse) controls.push(btn("Use", () => vctl.select("os"))); }
      else {
        const act = toggleAction(vm);
        const run = { download: () => chooseVoice(vctl, vm.id, app.toast, { toggle: true }), retry: () => chooseVoice(vctl, vm.id, app.toast, { toggle: true }), load: () => vctl.load(vm.id), unload: () => vctl.release("person"), cancel: () => vctl.cancel(vm.id) }[act];
        if (run && ACTION_LABEL[act]) controls.push(btn(ACTION_LABEL[act], run, act === "download" || act === "load" || act === "retry" ? "primary" : ""));
        if (!vm.inUse && (vm.state === "downloaded" || vm.state === "loaded" || vm.state === "busy")) controls.push(btn("Use", () => vctl.select(vm.id)));
        if (vm.state === "downloaded" || vm.state === "loaded" || vm.state === "busy") {
          controls.push(btn("Hear a sample", () => vctl.hearSample(vm.id).catch((e) => app.toast?.(e.message))));
          controls.push(btn("Remove", async () => { if (await ask("Remove " + vm.label + "?", "It is deleted from this device. Reading aloud goes back to the system voice if it was in use. You can download it again any time.", "Remove")) vctl.remove(vm.id); }, "danger"));
        }
      }
      const extra = vm.kind === "system" ? [] : [vm.recommended ? "Recommended for this device" : vm.advice, vm.failures && vm.state !== "failed" ? "failed before: " + vm.failures.reason : ""];
      const el = rowEl(vm, { controls, extraDesc: extra });
      if (vm.kind === "system") el.querySelector(".set-desc").textContent = vm.note;
      voiceCard.append(el);
    }
    voiceCard.append(row("Total on this device", snap.totalBytes ? sizeText(snap.totalBytes) : "No voices downloaded", null));
    if (voiceHint) voiceCard.append(h("div", { class: "set-desc", text: voiceHint }));
  }
  async function startVoice() { vctl = await app.loadVoice?.(); if (!vctl) { paintVoice(null); return; } voffs?.(); voffs = vctl.subscribe(paintVoice); paintVoice(vctl.snapshot()); vctl.advise(); }

  // ---------------------------------------------------------------- 4. Other models
  const otherCard = h("div", { class: "set-card", id: "otherModels" });
  const otherSection = h("section", { id: "otherModelsSection", "aria-labelledby": "otherHead" }, h("h3", { class: "set-sub", id: "otherHead", text: "Other models" }),
    h("p", { class: "set-desc", text: "Small models the app uses for Roberta and search. They load when needed." }), otherCard);

  // ---------------------------------------------------------------- 5. Memory and storage
  const memCard = h("div", { class: "set-card", id: "memoryCard" });
  const memSection = h("section", { id: "memorySection", "aria-labelledby": "memHead" }, h("h3", { class: "set-sub", id: "memHead", text: "Memory and storage" }), memCard);
  let mm = null;
  const MEM_WORDS = { unloaded: "Not in memory", loading: "Loading…", loaded: "In memory", unloading: "Unloading…", faulted: "Needs attention" };
  function paintMemory(snap) {
    memCard.textContent = "";
    const box = h("input", { type: "checkbox", id: "oneAtATime", "aria-label": "One model at a time" });
    box.checked = snap.policy === "one-at-a-time";
    box.addEventListener("change", () => mm.setPolicy(box.checked ? "one-at-a-time" : "keep"));
    memCard.append(row("One model at a time", "Free the other models from memory whenever one is in use, so it gets the whole device. Replies and reading start a little later because models load again when they are needed. Off: the app tries whatever you ask, even if the device runs short, and tells you what is happening.", box));
    if (snap.activity) memCard.append(h("div", { class: "set-note", role: "status", text: snap.activity.text }));
    for (const r of snap.residents) {
      const controls = [];
      if ((r.state === "loaded" || r.state === "faulted") && !r.busy) controls.push(btn("Unload", () => mm.unload(r.id)));
      const size = r.estimateBytes ? " · about " + sizeText(r.estimateBytes) : "";
      memCard.append(row(r.label.charAt(0).toUpperCase() + r.label.slice(1), (r.busy && r.state === "loaded" ? "Working now" : MEM_WORDS[r.state] || r.state) + size, controls));
    }
    if (snap.residents.some((r) => (r.state === "loaded" || r.state === "faulted") && !r.busy)) memCard.append(row("Free all memory", "Unload every model that is not working right now. Downloads are kept.", btn("Unload all", () => mm.unloadAll())));
    memCard.append(row("Keep models on this device", "Ask the browser not to clear downloaded models when storage runs low.", btn("Keep models", () => lm()?.persist())),
      row("Storage and backups", "Where chats and models live on this device.", btn("Open", () => app.openStorage())));
  }
  function paintOther(snap) {
    otherCard.textContent = "";
    const rows = otherRows(snap);
    if (!rows.length) { otherCard.append(row("Matching model", "Not used yet in this session.", null)); return; }
    for (const vm of rows) {
      const loaded = vm.state === "loaded";
      otherCard.append(rowEl({ ...vm, inUse: false }, { controls: loaded ? [btn("Unload", () => mm.unload(vm.id))] : [] }));
    }
  }
  async function startMemory() { mm = await app.loadMemory?.(); if (!mm) return; const off = mm.subscribe((s) => { if (!memCard.isConnected && !w.isConnected) return; paintMemory(s); paintOther(s); }); void off; paintMemory(mm.snapshot()); paintOther(mm.snapshot()); }

  const { section: offlineSection, note: offlineNote } = buildOfflineSection({ app, h });
  w.append(offlineNote, langSection, offlineSection, providerSection, voiceSection, otherSection, memSection);
  paintLanguage(); paintProvider(); startVoice(); startMemory();
  w.addEventListener("shell-refresh", () => { paintLanguage(); paintProvider(); if (vctl) { paintVoice(vctl.snapshot()); vctl.advise(); } if (mm) { paintMemory(mm.snapshot()); paintOther(mm.snapshot()); } });
  return w;
}
