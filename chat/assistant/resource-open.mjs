// The visible side of a discovery "Open in Private Local Chat" link (chat/assistant/resource-link.mjs): the address says WHICH file (title, version, size, checksum, licence, the page it came from);
// the person downloads it from that page and chooses it here; PLC checks that it is exactly the listed file, and only then does the family's own reader run (a preset file goes to PLC's preset review box, where
// only Add adds anything). Opening the link changes nothing. PLC never fetches the file or the page: the download is the browser's, on the person's click.
//   createResourceOpen(host) returns { openFromAddress }
// host: el, openAppDialog, location (window.location, read only), reviewPreset(result, origin, extra) (PLC's preset review), readPreset(text) (parsePresetCandidate), alert(title, message) (defaults to window.plcDialogs.alert)
import { readResourceFragment, checkResourceFile, RESOURCE_FAMILIES } from "./resource-link.mjs";

const KIND = Object.freeze({ "preset-candidate": "A plain character preset (a name and instructions)" });
const short = (hex) => hex;   // the checksum is shown in full (it wraps): an abbreviated hash cannot be compared by eye

export function createResourceOpen(host) {
  const { el, openAppDialog, reviewPreset, readPreset } = host;
  const tell = host.alert || ((title, message) => window.plcDialogs.alert(title, message));
  const win = () => (host.location ? { location: host.location } : window);
  let showing = null; // the open box: a second one is not stacked on it

  function show(resource) {
    if (showing && !showing.closed) return;
    const root = el("div", "resource-open");
    root.appendChild(el("p", "muted", "Nothing has been added yet. Private Local Chat does not download this for you: get the file from the page it came from, then choose it here. It is checked against this listing before anything is shown."));
    const facts = el("dl", "resource-facts");
    const row = (label, value) => { facts.appendChild(el("dt", null, label)); facts.appendChild(el("dd", null, value)); };
    row("Name", resource.title); row("Kind", KIND[resource.family] || resource.family); row("Version", resource.version);
    row("Size", resource.bytes + " bytes"); row("Checksum (SHA-256)", short(resource.sha256)); facts.lastChild.classList.add("hash-full"); row("Licence", resource.license);
    const pageRow = el("dd"); const link = el("a", null, resource.page); link.href = resource.page; link.target = "_blank"; link.rel = "noopener noreferrer"; pageRow.appendChild(link);
    facts.appendChild(el("dt", null, "Page it came from")); facts.appendChild(pageRow);
    root.appendChild(facts);
    const status = el("p", "resource-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    root.appendChild(status);

    let busy = false;
    function choose(handle) {
      if (busy) return;
      const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.style.display = "none"; input.setAttribute("aria-label", "The downloaded file");
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0]; input.remove();
        if (!file) return;
        busy = true; status.textContent = "";
        try {
          // the size is checked on the file before any of it is read (and before it is hashed)
          if (file.size !== resource.bytes) { status.textContent = "This file is " + file.size + " bytes, but the listing says " + resource.bytes + ". It is not the file that was listed; choose the one downloaded from the page. Nothing was changed."; return; }
          let bytes; try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { status.textContent = "The file could not be read. Nothing was changed."; return; }
          const checked = await checkResourceFile(resource, bytes);
          if (!checked.ok) { status.textContent = checked.message; return; }
          let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { status.textContent = "This file matches the listing but is not text this app can read. Nothing was changed."; return; }
          const result = readPreset(text);
          handle.close();
          await reviewPreset(result, "listing", { note: "This file matches the listing: version " + resource.version + ", " + resource.bytes + " bytes, checksum " + short(resource.sha256) + "." });
        } finally { busy = false; }
      });
      input.addEventListener("cancel", () => input.remove());
      input.click();
    }
    showing = openAppDialog({ title: "Open a resource from a discovery page", content: root, wide: true, actions: [
      { label: "Cancel" },
      { label: "Choose the downloaded file…", primary: true, close: false, run: (handle) => choose(handle) }
    ] });
    return showing;
  }

  /** A resource link opened here: read the fragment (bounded first) and show the box, or say why not. The address is NOT changed (tests/no-address-change.test.mjs). */
  async function openFromAddress() {
    const result = readResourceFragment(win().location.hash);
    if (!result) return false;
    if (!result.ok) { await tell("Link not opened", result.message); return false; }
    show(result.resource);
    return true;
  }
  return { openFromAddress, supportedFamilies: Object.keys(RESOURCE_FAMILIES) };
}
