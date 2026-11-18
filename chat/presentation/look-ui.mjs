// Showing and controlling a kept character look in the conversation (board T706, docs/PRESENTATION-CHOICE-PLAN.md).
//   createLookUi({ el, keeper, showToast, urls?, strip, messagesEl, controlsEl, confirm? }) -> { render(presetId), release() }
// render(presetId) is called when a chat is selected and whenever presets or looks change. With no kept look, or one that is disabled or unusable, the page is exactly as before: nothing
// is drawn, the strip is hidden and no attribute is set. With a usable look it draws
//   - a strip under the chat header: the picture, the character's name and the background, in the look's layout and palette NAMES (PLC's stylesheet maps them to its own colours), and
//   - a palette on the agent's message panels only (the message sits on a solid panel, so a picture can never lower its contrast).
// The person's own messages, every control, the header and the composer are not touched. The controls (shown in "Instructions for this chat" whenever the chat's preset has a kept look)
// turn the whole look off, or the picture, background, layout or palette one at a time, and remove the look.
// Everything that comes from a package is written as text; pictures come from bytes that were verified when the look was kept and are drawn through temporary addresses released on the next render.
import { LAYOUT_MEANING, PALETTE_MEANING } from "./explain.mjs";

const PARTS = [["portrait", "Picture"], ["background", "Background"], ["layout", "Layout"], ["palette", "Palette"]];
/** "sha256:" + lower-case hex of the bytes (Web Crypto): what a record states for each picture. */
export async function digestSha256(bytes) {
  const out = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = ""; for (const b of out) hex += b.toString(16).padStart(2, "0");
  return "sha256:" + hex;
}

export function createLookUi({ el, keeper, showToast, strip, messagesEl, controlsEl, confirm, digest = digestSha256, urls = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) } }) {
  let made = [];
  let saving = false;
  let drawing = 0; // each render takes a number; a slow check of an earlier render must not draw over a later one
  const release = () => { for (const u of made) urls.revoke(u); made = []; };

  function clearScene() {
    release(); strip.replaceChildren(); strip.hidden = true;
    for (const a of ["palette", "layout"]) { delete strip.dataset[a]; }
    delete messagesEl.dataset.lookPalette; delete messagesEl.dataset.lookLayout;
    controlsEl.replaceChildren(); controlsEl.hidden = true;
  }

  function drawStrip(d) {
    if (d.palette) strip.dataset.palette = d.palette;
    if (d.layout) strip.dataset.layout = d.layout;
    strip.setAttribute("role", "group"); strip.setAttribute("aria-label", "Character look: " + (d.label || "character"));
    for (const image of d.images) {
      const url = urls.create(new Blob([image.bytes], { type: image.mediaType })); made.push(url);
      const img = el("img", image.role === "background" ? "look-bg" : "look-portrait"); img.src = url; img.decoding = "async";
      if (image.hideFromAssistiveTech) { img.alt = ""; img.setAttribute("aria-hidden", "true"); } else img.alt = image.alt;
      strip.appendChild(img);
    }
    strip.appendChild(el("span", "look-name", d.label || "Character"));
    strip.hidden = false;
    if (d.palette) messagesEl.dataset.lookPalette = d.palette;
    if (d.layout) messagesEl.dataset.lookLayout = d.layout;
  }

  function drawControls(presetId, record) {
    const box = el("fieldset", "look-controls");
    box.appendChild(el("legend", null, "Character look: " + record.source.label));
    const row = (id, label, checked, onChange, disabled = false) => {
      const wrap = el("label", "look-toggle"); wrap.htmlFor = id;
      const input = el("input"); input.type = "checkbox"; input.id = id; input.checked = checked; input.disabled = disabled;
      // not disabled while saving: a disabled control loses keyboard focus. A change made while another is still being saved is put back by the redraw that follows it.
      input.addEventListener("change", async () => { if (saving) { input.checked = !input.checked; return; } saving = true; try { await onChange(input.checked); } finally { saving = false; } });
      wrap.append(input, document.createTextNode(" " + label));
      return wrap;
    };
    const change = async (choice) => { const r = await keeper.setChoice(presetId, choice); if (!r.ok) showToast(r.message || "The look could not be changed."); else if (r.result?.status === "newer") showToast("This look was kept by a newer version of the app, so it was left as it is."); };
    box.appendChild(row("lookEnabled", "Use this character's look in this chat", record.enabled, (v) => change({ enabled: v })));
    const parts = el("div", "look-parts");
    for (const [part, label] of PARTS) {
      const has = part === "layout" ? record.look.layout !== null : part === "palette" ? record.look.palette !== null : record.images.some((i) => i.role === part);
      if (!has) continue;
      parts.appendChild(row("lookPart-" + part, label, !record.off[part], (v) => change({ off: { [part]: !v } }), !record.enabled));
    }
    box.appendChild(parts);
    const facts = el("ul", "look-facts");
    if (record.look.layout) facts.appendChild(el("li", null, "Layout: " + record.look.layout + " (" + LAYOUT_MEANING[record.look.layout] + ")"));
    if (record.look.palette) facts.appendChild(el("li", null, "Palette: " + record.look.palette + " (" + PALETTE_MEANING[record.look.palette] + "). The app draws it with its own colours."));
    for (const image of record.images) facts.appendChild(el("li", null, (image.role === "background" ? "Background" : "Picture") + ": " + image.alt + " — made by " + image.author + ", licence " + image.license + "."));
    box.appendChild(facts);
    const remove = el("button", "secondary", "Remove look"); remove.type = "button";
    remove.addEventListener("click", async () => {
      if (typeof confirm === "function" && !(await confirm("Remove look", "Remove the kept look of “" + record.source.label + "” from this preset? The preset and your chats stay as they are, and the look and its pictures are deleted from this browser.", "Remove look", { danger: true }))) return;
      const r = await keeper.remove(presetId);
      showToast(r.ok ? "Look removed." : (r.message || "The look could not be removed."));
    });
    box.appendChild(remove);
    controlsEl.replaceChildren(box); controlsEl.hidden = false;
  }

  /** true when some picture of the description does not hash to what it states (or cannot be hashed); false when all do. */
  async function verifyPictures(d) {
    try { for (const image of d.images) if ((await digest(image.bytes)) !== image.sha256) return true; return false; } catch { return true; }
  }
  function render(presetId) {
    drawing++; // an earlier check still running must not draw after this render
    // A control the person is using is redrawn with the rest: put focus back on the same one, or a keyboard user would lose their place after every change.
    const focused = controlsEl.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;
    clearScene();
    if (!presetId) return;
    const record = keeper.peek(presetId);
    if (!record) return;
    drawControls(presetId, record);
    const d = keeper.describe(presetId);
    if (!d.usesDefault) {
      // The look is drawn only if every picture still has the checksum it had when it was verified (a stored picture is not trusted just because its size is right).
      const mine = ++drawing, box = controlsEl.firstChild;
      verifyPictures(d).then((bad) => {
        if (mine !== drawing) return;
        if (bad) { release(); strip.hidden = true; box?.appendChild(el("p", "look-warning", "A picture of this look no longer matches the checksum it was kept with, so the look is not shown. Remove it, or add the character again.")); box?.querySelector(".look-warning")?.setAttribute("role", "status"); return; }
        drawStrip(d);
      });
    } else drawing++;
    if (focused) { const again = controlsEl.querySelector('#' + focused); if (again && !again.disabled) again.focus(); }
  }
  return { render, release };
}
