// One vocabulary for every model, whatever its kind (chat model, voice, embedding model, later image and OCR models). Pure functions: they turn what each
// part of the app knows into the same row shape, and say the same words for the same state, so the composer pickers and Settings can never disagree.
//
// A model is in one of these states (a failure is a message on the row, not a state of its own):
//   none (not downloaded) · downloading · testing · downloaded (on the device, not in memory) · loading · loaded (in memory, ready) · busy (loaded and working) · failed
// "In use" (the chosen model) is separate from "loaded". The system voice and connected providers are not models on this device: they have no download or memory state.

export const sizeText = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + " GB" : n >= 1e6 ? (n / 1e6 < 10 ? (n / 1e6).toFixed(1) : Math.round(n / 1e6)) + " MB" : Math.max(1, Math.round((n || 0) / 1e3)) + " KB");

/** The one-line description of a model's state (no cost words: nothing is "free", "light" or "instant"). */
export function stateLine(vm) {
  switch (vm.state) {
    case "none": return "Not downloaded" + (vm.sizeBytes ? " (" + sizeText(vm.sizeBytes) + ")" : "");
    case "downloading": return vm.progressNote || (vm.progress != null ? "Downloading " + Math.round(vm.progress * 100) + "%" : "Downloading…");
    case "testing": return "Testing on this device…";
    case "downloaded": return "Downloaded" + (vm.bytesOnDevice || vm.sizeBytes ? " (" + sizeText(vm.bytesOnDevice || vm.sizeBytes) + ")" : "") + " · not in memory";
    case "loading": return "Loading into memory…";
    case "loaded": return "In memory, ready";
    case "busy": return "Working now";
    case "failed": return "Failed" + (vm.error ? ": " + String(vm.error).replace(/[.\s]*$/, "") : "") + ". Tap to try again.";
    default: return "";
  }
}

/** What clicking the row does (the picker toggle), as a word for tooltips and for Settings buttons. */
export function toggleAction(vm) {
  if (vm.kind === "provider" || vm.kind === "system") return vm.inUse ? "in-use" : "use";
  switch (vm.state) {
    case "none": return "download";
    case "downloading": case "testing": return "cancel";
    case "downloaded": return "load";
    case "loading": return "wait";
    case "loaded": case "busy": return "unload";
    case "failed": return "retry";
    default: return "wait";
  }
}
export const ACTION_LABEL = { download: "Download", cancel: "Cancel", load: "Load", unload: "Unload", retry: "Try again", use: "Use", wait: "", "in-use": "In use" };

// short descriptions of the on-device chat models (what the old model dropdown said after the dash)
export const TIER_NOTES = Object.freeze({ default: "", light: "smaller download", lfm: "Liquid, strong writing", granite: "IBM, small download", mini: "IBM, tiny: for phones with little room", nano: "tiny: the smallest download" });

/** Chat-model rows from the model host's state (window.localModels.state). `notes`: tier -> short description. */
export function languageRows(lmState, { mode = "local", notes = TIER_NOTES, hide = [] } = {}) {
  if (!lmState) return [];
  const sel = lmState.selection?.tier;
  return Object.entries(lmState.tiers || {}).filter(([tier]) => !hide.includes(tier) || tier === sel).map(([tier, item]) => {
    const isSel = tier === sel, installed = item.install?.ok === true, present = item.install?.bytesPresent || 0;
    const loadedHere = lmState.load?.state === "ready" && lmState.load?.tier === tier;
    let state = installed ? "downloaded" : "none", progress = null;
    if (loadedHere) state = "loaded";
    // a download or a load only: the check of saved files at start-up is busy too (with a transfer of its own), and is neither
    else if (isSel && (lmState.busy === "install" || lmState.busy === "repair") && lmState.transfer) { state = "downloading"; progress = (lmState.transfer.bytesDone || 0) / Math.max(1, lmState.transfer.bytesTotal || 1); }
    else if (isSel && (lmState.busy === "load" || lmState.load?.state === "loading")) state = "loading";
    else if (isSel && lmState.busy === "install") state = "downloading";
    const failed = isSel && lmState.lastError && state !== "loaded" && !lmState.busy;
    return { id: tier, kind: "language", label: item.info?.label || item.info?.modelId || tier, modelId: item.info?.modelId, note: notes[tier] || "",
      sizeBytes: item.info?.downloadBytes ?? null, memoryBytes: item.info?.memory?.steadyBytes ?? null, bytesOnDevice: present, installed, partial: present > 0 && !installed,
      inUse: mode === "local" && isSel, state: failed ? "failed" : state, progress, error: failed ? (lmState.lastError.message || String(lmState.lastError)) : null };
  });
}

/** Voice rows from the voice picker's snapshot (chat/voice/voice-choice.mjs). The system voice is a "system" row, not a model. */
export function voiceRows(snap) {
  if (!snap) return [];
  return snap.voices.map((v) => {
    if (v.id === "os") return { id: "os", kind: "system", label: v.label, note: v.note, inUse: v.selected, state: "ready" };
    let state = "none";
    if (v.state === "installing") state = "downloading"; else if (v.state === "testing") state = "testing"; else if (v.state === "failed") state = "failed";
    else if (v.state === "ready") state = v.memory === "loading" ? "loading" : v.memory === "speaking" ? "busy" : v.memory === "loaded" ? "loaded" : "downloaded";
    return { id: v.id, kind: "voice", label: v.label, note: v.note, license: v.license, sizeBytes: v.size, bytesOnDevice: v.bytesOnDevice, inUse: v.selected, state,
      progress: v.progress?.total ? v.progress.done / v.progress.total : null,
      progressNote: v.progress?.phase === "connecting" ? "Connecting to the download server…" : v.progress?.phase === "retry" ? "Connection problem, trying again" + (v.progress.attempt ? " (" + v.progress.attempt + ")" : "") + "…" : null, error: v.error, failures: v.failures, advice: v.advice, recommended: v.recommended };
  });
}

/** Everything else the memory manager knows about (the embedding model, later image and OCR models), as read-only rows. */
export function otherRows(memorySnap, skipIds = ["chat-llm", "voice"]) {
  return (memorySnap?.residents || []).filter((r) => !skipIds.includes(r.id)).map((r) => ({
    id: r.id, kind: r.kind, label: r.label.charAt(0).toUpperCase() + r.label.slice(1), state: r.busy && r.state === "loaded" ? "busy" : r.state === "unloaded" ? "downloaded" : r.state, sizeBytes: null, inUse: false, memoryBytes: r.estimateBytes }));
}
