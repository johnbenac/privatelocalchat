// The visible side of opening a character package: choose a file, see how each character in it would look, and read what was and was not used.
// A PREVIEW only. Nothing is added, saved or applied, nothing is fetched, and the package grants nothing: no code, tool, memory or network authority. Choosing, overriding
// and keeping a look in conversations is a later task (T706).
//   createPresentationPreview(host) returns { chooseFile, showResult }
//
// host: el, openAppDialog, showToast, loadValidator() -> Promise<{ openAuthored, projectPLCPreset }> (the shared validator is loaded only when a package is opened), alert(title, message) (defaults to
//       window.plcDialogs.alert), urls ({ create(blob), revoke(url) }, defaults to URL.createObjectURL / revokeObjectURL; tests replace it),
//       addAsPreset?(character, record|null) -> opens PLC's own preset review for the character's plain text; when the person adds it, the look in `record` is kept for that preset
//       (the button is drawn only when this is given and the character has a preset)
//
// What reaches the page from a package is only: its text (written as text, never as markup), a layout and a palette that are in PLC's closed lists (they pick a stylesheet rule that
// PLC owns), and picture bytes that the validator checked against their SHA-256 and that PLC checked are a PNG, WebP or JPEG within the size bound. A package never supplies CSS, HTML,
// a colour, a font or script. The controls that say who is speaking, stop, leave, host and privacy are not drawn here at all.
import { MAX_PACKAGE_CHARS, openPresentationBundle } from "./open-bundle.mjs";
import { makeRecord } from "./record.mjs";
import { LAYOUT_MEANING, PALETTE_MEANING, explainOmission, explainOpenFailure, explainRefusal } from "./explain.mjs";

const ROLE_WORD = Object.freeze({ portrait: "Picture", background: "Background" });
let counter = 0;

export function createPresentationPreview(host) {
  const { el, openAppDialog, showToast } = host;
  const tell = host.alert || ((title, message) => window.plcDialogs.alert(title, message));
  const urls = host.urls || { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) };
  let showing = null; // the open preview: a second one is not stacked on it

  function drawCharacter(character, assetBytes, made) {
    const id = "pkgChar" + (++counter), view = character.view;
    const section = el("section", "pkg-character"); section.setAttribute("aria-labelledby", id + "-name");
    const name = el("h3", null, character.label || "Character"); name.id = id + "-name";
    section.appendChild(name);
    if (character.summary) section.appendChild(el("p", "muted", character.summary));

    // the card: PLC's own rule picks the colours from the palette NAME and the arrangement from the layout NAME
    const card = el("div", "pkg-card"); card.setAttribute("role", "group"); card.setAttribute("aria-label", "How " + (character.label || "this character") + " would look");
    const applyLook = (usePackage) => {
      if (usePackage && view.palette) card.dataset.palette = view.palette; else delete card.dataset.palette;
      if (usePackage && view.layout) card.dataset.layout = view.layout; else delete card.dataset.layout;
      card.classList.toggle("pkg-own-look", !usePackage || view.usesDefault);
    };
    for (const image of view.images) {
      const bytes = assetBytes.get(image.assetId); if (!bytes) continue;
      const url = urls.create(new Blob([bytes], { type: image.mediaType })); made.push(url);
      const img = el("img", image.role === "background" ? "pkg-bg" : "pkg-portrait");
      img.src = url; img.decoding = "async";
      if (image.hideFromAssistiveTech) { img.alt = ""; img.setAttribute("aria-hidden", "true"); } else img.alt = image.alt;
      card.appendChild(img);
    }
    const turn = el("div", "pkg-turn");
    turn.append(el("strong", "pkg-speaker", character.label || "Character"), el("p", null, "A message from this character would be drawn like this."));
    card.appendChild(turn);
    section.appendChild(card);

    const toggleId = id + "-own";
    const toggle = el("label", "pkg-toggle"); toggle.htmlFor = toggleId;
    const box = el("input"); box.type = "checkbox"; box.id = toggleId;
    toggle.append(box, document.createTextNode(" Show with the app's own look instead"));
    if (!view.usesDefault) section.appendChild(toggle);
    box.addEventListener("change", () => applyLook(!box.checked));
    applyLook(true);

    if (typeof host.addAsPreset === "function") {
      const made = makeRecord({ character, assetBytes });
      const record = made.ok ? made.record : null;
      if (character.preset && character.preset.ok) {
        const add = el("button", "primary", record ? "Add as a preset with this look…" : "Add as a preset…"); add.type = "button";
        add.addEventListener("click", () => { const handle = showing; if (handle) handle.close(); host.addAsPreset(character, record); });
        section.appendChild(add);
      } else if (character.preset) section.appendChild(el("p", "pkg-note", "This character cannot be added as a preset: " + character.preset.message));
    }
    const facts = el("ul", "pkg-facts");
    if (view.usesDefault) facts.appendChild(el("li", null, view.refused ? "This package's look is not used; the app's own look is shown." : "This package does not carry a look; the app's own look is shown."));
    if (view.layout) facts.appendChild(el("li", null, "Layout: " + view.layout + " (" + LAYOUT_MEANING[view.layout] + ")"));
    if (view.palette) facts.appendChild(el("li", null, "Palette: " + view.palette + " (" + PALETTE_MEANING[view.palette] + "). The app draws it with its own colours."));
    if (view.alt) facts.appendChild(el("li", null, "The package describes the look as: " + view.alt));
    for (const image of view.images) facts.appendChild(el("li", null, (ROLE_WORD[image.role] || "Picture") + ": " + image.alt + " — made by " + image.author + ", licence " + image.license + "."));
    if (view.refused) facts.appendChild(el("li", "pkg-note", explainRefusal(view.refused)));
    for (const omission of view.omissions) facts.appendChild(el("li", "pkg-note", explainOmission(omission)));
    section.appendChild(facts);

    if (character.otherAspects.length) {
      const more = el("details", "pkg-other"); more.appendChild(el("summary", null, "Other parts of this character in the package (not used for the look)"));
      more.appendChild(el("p", "muted", character.otherAspects.join(", ")));
      section.appendChild(more);
    }
    return section;
  }

  function showResult(result) {
    if (!result?.ok) return tell("Character package not opened", explainOpenFailure(result));
    if (showing && !showing.closed) { showToast("Close the preview you have open first."); return undefined; }
    const root = el("div", "pkg-preview");
    root.appendChild(el("p", "muted", "This is only a preview. Nothing is added, saved or applied to any chat, and nothing is sent anywhere. The package gives no code, tools, memory or network access."));
    const made = [];
    if (!result.characters.length) root.appendChild(el("p", null, "This package has no characters to show."));
    for (const character of result.characters) root.appendChild(drawCharacter(character, result.assetBytes, made));
    for (const omission of result.omissions) root.appendChild(el("p", "pkg-note", explainOmission(omission)));
    showing = openAppDialog({ title: "Preview character package", content: root, wide: true, actions: [{ label: "Close", primary: true }] });
    showing.onClose = () => { for (const url of made) urls.revoke(url); made.length = 0; };
    return showing;
  }

  async function open(text) {
    let result;
    try {
      const { openAuthored, projectPLCPreset } = await host.loadValidator();
      result = await openPresentationBundle(text, { openAuthored, projectPLCPreset });
    } catch { result = { ok: false, reason: "unavailable", message: "The character package reader could not be loaded, so nothing was opened." }; }
    return showResult(result);
  }

  function chooseFile() {
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.style.display = "none"; input.setAttribute("aria-label", "Character package file");
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0]; input.remove();
      if (!file) return;
      if (file.size > MAX_PACKAGE_CHARS) { await tell("Character package not opened", explainOpenFailure({ reason: "too-large" })); return; }
      let text;
      try { text = await file.text(); } catch { await tell("Character package not opened", "The file could not be read. Nothing was used."); return; }
      await open(text);
    });
    input.click();
  }

  return { chooseFile, showResult, open };
}
