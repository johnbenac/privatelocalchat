// The visible side of importing a preset: choose a file or open a preset link, review the name and the exact instructions, then add it only when the person says so.
// Nothing here fetches anything, runs a model or changes a chat: reading a file or an address only fills the review box, and "Add" creates a NEW preset with a new id.
// createPresetImport(host) returns { chooseFile, reviewResult, openFromAddress }.
//
// host: el, openAppDialog, showToast, store (preset-store.mjs), builtins() (the built-in presets), generateId(), onAdded(preset, list) (the page refreshes its list),
//       location (window.location, read only), alert(title, message) (defaults to window.plcDialogs.alert)
import { admitPreset, checkPresetName, findPresetConflicts, parsePresetCandidate, readPresetFragment, PRESET_LIMITS } from "./preset-candidate.mjs";

export function createPresetImport(host) {
  const { el, openAppDialog, showToast, store, builtins, generateId, onAdded } = host;
  const win = () => (host.location ? { location: host.location } : window); // only openFromAddress needs the page's address (read only)
  const tell = host.alert || ((title, message) => window.plcDialogs.alert(title, message));
  let reviewing = null; // the open review box: a second one is not stacked on it

  async function review(candidate, origin) {
    if (reviewing && !reviewing.closed) { showToast('Finish or cancel the preset you are reviewing first.'); return; }
    const root = el('div', 'preset-review');
    const note = el('p', 'muted', 'Nothing has been added yet. Adding creates a new preset on this device; it is not applied to any chat, and nothing is sent anywhere.');
    const source = el('p', 'muted', 'Read from ' + (origin === 'link' ? 'a link' : 'a file') + (candidate.sourceId ? '. Its own id (“' + candidate.sourceId.slice(0, 60) + '”) is not used: this device gives it a new one.' : '.'));
    const nameId = 'presetReviewName', textId = 'presetReviewText';
    const nameLabel = el('label', null, 'Preset name'); nameLabel.htmlFor = nameId;
    const nameInput = el('input'); nameInput.type = 'text'; nameInput.id = nameId; nameInput.value = candidate.name; nameInput.maxLength = PRESET_LIMITS.nameChars; nameInput.autocomplete = 'off';
    const textLabel = el('label', null, 'Instructions (exactly as they will be saved)'); textLabel.htmlFor = textId;
    const text = el('textarea'); text.id = textId; text.readOnly = true; text.value = candidate.prompt; text.rows = 10;
    const status = el('p', 'preset-review-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    root.append(note, source, nameLabel, nameInput, textLabel, text, status);

    let adding = false;
    let offeredSeparate = false; // the button said "Keep as a separate preset" the last time the box was drawn: only then is a click that explicit answer
    // `ready` is what the store says right now: its saved list, or why nothing can be added (saved presets unreadable or malformed, this tab read-only, no Web Locks).
    // It is asked again at every refresh and at the click, so a store that stopped being usable disables adding and the stored bytes are never touched.
    const state = () => {
      const ready = store.ready();
      const checked = checkPresetName(nameInput.value);
      const conflicts = ready.ok && checked.ok ? findPresetConflicts([...builtins(), ...ready.list], checked.name, candidate.prompt) : null;
      return { ready, checked, conflicts };
    };
    const refresh = () => {
      const { ready, checked, conflicts } = state();
      const primary = handle.root.querySelector('.dialog-actions .primary');
      status.textContent = !ready.ok ? ready.message
        : !checked.ok ? checked.message
        : conflicts.identical ? 'You already have a preset with this name and these same instructions. Adding keeps both as separate presets.'
        : conflicts.any ? 'You already have a preset called “' + checked.name + '”. Adding keeps both as separate presets; change the name above to tell them apart.'
        : '';
      offeredSeparate = Boolean(conflicts?.any);
      if (primary) { primary.textContent = conflicts?.any ? 'Keep as a separate preset' : 'Add preset'; primary.disabled = !ready.ok || !checked.ok || adding; }
    };
    const handle = openAppDialog({
      title: 'Review preset', content: root, wide: true,
      actions: [
        { label: 'Cancel' },
        { label: 'Add preset', primary: true, close: false, run: async (h, button) => {
          if (adding) return; // a double click or Enter pressed twice adds one preset
          const { ready, checked, conflicts } = state();
          if (!ready.ok || !checked.ok) { refresh(); return; }
          if (conflicts.any && !offeredSeparate) { refresh(); return; } // a collision appeared after the person last looked (another tab): show it and ask, never count this click as the answer
          const keepSeparate = offeredSeparate;
          adding = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
          let outcome;
          try {
            outcome = await store.mutate((list) => {
              const admitted = admitPreset([...builtins(), ...list], { name: checked.name, prompt: candidate.prompt }, { makeId: generateId, keepSeparate });
              return admitted.ok ? { list: [...list, admitted.preset], result: admitted } : { result: admitted };
            });
          } finally { adding = false; button.removeAttribute('aria-busy'); }
          if (!outcome.ok) { refresh(); status.textContent = outcome.message; return; }
          if (!outcome.result.ok) { refresh(); if (!status.textContent) status.textContent = outcome.result.message || 'The preset was not added.'; return; } // refresh() words the collision from the list read just now
          h.close();
          onAdded(outcome.result.preset, outcome.list);
          showToast('Preset “' + outcome.result.preset.name + '” added. Choose it under “Instructions for this chat” to use it.');
        } }
      ]
    });
    reviewing = handle;
    nameInput.addEventListener('input', refresh);
    refresh();
    nameInput.focus();
  }

  /** A result from parsePresetCandidate / readPresetFragment: review it, or say why not (the box is the only thing that can add). */
  async function reviewResult(result, origin) {
    if (!result) return false;
    if (!result.ok) { await tell('Preset not added', result.message); return false; }
    await review(result.candidate, origin);
    return true;
  }

  /** The file chooser. The size is checked on the file before any of it is read. */
  function chooseFile() {
    const input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none'; input.setAttribute('aria-label', 'Preset file');
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; input.remove();
      if (!file) return;
      let result;
      if (file.size > PRESET_LIMITS.fileBytes) result = { ok: false, message: 'This file is too large to be a preset (more than ' + PRESET_LIMITS.fileBytes / 1024 + ' KB). Nothing was added.' };
      else { try { result = parsePresetCandidate(await file.text()); } catch { result = { ok: false, message: 'The file could not be read. Nothing was added.' }; } }
      await reviewResult(result, 'file');
    });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  }

  /**
   * A preset link opened here: read the fragment (bounded first, see readPresetFragment) and show it for review. The address is NOT changed: the app never rewrites its own
   * address (tests/no-address-change.test.mjs; the page-load counting promise in the privacy page), so the link stays in the address bar, a reload shows the same review
   * again, and nothing is ever added without the person's click.
   */
  async function openFromAddress() {
    const result = readPresetFragment(win().location.hash);
    if (!result) return false;
    return reviewResult(result, 'link');
  }

  return { chooseFile, reviewResult, openFromAddress };
}
