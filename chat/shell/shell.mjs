// The app shell: icon rail, sidebar panel, header actions, composer "+" menu, model picker, settings page, search overlay and
// Roberta's page. It rearranges the existing controls (it moves the real elements, so their behaviour and element ids are untouched)
// and adds the new ones. Everything is built from the registry so a place in the app is one entry.

import { iconNode } from "../icons.mjs";
import { createRegistry } from "./registry.mjs";
import { buildModelsPage } from "./models-page.mjs";
import { mountConnectionPill } from "./connection-pill.mjs";
import { rowParts, renderRowText } from "./model-row.mjs";
import { languageRows as langVMs, voiceRows as voiceVMs, stateLine as vmLine } from "../models/models-view.mjs";
import { hybridSearch, passagesFor, defaultFilters } from "./hybrid-search.mjs";
import { siteLinks } from "../site/site-links.mjs";

// What the page hands the shell (createShell(app)): `app.parts` are the page controls the shell is documented to move or watch, `app.models` the chat model
// controller, `app.dialogs` the page's dialogs, `app.build` the build info, `app.lock` the lock reminder setting. The shell asks for a part by name; a name the
// page did not provide is an error. `own(id)` finds only things the shell built itself.
let host = null;
const $ = (id) => { if (!host.parts || !(id in host.parts)) throw new Error('the page did not give the shell "' + id + '"'); return host.parts[id]; };
const own = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}
const icon = (name) => iconNode(name);
const iconBtn = (name, label, onclick, cls = "") => { const b = h("button", { type: "button", class: "shell-icon-btn " + cls, "aria-label": label, title: label, onclick }); b.append(icon(name)); return b; };

// ---- popovers ----------------------------------------------------------------------------------------------------------
let openPop = null;
export function closePopover() { if (openPop) { openPop.cleanup(); openPop = null; } }
export function popover(anchor, rows, { align = "start", above = false, cls = "" } = {}) {
  closePopover();
  const pop = h("div", { class: "shell-pop " + cls, role: "menu" });
  const fill = (list) => { for (const r of list) {
    if (r.divider) { pop.append(h("div", { class: "shell-pop-sep", role: "separator" })); continue; }
    if (r.heading) { pop.append(h("div", { class: "shell-pop-heading", text: r.heading })); continue; }
    if (r.note) { pop.append(h("div", { class: "shell-pop-note " + (r.kind || ""), role: "status", text: r.note })); continue; }
    const b = h("button", { type: "button", class: "shell-pop-row" + (r.danger ? " danger" : ""), role: r.checked != null ? "menuitemradio" : "menuitem", "aria-checked": r.checked != null ? String(Boolean(r.checked)) : null, disabled: r.disabled });
    if (r.dot) b.append(h("span", { class: "shell-pop-dot", "data-state": r.dot, "aria-hidden": "true" }));
    if (r.icon) b.append(h("span", { class: "shell-pop-ico" }, icon(r.icon)));
    let text;
    if (r.parts) { // a model row: drawn by the same code as the Settings row (chat/shell/model-row.mjs)
      b.append(h("span", { class: "shell-pop-dot", "data-state": r.parts.state, "aria-hidden": "true" }));
      text = renderRowText(h, r.parts, { box: "shell-pop-text", label: "shell-pop-label", desc: "shell-pop-desc", badge: "shell-pop-inuse" });
    } else {
      text = h("span", { class: "shell-pop-text" }, h("span", { class: "shell-pop-label", text: r.label }));
      if (r.desc) text.append(h("span", { class: "shell-pop-desc", text: r.desc }));
    }
    b.append(text);
    if (r.right) b.append(h("span", { class: "shell-pop-right" }, r.right));
    if (r.checked) b.append(h("span", { class: "shell-pop-check" }, icon("check")));
    b.addEventListener("click", (e) => { e.stopPropagation(); if (r.keepOpen) { r.onClick?.(e); return; } closePopover(); anchor.focus?.({ preventScroll: true }); r.onClick?.(e); }); // focus goes back to the control that opened the menu, so a dialog opened next returns there
    pop.append(b);
  } };
  fill(rows);
  // a menu that shows live state (a download running) is redrawn in place, keeping what had focus
  pop.update = (list) => { const keep = pop.querySelector(":focus")?.textContent; pop.textContent = ""; fill(list); const again = keep && [...pop.querySelectorAll("button")].find((b) => b.textContent === keep); again?.focus({ preventScroll: true }); place(); };
  document.body.append(pop);
  // placed from the anchor every time the content changes, so a menu that grows while it is open never slides over the control that opened it
  function place() {
    const rect = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = align === "end" ? rect.right - pw : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = above ? rect.top - ph - 8 : rect.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 8);
    if (top < 8) top = 8;
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  place();
  const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  const key = (e) => { if (e.key === "Escape") { closePopover(); anchor.focus?.(); } };
  setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", key, true); }, 0);
  anchor.setAttribute("aria-expanded", "true");
  openPop = { cleanup() { document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", key, true); pop.remove(); anchor.removeAttribute("aria-expanded"); } };
  pop.querySelector("button:not([disabled])")?.focus();
  return pop;
}

// ---- voices (the picker in the composer and the Voice section of Settings share these) ----
const voiceSize = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + " GB" : n >= 1e6 ? (n / 1e6 < 10 ? (n / 1e6).toFixed(1) : Math.round(n / 1e6)) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
const progressText = (p) => !p ? "Starting…" : p.phase === "connecting" ? "Connecting to the download server…" : p.phase === "retry" ? "Connection problem, trying again" + (p.attempt ? " (" + p.attempt + ")" : "") + "…" : p.total ? "Downloading " + Math.round((p.done / p.total) * 100) + "%" : "Downloading…";
/** One line about a voice, like the language-model list: what it is, whether it is on this device, what to do, and the device advice. */
// Where a downloaded voice is right now: on the device only, or also in memory. The dot on the voice pill follows the same words.
const MEMORY_TEXT = { unloaded: "Not in memory (loads when it reads)", loading: "Loading into memory…", loaded: "In memory, ready", speaking: "Reading now", unloading: "Unloading…" };
function voiceDescription(v) {
  // the state words come from chat/models/models-view.mjs, the same ones Settings and the storage screen use
  const vm = voiceVMs({ voices: [v] })[0];
  let line;
  if (v.id === "os") line = v.note;
  else if (v.state === "installing") line = "Downloading the " + v.label + " voice: " + progressText(v.progress).replace(/^Downloading\s*/, "");
  else if (v.state === "ready") line = vmLine(vm) + " · " + v.license + (v.memory === "unloaded" ? " (loads when it reads)" : "");
  else if (v.state === "failed" || v.state === "testing") line = vmLine(vm);
  else line = vmLine(vm) + " · " + v.license + (v.failures ? " · failed before: " + v.failures.reason : "");
  if (v.recommended) line += " · Recommended for this device";
  else if (v.advice) line += " · " + v.advice;
  return line;
}
/** Choose a voice from the picker or from Settings: downloads it when it is not on the device; after a failure asks once, then goes ahead. */
async function chooseVoice(ctl, id, toast, { toggle = false } = {}) {
  // A voice that is not downloaded cannot be fetched with no connection: say so in the shared words instead of starting a download that fails.
  const target = ctl.voices?.find((x) => x.id === id);
  if (target && id !== "os" && target.state !== "ready" && target.state !== "installing" && target.state !== "testing" && host.offline?.connection.state === "offline") {
    toast?.(host.offline.reason("voice-download")); return { ok: false, offline: true };
  }
  let r = await (toggle ? ctl.toggle(id) : ctl.select(id));
  if (r.needsConfirm) {
    const v = ctl.voices.find((x) => x.id === id);
    if (!(await host.dialogs?.confirm(v.label + " failed before", "It already failed on this device:\n\n" + r.reason + "\n\nTry again?", "Try again"))) return r;
    r = await (toggle ? ctl.toggle(id, { confirmed: true }) : ctl.select(id, { confirmed: true }));
  }
  if (r.busy) toast?.("A voice is being downloaded already. You can cancel it from the voice menu.");
  return r;
}
const voiceBusy = (snap) => snap.voices.find((v) => v.state === "installing" || v.state === "testing");

// ---- the shell ---------------------------------------------------------------------------------------------------------
export function createShell(app) {
  host = app;
  const registry = createRegistry();
  const shell = { registry, openSettings: () => {}, openSearch: () => {}, openRoberta: () => {}, closeRoberta: () => {}, ownsFocusTarget: () => false };
  const root = $("app"), panel = $("sidebar"), main = $("chatArea");
  if (!root || !panel || !main) return shell;
  document.body.classList.add("shell");

  // ---- registry entries ----
  registry.register("rail", { id: "chats", label: "Chats", icon: "chats", order: 10, open: () => { shell.closeRoberta(); closePanelOnMobile(); } });
  registry.register("rail", { id: "library", label: "Library", icon: "book", order: 20, open: () => { shell.closeRoberta(); app.openLibrary(); } });
  registry.register("explore", { id: "memory", label: "Memory & preferences", desc: "What it remembers and your defaults", icon: "bookmark", order: 10, open: () => app.openPreferences() });
  registry.register("explore", { id: "storage", label: "Storage & backups", desc: "Where chats live and how to keep them", icon: "storage", order: 20, open: () => app.openStorage() });
  registry.register("explore", { id: "transfer", label: "Transfer chats and settings", desc: "Move to another browser or device", icon: "transfer", order: 30, open: () => shell.openSettings("data") });
  registry.register("explore", { id: "help", label: "Help & about", icon: "help", order: 40, open: () => app.openHelp() });
  registry.register("explore", { id: "share", label: "Share", icon: "share", order: 50, open: () => app.openShare() });

  // ---- icon rail ----
  const rail = h("nav", { id: "shellRail", class: "shell-rail", "aria-label": "Main" });
  const railTop = h("div", { class: "shell-rail-top" }), railBottom = h("div", { class: "shell-rail-bottom" });
  rail.append(railTop, railBottom);
  root.insertBefore(rail, panel);
  const exploreBtn = iconBtn("more", "Explore", () => popover(exploreBtn, exploreRows(), { cls: "wide" }), "rail-btn");
  const profileBtn = h("button", { type: "button", class: "shell-avatar", "aria-label": "This device menu", title: "This device", "aria-haspopup": "menu" }); profileBtn.append(icon("device"));
  profileBtn.addEventListener("click", () => popover(profileBtn, [
    { heading: "This device" },
    { label: "Memory & preferences", icon: "bookmark", onClick: () => app.openPreferences() },
    { label: "Settings", icon: "gear", onClick: () => shell.openSettings("general") },
    { divider: true },
    { label: "Help & about", icon: "help", onClick: () => app.openHelp() },
    { label: "Share", icon: "share", onClick: () => app.openShare() }
  ], { above: true, cls: "wide" }));
  function exploreRows() {
    return registry.list("explore").map((i) => ({
      label: i.label, desc: i.desc, icon: i.icon, onClick: i.open,
      right: h("span", { class: "shell-pin" + (registry.isPinned(i.id) ? " on" : ""), role: "button", tabindex: "0", title: registry.isPinned(i.id) ? "Unpin from the rail" : "Pin to the rail", "aria-label": (registry.isPinned(i.id) ? "Unpin " : "Pin ") + i.label, onclick: (e) => { e.stopPropagation(); registry.setPinned(i.id, !registry.isPinned(i.id)); closePopover(); renderRail(); } }, icon("pin"))
    }));
  }
  function renderRail() {
    railTop.textContent = "";
    for (const i of registry.list("rail")) {
      const b = iconBtn(i.icon, i.label, () => i.open(), "rail-btn"); b.dataset.rail = i.id; railTop.append(b);
    }
    for (const i of registry.list("explore").filter((x) => registry.isPinned(x.id))) railTop.append(iconBtn(i.icon, i.label, () => i.open(), "rail-btn"));
    railTop.append(exploreBtn);
    railBottom.textContent = ""; railBottom.append(profileBtn);
    setRailActive();
  }
  function setRailActive() { rail.querySelectorAll("[data-rail]").forEach((b) => b.classList.toggle("active", b.dataset.rail === (document.body.classList.contains("roberta-page-open") ? "" : "chats"))); }
  registry.onChange(renderRail); renderRail();

  // ---- panel: header, nav, new chat, list ----
  const sideHeader = panel.querySelector(".sidebar-header"), brand = sideHeader.querySelector(".brand");
  const closeBtn = $("closeSidebarBtn");
  const panelToggle = iconBtn("panel", "Close sidebar", () => togglePanel(false), "panel-toggle");
  const searchBtn = iconBtn("search", "Search chats", () => shell.openSearch(), "panel-search");
  sideHeader.textContent = ""; sideHeader.append(brand, searchBtn, panelToggle);
  if (closeBtn) { closeBtn.classList.add("drawer-close"); sideHeader.append(closeBtn); }
  const newRow = panel.querySelector(".new-chat-row"), newChat = $("newChatBtn");
  newChat.textContent = ""; newChat.append(icon("compose"), h("span", { class: "btn-label", text: "New chat" })); newChat.classList.remove("primary"); newChat.classList.add("shell-row");
  newRow.textContent = ""; newRow.append(newChat);
  // destinations that only show in the panel on a phone (the rail is hidden there)
  const navList = h("div", { class: "shell-nav" });
  const robertaRow = h("button", { type: "button", class: "shell-row shell-dot", id: "robertaDot" }, h("span", { class: "shell-dot-avatar", "aria-hidden": "true", text: "R" }), h("span", { class: "btn-label", text: "Roberta" }));
  robertaRow.addEventListener("click", () => shell.openRoberta());
  const mobileLib = h("button", { type: "button", class: "shell-row mobile-only", onclick: () => { app.openLibrary(); closePanelOnMobile(); } }, icon("book"), h("span", { class: "btn-label", text: "Library" }));
  const mobileExplore = h("button", { type: "button", class: "shell-row mobile-only" }, icon("more"), h("span", { class: "btn-label", text: "Explore" }));
  mobileExplore.addEventListener("click", () => popover(mobileExplore, exploreRows(), { cls: "wide" }));
  const mobileSettings = h("button", { type: "button", class: "shell-row mobile-only", onclick: () => { shell.openSettings("general"); closePanelOnMobile(); } }, icon("gear"), h("span", { class: "btn-label", text: "Settings" }));
  const reportIssue = h("a", { class: "shell-row", href: "https://github.com/johnbenac/privatelocalchat/issues/new/choose", target: "_blank", rel: "noopener" }, icon("help"), h("span", { class: "btn-label", text: "Report an issue" }));
  navList.append(robertaRow, mobileLib, mobileExplore, mobileSettings, reportIssue);
  newRow.after(navList);

  const scroll = panel.querySelector(".sidebar-scroll");
  // everything that belongs in Settings is moved out of the sidebar
  const chatsSection = scroll.querySelector(".chats-section");
  const providerSettings = $("providerSettings"), backupFiles = $("backupFiles"), footer = panel.querySelector(".side-footer");

  // ---- panel collapse (desktop) / drawer (phone) ----
  const desktop = window.matchMedia("(min-width: 900px)");
  function togglePanel(open) {
    if (desktop.matches) { document.body.classList.toggle("shell-collapsed", open === undefined ? undefined : !open); try { localStorage.setItem("plc.shell.collapsed", document.body.classList.contains("shell-collapsed") ? "1" : ""); } catch { /* ignore */ } }
    else if (open) app.openSidebar(); else app.closeSidebar();
    syncToggle();
  }
  function closePanelOnMobile() { if (!desktop.matches) app.closeSidebar(); }
  try { if (localStorage.getItem("plc.shell.collapsed") === "1") document.body.classList.add("shell-collapsed"); } catch { /* ignore */ }

  // ---- header ----
  const header = $("chatHeader"), badge = $("modeBadge");
  const showPanel = iconBtn("panel", "Open sidebar", () => { if (desktop.matches) togglePanel(true); else app.openSidebar(); }, "show-panel");
  header.prepend(showPanel);
  const tempToggle = iconBtn("ghost", "Temporary chat", () => { const t = app.currentThread(); if (t?.temporary) app.newThread({}); else app.newThread({ temporary: true }); }, "header-temp");
  const chatMenu = iconBtn("more", "Chat options", () => { const id = app.currentThreadId(); if (id) app.toggleThreadMenu(id, chatMenu); }, "header-more");
  header.append(tempToggle, chatMenu);
  badge.querySelector(".mode-badge-text").setAttribute("data-quiet", "1");
  function syncToggle() {
    const collapsed = desktop.matches ? document.body.classList.contains("shell-collapsed") : !document.body.classList.contains("sidebar-open");
    showPanel.hidden = !collapsed && desktop.matches;
  }
  desktop.addEventListener?.("change", syncToggle);
  new MutationObserver(syncToggle).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  syncToggle();

  function syncChatState() {
    const t = app.currentThread();
    tempToggle.classList.toggle("on", Boolean(t?.temporary)); tempToggle.title = t?.temporary ? "Leave temporary chat" : "Temporary chat";
    tempToggle.setAttribute("aria-pressed", String(Boolean(t?.temporary)));
    chatMenu.hidden = !t || Boolean(t.temporary) || !(t.messages?.length);
    main.classList.toggle("is-empty", Boolean($("emptyState")));
    document.body.classList.toggle("view-temp", Boolean(t?.temporary));
  }
  const listEl = $("threadList");
  new MutationObserver(syncChatState).observe(listEl, { childList: true });
  new MutationObserver(syncChatState).observe($("messages"), { childList: true });
  syncChatState();

  // ---- composer ----
  const form = $("messageForm"), input = $("messageInput"), bar = form.querySelector(".composer-bar"), tools = $("composerTools");
  const plusBtn = h("button", { type: "button", class: "shell-plus", id: "shellPlus", "aria-label": "Add files and more", title: "Add files and more", "aria-haspopup": "menu" }); plusBtn.append(icon("plus"));
  plusBtn.addEventListener("click", () => popover(plusBtn, plusRows(), { above: true, cls: "wide" }));
  const modelPill = h("button", { type: "button", class: "shell-model", id: "modelPill", "aria-haspopup": "menu", "aria-label": "Choose model" }, h("span", { class: "shell-model-dot", "aria-hidden": "true" }), h("span", { class: "shell-model-name" }), icon("chevron"));
  bar.prepend(plusBtn); bar.insertBefore(modelPill, tools);
  // ---- voice picker: its own pill beside the model picker. Choosing a voice that is not downloaded downloads it at once, like choosing a model. ----
  const voicePill = h("button", { type: "button", class: "shell-model shell-voicepick", id: "voicePill", "aria-haspopup": "menu", "aria-label": "Choose voice", title: "Choose voice", hidden: true },
    h("span", { class: "shell-model-dot", "aria-hidden": "true" }), icon("volume"), h("span", { class: "shell-model-name", text: "System" }));
  bar.insertBefore(voicePill, tools);
  // ---- connection pill: only there when offline (or for a moment after coming back) ----
  if (app.offline) mountConnectionPill({ h, icon, bar, before: tools, offline: app.offline, popover, closePopover, openSettings: () => shell.openSettings("models") });
  let voiceCtl = null;
  function syncVoice(snap) {
    const busy = voiceBusy(snap), sel = snap.voices.find((v) => v.selected);
    const name = voicePill.querySelector(".shell-model-name");
    if (busy) { const pct = busy.progress?.total && busy.state === "installing" ? Math.round((busy.progress.done / busy.progress.total) * 100) + "%" : busy.state === "testing" ? "testing" : "connecting"; name.textContent = busy.label + " " + pct; voicePill.dataset.status = "busy"; voicePill.title = busy.label + " — " + voiceDescription(busy); }
    else { name.textContent = sel.id === "os" ? "System" : sel.label + (sel.memory === "loading" ? " loading…" : ""); voicePill.dataset.status = snap.notice?.kind === "error" ? "error" : sel.id === "os" ? "none" : "ready"; voicePill.dataset.memory = sel.id === "os" ? "" : sel.memory || ""; voicePill.title = "Voice: " + sel.label + (MEMORY_TEXT[sel.memory] ? " — " + MEMORY_TEXT[sel.memory] : "") + (snap.notice ? " — " + snap.notice.text : ""); }
  }
  const pickVoice = (id) => chooseVoice(voiceCtl, id, app.toast, { toggle: true });
  function voiceRows(snap) {
    const rows = [];
    if (snap.notice) rows.push({ note: snap.notice.text, kind: snap.notice.kind });
    rows.push({ heading: "Voice for reading aloud" });
    for (const vm of voiceVMs(snap)) {
      const extra = vm.kind === "system" ? [] : [vm.recommended ? "Recommended for this device" : vm.advice, vm.failures && vm.state !== "failed" ? "failed before: " + vm.failures.reason : ""];
      rows.push({ label: vm.label, parts: rowParts(vm, extra), checked: vm.inUse, keepOpen: true, onClick: () => pickVoice(vm.id) });
    }
    rows.push({ divider: true });
    const total = snap.totalBytes;
    rows.push({ heading: "Voices on this device: " + (total ? voiceSize(total) : "none downloaded") });
    for (const v of snap.voices) {
      if (v.state === "installing" || v.state === "testing") rows.push({ label: "Cancel " + v.label + " download", icon: "close", onClick: () => voiceCtl.cancel(v.id) });
      else if (v.id !== "os" && v.state === "ready") rows.push({ label: "Remove " + v.label + " (" + voiceSize(v.bytesOnDevice || v.size) + ")", icon: "trash", danger: true, onClick: async () => { if (await host.dialogs?.confirm("Remove " + v.label + "?", "It is deleted from this device. Reading aloud goes back to the system voice if it was selected. You can download it again any time.", "Remove", { danger: true })) voiceCtl.remove(v.id); } });
    }
    const sel = snap.voices.find((v) => v.selected);
    const inMemory = snap.voices.filter((v) => v.memory === "loaded" || v.memory === "speaking" || v.memory === "loading");
    if (inMemory.length) rows.push({ label: "Free the memory (unload " + inMemory.map((v) => v.label).join(", ") + ")", icon: "close", onClick: () => voiceCtl.release("person") });
    if (sel && sel.id !== "os" && sel.state === "ready") rows.push({ label: "Hear a sample of " + sel.label, icon: "play", onClick: () => voiceCtl.hearSample(sel.id).catch((e) => app.toast?.(e.message)) });
    return rows;
  }
  voicePill.addEventListener("click", () => {
    if (!voiceCtl) return;
    const pop = popover(voicePill, voiceRows(voiceCtl.snapshot()), { align: "end", above: true, cls: "wide" });
    const off = voiceCtl.subscribe((s) => { if (pop.isConnected) pop.update(voiceRows(s)); else off(); });
    voiceCtl.advise(); // measured now, shown as advice in the list when it is ready; it never blocks a choice
  });
  (async () => { voiceCtl = await app.loadVoice?.(); if (!voiceCtl) return; voiceCtl.subscribe(syncVoice); syncVoice(voiceCtl.snapshot()); voicePill.hidden = false; })();
  registry.register("plus", { id: "files", label: "Add photos & files", desc: "Upload from this device", icon: "paperclip", order: 10, open: () => app.attachFiles() });
  registry.register("plus", { id: "library", label: "Add from library", desc: "Browse your saved documents", icon: "book", order: 20, open: () => app.openLibrary() });
  registry.register("plus", { id: "project", label: "Work in a project", desc: "Start a chat in a project", icon: "folder", order: 30, open: () => app.moveCurrentToProject() });
  registry.register("plus", { id: "instructions", label: "Instructions for this chat", desc: "Tell the model how to answer", icon: "edit", order: 40, open: () => { const d = $("systemPromptContainer"); d.open = true; d.scrollIntoView({ block: "nearest" }); $("systemPromptInput")?.focus(); } });
  registry.register("plus", { id: "voice-note", label: "Record a voice note", desc: "Speak, then send it as a message", icon: "waveform", order: 50, open: () => app.toggleVoiceNote(), visible: () => app.canRecordNote() });
  function plusRows() { return registry.list("plus").map((i) => ({ label: i.label, desc: i.desc, icon: i.icon, onClick: i.open })); }

  // the mic is the dictation button; the voice button becomes the round waveform button; both swap for Send once there is text
  const decorate = () => {
    const voice = $("voiceModeBtn"), mic = $("micBtn");
    if (voice && !voice.dataset.shell) { voice.dataset.shell = "1"; voice.textContent = ""; voice.append(icon("waveform")); voice.classList.add("shell-voice"); voice.title = "Voice conversation"; }
    if (mic && !mic.dataset.shell) { mic.dataset.shell = "1"; mic.classList.add("shell-mic"); mic.title = "Dictate"; }
  };
  new MutationObserver(decorate).observe(tools, { childList: true }); decorate();
  const statusEl = $("generationStatus");
  const syncStatus = () => statusEl.classList.toggle("quiet", /^\s*(Response complete|Ready)/i.test(statusEl.textContent || ""));
  new MutationObserver(syncStatus).observe(statusEl, { childList: true, characterData: true, subtree: true }); syncStatus();
  const syncText = () => form.classList.toggle("has-text", input.value.trim().length > 0);
  input.addEventListener("input", syncText); syncText();
  new MutationObserver(syncText).observe(input, { attributes: true }); // a draft restored by script
  setInterval(syncText, 700);

  // ---- model picker ----
  const modelName = () => {
    const lm = host.models;
    if (lm?.mode === "api") { const v = $("modelSelect"); return { name: v?.value || "Connected model", status: "provider", detail: "Connected provider" }; }
    const label = lm?.state?.tiers?.[lm.state.selection.tier]?.info?.label || "On-device model";
    const s = lm?.state, t = s?.transfer;
    if (lm?.ready) return { name: label, status: "ready", detail: "Ready on this device" };
    // only a real download or load shows as one: the check of saved files at start-up is "busy" too, and used to read "Downloading 0%"
    if ((s?.busy === "install" || s?.busy === "repair") && t) return { name: label, status: "busy", detail: "Downloading " + Math.round(((t.bytesDone || 0) / Math.max(1, t.bytesTotal || 1)) * 100) + "%" };
    if (s?.busy === "load") return { name: label, status: "busy", detail: "Loading…" };
    if (lm?.installed) return { name: label, status: "idle", detail: "Downloaded, not loaded" };
    return { name: label, status: "none", detail: "Not downloaded" };
  };
  function syncModel() {
    const m = modelName();
    modelPill.querySelector(".shell-model-name").textContent = m.name;
    modelPill.dataset.status = m.status; modelPill.title = m.name + " — " + m.detail;
    const where = $("modeBadge"); if (where) where.dataset.status = m.status;
  }
  window.addEventListener("local-model-state", syncModel);
  setInterval(syncModel, 1500); syncModel();
  function modelRows() {
    const lm = host.models, rows = [{ heading: "On this device" }];
    // the same rows as Settings > Models, built from the same view-model (chat/models/models-view.mjs)
    for (const vm of lm?.state ? langVMs(lm.state, { mode: lm.mode, hide: lm.qualityAvailable === false ? ["default"] : [] }) : []) {
      rows.push({ label: vm.label, parts: rowParts(vm), checked: vm.inUse, keepOpen: true, onClick: () => toggleLocal(vm.id) });
    }
    const api = $("modelSelect");
    if (api && [...api.options].some((o) => o.value)) {
      rows.push({ heading: "Connected provider" });
      for (const o of [...api.options].filter((x) => x.value).slice(0, 12)) rows.push({ label: o.text, icon: "cloud", checked: lm?.mode === "api" && api.value === o.value, onClick: () => chooseProvider(o.value) });
    }
    rows.push({ divider: true }, { label: "Manage models…", icon: "sliders", onClick: () => shell.openSettings("models") }, { label: "Add a provider…", icon: "cloud", onClick: () => shell.openSettings("models", $("endpointSelect") || own("replyModeSeg"), true) });
    return rows;
  }
  modelPill.addEventListener("click", () => {
    const pop = popover(modelPill, modelRows(), { align: "end", above: true, cls: "wide" });
    const redraw = () => { if (pop.isConnected) pop.update(modelRows()); else window.removeEventListener("local-model-state", redraw); };
    window.addEventListener("local-model-state", redraw);
  });
  // A click on a chat model is a toggle on whether it is loaded: not downloaded -> download and load; downloading -> cancel; downloaded -> load; loaded -> unload
  // (it stays the chosen model and loads again when the next message is sent). Another model is chosen and loaded. A provider's model is a plain selection.
  async function toggleLocal(value) {
    const lm = host.models;
    if (lm && lm.mode === "local" && lm.selectedTier === value) {
      const s = lm.state;
      if (lm.ready) { try { await lm.freeMemory(); } catch (e) { app.toast?.(e.message); } return; }
      if (s?.busy && s.transfer) { lm.cancelDownload(); return; }
      if (s?.busy) { app.toast?.("The chat model is loading. It can be unloaded when it has finished."); return; }
    }
    return chooseLocal(value);
  }
  async function chooseLocal(value) {
    const lm = host.models; if (!lm) return;
    lm.setMode("local");
    if (lm.selectedTier !== value) await lm.selectTier(value);
    if (!lm.ready) lm.ensureReady().catch(() => {});
  }
  function chooseProvider(value) {
    const sel = $("modelSelect");
    host.models?.setMode("api");
    sel.value = value; sel.dispatchEvent(new Event("change"));
  }

  // ---- settings page ----
  const settings = buildSettings({ app, shell, registry, moved: { providerSettings, backupFiles, footer } });
  shell.openSettings = settings.open; shell.ownsFocusTarget = (el) => settings.contains(el);
  badge.addEventListener("click", (e) => { e.stopImmediatePropagation(); settings.open("models", own("replyModeSeg")); }, true);

  // ---- search overlay ----
  const search = buildSearch({ app, registry });
  shell.openSearch = search.open;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); search.open(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChat.click(); }
  });

  // ---- Roberta's page ----
  const page = h("section", { id: "robertaPage", class: "roberta-page", hidden: true, "aria-label": "Roberta" });
  const pageHead = h("div", { class: "roberta-page-head" },
    h("button", { type: "button", class: "shell-icon-btn", "aria-label": "Back to chats", onclick: () => shell.closeRoberta() }, icon("left")),
    h("span", { class: "shell-dot-avatar big", "aria-hidden": "true", text: "R" }),
    h("div", { class: "roberta-page-title" }, h("strong", { text: "Roberta" }), h("span", { text: "Your guide to this app. Scripted, never an AI model." })));
  const callBtn = h("button", { type: "button", class: "roberta-call", id: "robertaCallBtn", "aria-label": "Call Roberta" }, icon("phone"), h("span", { text: "Call" }));
  pageHead.append(callBtn);
  const pageBody = h("div", { class: "roberta-page-body" });
  page.append(pageHead, pageBody);
  main.append(page);
  shell.openRoberta = async () => {
    closePopover(); closePanelOnMobile();
    document.body.classList.add("roberta-page-open"); page.hidden = false; robertaRow.classList.add("active"); setRailActive();
    pageBody.textContent = "";
    try {
      const api = await app.loadRoberta();
      api.mountHero(pageBody, { onDismiss: () => shell.closeRoberta() });
      callBtn.onclick = () => api.openCall();
    } catch { pageBody.append(h("p", { class: "muted", text: "Roberta could not start in this browser. Help & about still has the written answers." })); }
  };
  shell.closeRoberta = () => { document.body.classList.remove("roberta-page-open"); page.hidden = true; robertaRow.classList.remove("active"); setRailActive(); };
  new MutationObserver(() => { if (document.body.classList.contains("roberta-page-open")) { /* chat opened from the list */ } }).observe(listEl, { childList: true });
  listEl.addEventListener("click", () => shell.closeRoberta());
  newChat.addEventListener("click", () => shell.closeRoberta());

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".app-dialog, .shell-pop, .search-overlay:not([hidden]), .settings-page:not([hidden])") && document.body.classList.contains("roberta-page-open") && !app.callOpen()) shell.closeRoberta(); });
  return shell;
}

// ---- settings --------------------------------------------------------------------------------------------------------------
function buildSettings({ app, shell, registry, moved }) {
  const card = (...rows) => h("div", { class: "set-card" }, rows);
  const row = (label, desc, control) => h("div", { class: "set-row" }, h("div", { class: "set-text" }, h("div", { class: "set-label", text: label }), desc ? h("div", { class: "set-desc", text: desc }) : null), h("div", { class: "set-control" }, control));
  const btn = (text, onclick, cls = "") => h("button", { type: "button", class: "set-btn " + cls, onclick }, text);
  const sections = [];
  const add = (id, label, ico, keywords, build) => sections.push({ id, label, ico, keywords, build });

  add("general", "General", "gear", "theme appearance dark light build version microphone voice dictation", () => {
    const wrap = h("div");
    wrap.append(h("h2", { text: "General" }), card(
      row("Theme", "Light or dark. Saved on this device.", $("themeToggleBtn")),
      row("Where replies run", "On this device, or an outside provider you choose.", btn("Models and connection", () => settings.open("models")))));
    // The build this page is running, so a stale copy is easy to spot: compare it with the one at /version.json.
    const b = host.build || {};
    const builtAt = b.builtAt ? new Date(b.builtAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
    wrap.append(h("p", { class: "set-about", id: "settingsBuild", text: "Private Local Chat " + (b.version ? b.version + " · " : "") + "build " + (b.commit ? String(b.commit).slice(0, 7) : "unknown") + (b.environment && b.environment !== "production" ? " (" + b.environment + ")" : "") + (builtAt ? " · built " + builtAt : "") }));
    return wrap;
  });
  add("personalization", "Personalization", "user", "memory preferences instructions voice speed call sounds", () => h("div", {}, h("h2", { text: "Personalization" }), card(
    row("Memory & preferences", "What it remembers, voice, reply speed and call sounds. Never used in temporary chats.", btn("Manage", () => app.openPreferences())),
    row("Instructions for a chat", "Set these from the + menu in any chat.", null))));
  add("models", "Models", "sliders", "model models download remove delete storage provider api endpoint token device gpu voice read aloud listen speak sample system tts kokoro kitten memory unload language chat embedding", () => buildModelsPage({ app, h, row, btn, moved, chooseVoice }));
  add("data", "Data controls", "shield", "export import backup transfer delete archive trash storage", () => {
    const w = h("div", {}, h("h2", { text: "Data controls" }));
    w.append(card(
      row("Archived chats", "Chats you set aside.", btn("View", () => { settings.close(); app.setThreadView("archived"); openPanel(); })),
      row("Recently deleted", "Kept for 30 days, then removed for good.", btn("View", () => { settings.close(); app.setThreadView("trash"); openPanel(); })),
      row("Storage & backups", "Where chats live on this device, and how to keep them.", btn("Open", () => app.openStorage()))));
    w.append(h("div", { class: "set-moved" }, moved.backupFiles));
    w.append(h("p", { class: "set-note", text: "Nothing is sent anywhere to train on. There is no account." }));
    return w;
  });
  add("security", "Security", "lock", "lock passcode app lock reminder splash not locked", () => {
    const box = h("input", { type: "checkbox", id: "lockReminder", "aria-label": "Remind me when the app is not locked" });
    const sync = () => { box.checked = app.lock ? app.lock.reminderOn() : true; };
    box.addEventListener("change", () => app.lock?.setReminder(box.checked));
    const w = h("div", {}, h("h2", { text: "Security" }), card(
      row("App lock and encryption", "Ask for a passcode before the app opens, and encrypt everything this app saves on this device. Unlock with the passphrase, or Face ID where the device offers it.", btn("Set up", () => app.openLockSettings())),
      row("Not-locked reminder", "When the app has no passcode, show a short reminder as it opens, with a button to add one.", box)));
    w.addEventListener("shell-refresh", sync); sync();
    return w;
  });
  add("roberta", "Roberta & voice", "phone", "roberta call dictation voice", () => h("div", {}, h("h2", { text: "Roberta & voice" }), card(
    row("Call Roberta", "A scripted guide to the app. She is not an AI model.", btn("Open Roberta", () => { settings.close(); shell.openRoberta(); })),
    row("Voice, speed and call sounds", "Choose the voice used to read answers aloud.", btn("Open", () => app.openPreferences())))));
  add("files", "Library", "book", "documents files library", () => h("div", {}, h("h2", { text: "Library" }), card(row("Documents", "Files you can use in any chat or in one project.", btn("Manage", () => app.openLibrary())))));
  add("about", "About", "info", "version offline privacy help share source report", () => {
    const w = h("div", {}, h("h2", { text: "About" }), card(
      row("Help & about", "How privacy works, install tips, and answers.", btn("Open", () => app.openHelp())),
      row("Share this app", null, btn("Share", () => app.openShare())),
      siteLinks().has("privacy") ? row("Privacy", null, h("a", { class: "set-btn", href: siteLinks().href("privacy"), target: "_blank", rel: "noopener" }, "Read")) : null,
      row("Report a problem", "A GitHub account is needed. Leave out keys and private chats.", h("a", { class: "set-btn", href: "https://github.com/johnbenac/privatelocalchat/issues/new/choose", target: "_blank", rel: "noopener" }, "Open")),
      row("Source code", null, h("a", { class: "set-btn", href: "https://github.com/johnbenac/privatelocalchat", target: "_blank", rel: "noopener" }, "View"))));
    const foot = moved.footer; foot.classList.add("set-foot");
    w.append(foot); return w;
  });

  const page = h("div", { class: "settings-page", id: "settingsPage", role: "dialog", "aria-modal": "true", "aria-label": "Settings", hidden: true });
  const nav = h("nav", { class: "settings-nav", "aria-label": "Settings sections" });
  const close = iconBtn("close", "Close settings", () => settings.close(), "settings-close");
  const q = h("input", { type: "search", class: "settings-search", placeholder: "Search", "aria-label": "Search settings" });
  const content = h("div", { class: "settings-content", tabindex: "-1" });
  nav.append(h("div", { class: "settings-nav-head" }, h("strong", { text: "Settings" }), close), q);
  const buttons = new Map();
  const tabs = h("div", { class: "settings-nav-tabs" });
  for (const s of sections) { const b = h("button", { type: "button", class: "settings-nav-item", "data-section": s.id }, icon(s.ico), h("span", { text: s.label })); b.addEventListener("click", () => show(s.id)); buttons.set(s.id, b); tabs.append(b); }
  nav.append(tabs);
  q.addEventListener("input", () => { const t = q.value.trim().toLowerCase(); for (const s of sections) buttons.get(s.id).hidden = Boolean(t) && !(s.label + " " + s.keywords).toLowerCase().includes(t); const first = sections.find((s) => !buttons.get(s.id).hidden); if (t && first) show(first.id); });
  page.append(nav, content);
  document.body.append(page);
  const built = new Map();
  const stash = h("div", { hidden: true }); document.body.append(stash);
  function show(id) {
    const s = sections.find((x) => x.id === id) || sections[0];
    if (!built.has(s.id)) built.set(s.id, s.build());
    for (const w of built.values()) if (w.parentNode === content) stash.append(w); // never detach: the app looks these controls up by id
    content.append(built.get(s.id));
    built.get(s.id).dispatchEvent?.(new Event("shell-refresh"));
    buttons.forEach((b, k) => b.classList.toggle("active", k === s.id));
    page.dataset.section = s.id;
  }
  // build every section once so the moved controls (model download, API form, theme button) exist for the app's scripts even while closed
  for (const s of sections) built.set(s.id, s.build());
  for (const w of built.values()) stash.append(w);
  let lastFocus = null;
  const settings = {
    contains: (el) => Boolean(el && (page.contains(el) || stash.contains(el))),
    open(id = "general", focusEl = null, fromPicker = false) {
      if (id === "voice") { id = "models"; focusEl = focusEl || (() => { const s = own("voiceSection"); return s; })(); } // voices are a section of the Models page
      closePopover(); lastFocus = document.activeElement; page.hidden = false; document.body.classList.add("settings-open"); show(id);
      if (fromPicker) host.models?.setMode("api");
      if (focusEl) setTimeout(() => { try { focusEl.scrollIntoView({ block: "center", behavior: "smooth" }); focusEl.focus({ preventScroll: true }); } catch { /* not focusable */ } }, 60);
      else content.focus({ preventScroll: true });
      if (!desktopQ.matches) app.closeSidebar();
    },
    close() { page.hidden = true; document.body.classList.remove("settings-open"); for (const [, w] of built) stash.append(w); lastFocus?.focus?.({ preventScroll: true }); }
  };
  const desktopQ = window.matchMedia("(min-width: 900px)");
  const openPanel = () => { if (desktopQ.matches) document.body.classList.remove("shell-collapsed"); else app.openSidebar(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !page.hidden && !document.querySelector(".app-dialog, .shell-pop")) settings.close(); });
  return settings;
}

// ---- search ----------------------------------------------------------------------------------------------------------------
function buildSearch({ app }) {
  const overlay = h("div", { class: "search-overlay", id: "searchOverlay", hidden: true, role: "dialog", "aria-modal": "true", "aria-label": "Search chats" });
  const box = h("div", { class: "search-box" });
  const input = h("input", { type: "search", class: "search-input", placeholder: "Search chats", "aria-label": "Search chats", autocomplete: "off" });
  const filterBtn = h("button", { type: "button", class: "set-btn", "aria-expanded": "false" }, icon("filter"), h("span", { text: "Filters" }));
  const closeBtn = iconBtn("close", "Close search", () => close());
  const filters = defaultFilters();
  const panel = h("div", { class: "search-filters", hidden: true });
  const sel = (label, key, opts, parse = (v) => v) => { const s = h("select", { "aria-label": label }); for (const [v, t] of opts) s.append(h("option", { value: v, text: t })); s.value = String(filters[key]); s.addEventListener("change", () => { filters[key] = parse(s.value); run(); }); return h("label", { class: "search-f" }, h("span", { text: label }), s); };
  const chk = (label, key) => { const c = h("input", { type: "checkbox" }); c.addEventListener("change", () => { filters[key] = c.checked; run(); }); return h("label", { class: "search-f check" }, c, h("span", { text: label })); };
  const folderSel = h("select", { "aria-label": "Project" }); folderSel.addEventListener("change", () => { filters.folderId = folderSel.value; run(); });
  panel.append(
    sel("Date", "days", [["0", "Any time"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["365", "Last year"]], Number),
    h("label", { class: "search-f" }, h("span", { text: "Project" }), folderSel),
    sel("Include", "archived", [["no", "Active chats"], ["only", "Archived only"], ["all", "Everything, including deleted"]]),
    sel("Written by", "role", [["", "Anyone"], ["user", "Me"], ["assistant", "The assistant"]]),
    sel("Match", "mode", [["both", "Words and meaning"], ["words", "Words only"], ["meaning", "Meaning only"]]),
    chk("Pinned only", "pinnedOnly"), chk("Has files", "hasFiles"));
  const status = h("p", { class: "search-status", role: "status", "aria-live": "polite" });
  const list = h("ul", { class: "search-list", role: "listbox", "aria-label": "Results" });
  box.append(h("div", { class: "search-top" }, icon("search"), input, filterBtn, closeBtn), panel, status, list);
  overlay.append(box); document.body.append(overlay);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  filterBtn.addEventListener("click", () => { panel.hidden = !panel.hidden; filterBtn.setAttribute("aria-expanded", String(!panel.hidden)); });

  // the meaning index: vectors for message passages, built in the background while the overlay is open, kept in memory only
  let embedder = null, indexing = false, indexed = 0, total = 0, embedderFailed = "";
  const vectors = new Map();
  async function ensureEmbedder() {
    if (embedder || embedderFailed) return embedder;
    try {
      embedder = await app.getEmbedder();
      embedder.onState?.(() => { setStatus(); });
      embedder.ready().then(buildIndex).catch((e) => { embedderFailed = e?.message || "unavailable"; setStatus(); });
    } catch (e) { embedderFailed = e?.message || "unavailable"; }
    setStatus(); return embedder;
  }
  async function buildIndex() {
    if (indexing || !embedder || embedder.state !== "ready") return;
    indexing = true;
    try {
      const todo = passagesFor(app.threads()).filter((p) => !vectors.has(p.key)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2500);
      total = vectors.size + todo.length;
      for (let i = 0; i < todo.length && !overlay.hidden; i += 24) {
        const batch = todo.slice(i, i + 24);
        const vs = await embedder.embedDocuments(batch.map((p) => p.text));
        batch.forEach((p, j) => vectors.set(p.key, vs[j])); indexed = vectors.size; setStatus();
        if (i % 96 === 0) run();
      }
    } catch (e) { embedderFailed = e?.message || "the matching model stopped"; }
    indexing = false; setStatus(); run();
  }
  function setStatus() {
    if (filters.mode === "words") { status.textContent = "Matching exact words only."; return; }
    if (embedderFailed) status.textContent = "Matching by words only (" + embedderFailed.replace(/\.$/, "") + ").";
    else if (!embedder || embedder.state === "loading" || embedder.state === "idle") status.textContent = "Improving search: loading a small on-device model that matches by meaning (about 24 MB, once). Words work now.";
    else if (indexing) status.textContent = "Matching by meaning: " + indexed + " of " + total + " passages read on this device…";
    else status.textContent = vectors.size ? "Matching by words and meaning, on this device." : "Matching by words.";
  }

  let results = [], active = 0, seq = 0, timer = null;
  const when = (t) => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
  async function run() {
    clearTimeout(timer); const my = ++seq; const q = input.value.trim(); const threads = app.threads();
    list.textContent = ""; active = 0;
    if (!q) {
      const recent = threads.filter((t) => !t.temporary && t.deletedAt == null && !t.archived).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
      results = recent.map((t) => ({ threadId: t.id, title: t.title || "Untitled", messageId: null, snippet: { before: "", match: "", after: "" }, updatedAt: t.updatedAt, via: "recent" }));
      list.append(h("li", { class: "search-group", text: "Recent chats" }));
      paint(); return;
    }
    let semantic = null;
    if (filters.mode !== "words" && embedder?.state === "ready" && vectors.size) { try { semantic = { queryVector: await embedder.embedQuery(q), vectors, minScore: 0.34 }; } catch { /* words only */ } }
    if (my !== seq) return;
    results = hybridSearch({ threads, query: q, filters, semantic });
    if (!results.length) list.append(h("li", { class: "search-empty", text: "No chats match “" + q + "” with these filters." }));
    paint();
  }
  function paint() {
    results.forEach((r, i) => {
      const li = h("li", { class: "search-item" + (i === active ? " active" : ""), role: "option", tabindex: "-1", "aria-selected": String(i === active) });
      li.append(icon("chats"), h("div", { class: "search-item-text" }, h("div", { class: "search-item-title", text: r.title || "Untitled" }),
        r.via === "recent" ? null : h("div", { class: "search-item-snip" }, r.snippet.before, r.snippet.match ? h("mark", { class: "search-hit", text: r.snippet.match }) : null, r.snippet.after)),
        h("div", { class: "search-item-meta" }, r.via === "meaning" ? h("span", { class: "search-tag", text: "meaning" }) : null, r.archived ? h("span", { class: "search-tag", text: "archived" }) : null, h("span", { text: when(r.updatedAt) })));
      li.addEventListener("click", () => choose(i)); li.addEventListener("mousemove", () => { if (active !== i) { active = i; mark(); } });
      list.append(li);
    });
  }
  const mark = () => list.querySelectorAll(".search-item").forEach((li, i) => { li.classList.toggle("active", i === active); li.setAttribute("aria-selected", String(i === active)); });
  function choose(i) { const r = results[i]; if (!r) return; close(); app.openResult(r, input.value.trim()); }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 160); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(results.length - 1, active + 1); mark(); list.querySelectorAll(".search-item")[active]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); mark(); list.querySelectorAll(".search-item")[active]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); choose(active); }
  });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  let lastFocus = null;
  function open() {
    closePopover(); if (document.body.classList.contains("sidebar-open")) app.closeSidebar(); lastFocus = document.activeElement; overlay.hidden = false; document.body.classList.add("search-open");
    folderSel.textContent = ""; folderSel.append(h("option", { value: "", text: "All projects" })); for (const f of app.folders()) folderSel.append(h("option", { value: f.id, text: f.name }));
    folderSel.value = filters.folderId || "";
    setStatus(); input.focus(); input.select(); run();
    ensureEmbedder().then(() => { if (embedder?.state === "ready") buildIndex(); });
  }
  function close() { overlay.hidden = true; document.body.classList.remove("search-open"); lastFocus?.focus?.({ preventScroll: true }); }
  return { open, close };
}
