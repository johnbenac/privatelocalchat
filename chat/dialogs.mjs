// The page's own dialogs: a titled, focus-trapped modal (Escape closes it, focus goes back to what opened it) and the questions built on it. Nothing in the app uses
// the browser's confirm / alert / prompt (tests/no-native-dialogs.test.mjs). The page creates one set with createDialogs({ el, showToast }) and passes the
// functions to the features that need them; window.plcDialogs is the same set for the modules that cannot be handed it.

export function createDialogs({ el, showToast }) {
  // ---- dialogs ---------------------------------------------------------------------------------------------------
  /** A modal dialog: titled, focus-trapped, Escape closes, focus returns to what opened it. */
  function openAppDialog({ title, content, actions = [], wide = false }) {
    const opener = document.activeElement;
    const root = el('div', 'app-dialog');
    const sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    const heading = el('h2', null, title); heading.id = 'dlg-' + Math.random().toString(36).slice(2);
    sheet.setAttribute('aria-labelledby', heading.id);
    if (wide) sheet.style.width = 'min(60rem, 100%)';
    const head = el('div', 'dialog-head'); head.appendChild(heading);
    const x = el('button', 'icon-action', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    head.appendChild(x);
    sheet.appendChild(head);
    const body = el('div', 'dialog-body');
    [].concat(content).forEach(node => body.append(node));
    sheet.appendChild(body);
    const bar = el('div', 'dialog-actions');
    const handle = { root, body, close };
    actions.forEach(a => {
      const b = el('button', a.primary ? 'primary' : 'secondary', a.label); b.type = 'button';
      if (a.danger) b.classList.add('danger');
      b.addEventListener('click', async () => { if (b.getAttribute('aria-busy') === 'true') return; if (a.run) await a.run(handle, b); if (a.close !== false) close(); });
      bar.appendChild(b);
    });
    if (actions.length) sheet.appendChild(bar);
    root.appendChild(sheet); document.body.appendChild(root);
    const focusables = () => [...sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && !n.hidden);
    function onKey(event) {
      if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function close() { document.removeEventListener('keydown', onKey, true); root.remove(); handle.closed = true; handle.onClose?.(); if (opener && opener.focus) try { opener.focus(); } catch { /* gone */ } }
    document.addEventListener('keydown', onKey, true);
    x.addEventListener('click', close);
    root.addEventListener('mousedown', event => { if (event.target === root) close(); });
    const target = focusables().find(n => n !== x) || x;
    window.setTimeout(() => target.focus(), 0);
    return handle;
  }
  function confirmDialog(title, message, confirmLabel, { danger = false } = {}) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      const body = el('p', null, message); body.style.whiteSpace = 'pre-line';
      const d = openAppDialog({ title, content: body, actions: [
        { label: 'Cancel', run: () => finish(false) },
        { label: confirmLabel, primary: true, danger, run: () => finish(true) }
      ] });
      d.onClose = () => finish(false);
    });
  }
  // A message that needs reading, with one OK button (what alert() used to be).
  function alertDialog(title, message) {
    return new Promise(resolve => {
      const body = el('p', null, message); body.style.whiteSpace = 'pre-line';
      const d = openAppDialog({ title, content: body, actions: [{ label: 'OK', primary: true, run: () => resolve() }] });
      d.onClose = () => resolve();
    });
  }
  // Text the browser would not let the page copy: shown selected, in a box, with a Copy button (what window.prompt('Copy this') used to be).
  function copyTextDialog(title, text) {
    const area = el('textarea'); area.value = text; area.readOnly = true; area.rows = Math.min(8, Math.max(2, String(text).split('\n').length + 1)); area.style.width = '100%'; area.setAttribute('aria-label', title);
    const d = openAppDialog({ title, content: [el('p', 'muted', 'Select the text and copy it.'), area], actions: [
      { label: 'Close' },
      { label: 'Copy', primary: true, close: false, run: async dlg => { try { await navigator.clipboard.writeText(text); showToast('Copied.'); dlg.close(); } catch { area.focus(); area.select(); } } }
    ] });
    window.setTimeout(() => { area.focus(); area.select(); }, 0);
    return d;
  }
  function promptDialog(title, label, value = '', { multiline = false, confirmLabel = 'Save' } = {}) {
    return new Promise(resolve => {
      let settled = false;
      const finish = v => { if (!settled) { settled = true; resolve(v); } };
      const wrap = el('div'); const lab = el('label', null, label);
      const input = multiline ? el('textarea') : el('input'); if (!multiline) input.type = 'text';
      input.value = value; const id = 'p-' + Math.random().toString(36).slice(2); input.id = id; lab.htmlFor = id;
      wrap.append(lab, input);
      const d = openAppDialog({ title, content: wrap, actions: [
        { label: 'Cancel', run: () => finish(null) },
        { label: confirmLabel, primary: true, run: () => finish(input.value) }
      ] });
      d.onClose = () => finish(null);
      if (!multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value); d.close(); } });
      window.setTimeout(() => { input.focus(); input.select?.(); }, 0);
    });
  }
  return { openAppDialog, confirmDialog, alertDialog, copyTextDialog, promptDialog };
}
