// The connection pill beside the model and voice pills. It is there only when it has something to say: offline, or "back online" for a few
// seconds. Offline with an on-device model it is calm (nothing is wrong); offline with a connected provider it says what will not work.
// Draws only. The state comes from app.offline (chat/connection/connection-glue.mjs).
import { checklistRows } from "./offline-checklist.mjs";

export function mountConnectionPill({ h, icon, bar, before, offline, popover, closePopover, openSettings, announceTo }) {
  const pill = h("button", { type: "button", class: "shell-model shell-conn", id: "connectionPill", "aria-haspopup": "menu", "aria-label": "Connection", hidden: true },
    h("span", { class: "shell-model-dot", "aria-hidden": "true" }), h("span", { class: "shell-model-name" }));
  bar.insertBefore(pill, before);
  const live = h("span", { class: "sr-only", id: "connectionAnnounce", role: "status", "aria-live": "polite" });
  (announceTo || bar).append(live);
  let last = null, readiness = null, open = null;

  // "local": an on-device model answers. "device": a provider on this computer. "network": a provider on your own network. "internet": a provider that needs the internet.
  const mode = () => (window.localModels?.mode !== "api" ? "local" : offline.providerPlace());
  function sentence(state) {
    if (state === "back") return "Back online.";
    if (mode() === "internet") return "You are offline. " + offline.reason("provider");
    if (mode() === "device") return "You are offline. " + offline.reason("provider-device");
    if (mode() === "network") return "You are offline. " + offline.reason("provider-network");
    return "You are offline. On-device chat still works.";
  }
  function paint() {
    const { state } = offline.connection;
    pill.hidden = state === "online";
    if (state === "online") { pill.removeAttribute("data-state"); pill.removeAttribute("data-mode"); return; }
    pill.dataset.state = state; pill.dataset.mode = mode();
    pill.querySelector(".shell-model-name").textContent = state === "back" ? "Back online" : "Offline";
    pill.title = sentence(state);
    if (state !== last) { live.textContent = sentence(state); last = state; }
  }
  // Short on purpose: what is going on, only the lines that need attention (each with its fix), and a way to the whole list in Settings.
  function rows() {
    const state = offline.connection.state;
    const out = [{ heading: state === "offline" ? "You are offline" : "Back online" }, { note: sentence(state), kind: state === "offline" && mode() === "internet" ? "" : "ok" }];
    if (readiness && mode() !== "internet") {
      const todo = readiness.items.filter((i) => i.state === "missing" || i.state === "partial");
      out.push({ divider: true }, { heading: todo.length ? "To use this offline later" : "Ready for offline use" });
      if (!todo.length) out.push({ note: "Everything this chat needs is saved on this device.", kind: "ok" });
      for (const r of checklistRows({ ...readiness, items: todo }, { fix: (a) => offline.fix(a) }).slice(1)) out.push(r);
    }
    out.push({ divider: true }, { label: "Offline settings…", icon: "sliders", onClick: () => openSettings?.() });
    return out;
  }
  pill.addEventListener("click", async () => {
    readiness = await offline.readiness();
    open = popover(pill, rows(), { align: "end", above: true, cls: "wide" });
  });
  offline.connection && offline.subscribe((r) => { readiness = r; paint(); if (open && open.isConnected) open.update(rows()); });
  window.addEventListener("local-model-state", paint);
  paint();
  return { pill, paint };
}
