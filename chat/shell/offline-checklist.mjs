// How the offline checklist (runtime/offline-readiness.mjs) is shown: the same words and dots in the connection pill's menu and in Settings > Models.
// No state of its own: it is handed the readiness result and draws it.

export const STATE_WORDS = { ready: "Ready", partial: "One more step", missing: "Not saved yet", unknown: "Checking…", na: "Not used" };
const DOT = { ready: "loaded", partial: "partial", missing: "none", unknown: "none", na: "none" };
export const FIX_LABEL = { reload: "Reload", "save-runtime": "Save now", "download-model": "Download", "download-voice": "Choose voice", persist: "Ask to keep", "download-matching": "Download" };

/** Rows for the shell's popover: the one-line summary, then one row per item. */
export function checklistRows(result, { fix } = {}) {
  const rows = [{ note: result.text, kind: result.summary === "ready" ? "ok" : "" }];
  for (const item of result.items) {
    rows.push({
      label: item.label, desc: item.detail, dot: DOT[item.state], keepOpen: true,
      right: item.fix && FIX_LABEL[item.fix] ? FIX_LABEL[item.fix] + " ›" : undefined,
      onClick: item.fix && fix ? () => fix(item.fix) : undefined,
    });
  }
  return rows;
}

/** A list element for Settings: dot, label, detail and (when something would fix it) a button. */
export function renderChecklist(h, result, { onFix } = {}) {
  const list = h("ul", { class: "off-list", "aria-label": "What is ready for offline use" });
  for (const item of result.items) {
    const li = h("li", { class: "off-item", "data-state": item.state, "data-id": item.id },
      h("span", { class: "off-dot", "data-state": DOT[item.state], "aria-hidden": "true" }),
      h("span", { class: "off-text" }, h("span", { class: "off-label", text: item.label }), h("span", { class: "off-state", text: STATE_WORDS[item.state] }), h("span", { class: "off-detail", text: item.detail })));
    if (item.fix && onFix && FIX_LABEL[item.fix]) {
      const b = h("button", { type: "button", class: "set-btn", text: FIX_LABEL[item.fix] });
      b.addEventListener("click", async () => { b.disabled = true; try { await onFix(item.fix); } finally { b.disabled = false; } });
      li.append(b);
    }
    list.append(li);
  }
  return list;
}
