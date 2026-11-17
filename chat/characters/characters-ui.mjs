// The visible side of rich characters: choose a package file or open a character link, review exactly what it holds, then keep it only when the person says so; a saved
// characters library with details, an explicit copy, an update of one chosen character, and removal. Every save, update, copy and removal goes through the one store
// (chat/characters/character-store.mjs); this module never writes browser storage itself, never fetches an address and never starts a model or changes a chat.
//
// createCharactersUi(host) returns { chooseFile, openFromAddress, addressConflict, openLibrary, closePrivateViews }.
//
// host: el, openAppDialog, showToast, events (the page's event list), storage (the page's vault-aware local storage), key? (defaults to CHARACTERS_KEY), vault ({ active, readOnly }), location (read only),
//       runWriteScope? (the durable write capability, passed to the PERSISTENT store only: without it saving is unavailable and says so, while importing, previewing, cancelling and reading the
//       library still work; a temporary chat never uses it),
//       currentThread() (the open conversation, to know whether it is a temporary chat), alert(title, message), confirm(title, message, label, { danger }), crypto?
//
// Lifetimes: a temporary chat has its own memory-only store, made when it first needs one and ended when that chat is left (a new temporary chat gets a new, empty one).
// When the encrypted vault is locked every open view is closed, every picture and sound address made for a preview is revoked, and work prepared before the lock is stale.
import { createCharacterStore, createTemporaryCharacterStore } from './character-store.mjs';
import { reviewCharacterPackageFile, reviewCharacterPackageFragment, checkPackageFileSize, readCharacterFragment, CHARACTER_FRAGMENT_KEY } from './character-package.mjs';
import { externalResourcesOf, checkResourceFiles, matchResourceFiles } from './character-resources.mjs';
import { describeCapabilities, describeOmissions, describeResource, describeSourceClaims, BACKUP_LIMIT, KEEP_PRIVATE } from './character-describe.mjs';
import { PRESET_FRAGMENT_KEY } from '../assistant/preset-candidate.mjs';

// The one browser storage key rich characters use: owned here, classified in chat/vault/key-classes.mjs and the storage inventory, format 1.
export const CHARACTERS_KEY = 'plc.characters.v1';
const SHOWN_CHARS = 4000;
const STRUCTURE_CHARS = 20000;

export function createCharactersUi(host) {
  const { el, openAppDialog, showToast, events, storage, vault } = host;
  const key = host.key || CHARACTERS_KEY;
  const crypto = host.crypto || globalThis.crypto;
  const tell = host.alert || ((title, message) => window.plcDialogs.alert(title, message));
  const ask = host.confirm || ((...a) => window.plcDialogs.confirm(...a));
  const locationOf = () => host.location || window.location;

  // ---- which store, and its lifetime ----
  let epoch = 0; // moves whenever the vault is locked, unlocked or turned off: work prepared before is stale after
  let vaultWasOn = Boolean(vault?.active);
  const persistent = createCharacterStore({ storage, key, crypto, runWriteScope: host.runWriteScope, isReadOnly: () => Boolean(vault?.readOnly), isLocked: () => vaultWasOn && !vault?.active, scope: { current: () => epoch } });
  let temp = null; // { threadId, store } for the open temporary chat only
  // A temporary store belongs to one temporary chat AT ONE lifecycle epoch: locking, unlocking or turning the vault off moves the epoch and ends it, even though the chat id is unchanged.
  const tempScope = () => { const t = host.currentThread?.(); return t?.temporary ? t.id + ':' + epoch : null; };
  function dropTemporary() { if (temp) { temp.store.read(); temp = null; } } // reading an ended store clears its memory (its scope has moved)

  // The scope an action starts in: the lifecycle epoch and the session (this temporary chat, or the normal one). Taken BEFORE any asynchronous work, rechecked after every await and
  // before anything private is drawn, said, called back or committed: work that began in another epoch or session is dropped silently, never shown, never resumed after an unlock.
  const sessionOf = (t) => (t?.temporary ? 'temp:' + t.id : 'normal');
  const liveSession = () => { try { return sessionOf(host.currentThread?.()); } catch { return 'normal'; } };
  let sessionSeq = 0; let lastSession = liveSession(); // sessionSeq moves on every change of session, so leaving and coming back is still another session
  const noteSession = (thread) => { const k = sessionOf(thread); if (k !== lastSession) { lastSession = k; sessionSeq += 1; } };
  const beginScope = () => ({ epoch, seq: sessionSeq, session: liveSession() });
  const stale = (scope) => scope.epoch !== epoch || scope.seq !== sessionSeq || scope.session !== liveSession() || (vaultWasOn && !vault?.active);
  function currentStore() {
    const thread = host.currentThread?.();
    if (thread?.temporary) {
      if (temp && (temp.threadId !== thread.id || temp.store.read().code === 'scope-changed')) temp = null;
      if (!temp) temp = { threadId: thread.id, store: createTemporaryCharacterStore({ scope: { current: tempScope }, crypto }) };
      return { store: temp.store, temporary: true, threadId: thread.id };
    }
    return { store: persistent, temporary: false, threadId: null };
  }
  // A save whose outcome is not confirmed keeps its ORIGINAL preparation (and so its admission identity): trying again reconciles that same save, never a second one.
  const UNCONFIRMED = 'This could not be confirmed: the character may or may not have been saved. Check your characters, or try the same save again; it will not be saved twice.';
  const isUnconfirmed = (outcome) => Boolean(outcome && !outcome.ok && (outcome.unconfirmed || outcome.code === 'unconfirmed'));
  const pendingCopies = new Map(); // 'individualId@version' -> { preparation, born }: a copy whose outcome is unconfirmed
  const where = (temporary) => (temporary ? 'Only for this temporary chat: it is forgotten when the chat is closed or the page is reloaded.' : 'Saved on this device only.');

  // ---- open views, previews and their cleanup ----
  const views = new Set();
  function track(handle, { temporary = false, threadId = null } = {}) {
    const urls = [];
    const record = { handle, urls, temporary, threadId };
    views.add(record);
    const previous = handle.onClose;
    handle.onClose = () => { for (const u of urls.splice(0)) URL.revokeObjectURL(u); views.delete(record); previous?.(); };
    return record;
  }
  let closingAll = false; // while every view is being closed (the vault locked), nothing is reopened or resumed behind it
  const pickers = new Set(); // file choosers this module opened and has not heard back from: removed with the views, and an answer that arrives later is ignored
  function dropPickers() { for (const input of [...pickers]) { pickers.delete(input); try { input.remove(); } catch { /* gone */ } } }
  function closePrivateViews() { closingAll = true; try { for (const v of [...views]) { try { v.handle.close(); } catch { /* already gone */ } } dropPickers(); } finally { closingAll = false; } }
  events?.on('vault:locked', (info) => { epoch += 1; if (info?.off) vaultWasOn = false; closePrivateViews(); dropTemporary(); pendingCopies.clear(); });
  events?.on('vault:unlocked', () => { epoch += 1; vaultWasOn = true; closePrivateViews(); dropTemporary(); pendingCopies.clear(); });
  events?.on('thread:selected', (thread) => {
    noteSession(thread);
    if (temp && !(thread?.temporary && thread.id === temp.threadId)) { for (const v of [...views]) if (v.temporary) v.handle.close(); dropPickers(); dropTemporary(); }
  });
  /** A file chooser for this module: remembered until it answers, so an answer after the scope ended can be recognised and dropped. */
  function newPicker({ accept = null, multiple = false, label }) {
    const input = el('input'); input.type = 'file'; if (accept) input.accept = accept; input.multiple = multiple; input.style.display = 'none'; input.setAttribute('aria-label', label);
    document.body.appendChild(input); pickers.add(input);
    return input;
  }
  const settlePicker = (input) => { const wasKnown = pickers.delete(input); input.remove(); return wasKnown; }; // false: it was dropped (the scope ended) before it answered

  // ---- drawing helpers (everything from a package is text, never markup) ----
  const section = (title) => el('h3', 'char-heading', title);
  const note = (text, cls = 'muted') => el('p', cls, text);

  function previewNode(record, resource, bytes) {
    const wrap = el('div', 'char-resource-preview'); wrap.dataset.hash = resource.sha256;
    const p = resource.preview || { kind: 'unavailable' };
    if (!bytes) { wrap.append(note('No bytes are held for this file, so nothing can be shown.')); return wrap; }
    if (p.kind === 'text') {
      const pre = el('pre', 'char-text-preview'); pre.textContent = p.text.length > SHOWN_CHARS ? p.text.slice(0, SHOWN_CHARS) + '…' : p.text; wrap.append(pre);
      if (p.text.length > SHOWN_CHARS) wrap.append(note('Shown shortened; the file is kept in full.'));
    } else if (p.kind === 'refused-text') wrap.append(note('This text is not shown (' + (p.reason === 'not-utf-8' ? 'it is not readable text' : 'it holds characters that are unsafe to show') + '). It is kept as received.'));
    else if (p.kind === 'image' && resource.mediaType === 'image/png' && p.signatureMatches) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); record?.urls.push(url);
      const img = el('img', 'char-image-preview'); img.src = url; img.alt = 'Picture ' + resource.id; img.style.maxWidth = '14rem'; img.style.imageRendering = 'pixelated'; wrap.append(img);
    } else if (p.kind === 'audio' && resource.mediaType === 'audio/wav' && p.signatureMatches) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); record?.urls.push(url);
      const audio = el('audio', 'char-audio-preview'); audio.controls = true; audio.preload = 'none'; audio.autoplay = false; audio.src = url; audio.setAttribute('aria-label', 'Sound ' + resource.id); wrap.append(audio);
      wrap.append(note('Plays only when you press play. This is the original file, not a claim about voice quality.'));
    } else wrap.append(note(p.kind === 'image' || p.kind === 'audio' ? 'This file is not a valid ' + (p.kind === 'image' ? 'picture' : 'sound') + ' of its declared kind, so it is not shown. It is kept as received.' : 'No preview for this kind of file. It is kept as received.'));
    return wrap;
  }
  function resourceList(record, candidate) {
    const box = el('div', 'char-resources');
    if (!candidate.resources.length) { box.append(note('No separate files come with this character.')); return box; }
    for (const r of candidate.resources) {
      const d = describeResource(r);
      const row = el('div', 'char-resource'); row.dataset.resource = r.id;
      row.append(el('p', 'char-resource-line', d.line));
      const hash = el('p', 'muted char-hash', 'SHA-256 ' + r.sha256.slice(7, 23) + '…'); hash.title = r.sha256; row.append(hash);
      row.append(previewNode(record, r, candidate.resourceBytes(r.sha256)));
      box.append(row);
    }
    return box;
  }
  function capabilityList(capabilities) {
    const ul = el('ul', 'char-capabilities');
    for (const c of describeCapabilities(capabilities)) { const li = el('li', 'char-capability'); li.dataset.capability = c.key; li.dataset.state = c.state; li.append(el('strong', null, c.label + ': '), document.createTextNode(c.text)); ul.append(li); }
    return ul;
  }
  function omissionList(omissions) {
    const rows = describeOmissions(omissions);
    if (!rows.length) return null;
    const d = el('details', 'char-omissions'); d.append(el('summary', null, 'Kept but not used (' + rows.length + ')'));
    const ul = el('ul'); for (const r of rows) ul.append(el('li', null, r.id + ': ' + r.text)); d.append(ul); return d;
  }
  function claimsList(candidateLike) {
    const rows = describeSourceClaims(candidateLike);
    const d = el('details', 'char-claims'); d.append(el('summary', null, 'What the package says about itself (not checked)'));
    const ul = el('ul'); for (const [k, v] of rows) ul.append(el('li', null, k + ': ' + v));
    d.append(ul, note('These are statements by the package’s author. They do not choose, match or continue any character you already have.')); return d;
  }

  // ---- review: file or link ----
  let reviewing = null;
  const hint = (text) => {
    try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.name === 'string' && typeof v.prompt === 'string' && !Array.isArray(v.assets)) return ' This looks like a simple preset: use “Import preset…” for it.'; } catch { /* not json */ }
    return '';
  };

  /** proposal: { route: 'file', text, adapters? } or { route: 'link', hash }; target: a chosen saved character to update, when the person started from one. */
  async function startReview(proposal, { target = null, after: afterRaw = null, born = beginScope() } = {}) {
    const after = afterRaw && (() => { if (!closingAll && !stale(born)) afterRaw(); });
    if (reviewing && !reviewing.closed) { showToast('Finish or cancel the character you are reviewing first.'); return false; }
    const here = currentStore();
    const options = { crypto, ...(proposal.adapters || {}) };
    const reviewed = proposal.route === 'file' ? await reviewCharacterPackageFile(proposal.text, options) : await reviewCharacterPackageFragment(proposal.hash, options);
    if (stale(born)) return false; // the vault or the session changed while the package was being validated: nothing is drawn, said or resumed
    if (reviewed === null) return false;
    if (!reviewed.ok) {
      if (proposal.route === 'file' && reviewed.code === 'external-bytes' && !proposal.adapters) {
        const declared = externalResourcesOf(proposal.text);
        if (declared.length) return chooseResources(proposal, declared, { target, after, born });
      }
      await tell('Character not added', reviewed.message + (proposal.route === 'file' ? hint(proposal.text) : ''));
      after?.();
      return false;
    }
    showReview(proposal, reviewed.candidate, here, { target, after, born });
    return true;
  }

  /** The package keeps some resources outside itself: the person chooses those files. They are measured before they are read and matched by their own SHA-256. */
  function chooseResources(proposal, declared, { target, after, born }) {
    const { temporary, threadId } = currentStore();
    const root = el('div', 'char-resource-step');
    root.append(note('This package keeps ' + declared.length + ' of its files outside itself. Nothing is downloaded: choose the file' + (declared.length === 1 ? '' : 's') + ' you were given with it, from this device.'));
    const list = el('ul'); for (const d of declared) list.append(el('li', null, d.hash.slice(0, 23) + '… · ' + d.size + ' bytes')); root.append(list);
    const status = el('p', 'char-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
    let busy = false;
    let myPicker = null;
    const handle = openAppDialog({ title: 'Choose the package’s files', content: root, actions: [
      { label: 'Cancel', run: () => after?.() },
      { label: 'Choose files…', primary: true, close: false, run: (h, button) => {
        if (busy || stale(born) || h.closed) return;
        const input = newPicker({ multiple: true, label: 'Resource files' }); myPicker = input;
        // An answer only counts while this dialog is open and the scope it started in is the current one: a late answer after Cancel, a lock or a session change is dropped unread.
        const live = () => !h.closed && !stale(born) && pickers.has(input);
        input.addEventListener('change', async () => {
          const files = [...(input.files || [])]; const wasLive = live(); settlePicker(input); if (myPicker === input) myPicker = null;
          if (!wasLive) return;
          const ok = checkResourceFiles(files.map((f) => ({ name: f.name, size: f.size })), declared);
          if (!ok.ok) { status.textContent = ok.message; return; }
          busy = true; button.disabled = true;
          try {
            const entries = []; for (const f of files) entries.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
            if (h.closed || stale(born)) return;
            const matched = await matchResourceFiles(entries, declared, crypto);
            if (h.closed || stale(born)) return;
            if (!matched.ok) { status.textContent = 'These files are not the ones this package describes: ' + matched.unmatched.map((u) => '“' + String(u.name).slice(0, 60) + '” (' + (u.reason === 'duplicate' ? 'chosen twice' : 'not declared') + ')').join(', ') + '. Nothing was added.'; return; }
            h.close();
            await startReview({ ...proposal, adapters: matched.adapters }, { target, after, born });
          } catch { if (!h.closed) status.textContent = 'The files could not be read. Nothing was added.'; } finally { busy = false; if (!h.closed) button.disabled = false; }
        });
        input.addEventListener('cancel', () => { settlePicker(input); if (myPicker === input) myPicker = null; });
        input.click();
      } },
    ] });
    track(handle, { temporary, threadId }); // a view like any other: a lock or a session change closes it
    const closing = handle.onClose;
    handle.onClose = () => { if (myPicker) { settlePicker(myPicker); myPicker = null; } closing?.(); };
    return true;
  }

  function showReview(proposal, candidate, here, { target, after, born }) {
    if (stale(born)) return;
    const { store, temporary, threadId } = here;
    const root = el('div', 'char-review');
    root.append(note('Nothing has been saved yet. ' + KEEP_PRIVATE + ' ' + where(temporary)));
    root.append(note('Read from ' + (proposal.route === 'link' ? 'a link' : 'a file') + '.'));
    const nameLabel = el('label', null, 'Name'); nameLabel.htmlFor = 'charReviewName';
    const nameInput = el('input'); nameInput.type = 'text'; nameInput.id = 'charReviewName'; nameInput.readOnly = true; nameInput.value = candidate.preview.name;
    const textLabel = el('label', null, 'Instructions (exactly as they will be saved)'); textLabel.htmlFor = 'charReviewText';
    const text = el('textarea'); text.id = 'charReviewText'; text.readOnly = true; text.rows = 8; text.value = candidate.preview.instructions;
    root.append(nameLabel, nameInput, textLabel, text);
    root.append(section('What it comes with'), capabilityList(candidate.capabilities));
    const omitted = omissionList(candidate.omissions); if (omitted) root.append(omitted);
    root.append(section('Files'));
    const record = { urls: [] }; // swapped for the tracked record below
    const filesHolder = el('div'); root.append(filesHolder);
    root.append(claimsList(candidate));

    // how to keep it: a new character, or an update of one the person chooses
    const fieldset = el('fieldset', 'char-purpose'); fieldset.append(el('legend', null, 'How to keep it'));
    const freshId = 'charPurposeFresh', updateId = 'charPurposeUpdate';
    const fresh = el('input'); fresh.type = 'radio'; fresh.name = 'charPurpose'; fresh.id = freshId; fresh.value = 'fresh'; fresh.checked = !target;
    const freshLabel = el('label', null, ' Save as a new character'); freshLabel.htmlFor = freshId; freshLabel.prepend(fresh);
    const upd = el('input'); upd.type = 'radio'; upd.name = 'charPurpose'; upd.id = updateId; upd.value = 'update'; upd.checked = Boolean(target);
    const updLabel = el('label', null, ' Update a character I already saved'); updLabel.htmlFor = updateId; updLabel.prepend(upd);
    const pick = el('select'); pick.id = 'charUpdateTarget'; pick.setAttribute('aria-label', 'Saved character to update');
    fieldset.append(freshLabel, document.createElement('br'), updLabel, document.createElement('br'), pick);
    fieldset.append(note('A new character gets its own local reference, even if you saved the same package before or one has the same name. An update keeps the reference of the character you pick and replaces what it holds; nothing in the package picks it for you.'));
    root.append(fieldset);
    const status = el('p', 'char-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    root.append(status, note(BACKUP_LIMIT));

    // The target is what the person chose, with the version they were looking at; listing again never moves it to a newer version (that is what the stale check is for).
    let held = null; // { preparation, purpose, target }: the original preparation of a save whose outcome was not confirmed
    let saving = false; let chosen = target ? { individualId: target.individualId, recordVersion: target.recordVersion } : null;
    function refreshTargets() {
      const listed = store.list();
      pick.textContent = '';
      const first = el('option', null, 'Choose a saved character…'); first.value = ''; pick.append(first);
      if (listed.ok) for (const r of listed.records) { const o = el('option', null, r.name + ' · version ' + r.recordVersion); o.value = r.individualId; o.dataset.version = String(r.recordVersion); pick.append(o); }
      if (chosen && listed.ok) { const o = [...pick.options].find((x) => x.value === chosen.individualId); if (o) pick.value = o.value; else chosen = null; }
      if (!listed.ok || !listed.records.length) { upd.disabled = true; if (upd.checked) { upd.checked = false; fresh.checked = true; } } else upd.disabled = false;
      return listed;
    }
    const refresh = () => {
      const ready = store.ready(); const listed = refreshTargets();
      fieldset.disabled = Boolean(held); // the proposal is fixed while an unconfirmed save is pending: its identity is not silently replaced by another purpose or target
      pick.disabled = !upd.checked || !listed.ok;
      const primary = handle.root.querySelector('.dialog-actions .primary');
      const needTarget = upd.checked && !chosen;
      const newer = upd.checked && chosen && [...pick.options].find((x) => x.value === chosen.individualId && Number(x.dataset.version) !== chosen.recordVersion);
      if (!ready.ok) status.textContent = ready.message;
      else if (needTarget) status.textContent = 'Choose which saved character to update.';
      else if (newer) status.textContent = 'That character has changed since you chose it (now version ' + newer.dataset.version + '). Saving will be refused; choose it again to update the newer version.';
      if (primary) {
        primary.textContent = held ? 'Try the same save again' : upd.checked ? 'Update this character' : 'Save as new character';
        primary.disabled = !ready.ok || needTarget || saving;
      }
      if (ready.ok && !needTarget && !newer && !saving && !held) status.textContent = '';
    };
    const handle = openAppDialog({
      title: 'Review character', content: root, wide: true,
      actions: [
        { label: 'Cancel' },
        { label: 'Save as new character', primary: true, close: false, run: async (h, button) => {
          if (saving) return; // a double click or Enter pressed twice saves one character
          if (stale(born)) { h.close(); return; }
          const ready = store.ready(); if (!ready.ok) { refresh(); return; }
          const purpose = held ? held.purpose : upd.checked ? 'update' : 'fresh';
          let targetRef; if (held) targetRef = held.target; else if (purpose === 'update') { if (!chosen) { refresh(); return; } targetRef = { ...chosen }; }
          saving = true; button.disabled = true; button.setAttribute('aria-busy', 'true'); status.textContent = 'Saving…';
          let outcome; let preparation = held ? held.preparation : null;
          try {
            if (!preparation) {
              const input = { purpose, ...(proposal.route === 'file' ? { text: proposal.text } : { hash: proposal.hash }), ...(targetRef ? { target: targetRef } : {}), ...(proposal.adapters || {}) };
              const prepared = await store.prepare(input);
              if (prepared.ok) preparation = prepared.preparation; else outcome = prepared;
            }
            if (preparation) outcome = await store.commit(preparation, { fence: () => stale(born) });
          } catch {
            // Before a preparation exists nothing could have been written; once one is being committed it may have been.
            outcome = preparation ? { ok: false, code: 'unconfirmed', unconfirmed: true, message: UNCONFIRMED } : { ok: false, code: 'error', message: 'The character could not be saved. Nothing was changed.' };
          }
          finally { saving = false; button.removeAttribute('aria-busy'); }
          if (preparation && isUnconfirmed(outcome)) held = { preparation, purpose, target: targetRef }; else held = null;
          if (stale(born)) { if (!h.closed) h.close(); return; } // the vault or the session changed meanwhile: no toast, no follow-up, nothing drawn (the store already refused or finished by its own checks)
          if (!outcome.ok) { refresh(); status.textContent = outcome.message; return; } // the proposal stays open for another try (an unconfirmed one retries the SAME save)
          h.close();
          showToast(outcome.status === 'updated' || outcome.status === 'already-applied' ? '“' + candidate.preview.name + '” updated.' : '“' + candidate.preview.name + '” saved. It is not used in any chat yet.');
          after?.();
        } },
      ],
    });
    const tracked = track(handle, { temporary, threadId });
    filesHolder.append(resourceList(tracked, candidate));
    reviewing = handle;
    const previousClose = handle.onClose;
    handle.onClose = () => { previousClose?.(); if (handle !== reviewing) return; if (!saving) after?.(); };
    pick.addEventListener('change', () => { const o = pick.selectedOptions[0]; chosen = o?.value ? { individualId: o.value, recordVersion: Number(o.dataset.version) } : null; refresh(); });
    fresh.addEventListener('change', refresh); upd.addEventListener('change', refresh);
    refresh();
    void record;
  }

  // ---- entry points ----
  function chooseFile({ target = null, after: afterRaw = null } = {}) {
    const born = beginScope();
    const after = afterRaw && (() => { if (!closingAll && !stale(born)) afterRaw(); });
    const input = newPicker({ accept: '.json,application/json', label: 'Character package file' });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; const wasLive = settlePicker(input) && !stale(born);
      if (!wasLive) return; // the answer came after the vault or the session changed: the file is not read and nothing is said
      if (!file) { after?.(); return; }
      const size = checkPackageFileSize(file.size);
      if (!size.ok) { await tell('Character not added', size.message); after?.(); return; }
      let text; try { text = await file.text(); } catch { if (!stale(born)) await tell('Character not added', 'The file could not be read. Nothing was added.'); after?.(); return; }
      if (stale(born)) return;
      await startReview({ route: 'file', text }, { target, after, born });
    });
    input.addEventListener('cancel', () => { const wasLive = settlePicker(input) && !stale(born); if (wasLive) after?.(); });
    input.click();
  }

  const hasKey = (hash, name) => new RegExp('(^|[#&])' + name + '=').test(String(hash || ''));
  /** True when an address names both a preset and a character: neither is opened, so two review flows never stack on one link. */
  function addressConflict(hash = locationOf().hash) { return hasKey(hash, PRESET_FRAGMENT_KEY) && hasKey(hash, CHARACTER_FRAGMENT_KEY); }
  async function openFromAddress() {
    const hash = locationOf().hash; const born = beginScope();
    if (!hasKey(hash, CHARACTER_FRAGMENT_KEY)) return false;
    if (addressConflict(hash)) { await tell('Nothing was added', 'This link carries both a preset and a character. Open one at a time. Nothing was added.'); return true; }
    const read = readCharacterFragment(hash);
    if (read === null) return false;
    if (!read.ok) { await tell('Character not added', read.message); return true; }
    await startReview({ route: 'link', hash }, { born });
    return true;
  }

  // ---- the library ----
  const when = (t) => (t ? new Date(t).toLocaleString() : '');
  let libraryHandle = null;
  function openLibrary() {
    if (libraryHandle && !libraryHandle.closed) return;
    const born = beginScope();
    const here = currentStore();
    const { store, temporary, threadId } = here;
    const root = el('div', 'char-library');
    const handle = openAppDialog({ title: 'Saved characters', content: root, wide: true, actions: [
      { label: 'Add from a file…', close: false, run: () => { handle.close(); chooseFile({ after: reopen }); } },
      { label: 'Done', primary: true },
    ] });
    libraryHandle = handle; track(handle, { temporary, threadId });
    const reopen = () => { if (!closingAll && !stale(born) && (!libraryHandle || libraryHandle.closed)) openLibrary(); };
    const button = (label, run, cls = 'secondary') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); return b; };
    function render() {
      root.textContent = '';
      root.append(note(where(temporary)), note(BACKUP_LIMIT), note('Saving a character does not put it in any chat yet: chats do not use these characters.'));
      const listed = store.list();
      const status = el('p', 'char-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      if (!listed.ok) { root.append(el('p', 'char-library-problem', listed.message)); return; }
      if (!listed.records.length) { root.append(note('No saved characters yet. Use “Add from a file…”, or open a character link.')); return; }
      const ul = el('ul', 'char-list');
      for (const r of listed.records) {
        const li = el('li', 'char-item'); li.dataset.individual = r.individualId; li.dataset.version = String(r.recordVersion);
        li.append(el('strong', 'char-name', r.name));
        const kept = Object.entries(r.capabilities).filter(([k, v]) => k !== 'text' && v !== 'absent').map(([k]) => k);
        li.append(el('span', 'muted char-meta', ' · ' + (r.origin === 'copy' ? 'a copy' : 'saved from a package') + ' · version ' + r.recordVersion + (r.updatedAt ? ' · ' + when(r.updatedAt) : '') + (kept.length ? ' · keeps ' + kept.join(', ') : '') + ' · ' + r.resources.length + ' file' + (r.resources.length === 1 ? '' : 's')));
        const actions = el('div', 'char-actions');
        actions.append(
          button('Details', () => openDetails(r.individualId)),
          button('Make a copy', () => copy(r)),
          button('Update from a file…', () => { handle.close(); chooseFile({ target: { individualId: r.individualId, recordVersion: r.recordVersion }, after: reopen }); }),
          button('Remove', () => remove(r), 'secondary danger'),
        );
        li.append(actions); ul.append(li);
      }
      root.append(ul, status);
    }
    const say = (text) => { const s = root.querySelector('.char-status'); if (s) s.textContent = text; else showToast(text); };
    async function copy(r) {
      if (stale(born)) return;
      const copyKey = r.individualId + '@' + r.recordVersion;
      let again = pendingCopies.get(copyKey); if (again && stale(again.born)) { pendingCopies.delete(copyKey); again = null; }
      let preparation = again ? again.preparation : null; let out;
      try {
        if (!preparation) {
          const prepared = await store.prepare({ purpose: 'copy', source: { individualId: r.individualId, recordVersion: r.recordVersion } });
          if (prepared.ok) preparation = prepared.preparation; else out = prepared;
        }
        if (preparation) out = await store.commit(preparation, { fence: () => stale(born) });
      } catch { out = preparation ? { ok: false, code: 'unconfirmed', unconfirmed: true, message: UNCONFIRMED } : { ok: false, code: 'error', message: 'The copy could not be made. Nothing was changed.' }; }
      if (stale(born)) return; // locked or changed session meanwhile: draw nothing, and never put a private preparation back after the lifecycle cleared it
      if (preparation && isUnconfirmed(out)) pendingCopies.set(copyKey, { preparation, born }); else pendingCopies.delete(copyKey);
      if (handle.closed) return;
      render();
      if (!out.ok) { say(out.message); return; }
      say('Copied “' + r.name + '” as a new character. It has its own reference and no shared history.');
    }
    async function remove(r) {
      const sure = await ask('Remove saved character', 'Remove “' + r.name + '” from this ' + (temporary ? 'temporary chat' : 'device') + '? Its saved files go with it. Chats that already happened are not changed.', 'Remove', { danger: true });
      if (!sure || stale(born)) return;
      const out = await store.remove({ individualId: r.individualId, recordVersion: r.recordVersion }, { fence: () => stale(born) });
      if (stale(born) || handle.closed) return;
      render();
      say(out.ok ? (out.status === 'already-absent' ? 'It was already gone.' : 'Removed “' + r.name + '”.') : out.message);
    }
    render();
  }

  async function openDetails(individualId) {
    const born = beginScope();
    const here = currentStore(); const { store, temporary, threadId } = here;
    const opened = await store.open(individualId);
    if (stale(born)) return; // locked, unlocked or another session while the saved character was being reopened: nothing private is drawn
    if (!opened.ok) { await tell('Saved character', opened.message); return; }
    const { candidate, record } = opened;
    const root = el('div', 'char-details');
    root.append(note(where(temporary)));
    const facts = el('ul', 'char-facts');
    for (const [k, v] of [['Local reference', record.individualId], ['Version', String(record.recordVersion)], ['How it was made', record.origin.purpose === 'copy' ? 'A copy of another saved character (new reference, no shared history)' : 'Saved from a package'], ['Saved', when(record.createdAt)], ['Last changed', when(record.updatedAt)], ['Package fingerprint', record.source.root]]) {
      const li = el('li'); li.dataset.fact = k; li.append(el('strong', null, k + ': '), document.createTextNode(v)); facts.append(li);
    }
    root.append(facts);
    const nameLabel = el('label', null, 'Name'); nameLabel.htmlFor = 'charDetailName';
    const nameInput = el('input'); nameInput.id = 'charDetailName'; nameInput.readOnly = true; nameInput.value = record.preview.name;
    const textLabel = el('label', null, 'Instructions (exactly as saved)'); textLabel.htmlFor = 'charDetailText';
    const text = el('textarea'); text.id = 'charDetailText'; text.readOnly = true; text.rows = 8; text.value = record.preview.instructions;
    root.append(nameLabel, nameInput, textLabel, text, section('What it holds'), capabilityList(record.capabilities));
    for (const [k, label] of [['lore', 'Background and lore'], ['guidance', 'Writing guidance'], ['prepared', 'Prepared interactions'], ['presentation', 'Appearance and presentation'], ['media', 'Pictures, sound and media'], ['evidence', 'Authored history and notes'], ['other', 'Other authored parts']]) {
      const items = record.structured[k]; if (!items?.length) continue;
      const d = el('details', 'char-structure'); d.dataset.structure = k; d.append(el('summary', null, label + ' as saved'));
      const pre = el('pre', 'char-text-preview'); const json = JSON.stringify(items, null, 2); pre.textContent = json.length > STRUCTURE_CHARS ? json.slice(0, STRUCTURE_CHARS) + '\n… (shown shortened; saved in full)' : json; d.append(pre); root.append(d);
    }
    const omitted = omissionList(record.omissions); if (omitted) root.append(omitted);
    root.append(section('Files'));
    const handle = openAppDialog({ title: record.preview.name, content: root, wide: true, actions: [{ label: 'Close', primary: true }] });
    const tracked = track(handle, { temporary, threadId });
    root.append(resourceList(tracked, candidate), claimsList(record));
  }

  return { chooseFile, openFromAddress, addressConflict, openLibrary, closePrivateViews, get temporaryStore() { return temp?.store || null; } };
}
