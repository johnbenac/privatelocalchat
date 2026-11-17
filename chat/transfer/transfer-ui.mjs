// The dialogs for sharing and moving things, one per flow, each with its own title, scope and action:
//   Share                      recommend the public app            (Share Private Local Chat)
//   Transfer settings          move provider settings              (Create transfer link)
//   Transfer chats and backups move conversations as files         (Export saved conversations / Create protected backup)
// plus the review that appears when settings arrive, the unlock step for a protected token, and the Help & about sheet.
// The page supplies everything it owns (storage, tokens, dialogs) through `app`, so nothing here reaches into globals it does not own.
import * as ST from "./settings-transfer.mjs";
import { PRODUCT, mountProductShare, canShareNatively } from "./product-share.mjs";
import { renderQr, fitsQr } from "./qr.mjs";
import { ROBOT_NAME } from "../roberta/ivr-content.mjs";
import { appSession } from "../vault/vault-store.mjs";
import { siteLinks } from "../site/site-links.mjs";

export const NOTICE_SETTINGS = "This transfer includes the settings listed below. These settings may contain sensitive information. Anyone with the link, QR code, or settings file can read the listed settings. An included API token is encrypted with your chosen password. Communicate that password separately.";
export const NOTICE_EXPORT = "This file includes the conversations and items listed below. Anyone able to open the file can read its included content. Choose where to save it and who to give it to.";
export const NOTICE_BACKUP = "This backup includes the items listed below and is protected with your chosen password. Keep the password available for restoration.";
export const UNLOCK_FAILED = "Couldn’t unlock the API token. Your other settings are ready.";
const PENDING_KEY = "plc.pendingToken.v1";

export function createTransferUi({ app, el, openAppDialog, showToast, icon, doc = document, nav = navigator }) {
  const iconNode = (name) => { const s = el("span", "flow-icon"); s.setAttribute("aria-hidden", "true"); const n = icon?.(name); if (n) s.appendChild(n); return s; };
  const button = (label, { primary = false, id = null, danger = false } = {}) => { const b = el("button", primary ? "primary" : "secondary", label); b.type = "button"; if (id) b.id = id; if (danger) b.classList.add("danger"); return b; };
  const scope = (iconName, text, cls) => { const d = el("div", "flow-scope" + (cls ? " " + cls : "")); d.append(iconNode(iconName), el("p", null, text)); return d; };
  const notice = (text) => { const d = el("div", "danger-notice"); d.setAttribute("role", "note"); d.append(iconNode("warning"), el("p", null, text)); return d; };
  const status = () => { const p = el("p", "flow-status"); p.setAttribute("role", "status"); return p; };
  const field = (label, id, { type = "text" } = {}) => {
    const wrap = el("div", "form-group"); const l = el("label", null, label); l.htmlFor = id;
    const input = el("input"); input.type = type; input.id = id; input.autocomplete = "off"; input.autocapitalize = "off"; input.spellcheck = false;
    input.setAttribute("data-1p-ignore", ""); input.setAttribute("data-lpignore", "true");
    wrap.append(l, input); return { wrap, input, label: l };
  };
  const passwordField = (label, id) => {
    const f = field(label, id, { type: "password" });
    const row = el("div", "secret-field"); f.wrap.replaceChild(row, f.input); row.appendChild(f.input);
    const reveal = el("button", "icon-btn", "Show"); reveal.type = "button"; reveal.setAttribute("aria-pressed", "false"); reveal.setAttribute("aria-label", "Show " + label.toLowerCase());
    reveal.addEventListener("click", () => { const on = f.input.type === "password"; f.input.type = on ? "text" : "password"; reveal.textContent = on ? "Hide" : "Show"; reveal.setAttribute("aria-pressed", String(on)); reveal.setAttribute("aria-label", (on ? "Hide " : "Show ") + label.toLowerCase()); });
    row.appendChild(reveal);
    return { ...f, reveal };
  };
  const dl = (rows) => { const d = el("dl", "flow-review"); for (const [k, v] of rows) { const dt = el("dt", null, k), dd = el("dd"); if (v instanceof Node) dd.appendChild(v); else dd.textContent = v; d.append(dt, dd); } return d; };
  const busy = (b, on) => { if (on) b.setAttribute("aria-busy", "true"); else b.removeAttribute("aria-busy"); };
  const themeLabel = (t) => (t === "dark" ? "Dark" : t === "light" ? "Light" : "System default");
  const destinationLabel = (endpoint) => { const id = ST.endpointIdentity(endpoint); return id ? id.replace(/^https?:\/\//, "") : "an endpoint"; };

  // ---- Share ------------------------------------------------------------------------------------------------------------
  function openShare() {
    const body = el("div");
    if (!PRODUCT.url) { body.appendChild(el("p", null, "This copy of the app names no public address, so there is nothing to share from here. Your chats and settings are never part of a share.")); return openAppDialog({ title: "Share Private Local Chat", content: body, actions: [{ label: "OK", primary: true }] }); }
    mountProductShare(body, { doc, nav, onToast: showToast, qrColors: app.qrColors });
    return openAppDialog({ title: "Share Private Local Chat", content: body });
  }

  // ---- Help & about -----------------------------------------------------------------------------------------------------
  function openHelp() {
    const site = app.siteConfig || {};
    const list = el("ul", "help-links");
    const item = (label, href, note) => {
      const li = el("li"); const a = el("a", null, label); a.href = href; a.target = "_blank"; a.rel = "noopener";
      const sr = el("span", "sr-only", " (opens in a new tab)"); a.appendChild(sr);
      li.appendChild(a); if (note) li.appendChild(el("span", "hint-text", " " + note)); list.appendChild(li); return li;
    };
    // the pages of the site that serves this copy (chat/site/site-links.mjs): a page it does not have is not drawn, and with none the list and the sentence about it go
    const links = siteLinks();
    const page = (label, name, anchor) => { const href = links.href(name, anchor); if (href) item(label, href); };
    page("Getting started", "help", "getting-started");
    page("FAQ", "help", "faq");
    page("Troubleshooting", "help", "troubleshooting");
    page("Privacy", "privacy");
    page("About", "about");
    page("Updates", "updates");
    page("Contact", "help", "contact");
    if (site.discussionsUrl) page("Community", "help", "community");
    const body = el("div");
    body.appendChild(scope("help", list.children.length ? "Guides, answers and information about Private Local Chat. Each opens in a new tab, so your chat and draft stay here." : "Information about Private Local Chat."));
    if (list.children.length) body.appendChild(list);
    const actions = el("div", "help-actions");
    if (app.callRoberta) { const call = button(`Call ${ROBOT_NAME}, the app's robot`, { id: "helpCallRoberta" }); call.addEventListener("click", () => { handle.close(); app.callRoberta(); }); actions.appendChild(call); }
    const about = button("Quick summary of this app"); about.addEventListener("click", () => { handle.close(); app.openAboutModal(); }); actions.appendChild(about);
    body.appendChild(actions);
    const fine = el("div", "help-fineprint");
    if (site.supportEmail) { const p = el("p", "hint-text"); const a = el("a", null, "Email the project team"); a.href = "mailto:" + site.supportEmail; p.append(a, " — goes to the people who run this project, for questions and support."); fine.appendChild(p); }
    fine.appendChild(el("p", "hint-text", "GitHub submissions are public. Leave out API keys and private conversations."));
    body.appendChild(fine);
    const handle = openAppDialog({ title: "Help & about", content: body });
    return handle;
  }

  // ---- Transfer settings ------------------------------------------------------------------------------------------------
  async function openTransferSettings() {
    const cfg = app.getConfig();
    const picked = ST.pickSettings(cfg);
    const savedToken = (app.tokens.get(picked.endpoint) || "").trim();
    const canIncludeToken = Boolean(savedToken && ST.endpointIdentity(picked.endpoint));
    let snapshot = null, inputs = null, working = false;

    const body = el("div", "flow-transfer");
    body.appendChild(scope("transfer", "Moves your connection settings to another browser: the endpoint, model and theme, and optionally your API token.", "flow-settings"));
    body.appendChild(notice(NOTICE_SETTINGS));
    const review = el("div", "flow-review-wrap");
    const tokenState = el("span", null, "Omitted");
    const renderReview = () => { review.textContent = ""; review.appendChild(dl([["Endpoint", picked.endpoint || "Not set"], ["Model", picked.model || "Not set"], ["Theme", themeLabel(picked.theme)], ["API token", tokenState]])); };
    renderReview();
    body.appendChild(review);

    let include = null, password = null;
    if (canIncludeToken) {
      const row = el("label", "flow-check"); include = el("input"); include.type = "checkbox"; include.id = "transferIncludeToken";
      row.append(include, el("span", null, "Include API token (the value stays masked: ••••••••)"));
      body.appendChild(row);
      password = passwordField("Transfer password", "transferPassword"); password.wrap.hidden = true;
      password.wrap.appendChild(el("p", "hint-text", "Any text works, including a short or blank password. Whoever opens the transfer needs exactly this text."));
      body.appendChild(password.wrap);
      include.addEventListener("change", () => { password.wrap.hidden = !include.checked; tokenState.textContent = include.checked ? "Included and password protected" : "Omitted"; invalidate(); });
      password.input.addEventListener("input", () => invalidate());
    }

    const message = status(); body.appendChild(message);
    const outputs = el("div", "flow-outputs"); outputs.hidden = true;
    const copyBtn = button("Copy transfer link", { id: "transferCopyBtn" });
    const qrBtn = button("Show transfer QR code", { id: "transferQrBtn" }); qrBtn.setAttribute("aria-expanded", "false");
    const shareBtn = canShareNatively(nav) ? button("Share transfer link", { id: "transferShareBtn" }) : null;
    const fileBtn = button("Download settings file", { id: "transferFileBtn" });
    const outRow = el("div", "flow-output-actions"); outRow.append(...[copyBtn, qrBtn, shareBtn, fileBtn].filter(Boolean));
    const qrBox = el("div", "flow-qr"); qrBox.hidden = true;
    const qrImage = el("div", "flow-qr-image"); qrImage.setAttribute("role", "img"); qrImage.setAttribute("aria-label", "QR code for the settings transfer link");
    qrBox.appendChild(qrImage);
    const qrNote = el("p", "hint-text"); qrNote.hidden = true;
    const manual = el("textarea", "flow-manual"); manual.readOnly = true; manual.rows = 3; manual.hidden = true; manual.setAttribute("aria-label", "Transfer link");
    manual.addEventListener("focus", () => manual.select());
    outputs.append(outRow, qrNote, qrBox, manual);
    body.appendChild(outputs);

    const createBtn = button("Create transfer link", { primary: true, id: "transferCreateBtn" });
    const cancelBtn = button("Cancel");
    const actions = el("div", "dialog-actions"); actions.append(cancelBtn, createBtn);
    body.appendChild(actions);

    const current = () => ({ settings: ST.pickSettings(app.getConfig()), token: (app.tokens.get(ST.pickSettings(app.getConfig()).endpoint) || "").trim(), include: Boolean(include?.checked) });
    const same = (a, b) => a.settings.endpoint === b.settings.endpoint && a.settings.model === b.settings.model && a.settings.theme === b.settings.theme && a.include === b.include && (!a.include || a.token === b.token);
    function invalidate(text = "") {
      if (!snapshot) return;
      snapshot = null; inputs = null; outputs.hidden = true; qrBox.hidden = true; qrImage.textContent = ""; manual.hidden = true; manual.value = "";
      qrBtn.setAttribute("aria-expanded", "false"); qrBtn.textContent = "Show transfer QR code";
      createBtn.hidden = false; message.textContent = text || "Something you included changed. Create the transfer link again.";
    }
    const fresh = () => { if (!snapshot) return false; if (!same(inputs, current())) { invalidate(); return false; } return true; };

    createBtn.addEventListener("click", async () => {
      if (working) return;
      working = true; busy(createBtn, true); createBtn.textContent = "Encrypting…"; message.textContent = include?.checked ? "Encrypting the API token. This takes a moment." : "Creating the transfer.";
      const now = current();
      try {
        const made = await ST.createTransfer({ settings: now.settings, includeToken: now.include, token: now.token, password: password ? password.input.value : "" });
        Object.assign(picked, now.settings);
        renderReview();
        snapshot = made; inputs = { settings: { ...now.settings }, token: now.token, include: now.include };
        outputs.hidden = false; createBtn.hidden = true;
        const fits = fitsQr(made.url, "M");
        qrBtn.hidden = !fits;
        qrNote.hidden = fits; qrNote.textContent = fits ? "" : "This transfer is too long for a QR code. Copy the transfer link or download the settings file instead; both carry everything.";
        message.textContent = made.includesToken ? "Transfer link created. Tell the recipient the password separately." : "Transfer link created.";
        copyBtn.focus();
      } catch (error) { message.textContent = (error?.message || "The transfer could not be created.") + " Nothing was created."; }
      finally { working = false; busy(createBtn, false); createBtn.textContent = "Create transfer link"; }
    });
    copyBtn.addEventListener("click", async () => {
      if (!fresh()) return;
      try { if (!nav.clipboard?.writeText) throw new Error("no clipboard"); await nav.clipboard.writeText(snapshot.url); message.textContent = "Transfer link copied."; showToast("Transfer link copied."); }
      catch { manual.value = snapshot.url; manual.hidden = false; manual.focus(); manual.select(); message.textContent = "Copy this link: it is selected below."; }
    });
    qrBtn.addEventListener("click", async () => {
      if (!fresh()) return;
      if (!qrBox.hidden) { qrBox.hidden = true; qrBtn.setAttribute("aria-expanded", "false"); qrBtn.textContent = "Show transfer QR code"; return; }
      busy(qrBtn, true);
      try { await renderQr(qrImage, snapshot.url, { level: "M", size: 260, ...(app.qrColors?.() || {}) }); qrBox.hidden = false; qrBtn.setAttribute("aria-expanded", "true"); qrBtn.textContent = "Hide transfer QR code"; }
      catch (error) { message.textContent = error?.code === "qr-too-large" ? "This transfer is too long for a QR code. Copy the link or download the file instead." : "The QR code could not be drawn here. Copy the link instead."; qrBtn.hidden = true; }
      finally { busy(qrBtn, false); }
    });
    shareBtn?.addEventListener("click", () => {
      if (!fresh()) return;
      // the snapshot already exists, so the share call is the first thing this click does
      Promise.resolve(nav.share({ title: "Private Local Chat settings", url: snapshot.url })).then(() => { message.textContent = "Handed to your device’s sharing sheet."; }, (e) => { if (e?.name !== "AbortError") message.textContent = "Sharing did not work here. Copy the link instead."; });
    });
    fileBtn.addEventListener("click", () => { if (!fresh()) return; app.downloadText(snapshot.fileName, snapshot.fileText, "application/json"); message.textContent = "Settings file saved."; });
    cancelBtn.addEventListener("click", () => handle.close());

    const handle = openAppDialog({ title: "Transfer settings", content: body });
    // transient secrets go with the dialog; the generated ciphertext package is not affected by emptying the field
    handle.onClose = () => { if (password) password.input.value = ""; snapshot = null; inputs = null; qrImage.textContent = ""; manual.value = ""; };
    const lead = body.querySelector("input, button"); (include || createBtn).focus?.();
    return handle;
  }

  // ---- pending (still locked) token ---------------------------------------------------------------------------------------
  const readPending = () => { try { const v = JSON.parse(appSession.getItem(PENDING_KEY)); return v?.envelope ? v : null; } catch { return null; } };
  const writePending = (envelope) => { try { appSession.setItem(PENDING_KEY, JSON.stringify({ envelope, at: Date.now() })); } catch { /* the token can still be typed in */ } renderPending(); };
  function discardPending() { try { appSession.removeItem(PENDING_KEY); } catch { /* nothing stored */ } renderPending(); }
  let pendingRow = null;
  function renderPending() {
    if (!pendingRow) return;
    const pending = readPending();
    pendingRow.hidden = !pending; pendingRow.textContent = "";
    if (!pending) return;
    const label = el("p", "hint-text", "A transferred API token for " + destinationLabel(pending.envelope.settings.endpoint) + " is waiting for its password.");
    const unlock = button("Unlock transferred API token", { primary: true, id: "unlockPendingBtn" });
    const discard = button("Discard pending token", { id: "discardPendingBtn" });
    unlock.addEventListener("click", () => openUnlock(pending.envelope, { origin: "later" }));
    discard.addEventListener("click", () => { discardPending(); showToast("Pending API token discarded."); });
    const row = el("div", "flow-output-actions"); row.append(unlock, discard);
    pendingRow.append(label, row);
  }
  function mountPendingRow(container) { pendingRow = container; renderPending(); }
  /** A token typed or pasted for the same destination replaces the waiting one. */
  function tokenSetFor(endpoint) { const p = readPending(); if (p && ST.sameDestination(p.envelope.settings.endpoint, endpoint)) discardPending(); }

  // ---- unlock ----------------------------------------------------------------------------------------------------------
  function openUnlock(envelope, { origin = "import" } = {}) {
    const destination = destinationLabel(envelope.settings.endpoint);
    const body = el("div", "flow-unlock");
    body.appendChild(scope("lock", "This transfer includes an API token protected with a password. Enter the exact password the sender gave you."));
    body.appendChild(el("p", "hint-text", "Destination: " + destination));
    const pw = passwordField("Transfer password", "unlockPassword");
    const message = status(); message.setAttribute("role", "alert");
    body.append(pw.wrap, message);
    const unlockBtn = button("Unlock API token", { primary: true, id: "unlockTokenBtn" });
    const skipBtn = button("Continue without API token", { id: "skipTokenBtn" });
    const retryBtn = button("Try again", { id: "retryUnlockBtn" }); retryBtn.hidden = true;
    const manualBtn = button("Enter an API token manually", { id: "manualTokenBtn" }); manualBtn.hidden = true;
    const row = el("div", "dialog-actions"); row.append(skipBtn, retryBtn, manualBtn, unlockBtn);
    body.appendChild(row);
    let working = false;
    const afterSkip = () => { handle.close(); if (origin === "import") app.credentialsResolved({ endpoint: envelope.settings.endpoint }); };
    skipBtn.addEventListener("click", afterSkip);
    retryBtn.addEventListener("click", () => { retryBtn.hidden = true; manualBtn.hidden = true; unlockBtn.hidden = false; message.textContent = ""; pw.input.value = ""; pw.wrap.hidden = false; pw.input.focus(); });
    manualBtn.addEventListener("click", () => { handle.close(); app.focusTokenField(); if (origin === "import") app.credentialsResolved({ endpoint: envelope.settings.endpoint }); });
    unlockBtn.addEventListener("click", async () => {
      if (working) return;
      // the token is only ever attached to the destination it was authenticated for, checked against what is selected now
      if (!ST.tokenBelongsTo(envelope, app.getConfig().endpoint)) { message.textContent = "This token is for " + destination + ", which is not the endpoint selected now. Select that endpoint to use it."; return; }
      working = true; busy(unlockBtn, true); message.textContent = "Unlocking…";
      try {
        const token = await ST.unlockToken(envelope, pw.input.value);
        app.tokens.set(envelope.settings.endpoint, token);
        discardPending(); pw.input.value = "";
        handle.close(); showToast("API token unlocked for " + destination + ".");
        app.credentialsResolved({ endpoint: envelope.settings.endpoint, unlocked: true });
      } catch {
        message.textContent = UNLOCK_FAILED; pw.wrap.hidden = true; unlockBtn.hidden = true; retryBtn.hidden = false; manualBtn.hidden = false; retryBtn.focus();
      } finally { working = false; busy(unlockBtn, false); }
    });
    const handle = openAppDialog({ title: "Unlock API token", content: body });
    handle.onClose = () => { pw.input.value = ""; };
    if (!ST.tokenBelongsTo(envelope, app.getConfig().endpoint)) message.textContent = "This token is for " + destination + ", which is not the endpoint selected now. Select that endpoint to use it.";
    pw.input.focus();
    return handle;
  }

  function openTokenUnreadable({ origin, settings }) {
    const body = el("div");
    body.appendChild(scope("lock", "The API token in this transfer could not be read. Your other settings are ready."));
    body.appendChild(el("p", "hint-text", origin === "file" ? "The file may be damaged or made by a different version. Choose the file again to retry, or enter an API token yourself." : "The link may be incomplete or damaged. Ask the sender to create it again, or enter an API token yourself."));
    const retry = origin === "file" ? button("Try again") : null, manual = button("Enter an API token manually", { primary: true });
    const row = el("div", "dialog-actions"); row.append(...[retry, manual].filter(Boolean)); body.appendChild(row);
    retry?.addEventListener("click", () => { handle.close(); app.chooseSettingsFile(); });
    manual.addEventListener("click", () => { handle.close(); app.focusTokenField(); });
    const handle = openAppDialog({ title: "API token not imported", content: body });
    handle.onClose = () => app.credentialsResolved({ endpoint: settings.endpoint });
  }

  // ---- settings arriving ------------------------------------------------------------------------------------------------
  /** `result` comes from readIncoming / readConfigFile. Shows what would change, and applies it only when asked. */
  function reviewIncoming(result, { origin = "link" } = {}) {
    if (!result?.ok) {
      const body = el("div"); body.appendChild(scope("warning", (result?.message || "These settings could not be read.") + " Nothing was changed.", "flow-error"));
      return openAppDialog({ title: "Couldn’t read these settings", content: body, actions: [{ label: "OK", primary: true }] });
    }
    const cfg = app.getConfig(), s = result.settings;
    const next = { endpoint: s.endpoint || cfg.endpoint, model: s.model || cfg.model, theme: s.theme || cfg.theme };
    const nextId = ST.endpointIdentity(next.endpoint);
    const haveSame = Boolean(nextId && (app.tokens.get(next.endpoint) || "").trim());
    const body = el("div", "flow-import");
    body.appendChild(scope("transfer", "Review these settings before importing. Your conversations are not changed.", "flow-settings"));
    const included = [s.endpoint && "endpoint", s.model && "model", s.theme && "theme"].filter(Boolean);
    const tokenText = { absent: "No API token included", locked: "API token included, protected with a password", decrypted: "API token included (not password protected)", damaged: "An API token was included but could not be read", unsupported: "An API token was included in a format this version cannot read" }[result.token.state];
    body.appendChild(dl([["Endpoint", s.endpoint || "Not included"], ["Model", s.model || "Not included"], ["Theme", s.theme ? themeLabel(s.theme) : "Not included"], ["Included fields", included.length ? included.join(", ") : "None"], ["API token", tokenText]]));
    const changes = [];
    if (s.endpoint && s.endpoint !== cfg.endpoint) changes.push(`Endpoint: ${cfg.endpoint || "not set"} → ${s.endpoint}`);
    if (s.model && s.model !== cfg.model) changes.push(`Model: ${cfg.model || "not set"} → ${s.model}`);
    if (s.theme && s.theme !== cfg.theme) changes.push(`Theme: ${themeLabel(cfg.theme)} → ${themeLabel(s.theme)}`);
    if (result.token.state === "decrypted") changes.push("API token: will be saved for " + destinationLabel(next.endpoint));
    const keep = [];
    if (["absent", "locked", "damaged", "unsupported"].includes(result.token.state)) keep.push(haveSame ? "Your saved API token for this endpoint is kept." : "API tokens you saved stay with the endpoints they belong to.");
    const list = el("ul", "flow-changes");
    (changes.length ? changes : ["These settings match what you have now."]).forEach((c) => list.appendChild(el("li", null, c)));
    keep.forEach((c) => list.appendChild(el("li", null, c)));
    body.appendChild(el("h3", null, "What will change")); body.appendChild(list);
    let clear = null;
    if (haveSame && result.token.state === "absent") {
      const row = el("label", "flow-check"); clear = el("input"); clear.type = "checkbox"; clear.id = "importClearToken";
      row.append(clear, el("span", null, "Also remove my saved API token for this endpoint")); body.appendChild(row);
    }
    const message = status(); body.appendChild(message);
    const importBtn = button("Import settings", { primary: true, id: "importSettingsBtn" }), cancelBtn = button("Cancel");
    const row = el("div", "dialog-actions"); row.append(cancelBtn, importBtn); body.appendChild(row);
    cancelBtn.addEventListener("click", () => handle.close());
    importBtn.addEventListener("click", () => {
      if (result.token.state === "locked") writePending(result.envelope);
      const outcome = app.applySettings(next, { token: result.token.state === "decrypted" ? result.token.value : null, clearToken: Boolean(clear?.checked), models: result.models });
      handle.close();
      showToast("Settings imported.");
      if (result.token.state === "locked") openUnlock(result.envelope, { origin: "import" });
      else if (result.token.state === "damaged" || result.token.state === "unsupported") openTokenUnreadable({ origin, settings: next });
      else app.credentialsResolved({ endpoint: next.endpoint, changed: outcome.endpointChanged });
    });
    const handle = openAppDialog({ title: "Import these settings", content: body });
    return handle;
  }

  // ---- chats and backups ------------------------------------------------------------------------------------------------
  async function openTransferChats() {
    const counts = app.chatCounts();
    const body = el("div", "flow-transfer");
    body.appendChild(scope("chats", "Moves conversations and app data as files. Provider settings and API tokens are not in these files; move them with Transfer settings.", "flow-chats"));

    const summary = (rows) => { const ul = el("ul", "flow-included"); rows.forEach(([label, text, included]) => { const li = el("li", included ? "included" : "excluded"); li.append(el("strong", null, label + ": "), text); ul.appendChild(li); }); return ul; };
    const plainRows = () => [
      ["Conversations", counts.conversations + " saved conversation" + (counts.conversations === 1 ? "" : "s") + " (temporary chats are never saved)", true],
      ["Projects", "Not included", false], ["Memory", "Not included", false], ["Preferences", "Not included", false], ["Documents", "Not included", false],
      ["Provider settings", "Not included", false], ["Credentials", "Not included", false],
      ["File type", "JSON (.json)", true], ["Encryption", "None. The file is readable.", true]];
    const exportCard = el("section", "flow-card"); exportCard.setAttribute("aria-labelledby", "exportCardTitle");
    const exportTitle = el("h3", null, "Export saved conversations"); exportTitle.id = "exportCardTitle";
    const exportBtn = button("Export saved conversations", { primary: true, id: "exportChatsBtn" });
    exportCard.append(exportTitle, notice(NOTICE_EXPORT), summary(plainRows()), exportBtn);

    const backupCard = el("section", "flow-card"); backupCard.setAttribute("aria-labelledby", "backupCardTitle");
    const backupTitle = el("h3", null, "Protected backup"); backupTitle.id = "backupCardTitle";
    const docsRow = el("label", "flow-check"); const docsBox = el("input"); docsBox.type = "checkbox"; docsBox.id = "bkDocs";
    docsRow.append(docsBox, el("span", null, "Include attached files and the document library (can be large)"));
    const backupSummary = el("div");
    const backupRows = (docCount) => [
      ["Conversations", counts.conversations + " saved conversation" + (counts.conversations === 1 ? "" : "s"), true],
      ["Projects", counts.projects + " project" + (counts.projects === 1 ? "" : "s"), true],
      ["Memory", counts.memory + " remembered item" + (counts.memory === 1 ? "" : "s"), true],
      ["Presets", counts.presets + " custom preset" + (counts.presets === 1 ? "" : "s"), true],
      ["Preferences", counts.hasInstructions ? "Your instructions and speech settings" : "Speech settings", true],
      ["Documents", docCount === null ? "Not included" : docCount + " file" + (docCount === 1 ? "" : "s"), docCount !== null],
      ["Provider settings", "Not included", false], ["Credentials", "Not included", false],
      ["File type", "JSON (.json)", true], ["Encryption", "Encrypted with the password you choose", true]];
    const renderBackup = (docCount) => { backupSummary.textContent = ""; backupSummary.appendChild(summary(backupRows(docCount))); };
    renderBackup(null);
    docsBox.addEventListener("change", async () => renderBackup(docsBox.checked ? await app.documentCount() : null));
    const p1 = passwordField("Password (at least 8 characters)", "bkPass1"), p2 = passwordField("Repeat the password", "bkPass2");
    p1.input.autocomplete = "new-password"; p2.input.autocomplete = "new-password";
    const backupMsg = status(); backupMsg.setAttribute("role", "alert"); backupMsg.classList.add("danger");
    const backupBtn = button("Create protected backup", { primary: true, id: "createBackupBtn" });
    backupCard.append(backupTitle, notice(NOTICE_BACKUP), backupSummary, docsRow, p1.wrap, p2.wrap, backupMsg, backupBtn);

    const importRow = el("div", "flow-card flow-import-row");
    importRow.append(el("h3", null, "Receiving chats"), el("p", "hint-text", "Import a chat file or a protected backup you exported earlier, or a ChatGPT or Claude export. You review it and choose Merge or Replace first."));
    const importBtn = button("Import chats or backup", { id: "importChatsBtn" });
    const settingsBtn = button("Transfer settings", { id: "chatsToSettingsBtn" });
    importRow.append(importBtn, settingsBtn);

    body.append(exportCard, backupCard, importRow);
    const handle = openAppDialog({ title: "Transfer chats and backups", content: body, wide: true });
    exportBtn.addEventListener("click", () => { app.exportHistory(); showToast("Conversations exported."); });
    backupBtn.addEventListener("click", async () => {
      if (backupBtn.getAttribute("aria-busy") === "true") return;
      if (p1.input.value.length < 8) { backupMsg.textContent = "Use at least 8 characters."; return; }
      if (p1.input.value !== p2.input.value) { backupMsg.textContent = "The two passwords do not match."; return; }
      busy(backupBtn, true); backupMsg.textContent = "Encrypting…";
      try { await app.createProtectedBackup({ passphrase: p1.input.value, includeDocs: docsBox.checked }); p1.input.value = p2.input.value = ""; handle.close(); showToast("Protected backup saved. Keep the password: it cannot be recovered.", 7000); }
      catch (error) { backupMsg.textContent = "The backup could not be created: " + (error?.message || error); }
      finally { busy(backupBtn, false); }
    });
    importBtn.addEventListener("click", () => { handle.close(); app.chooseChatFile(); });
    settingsBtn.addEventListener("click", () => { handle.close(); openTransferSettings(); });
    handle.onClose = () => { p1.input.value = ""; p2.input.value = ""; };
    exportBtn.focus();
    return handle;
  }

  return { openShare, openHelp, openTransferSettings, openTransferChats, reviewIncoming, openUnlock, mountPendingRow, renderPending, discardPending, tokenSetFor, hasPending: () => Boolean(readPending()), PRODUCT };
}
