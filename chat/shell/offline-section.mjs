// Settings > Models > "Ready for offline use": one summary line and the checklist (runtime/offline-readiness.mjs), with a button on every line that
// something would fix. Draws only; the facts and the fixes come from app.offline.
import { renderChecklist } from "./offline-checklist.mjs";

export function buildOfflineSection({ app, h }) {
  const offline = app.offline;
  const body = h("div", { class: "set-card", id: "offlineCard" });
  const summary = h("p", { class: "set-desc off-summary", id: "offlineSummary", role: "status", "aria-live": "polite", text: "Checking whether this device is ready for offline use…" });
  const section = h("section", { id: "offlineSection", "aria-labelledby": "offlineHead" },
    h("h3", { class: "set-sub", id: "offlineHead", text: "Ready for offline use" }), summary, body);
  // Shown at the top of the Models page while offline: downloads can still be started, they wait for the connection.
  const note = h("div", { class: "set-note off-note", id: "offlineNote", role: "status", hidden: true });
  const paintNote = () => {
    const off = offline?.connection.state === "offline";
    note.hidden = !off;
    note.textContent = off ? "You are offline. A download you start now waits for a connection and carries on by itself. Models you have already downloaded work as usual." : "";
  };
  async function paint(result) {
    paintNote();
    result = result || await offline.readiness();
    summary.textContent = result.text; summary.dataset.summary = result.summary;
    body.textContent = "";
    body.append(renderChecklist(h, result, { onFix: (action) => offline.fix(action) }));
  }
  if (offline) { offline.subscribe(paint); paint(); } else section.hidden = true;
  return { section, note, paint };
}
