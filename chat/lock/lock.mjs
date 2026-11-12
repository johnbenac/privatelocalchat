// The app lock and the "not locked" reminder.
//   With a passcode the app opens on a closed padlock and a passphrase field. It is a screen lock: it hides chats, it does not encrypt what the browser stores.
//   With no passcode the app opens on a short reminder (an open padlock inside a countdown ring) with a button to add one; doing nothing continues into the app.
//   With the encrypted vault on (chat/vault/), locking is real: "Lock now" forgets the key and reloads, and the next visit asks for the passphrase (or Face ID / Touch ID) before anything is read.
// Everything the page provides is passed in, so this file reads on its own. createLock({...}).start() runs once as the page starts.
// `vault` is chat/vault/vault-control.mjs (or null where there is none).

import { createPadlock, playPadlock } from './padlock.mjs';

export function createLock({ el, createEmoji, readJson, writeJson, openAppDialog, confirmDialog, showToast, loadCrypto, passField, focusComposer, onLock, vault = null, busy = () => false }) {
  // app lock: a passphrase screen over the app. Without the vault it hides chats and does not encrypt what the browser stores.
  const LOCK_KEY = 'plc.lock.v1';
  let lockCfg = vault?.active ? { vault: true, autoMinutes: vault.autoMinutes } : readJson(localStorage, LOCK_KEY, null);
  const appEl = document.getElementById('app');
  const lockScreen = el('div', 'lock-screen'); lockScreen.id = 'lockScreen'; lockScreen.setAttribute('role', 'dialog'); lockScreen.setAttribute('aria-modal', 'true'); lockScreen.setAttribute('aria-label', 'Unlock Private Local Chat'); lockScreen.hidden = true; // shown only while locked (it used to cover an unlocked app until start-up finished)
  // the padlock picture (chat/lock/padlock.mjs) is the same everywhere: closed when the app is locked, open on the "not locked" reminder
  const padlock = (open, cls = '') => createPadlock({ open, cls });
  const lockForm = el('form'); const lockHead = el('h2', null, 'Private Local Chat is locked');
  const lockIcon = el('div', 'lock-icon'); lockIcon.appendChild(padlock(false));
  const lockPassLabel = el('label', 'sr-only', 'Passphrase'); lockPassLabel.htmlFor = 'unlockPass';
  const lockPass = el('input'); lockPass.type = 'password'; lockPass.id = 'unlockPass'; lockPass.autocomplete = 'current-password'; lockPass.placeholder = 'Passphrase';
  const lockMsg = el('p', 'danger'); lockMsg.setAttribute('role', 'alert');
  const lockGo = el('button', 'primary', 'Unlock'); lockGo.type = 'submit';
  const lockForgot = el('button', 'link-btn', 'Forgot the passphrase?'); lockForgot.type = 'button';
  const lockNote = el('p', 'muted lock-note'); lockNote.hidden = true;
  lockForm.append(lockIcon, lockHead, lockNote, lockPassLabel, lockPass, lockGo, lockMsg, lockForgot); lockScreen.appendChild(lockForm); document.body.appendChild(lockScreen);
  let failures = 0, lockedUntil = 0, idleTimer = null, hiddenAt = 0;
  function setLockedUi(locked) {
    document.documentElement.classList.toggle('locked', locked);
    const waiting = locked || Boolean(document.getElementById('lockSplash')); // the not-locked reminder keeps the app out of reach too, until it is done
    appEl.inert = waiting; appEl.setAttribute('aria-hidden', String(waiting));
    lockScreen.hidden = !locked;
    if (locked) { lockPass.value = ''; lockMsg.textContent = ''; lockScreen.style.pointerEvents = ''; playPadlock(lockScreen, 'locking'); window.setTimeout(() => lockPass.focus(), 0); } else { lockNote.hidden = true; lockScreen.classList.remove('locking', 'unlocking', 'denied', 'leaving'); }
  }
  async function lockNow(options) {
    if (vault?.active) {
      if (busy() && !options?.quiet && !await confirmDialog('A reply is still being written', 'Locking now stops it. What was written so far is kept.', 'Lock now')) return;
      onLock?.(); vault.lockNow(); return; // the key is forgotten and the page reloads; the unlock screen takes over
    }
    if (!lockCfg) return;
    setLockedUi(true); onLock?.();
  }
  lockForm.addEventListener('submit', async event => {
    event.preventDefault();
    const c = await loadCrypto();
    const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (wait > 0) { lockMsg.textContent = 'Too many tries. Wait ' + wait + ' seconds.'; return; }
    if (lockGo.getAttribute('aria-busy') === 'true') return;
    lockGo.setAttribute('aria-busy', 'true');
    const ok = await c.verifyLock(lockCfg, lockPass.value);
    lockGo.removeAttribute('aria-busy');
    if (ok) { // the lock opens (green, the bar swings up) and the screen fades before the app is shown
      failures = 0; lockScreen.style.pointerEvents = 'none'; playPadlock(lockScreen, 'unlocking');
      window.setTimeout(() => lockScreen.classList.add('leaving'), 1150);                               // the lock opens first, then the screen fades
      window.setTimeout(() => { setLockedUi(false); armIdle(); focusComposer?.(); }, 1550); return;
    }
    failures++; const delay = c.lockDelaySeconds(failures); lockedUntil = Date.now() + delay * 1000;
    lockMsg.textContent = 'That passphrase is not right.' + (delay ? ' Wait ' + delay + ' seconds before trying again.' : '');
    playPadlock(lockScreen, 'denied'); lockPass.select();
  });
  lockForgot.addEventListener('click', async () => {
    const sure = await confirmDialog('Erase and start over?', 'There is no way to recover a forgotten passphrase. You can erase this app’s saved chats, documents, memory and settings in this browser and remove the lock. Downloaded models are kept. If you have a backup you can restore it afterwards.', 'Erase everything', { danger: true });
    if (!sure) return;
    try { localStorage.clear(); sessionStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('plc-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); } catch { /* best effort */ }
    location.reload();
  });
  function armIdle() {
    window.clearTimeout(idleTimer);
    if (!lockCfg || !lockCfg.autoMinutes) return;
    idleTimer = window.setTimeout(() => lockNow({ quiet: true }), lockCfg.autoMinutes * 60000);
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(t => window.addEventListener(t, () => { if (lockCfg && !document.documentElement.classList.contains('locked')) armIdle(); }, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (!lockCfg) return;
    if (document.hidden && vault?.active && vault.lockOnHide) { lockNow({ quiet: true }); return; } // the person asked to be locked as soon as they leave
    if (document.hidden) hiddenAt = Date.now();
    else if (lockCfg.autoMinutes && hiddenAt && Date.now() - hiddenAt > lockCfg.autoMinutes * 60000) lockNow({ quiet: true });
  });
  const lockBtn = el('button', 'icon-btn'); lockBtn.appendChild(createEmoji('🔒')); lockBtn.type = 'button'; lockBtn.id = 'lockNowBtn'; lockBtn.title = 'Lock now'; lockBtn.setAttribute('aria-label', 'Lock now');
  lockBtn.addEventListener('click', lockNow);
  function syncLockUi() {
    if (lockCfg && !lockBtn.isConnected) document.getElementById('headerTools').appendChild(lockBtn); else if (!lockCfg) lockBtn.remove();
    if (!lockCfg) setLockedUi(false);
  }
  const DISCLAIMER = 'A passcode keeps casual snoopers out of this app. It is not strong protection: someone with enough skill and access to this device may still be able to read your chats. Also use your device’s own security: a device passcode, Face ID or fingerprint, and keep its software up to date.';
  const autoOptions = () => { const auto = el('select'); auto.id = 'lockAuto'; [['0', 'Only when I press Lock'], ['1', 'After 1 minute away'], ['5', 'After 5 minutes away'], ['15', 'After 15 minutes away']].forEach(([v, l]) => auto.appendChild(new Option(l, v))); return auto; };
  // The pieces the Settings page is made of (card, row, label, note), so these dialogs look like the rest of the app instead of a bare form.
  const card = (...rows) => { const c = el('div', 'set-card'); c.append(...rows); return c; };
  const sub = text => el('div', 'set-sub', text);
  const note = (text, cls = '') => el('p', 'set-note sec-note ' + cls, text);
  const rowOf = (label, desc, control, tag = 'div') => {
    const r = el(tag, 'set-row'); const t = el('div'); t.append(el('div', 'set-label', label)); if (desc) t.append(el('div', 'set-desc', desc));
    const c = el('div', 'set-control'); c.append(control); r.append(t, c); return r;
  };
  const field = wrapper => { wrapper.classList.add('set-field'); return wrapper; };
  const button = (label, id) => { const b = el('button', 'set-btn', label); b.type = 'button'; if (id) b.id = id; return b; };

  // Set a passcode. Any passphrase is allowed (one character is fine; it is the person's choice). After it is set the app locks at once and shows the closed padlock,
  // which also proves the passphrase was typed the way they meant it.
  async function openSetLock() {
    const c = await loadCrypto();
    const root = el('div');
    const msg = el('p', 'danger sec-msg'); msg.setAttribute('role', 'alert');
    const auto = autoOptions();
    const [a, pa] = passField('New passphrase', 'lockNew1'), [b, pb] = passField('Repeat the passphrase', 'lockNew2');
    const canEncrypt = Boolean(vault?.supported);
    const encBox = el('input'); encBox.type = 'checkbox'; encBox.id = 'lockEncrypt'; encBox.checked = false; encBox.disabled = !canEncrypt; // never on by itself: it is for people who want it
    const fixedName = el('input', 'sr-only'); fixedName.type = 'text'; fixedName.name = 'username'; fixedName.autocomplete = 'username'; fixedName.value = 'Private Local Chat'; fixedName.tabIndex = -1; fixedName.readOnly = true; fixedName.setAttribute('aria-hidden', 'true'); // a fixed name for the OS password manager
    root.append(
      fixedName,
      el('p', 'sec-lead', 'Choose any passphrase you like: a single character, 1234, ABC or a long sentence. You will type it every time the app opens.'),
      card(field(a), field(b)),
      card(rowOf('Lock automatically', null, auto)),
      card(rowOf('Also encrypt everything this app saves', canEncrypt ? 'For people who want the strongest protection on this device. Off: the passcode is a screen lock only.' : 'This browser cannot keep an encrypted vault, so this passcode is a screen lock only.', encBox, 'label')),
      note(canEncrypt ? ENCRYPT_NOTE : '', 'enc-note'), msg, note(DISCLAIMER));
    openAppDialog({ title: 'Add a passcode', content: root, actions: [{ label: 'Cancel' }, { label: 'Lock the app', primary: true, close: false, run: async (d, button) => {
      if (!pa.value.length) { msg.textContent = 'Type a passphrase (any length, even one character).'; return; }
      if (pa.value !== pb.value) { msg.textContent = 'The two passphrases do not match.'; return; }
      if (encBox.checked && canEncrypt) { await enableVault(d, button, pa.value, Number(auto.value), msg); return; }
      button.setAttribute('aria-busy', 'true'); msg.textContent = 'Setting up…';
      lockCfg = { ...(await c.createLock(pa.value)), autoMinutes: Number(auto.value) };
      writeJson(localStorage, LOCK_KEY, lockCfg); try { localStorage.removeItem(SPLASH_KEY); } catch { /* ignore */ }
      syncLockUi(); armIdle(); d.close();
      setLockedUi(true); lockNote.textContent = 'Passcode set. Type it to open the app.'; lockNote.hidden = false;
    } }] });
  }

  const ENCRYPT_NOTE = 'Your chats, documents, memory and settings are sealed with this passphrase and stored as you go, so closing the tab loses nothing. Without the passphrase they cannot be read, and if you forget it they cannot be recovered: keep an encrypted backup. It does not protect against someone who controls the website you load, or against a device that is already unlocked and being watched.';

  /** Encrypt what is saved, check it by reading it back, then offer to remove the unencrypted copy. */
  async function enableVault(d, button, passphrase, autoMinutes, msg) {
    button.setAttribute('aria-busy', 'true'); msg.textContent = 'Encrypting everything and checking it…';
    try {
      const result = await vault.enable(passphrase, { autoMinutes });
      lockCfg = { vault: true, autoMinutes }; syncLockUi(); armIdle(); d.close();
      showToast('Your chats, documents, memory and settings are now encrypted with your passphrase.');
      if (result.remaining.length) {
        const sure = await confirmDialog('Remove the unencrypted copy?', 'Your data is encrypted now, but the old unencrypted copy is still stored in this browser, readable by anyone with the device. Remove it now? An encrypted backup first is a good idea (Settings > Storage).', 'Remove it', { danger: true });
        if (sure) { await vault.removePlaintext(); showToast('The unencrypted copy is removed.'); }
        else showToast('The unencrypted copy is still on this device. Remove it in Settings > Security.', 9000);
      }
    } catch (error) {
      button.removeAttribute('aria-busy');
      msg.textContent = 'Nothing was changed. ' + (error?.message || 'The encrypted copy could not be checked.');
    }
  }

  async function openVaultSettings() {
    const root = el('div');
    const leftover = vault.plaintextRemaining();
    const msg = el('p', 'danger sec-msg'); msg.setAttribute('role', 'alert');
    const auto = autoOptions(); auto.value = String(vault.autoMinutes || 0);
    const hideBox = el('input'); hideBox.type = 'checkbox'; hideBox.checked = vault.lockOnHide;
    const keysBox = el('input'); keysBox.type = 'checkbox'; keysBox.checked = vault.rememberKeys;
    const [cur, pc] = passField('Current passphrase', 'lockCurrent'); pc.autocomplete = 'current-password';
    const [nw, pn] = passField('New passphrase (only to change it)', 'lockNewPass'); pn.autocomplete = 'new-password';
    const faceCard = el('div', 'set-card face-box');
    root.append(el('p', 'sec-lead', 'Your chats, documents, memory and settings on this device are encrypted with your passphrase. Locking forgets the key and asks for it again.'));
    if (leftover.length) root.append(note('The old unencrypted copy of your data is still stored in this browser. Remove it so only the encrypted copy remains.', 'danger'));
    root.append(
      sub('Locking'),
      card(rowOf('Lock automatically', null, auto), rowOf('Lock as soon as I leave this tab or app', 'The page reloads and asks again.', hideBox, 'label')),
      sub('Unlock with Face ID or Touch ID'), faceCard,
      sub('API keys'),
      card(rowOf('Remember my API keys', 'Kept encrypted. Off: keys last until the tab closes.', keysBox, 'label')),
      sub('Passphrase'),
      card(field(cur), field(nw)), msg);
    if (window.__plcVaultUnlockMs) root.appendChild(note('Unlocking with the passphrase took ' + (window.__plcVaultUnlockMs / 1000).toFixed(1) + ' seconds on this device.'));
    const pending = vault.stats.pending; if (pending) root.appendChild(note(pending + ' change(s) are still being stored.'));
    root.appendChild(note(ENCRYPT_NOTE));
    // Face ID / Touch ID
    (async () => {
      const pk = await import('../vault/passkey.mjs').catch(() => null);
      if (!pk || !pk.passkeySupported()) { faceCard.append(rowOf('Not available here', 'This browser cannot unlock with Face ID, Touch ID or a screen lock. The passphrase always works.', document.createTextNode(''))); return; }
      const render = () => {
        faceCard.textContent = '';
        const list = vault.passkeys;
        const add = button(list.length ? 'Add another' : 'Turn on', 'addPasskey');
        add.setAttribute('aria-label', list.length ? 'Add another device' : 'Turn on Face ID / Touch ID');
        add.addEventListener('click', async () => {
          add.setAttribute('aria-busy', 'true'); msg.textContent = '';
          try { await vault.addPasskey(pk.createPasskeyWrap); showToast('You can now unlock with Face ID or Touch ID.'); render(); }
          catch (error) { add.removeAttribute('aria-busy'); msg.textContent = pk.passkeyMessage(error); }
        });
        faceCard.append(rowOf(list.length ? 'On for this address' : 'Face ID, Touch ID or screen lock', list.length ? 'You can unlock without typing.' : 'Unlock by looking at the phone or using the screen lock, instead of typing.', add));
        for (const w of list) {
          const rm = button('Remove'); rm.addEventListener('click', async () => { await vault.removePasskey(w.id); render(); });
          faceCard.append(rowOf(w.label || 'Passkey', 'Added ' + new Date(w.createdAt || Date.now()).toLocaleDateString(), rm));
        }
      };
      render();
      root.insertBefore(note('A passkey is kept by your device account (Apple passkeys sync through iCloud Keychain), and each web address has its own. If you lose it, the passphrase still opens everything; if you lose both, nothing can.'), faceCard.nextSibling);
    })();
    const actions = [
      { label: 'Lock now', run: () => lockNow() },
      { label: 'Save', primary: true, run: () => { vault.setAutoMinutes(Number(auto.value)); vault.setLockOnHide(hideBox.checked); lockCfg = { vault: true, autoMinutes: Number(auto.value) }; vault.setRememberKeys(keysBox.checked); armIdle(); showToast('Saved.'); } },
      { label: 'Change passphrase', close: false, run: async d => {
        if (!pc.value || !pn.value) { msg.textContent = 'Type the current passphrase and the new one.'; return; }
        try { msg.textContent = 'Changing…'; await vault.changePassphrase(pc.value, pn.value); d.close(); showToast('Passphrase changed. Nothing was re-encrypted; the old one no longer works.'); }
        catch (error) { msg.textContent = error?.code === 'bad-passphrase' ? 'That is not the current passphrase.' : (error?.message || 'Could not change it.'); }
      } },
      { label: 'Turn encryption off', danger: true, close: false, run: async d => {
        if (!pc.value) { msg.textContent = 'Type the current passphrase to turn encryption off.'; return; }
        const sure = await confirmDialog('Turn encryption off?', 'Your chats, documents, memory and settings will be stored in this browser without encryption, readable by anyone with the device.', 'Turn it off', { danger: true });
        if (!sure) return;
        try { msg.textContent = 'Turning off…'; await vault.disable(pc.value); lockCfg = null; syncLockUi(); d.close(); showToast('Encryption is off.'); }
        catch (error) { msg.textContent = error?.code === 'bad-passphrase' ? 'That is not the current passphrase.' : (error?.message || 'Could not turn it off.'); }
      } }
    ];
    if (leftover.length) actions.unshift({ label: 'Remove the unencrypted copy', danger: true, close: false, run: async d => { await vault.removePlaintext(); d.close(); showToast('The unencrypted copy is removed.'); } });
    openAppDialog({ title: 'Encryption and lock', content: root, actions });
  }

  async function openLockSettings() {
    if (vault?.active) { openVaultSettings(); return; }
    if (!lockCfg) { openSetLock(); return; }
    const c = await loadCrypto();
    const root = el('div');
    const msg = el('p', 'danger sec-msg'); msg.setAttribute('role', 'alert');
    const auto = autoOptions(); auto.value = String(lockCfg.autoMinutes || 0);
    const [cur, pc] = passField('Passphrase (to turn the lock off or to encrypt)', 'lockCurrent'); pc.autocomplete = 'current-password';
    root.append(
      el('p', 'sec-lead', 'The lock keeps people who pick up your device from reading your chats. It is a screen lock: it does not encrypt what this browser stores, so someone with access to the browser’s files could still read them.'),
      card(rowOf('Lock automatically', null, auto)), card(field(cur)), msg, note(DISCLAIMER));
    openAppDialog({ title: 'App lock', content: root, actions: [
      { label: 'Lock now', run: () => lockNow() },
      ...(vault?.supported ? [{ label: 'Encrypt everything…', close: false, run: async (d, button) => {
        if (!pc.value) { msg.textContent = 'Type your passphrase to encrypt everything with it.'; return; }
        if (!await c.verifyLock(lockCfg, pc.value)) { msg.textContent = 'That passphrase is not right.'; return; }
        await enableVault(d, button, pc.value, Number(auto.value), msg);
      } }] : []),
      { label: 'Save', run: () => { lockCfg.autoMinutes = Number(auto.value); writeJson(localStorage, LOCK_KEY, lockCfg); armIdle(); } },
      { label: 'Turn lock off', danger: true, close: false, run: async d => {
        if (!await c.verifyLock(lockCfg, pc.value)) { msg.textContent = 'That passphrase is not right.'; return; }
        lockCfg = null; try { localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ } syncLockUi(); d.close(); showToast('Lock is off.');
      } }
    ] });
  }

  // ---- the "not locked" reminder: when the app opens with no passcode, a short splash says so, with a countdown ring and a big open padlock to add one ----
  const SPLASH_KEY = 'plc.lockSplash.v1', SPLASH_MS = 2500;
  function showLockSplash() {
    const root = el('div', 'lock-splash'); root.id = 'lockSplash'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'splashTitle');
    const card = el('div', 'lock-splash-card');
    const title = el('h2', null, 'This app is not locked'); title.id = 'splashTitle';
    const lead = el('p', 'lock-splash-lead', 'Anyone who can use this device can open it and read your chats.');
    const NS = 'http://www.w3.org/2000/svg', ring = document.createElementNS(NS, 'svg'); ring.setAttribute('viewBox', '0 0 100 100'); ring.setAttribute('class', 'lock-ring'); ring.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(NS, 'circle'), arc = document.createElementNS(NS, 'circle');
    for (const c of [track, arc]) { c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '46'); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '5'); }
    track.setAttribute('class', 'lock-ring-track'); arc.setAttribute('class', 'lock-ring-arc'); arc.style.animationDuration = SPLASH_MS + 'ms'; ring.append(track, arc);
    const add = el('button', 'lock-add'); add.type = 'button'; add.id = 'splashAdd'; add.setAttribute('aria-label', 'Add a passcode');
    add.append(ring, padlock(true, 'lock-add-icon'), el('span', 'lock-add-label', 'Add a passcode'));
    const skip = el('button', 'link-btn lock-skip', 'Continue without a passcode'); skip.type = 'button'; skip.id = 'splashSkip';
    const never = el('button', 'link-btn lock-never', 'Don’t remind me again'); never.type = 'button'; never.id = 'splashNever';
    const status = el('p', 'sr-only'); status.setAttribute('role', 'status'); status.textContent = 'This app is not locked. Continuing in a moment.';
    const fine = el('p', 'lock-disclaimer', DISCLAIMER);
    card.append(title, lead, add, skip, never, fine, status); root.appendChild(card); document.body.appendChild(root);
    appEl.inert = true; appEl.setAttribute('aria-hidden', 'true');
    let done = false, timer = null;
    const finish = after => {
      if (done) return; done = true; window.clearTimeout(timer);
      root.remove(); document.documentElement.classList.remove('splashing'); appEl.inert = false; appEl.removeAttribute('aria-hidden');
      if (after) after(); else focusComposer?.({ preventScroll: true });
    };
    timer = window.setTimeout(() => finish(), SPLASH_MS);
    add.addEventListener('click', () => finish(() => openSetLock()));
    skip.addEventListener('click', () => finish());
    never.addEventListener('click', () => { try { localStorage.setItem(SPLASH_KEY, 'off'); } catch { /* ignore */ } showToast('The reminder is off. You can turn it back on in Settings > Security.'); finish(); });
    add.focus({ preventScroll: true });
  }
  const reminderOn = () => { try { return localStorage.getItem(SPLASH_KEY) !== 'off'; } catch { return true; } };
  const setReminder = on => { try { if (on) localStorage.removeItem(SPLASH_KEY); else localStorage.setItem(SPLASH_KEY, 'off'); } catch { /* ignore */ } };
  return {
    get enabled() { return Boolean(lockCfg); },
    lockNow, openLockSettings, showSplash: showLockSplash, reminderOn, setReminder,
    /** The lock settings changed from outside (a settings import): show the lock button, or not. */
    sync: syncLockUi,
    /** Call once at start-up: locked, or the reminder, or straight into the app. */
    start() {
      if (vault?.active) { document.documentElement.classList.remove('locked', 'splashing'); syncLockUi(); armIdle(); } // unlocked at start-up by chat/vault/unlock-screen.mjs
      else if (lockCfg) { setLockedUi(true); syncLockUi(); }
      else if (reminderOn()) showLockSplash();
      else document.documentElement.classList.remove('splashing');
    }
  };
}
