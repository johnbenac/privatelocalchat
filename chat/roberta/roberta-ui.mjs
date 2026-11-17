// Roberta's front desk, on screen. One menu engine (chat/roberta/ivr.mjs), two ways to meet it:
//   * a voicemail thread: voice notes from Roberta with numbered replies. This is what phones get first: a message waiting, like WhatsApp or
//     visual voicemail, nothing speaks until a person taps play.
//   * a call: a video-call window on a computer, a full-screen phone call on a phone, with a keypad whose keys are labelled with the menu,
//     and a tap-to-speak button that matches what is said to a topic by meaning.
// A computer first sees an incoming call from Roberta (Answer, or Voicemail to read it instead).
//
// Roberta is a robot with a name, not a person and not the language model; the words are the prepared text in ivr-content.mjs.
import { ROBOT_NAME, ROBOT_TAGLINE, describeContext } from "./ivr-content.mjs";
import { createIvr } from "./ivr.mjs";
import { mountVoiceNote, stopOtherNotes } from "../voice/voice-note.mjs";
import { iconNode } from "../icons.mjs";

/** Groups the engine's transcript for the voicemail thread: consecutive spoken lines are one voice note; menu prompts become buttons instead. */
export function groupTranscript(transcript) {
  const groups = [];
  for (const t of transcript) {
    if (t.who === "you") { groups.push({ who: "you", text: t.text }); continue; }
    if (t.kind === "menu") continue; // shown as reply buttons
    const last = groups.at(-1);
    if (last && last.who === "roberta") last.text += " " + t.text; else groups.push({ who: "roberta", text: t.text });
  }
  return groups;
}

export const KEYPAD = Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]);
const el = (doc, tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * app: {
 *   context(): the facts for the scripts (see describeContext),
 *   speak(text, rate): { done, stop() }   the browser's voice,
 *   actions: { startSetup, openShare, openImport, openExport, openTransferSettings, openProvider, startVoicemail, startChatting },
 *   getRouter(): Promise<{ route(text) } | null>,   warmUp(): void   (start the small search model in the background),
 *   listen(handlers): { abort() } | null   single utterances through the browser's speech recognition (null when it is not available),
 *   explainListenFailure(code): Promise<string>,   sounds: { dtmf, ringback, connected, ended } | null,
 *   layout(): 'desktop' | 'mobile',  seen(): boolean, markSeen()
 * }
 */
export function createRoberta({ app, doc = document }) {
  let started = false, view = null, pressedByUser = false, callOpen = false, muted = false;
  let speakHandle = null;
  const heroes = new Set();
  const ivr = createIvr({
    getContext: () => app.context(),
    say: async (lines) => { if (callOpen && !muted) { speakHandle = app.speak(lines.join(" "), 1); try { await speakHandle.done; } catch { /* the text is on screen */ } } },
    stopSpeech: () => { try { speakHandle?.stop(); } catch { /* nothing playing */ } speakHandle = null; },
    actions: new Proxy({}, { get: (_t, id) => (...args) => { if (id === "startChatting" || id === "startVoicemail" || id === "openProvider") api.closeCall(); app.actions[id]?.(...args); } }),
    router: { route: async (text) => { const router = await app.getRouter(); if (!router) return null; return router.route(text); } },
    onChange: () => refresh()
  });

  function refresh() { heroes.forEach((h) => h.render()); callView?.render(); }

  async function ensureStarted() {
    if (started) return;
    started = true; app.warmUp?.();
    await ivr.start();
  }

  // ---- the voicemail thread --------------------------------------------------------------------------------------------------
  function mountThread(container, { onDismiss, onCall }) {
    const root = el(doc, "section", "roberta-card roberta-thread"); root.setAttribute("aria-label", `Voicemail from ${ROBOT_NAME}`);
    const head = el(doc, "div", "roberta-head");
    const avatar = el(doc, "span", "roberta-avatar"); avatar.setAttribute("aria-hidden", "true"); avatar.textContent = ROBOT_NAME[0];
    const who = el(doc, "div", "roberta-who"); who.append(el(doc, "strong", null, ROBOT_NAME), el(doc, "span", "roberta-tag", ROBOT_TAGLINE));
    const badge = el(doc, "span", "roberta-badge", "1 new voicemail");
    head.append(avatar, who, badge);
    const feed = el(doc, "div", "roberta-feed"); feed.setAttribute("role", "log"); feed.setAttribute("aria-label", `Conversation with ${ROBOT_NAME}`);
    const chips = el(doc, "div", "roberta-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Reply by number");
    const foot = el(doc, "div", "roberta-foot");
    const call = el(doc, "button", "roberta-call-btn"); call.type = "button"; call.id = "robertaCardCallBtn";
    const ph = el(doc, "span", "roberta-ico", "☎"); ph.setAttribute("aria-hidden", "true");
    call.append(ph, doc.createTextNode(` Call ${ROBOT_NAME}`));
    const later = el(doc, "button", "roberta-link", "Not now"); later.type = "button"; later.id = "robertaDismissBtn";
    foot.append(call, later);
    root.append(head, feed, chips, foot);
    container.appendChild(root);
    let shown = 0;
    const rendered = [];
    // a browser with no voice shows the words instead of a player that could not play
    const mountNote = (g, i, holder, transcript) => { if (app.canSpeak && !app.canSpeak()) { transcript.hidden = false; return null; } return mountVoiceNote(holder, { doc, text: g.text, from: ROBOT_NAME, id: "roberta-" + i, transcript, rate: 1, speakOne: (t, r) => app.speak(t, r) }); };
    const render = () => {
      const state = ivr.state, groups = groupTranscript(state.transcript);
      if (groups.length < shown) { feed.textContent = ""; shown = 0; rendered.length = 0; }
      // a note that is still being written (the introduction is built line by line) is refreshed in place
      for (let i = 0; i < shown; i++) {
        const r = rendered[i];
        if (r && groups[i] && r.text !== groups[i].text && groups[i].who === "roberta") {
          r.text = groups[i].text; r.transcript.textContent = r.text; r.holder.textContent = ""; r.note = mountNote(groups[i], i, r.holder, r.transcript);
        }
      }
      for (; shown < groups.length; shown++) {
        const g = groups[shown];
        const row = el(doc, "div", "roberta-msg " + g.who);
        const entry = { text: g.text };
        if (g.who === "you") row.appendChild(el(doc, "span", "roberta-you", g.text));
        else {
          const transcript = el(doc, "p", "roberta-transcript", g.text); transcript.hidden = true;
          const holder = el(doc, "div", "roberta-note"); row.append(holder, transcript);
          Object.assign(entry, { transcript, holder, note: mountNote(g, shown, holder, transcript) });
        }
        rendered[shown] = entry;
        feed.appendChild(row);
        feed.scrollTop = feed.scrollHeight;
      }
      // a number that was just pressed plays its answer, once Roberta has finished writing it (a tap is what lets the browser speak)
      if (pressedByUser && !state.busy) { pressedByUser = false; const plays = feed.querySelectorAll(".roberta-msg.roberta .vn-play"); plays[plays.length - 1]?.click(); }
      chips.textContent = "";
      for (const item of state.nodeId ? [...state.items, { key: "*", label: "to go back", short: "back" }] : state.items) {
        const b = el(doc, "button", "roberta-chip"); b.type = "button"; b.dataset.key = item.key; b.setAttribute("aria-label", `Press ${item.key === "#" ? "pound" : item.key}: ${item.label.replace(/^to /, "")}`);
        b.append(el(doc, "span", "roberta-chip-key", item.key), el(doc, "span", "roberta-chip-label", item.short || item.label.replace(/^to /, "")));
        b.addEventListener("click", () => { pressedByUser = true; app.sounds?.dtmf(item.key); ivr.press(item.key, { viaGesture: true }); });
        chips.appendChild(b);
      }
      if (state.pendingAction) {
        const b = el(doc, "button", "roberta-chip roberta-pending", state.pendingAction.label); b.type = "button"; b.id = "robertaPending";
        b.addEventListener("click", () => ivr.runPending()); chips.appendChild(b);
      }
      badge.hidden = shown > 1;
    };
    call.addEventListener("click", () => onCall?.());
    later.addEventListener("click", () => onDismiss?.());
    const handle = { render, destroy() { heroes.delete(handle); root.remove(); }, root };
    heroes.add(handle);
    ensureStarted().then(render); render();
    return handle;
  }

  // ---- an incoming call (computers) --------------------------------------------------------------------------------------------
  function mountIncoming(container, { onAnswer, onVoicemail, onDismiss }) {
    const root = el(doc, "section", "roberta-card roberta-incoming"); root.setAttribute("aria-label", `Incoming call from ${ROBOT_NAME}`);
    const avatar = el(doc, "div", "roberta-avatar big"); avatar.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 3; i++) avatar.appendChild(el(doc, "span", "roberta-ring r" + i));
    avatar.appendChild(el(doc, "span", "roberta-face", ROBOT_NAME[0]));
    const name = el(doc, "h2", "roberta-incoming-name", ROBOT_NAME), tag = el(doc, "p", "roberta-tag", `${ROBOT_TAGLINE} is calling`);
    const note = el(doc, "p", "roberta-incoming-note", "A short, automated guide: prepared messages, not a person.");
    const answer = el(doc, "button", "roberta-answer", "Answer"); answer.type = "button"; answer.id = "robertaAnswerBtn";
    const mail = el(doc, "button", "roberta-voicemail-btn", "Read the voicemail"); mail.type = "button"; mail.id = "robertaVoicemailBtn";
    const later = el(doc, "button", "roberta-link", "Not now"); later.type = "button"; later.id = "robertaDismissBtn";
    const row = el(doc, "div", "roberta-incoming-actions"); row.append(answer, mail);
    root.append(avatar, name, tag, note, row, later);
    container.appendChild(root);
    answer.addEventListener("click", () => onAnswer?.()); mail.addEventListener("click", () => onVoicemail?.()); later.addEventListener("click", () => onDismiss?.());
    const handle = { render() {}, destroy() { heroes.delete(handle); root.remove(); }, root };
    heroes.add(handle);
    return handle;
  }

  // ---- the call -------------------------------------------------------------------------------------------------------------
  let callView = null;
  function buildCall() {
    const root = el(doc, "div", "rcall-scrim"); root.id = "robertaCall"; root.hidden = true;
    const win = el(doc, "section", "rcall"); win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-label", `Call with ${ROBOT_NAME}`);
    const top = el(doc, "div", "rcall-top");
    const name = el(doc, "p", "rcall-name", `${ROBOT_NAME} · Private Local Chat`);
    const status = el(doc, "p", "rcall-status"); status.id = "rcallStatus"; status.setAttribute("role", "status");
    const timer = el(doc, "p", "rcall-timer", "0:00"); timer.id = "rcallTimer"; timer.setAttribute("role", "timer"); timer.setAttribute("aria-live", "off");
    top.append(name, status, timer);
    const stage = el(doc, "div", "rcall-stage");
    const tile = el(doc, "div", "rcall-tile"); const av = el(doc, "div", "roberta-avatar big"); av.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 3; i++) av.appendChild(el(doc, "span", "roberta-ring r" + i));
    av.appendChild(el(doc, "span", "roberta-face", ROBOT_NAME[0]));
    const tileLabel = el(doc, "span", "rcall-chip", ROBOT_NAME); tile.append(av, tileLabel);
    const self = el(doc, "div", "rcall-self"); const selfLabel = el(doc, "span", null, "You"); self.setAttribute("aria-hidden", "true"); self.appendChild(selfLabel);
    stage.append(tile, self);
    const captions = el(doc, "div", "rcall-captions"); const line = el(doc, "p", "rcall-line"); line.id = "rcallLine"; const yours = el(doc, "p", "rcall-yours"); yours.id = "rcallYours";
    captions.append(line, yours);
    const hint = el(doc, "p", "rcall-hint"); hint.id = "rcallHint"; hint.setAttribute("role", "alert");
    const pad = el(doc, "div", "rcall-keypad"); pad.setAttribute("role", "group"); pad.setAttribute("aria-label", "Keypad");
    const keys = {};
    for (const k of KEYPAD) {
      const b = el(doc, "button", "rk"); b.type = "button"; b.dataset.key = k; b.id = "rk" + (k === "*" ? "Star" : k === "#" ? "Pound" : k);
      b.append(el(doc, "span", "rk-digit", k), el(doc, "span", "rk-sub"));
      b.addEventListener("click", () => press(k)); pad.appendChild(b); keys[k] = b;
    }
    const controls = el(doc, "div", "rcall-controls");
    const ctl = (id, label, cls) => { const w = el(doc, "div", "rcall-control"); const b = el(doc, "button", "rcall-btn" + (cls ? " " + cls : "")); b.type = "button"; b.id = id; b.setAttribute("aria-label", label); const t = el(doc, "span", "rcall-control-label", label); w.append(b, t); return { w, b, t }; };
    const speak = ctl("rcallSpeak", "Speak"); speak.b.replaceChildren(iconNode("mic", { doc }));
    const skip = ctl("rcallSkip", "Skip"); skip.b.replaceChildren(iconNode("skip", { doc }));
    const mute = ctl("rcallMute", "Mute voice"); mute.b.replaceChildren(iconNode("volume", { doc })); mute.b.setAttribute("aria-pressed", "false");
    const end = ctl("rcallEnd", "End call", "rcall-end"); end.b.replaceChildren(iconNode("hangup", { doc }));
    controls.append(speak.w, skip.w, mute.w, end.w);
    win.append(top, stage, captions, hint, pad, controls);
    root.appendChild(win); doc.body.appendChild(root);

    let startedAt = null, ticker = null, listening = null, connecting = false;
    const close = () => api.closeCall();
    function press(k) { app.sounds?.dtmf(k); callView?.clearHint(); ivr.press(k, { viaGesture: true }); }
    speak.b.addEventListener("click", () => {
      if (listening) { listening.finish(); return; }
      ivr.interrupt();
      let heard = "", timer2 = null;
      const done = () => { clearTimeout(timer2); const text = heard.trim(); try { h?.abort(); } catch { /* ended */ } listening = null; render(); if (text) ivr.hear(text); };
      const h = app.listen?.({
        onText: ({ final, interim }) => { if (final) heard += " " + final; yours.textContent = "You: " + (heard + " " + (interim || "")).trim(); clearTimeout(timer2); timer2 = setTimeout(done, 1300); },
        onEnd: () => { if (listening) done(); },
        onError: (e) => { listening = null; render(); app.explainListenFailure?.(e?.code).then((m) => { hint.textContent = m; }).catch(() => { hint.textContent = e?.message || "The microphone isn't available. You can use the keypad."; }); }
      });
      if (h) { listening = { finish: done }; yours.textContent = "Listening…"; render(); }
    });
    skip.b.addEventListener("click", () => ivr.interrupt());
    mute.b.addEventListener("click", () => { muted = !muted; mute.b.setAttribute("aria-pressed", String(muted)); mute.b.replaceChildren(iconNode(muted ? "volume-off" : "volume", { doc })); mute.t.textContent = muted ? "Unmute voice" : "Mute voice"; if (muted) ivr.interrupt(); });
    end.b.addEventListener("click", close);
    win.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (/^[0-9*#]$/.test(e.key) && !(e.target instanceof doc.defaultView.HTMLInputElement)) { e.preventDefault(); press(e.key); }
      if (e.key === "Tab") { const f = [...win.querySelectorAll("button")].filter((b) => !b.hidden && b.offsetParent !== null); if (!f.length) return; const first = f[0], last = f.at(-1); if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); } }
    });

    function render() {
      const state = ivr.state, items = Object.fromEntries(state.items.map((i) => [i.key, i]));
      win.dataset.state = connecting ? "connecting" : state.phase === "speaking" ? "speaking" : listening ? "listening" : state.matching ? "thinking" : "idle";
      status.textContent = connecting ? "Calling…" : state.matching ? "Working out what you meant…" : listening ? "Listening" : state.phase === "speaking" ? "Speaking" : "Your turn: press a key or tap Speak";
      for (const k of KEYPAD) { const it = items[k]; keys[k].dataset.active = it ? "true" : "false"; keys[k].querySelector(".rk-sub").textContent = it ? it.short : ""; keys[k].setAttribute("aria-label", it ? `${k === "#" ? "Pound" : k === "*" ? "Star" : k}, ${it.label.replace(/^to /, "")}` : (k === "#" ? "Pound" : k === "*" ? "Star" : k)); }
      keys["0"].querySelector(".rk-sub").textContent = state.nodeId ? "options" : "menu"; keys["*"].querySelector(".rk-sub").textContent = state.nodeId ? "back" : "";
      let cut = state.transcript.length; while (cut > 0 && state.transcript[cut - 1].who !== "you") cut--;
      const turnLines = state.transcript.slice(cut).filter((t) => t.who === "roberta" && t.kind !== "menu").map((t) => t.text);
      line.textContent = turnLines.join(" ");
      const lastYou = [...state.transcript].reverse().find((t) => t.who === "you");
      if (!listening) yours.textContent = lastYou ? "You: " + lastYou.text : "";
      speak.w.hidden = !app.listen; skip.w.hidden = !(state.phase === "speaking");
      if (state.pendingAction) hint.textContent = ""; // the thread shows the button; in a call it is spoken and shown on the page behind
    }
    const view = {
      root, render, clearHint() { hint.textContent = ""; },
      open: async () => {
        root.hidden = false; doc.body.classList.add("roberta-call-open"); callOpen = true; muted = false;
        connecting = true; startedAt = null; timer.textContent = "0:00"; render(); app.sounds?.ringback();
        speak.b.focus({ preventScroll: true });
        await new Promise((r) => setTimeout(r, app.ringMs ?? 1500));
        if (!callOpen) return;
        connecting = false; startedAt = Date.now(); app.sounds?.connected(); clearInterval(ticker); ticker = setInterval(() => { timer.textContent = clock(Math.floor((Date.now() - startedAt) / 1000)); }, 1000);
        // already introduced in the voicemail: a call just reads the menu again
        if (ivr.state.started) { callOpen && ivr.press("0", { viaGesture: true }); } else ensureStarted().then(render);
        render();
      },
      close: () => { clearInterval(ticker); ticker = null; try { listening?.finish?.(); } catch { /* done */ } listening = null; root.hidden = true; doc.body.classList.remove("roberta-call-open"); callOpen = false; connecting = false; ivr.stop(); started = false; app.sounds?.ended(); }
    };
    return view;
  }

  const api = {
    ivr,
    get callOpen() { return callOpen; },
    /** The first-visit hero for the empty chat: an incoming call on a computer, a voicemail on a phone. Returns { destroy }. */
    mountHero(container, { onDismiss } = {}) {
      stopOtherNotes(null);
      const desktop = app.layout() === "desktop";
      let current = null;
      const showThread = () => { current?.destroy(); current = mountThread(container, { onDismiss, onCall: () => api.openCall() }); };
      if (desktop && !started) current = mountIncoming(container, { onAnswer: () => { current.destroy(); showThread(); api.openCall(); }, onVoicemail: () => { current.destroy(); showThread(); }, onDismiss });
      else showThread();
      return { destroy: () => current?.destroy() };
    },
    async openCall() {
      callView ||= buildCall();
      if (callOpen) return;
      stopOtherNotes(null);
      await callView.open();
    },
    closeCall() { if (callOpen) callView?.close(); },
    context: describeContext
  };
  return api;
}
