// The connection note: one plain sentence in the page, above the composer, only while it has something to say: offline, or "Back online." for a few
// seconds. Offline is a state, not an error, so it is plain text in the normal text colour: no pill, no badge, no alarm colour. Offline with an
// on-device model it says nothing is wrong; offline with a connected provider it says what will not work.
// Draws only. The state comes from app.offline (chat/connection/connection-glue.mjs). The note is its own live region, so a change is announced.
export function mountConnectionNote({ h, bar, offline, openSettings }) {
  const text = h("span", { class: "connection-note-text" });
  const more = h("button", { type: "button", class: "link-btn connection-note-link", onclick: () => openSettings?.() }, "Offline settings");
  const note = h("p", { class: "connection-note", id: "connectionNote", role: "status", "aria-live": "polite", hidden: true }, text, " ", more);
  bar.parentNode.insertBefore(note, bar);

  // "local": an on-device model answers. "device": a provider on this computer. "network": a provider on your own network. "internet": a provider that needs the internet.
  const mode = () => (window.localModels?.mode !== "api" ? "local" : offline.providerPlace());
  function sentence(state) {
    if (state === "back") return "Back online.";
    if (mode() === "internet") return "You are offline. " + offline.reason("provider");
    if (mode() === "device") return "You are offline. " + offline.reason("provider-device");
    if (mode() === "network") return "You are offline. " + offline.reason("provider-network");
    return "You are offline. Nothing is wrong: chat with the on-device model works as usual.";
  }
  function paint() {
    const { state } = offline.connection;
    note.hidden = state === "online";
    more.hidden = state !== "offline";
    if (state === "online") { note.removeAttribute("data-state"); note.removeAttribute("data-mode"); text.textContent = ""; return; }
    note.dataset.state = state; note.dataset.mode = mode();
    const s = sentence(state);
    if (text.textContent !== s) text.textContent = s;
  }
  offline.connection && offline.subscribe(() => paint());
  window.addEventListener("local-model-state", paint);
  paint();
  return { note, paint };
}
