// The voice choice: which voice reads answers aloud, and the downloaded voices that can be picked.
//
// The person is always in charge. Every voice is always selectable, on every device: choosing one that is not downloaded downloads it at once, with visible
// progress, exactly like choosing a language model. Nothing is gated by a device test (the measurements only give advice: a "recommended" or "may be slow"
// note), nothing is hidden, and nothing is locked out. A failure is explained in plain words; trying the same voice again after a failure asks the person to
// confirm once ("this already failed: ...") and then goes ahead, as often as they like. The system voice is the default and is always available.
//
// Engine interface (chat/voice/voice-engine.mjs): { status(), install(onProgress, {signal}), remove(), speak(text, {onChunk, ...}), unload(), terminate() }.

import { VOICE_ENGINES, VOICE_CONFIG, voiceIsFastEnough, startDelayMs, pickVoiceEngine, isIOSDevice } from "../../runtime/voice-pick.mjs";
import { createGaplessPlayer } from "./voice-player.mjs";
import { appLocal } from "../vault/vault-store.mjs";

export const CHOICE_KEY = "plc.voice.v2";
const OLD_KEY = "plc.voice.v1";
// measured peak extra memory on a desktop (docs/VOICE-MEMORY.md); phones have not been measured
const MEMORY_ESTIMATE = Object.freeze({ kitten: 250e6, kokoro: 420e6 });
// The real engine (chat/voice/voice-engine.mjs) hands each chunk to onChunk as ONE object { samples, sampleRate, index, count, text }; the player and chat/voice/speech.mjs
// take (samples, sampleRate). Everything here goes through this one conversion. (A mismatch between the two made every downloaded voice silent, with no error.)
const unpackChunk = (c, rate) => (c && typeof c === "object" && c.samples ? [c.samples, c.sampleRate ?? rate] : [c, rate]);
export const SAMPLE_TEXT = "This is how I will read your answers aloud.";
const TYPICAL_REPLY_SECONDS = 20;

/** The list the picker shows. "os" is the system voice; the others are downloadable engines. */
export const VOICES = Object.freeze([
  Object.freeze({ id: "os", label: "System voice", note: "Built into your device.", bytes: 0, license: "" }),
  Object.freeze({ id: "kitten", label: "Kitten", note: "A natural English voice. Small download.", bytes: VOICE_ENGINES.kitten.downloadBytes, license: "Apache-2.0" }),
  Object.freeze({ id: "kokoro", label: "Kokoro", note: "The most natural English voice. Larger download.", bytes: VOICE_ENGINES.kokoro.downloadBytes, license: "Apache-2.0" }),
]);
export const ENGINE_IDS = Object.freeze(VOICES.filter((v) => v.id !== "os").map((v) => v.id));
const voiceOf = (id) => VOICES.find((v) => v.id === id) || VOICES[0];

const blank = () => ({ v: 2, selected: "os", failures: {}, pending: null, speaking: null });

export function createVoiceChoice({
  factory,                       // async (engineId) -> engine
  storage = appLocal,
  env = () => ({}),              // () -> { deviceMemoryGB, cores, webgpu }
  loadModule = (name) => import(new URL("./" + name, import.meta.url).href),
  userAgent = globalThis.navigator?.userAgent || "",
  maxTouchPoints = globalThis.navigator?.maxTouchPoints || 0,
  now = () => Date.now(),
  config = VOICE_CONFIG,
  selfTestTimeoutMs = 90000,
  createContext,
  hasAudioSession = () => Boolean(globalThis.navigator?.audioSession),   // iOS 16.4+: the player can ask for the speaker even in silent mode
  // Is a newer build published than this page? A deploy replaces the old release folder, so a page left open can no longer fetch its voice files.
  outdated = async () => {
    const commit = globalThis.APP_BUILD?.commit;
    if (!commit || typeof fetch !== "function") return false;
    try { const r = await fetch("/version.json?check=" + Date.now(), { cache: "no-store" }); const v = r.ok ? await r.json() : null; return Boolean(v?.commit && v.commit !== commit); } catch { return false; }
  },
  acquireMemory = async () => ({ release() {} }),   // () -> lease: asks the model memory manager for the device before the voice works ("One model at a time")
  idleUnloadMs = 60000,                       // a loaded voice that has not read for this long is unloaded (its files stay on the device)
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t),
  onOutdated = () => { try { globalThis.dispatchEvent?.(new Event("plc-check-update")); } catch { /* no window */ } },
} = {}) {
  const ios = isIOSDevice(userAgent, maxTouchPoints);
  let record = read();
  const engines = new Map();                                  // id -> engine instance
  const status = Object.fromEntries(ENGINE_IDS.map((id) => [id, { state: "none", progress: null, bytes: 0, error: null, metrics: null }]));
  // Memory state of each voice, so the person can see it: unloaded (files on the device only) | loading | loaded (in memory, idle) | speaking | unloading.
  const mem = Object.fromEntries(ENGINE_IDS.map((id) => [id, "unloaded"]));
  const speakingNow = new Map(); let idleTimer = null, releaseWanted = false;
  const setMem = (id, m) => { if (mem[id] !== m) { mem[id] = m; emit(); } };
  function armIdle() { if (idleTimer) clearTimer(idleTimer); idleTimer = setTimer(() => { idleTimer = null; ctl.release("idle"); }, idleUnloadMs); }
  const aborts = new Map();                                    // id -> AbortController of a running download
  let notice = null, advice = null, sessionFallback = false, slowStreak = 0, failStreak = 0, player = null, ready = false;
  const listeners = new Set();

  function read() {
    try {
      const r = JSON.parse(storage.getItem(CHOICE_KEY));
      if (r && r.v === 2) return { ...blank(), ...r };
      // a person who kept a downloaded voice with the earlier version keeps it
      const old = JSON.parse(storage.getItem(OLD_KEY));
      if (old && old.engine && old.chosen === old.engine) return { ...blank(), selected: old.engine };
    } catch { /* unreadable: start clean */ }
    return blank();
  }
  function save() { try { storage.setItem(CHOICE_KEY, JSON.stringify(record)); } catch { /* private mode: the choice lasts this page only */ } }
  function emit() { for (const f of listeners) { try { f(ctl.snapshot()); } catch { /* a listener must not break the flow */ } } }
  const setStatus = (id, patch) => { Object.assign(status[id], patch); emit(); };
  const say = (kind, text, extra = {}) => { notice = { kind, text, at: now(), ...extra }; emit(); };
  async function engineFor(id) { if (!engines.has(id)) engines.set(id, await factory(id)); return engines.get(id); }
  async function removeFiles(id) { try { await (await engineFor(id)).remove(); return true; } catch { return false; } }
  const noteFailure = (id, reason) => { const f = record.failures[id]; record.failures[id] = { count: (f?.count || 0) + 1, reason: String(reason).slice(0, 240), at: now() }; save(); };

  // A page the system killed does not say so. These two flags are set while a voice is being set up or reading, and cleared on a normal close; if one is found
  // at the next start the voice that was in use is the likely cause (usually the browser ran out of memory), and the person is told, not locked out.
  try { globalThis.addEventListener?.("pagehide", () => { if (record.pending || record.speaking) { record.pending = null; record.speaking = null; save(); } }); } catch { /* no window */ }
  const markSpeaking = (id, on) => { record.speaking = on ? { id, at: now() } : null; save(); };

  // At most one voice is in memory: bringing one in sends any other out (its files stay).
  async function unloadOthers(id) {
    for (const other of ENGINE_IDS) if (other !== id && mem[other] !== "unloaded" && !(speakingNow.get(other) > 0)) { setMem(other, "unloading"); try { await engines.get(other)?.unload?.(); } catch { /* stopped anyway */ } setMem(other, "unloaded"); }
  }
  // After a read: idle in memory, unless the chat model asked for the memory while it was reading.
  function afterSpeak(id) {
    const n = (speakingNow.get(id) || 1) - 1; speakingNow.set(id, n);
    if (n > 0) return;
    if (mem[id] === "speaking" || mem[id] === "loading") setMem(id, "loaded");
    if (releaseWanted) { releaseWanted = false; ctl.release("chat model"); } else armIdle();
  }

  const ctl = {
    isIOS: () => ios,
    voices: VOICES,
    get selected() { return record.selected; },

    /** Startup: find which voices are on this device, recover from a page that was killed mid-way, and drop a selection whose files are gone. */
    async init() {
      record = read();
      if (record.pending) {
        const { id } = record.pending; record.pending = null;
        await removeFiles(id);
        noteFailure(id, "The page ended while this voice was being set up (the browser may have run out of memory).");
        say("error", voiceOf(id).label + " could not be set up: the page ended while it was downloading. It may need more memory than this device has free. You can try again.", { memory: true });
      }
      let crashed = null;
      if (record.speaking) { crashed = record.speaking.id; record.speaking = null; }
      for (const id of ENGINE_IDS) {
        try { const st = await (await engineFor(id)).status(); if (st.installed) setStatus(id, { state: "ready", bytes: st.bytes || 0 }); else if (st.bytes > 0) await removeFiles(id); } catch { /* engine code unavailable: the voice stays "not downloaded" */ }
      }
      if (crashed && status[crashed]?.state === "ready") {
        noteFailure(crashed, "The page ended while reading with this voice (the browser may have run out of memory).");
        if (record.selected === crashed) record.selected = "os";
        say("error", voiceOf(crashed).label + " was in use when the page ended, so reading went back to the system voice. The voice is still downloaded; choose it again to retry.", { memory: true });
      }
      if (record.selected !== "os" && status[record.selected]?.state !== "ready") record.selected = "os";
      save(); ready = true; emit();
      return ctl.snapshot();
    },

    snapshot() {
      return {
        ready, ios, selected: record.selected, notice, advice,
        voices: VOICES.map((v) => {
          const s = status[v.id] || { state: "ready", progress: null, bytes: 0, error: null, metrics: null };
          const f = record.failures[v.id];
          return { id: v.id, label: v.label, note: v.note, license: v.license, size: v.bytes, selected: record.selected === v.id,
            state: v.id === "os" ? "ready" : s.state, memory: v.id === "os" || s.state !== "ready" ? null : mem[v.id], progress: s.progress, bytesOnDevice: s.bytes, error: s.error, metrics: s.metrics,
            failures: f ? { ...f } : null, advice: advice?.notes?.[v.id] || "", recommended: advice?.recommended === v.id };
        }),
        totalBytes: ENGINE_IDS.reduce((n, id) => n + (status[id].state === "ready" ? status[id].bytes : 0), 0),
      };
    },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    clearNotice() { notice = null; emit(); },

    /**
     * Choose a voice. The system voice and a downloaded voice are selected at once. A voice that is not downloaded is downloaded now (with progress), tested,
     * and selected. After a failure the same voice asks for one confirmation (`needsConfirm`), then it tries again; there is no limit.
     */
    async select(id, { confirmed = false } = {}) {
      notice = null; // a new choice clears yesterday's message; a new failure will say its own
      if (id === "os" || !status[id]) { record.selected = "os"; save(); sessionFallback = false; emit(); return { ok: true }; }
      const s = status[id];
      if (s.state === "installing" || s.state === "testing") return { ok: false, busy: true };
      // choosing a downloaded voice again turns it back on after a failure; the failure count only resets when it reads successfully
      if (s.state === "ready") { record.selected = id; sessionFallback = false; save(); emit(); return { ok: true }; }
      const f = record.failures[id];
      if (f?.count && !confirmed) return { ok: false, needsConfirm: true, reason: f.reason, count: f.count };
      return download(id);
    },

    /**
     * Give the memory back: unload every voice that is in memory and not reading (the downloaded files stay). Called when the chat model needs the memory,
     * after the idle time, and by the person ("Unload now"). A voice that is reading is unloaded as soon as it finishes.
     */
    async release(reason = "") {
      if (idleTimer) { clearTimer(idleTimer); idleTimer = null; }
      const jobs = [];
      for (const id of ENGINE_IDS) {
        if (mem[id] === "unloaded" || mem[id] === "unloading") continue;
        if (speakingNow.get(id) > 0 || mem[id] === "loading") { releaseWanted = true; continue; }
        setMem(id, "unloading");
        jobs.push((async () => { try { await engines.get(id)?.unload?.(); } catch { /* the worker is stopped anyway */ } setMem(id, "unloaded"); })());
      }
      await Promise.all(jobs);
      return { released: jobs.length, reason };
    },
    unload(id) { return ctl.release("person").then((r) => r); },
    /** For the memory manager: which voice is in memory (if any), its state and whether it is working. */
    memoryState() {
      const id = ENGINE_IDS.find((e) => mem[e] !== "unloaded") || (record.selected !== "os" ? record.selected : ENGINE_IDS[0]);
      const state = mem[id] === "speaking" ? "loaded" : mem[id] === "unloading" ? "unloading" : mem[id] || "unloaded";
      return { id, state, label: "the " + voiceOf(id).label + " voice", busy: (speakingNow.get(id) || 0) > 0 || mem[id] === "loading", estimateBytes: MEMORY_ESTIMATE[id] ?? null };
    },

    /**
     * The picker's click: a toggle on whether the voice is loaded. Not downloaded or failed -> the download path (with its confirmation rule); downloading -> cancel;
     * downloaded and not in memory -> load it and use it; in memory -> unload it (it stays the chosen voice and loads again when it next reads).
     * The system voice is not a model: choosing it is a plain selection.
     */
    async toggle(id, { confirmed = false } = {}) {
      if (id === "os" || !status[id]) return ctl.select("os");
      const s = status[id];
      if (s.state === "installing" || s.state === "testing") { ctl.cancel(id); return { ok: true, cancelled: true }; }
      if (s.state === "ready") {
        if (mem[id] === "loaded" || mem[id] === "speaking" || mem[id] === "loading") { await ctl.release("person"); return { ok: true, unloaded: true }; }
        return ctl.load(id);
      }
      return ctl.select(id, { confirmed });
    },

    /** Load a downloaded voice into memory now and make it the one in use. At most one voice is in memory: any other is unloaded first. */
    async load(id) {
      if (id === "os" || status[id]?.state !== "ready") return { ok: false, reason: "not downloaded" };
      notice = null; record.selected = id; sessionFallback = false; save();
      await unloadOthers(id);
      if (mem[id] === "loaded" || mem[id] === "speaking") { emit(); return { ok: true }; }
      setMem(id, "loading"); let lease = { release() {} };
      try {
        lease = await acquireMemory();
        const engine = await engineFor(id); await engine.load?.();
        setMem(id, "loaded"); armIdle();
        return { ok: true };
      } catch (err) {
        setMem(id, "unloaded"); const reason = String(err?.message || err);
        noteFailure(id, "while loading: " + reason);
        say("error", voiceOf(id).label + " could not be loaded: " + reason + ". The system voice reads until it works.", { memory: true });
        return { ok: false, reason };
      } finally { lease.release(); }
    },

    /** Stop a download that is running. Nothing is kept and it is not counted as a failure. */
    cancel(id) { aborts.get(id)?.abort(); },

    /** Delete a downloaded voice. If it was the selected one, reading goes back to the system voice. */
    async remove(id) {
      if (!status[id]) return { ok: true };
      aborts.get(id)?.abort();
      const removed = await removeFiles(id); if (removed) mem[id] = "unloaded";
      status[id] = { state: removed ? "none" : status[id].state, progress: null, bytes: removed ? 0 : status[id].bytes, error: removed ? null : "The files could not be deleted; try again.", metrics: null };
      if (record.selected === id) { player?.stop(); player = null; record.selected = "os"; }
      save(); emit();
      return { ok: removed };
    },

    /** Play a short sample in a downloaded voice (for the picker). */
    async hearSample(id) {
      if (id === "os" || status[id]?.state !== "ready") return false;
      const e = await engineFor(id);
      player?.stop(); const p = (player = createGaplessPlayer({ createContext }));
      if (idleTimer) { clearTimer(idleTimer); idleTimer = null; }
      speakingNow.set(id, (speakingNow.get(id) || 0) + 1);
      if (mem[id] === "unloaded") setMem(id, "loading");
      let lease = { release() {} };
      try { lease = await acquireMemory(); } catch (err) { setMem(id, "unloaded"); afterSpeak(id); throw err; }
      try { await e.speak(SAMPLE_TEXT, { onChunk: (c, rate) => { if (mem[id] !== "speaking") setMem(id, "speaking"); p.push(...unpackChunk(c, rate)); }, speed: 1 }); }
      catch (err) { setMem(id, "unloaded"); throw err; }
      finally { lease.release(); afterSpeak(id); }
      await p.finish();
      return true;
    },

    /** Advice only, never a gate: which voice suits this device, and which may be slow. Measured when the picker opens. */
    async advise() {
      try {
        const probeMod = await loadModule("voice-probe.mjs");
        const run = probeMod?.runComputeProbe || probeMod?.runVoiceProbe;
        const probe = run ? await run() : null;
        if (!probe || !Number.isFinite(probe.ms)) return advice;
        const e = await env();
        // storage is not part of the advice: the download itself tells the person if there is no room
        const d = pickVoiceEngine({ env: e, userAgent, maxTouchPoints, storage: { usage: 0, quota: 1e12, writeOk: true }, probe, only: ENGINE_IDS, manual: true, config: { ...config, calibrated: true } });
        const notes = {};
        const slow = "May be slow on this device.";
        if (d.reason === "probe-too-slow") for (const id of ENGINE_IDS) notes[id] = slow;
        else if (d.candidate === "kitten" && ENGINE_IDS.includes("kokoro")) notes.kokoro = probe.ms > config.qualityProbeMaxMs ? slow : "";
        if (ios) for (const id of ENGINE_IDS) notes[id] = [notes[id], "Safari limits memory per page; if the page reloads, choose the system voice."].filter(Boolean).join(" ");
        advice = { recommended: d.offer ? d.candidate : null, notes, probeMs: probe.ms };
        emit();
      } catch { /* no advice is fine */ }
      return advice;
    },

    /** For chat/voice/speech.mjs: an engine route while a downloaded voice is selected, otherwise null (system voice). */
    route() {
      const id = record.selected;
      if (id === "os" || sessionFallback || status[id]?.state !== "ready") return null;
      const m = status[id].metrics;
      const lead = m ? Math.min(startDelayMs({ audioSeconds: TYPICAL_REPLY_SECONDS, realTimeFactor: m.realTimeFactor, firstAudioMs: m.firstAudioMs }), config.maxStartDelayMs) : 0;
      // a chunk is at most about 25 s of speech, so making one takes 25 s divided by the speed measured here; the watchdog waits three times that
      const rtf = m?.realTimeFactor, perChunkMs = Number.isFinite(rtf) && rtf > 0 ? (25 / rtf) * 1000 : 60000;
      const firstChunkMs = Math.min(90000, Math.max(20000, Math.round(perChunkMs * 3 + config.maxFirstAudioMs)));
      const betweenMs = Math.min(75000, Math.max(15000, Math.round(perChunkMs * 3)));
      const engine = engines.get(id);
      const speak = async (t, o) => {
        markSpeaking(id, true);
        if (idleTimer) { clearTimer(idleTimer); idleTimer = null; }
        speakingNow.set(id, (speakingNow.get(id) || 0) + 1);
        if (mem[id] !== "loaded" && mem[id] !== "speaking") setMem(id, "loading");
        let lease = { release() {} };
        try { lease = await acquireMemory(); } catch (e) { setMem(id, "unloaded"); markSpeaking(id, false); afterSpeak(id); throw e; }
        const onChunk = o?.onChunk; const opts = onChunk ? { ...o, onChunk: (c, rate) => { if (mem[id] !== "speaking") setMem(id, "speaking"); return onChunk(...unpackChunk(c, rate)); } } : o;
        try {
          const r = await engine.speak(t, opts);
          failStreak = 0;
          // the speed is re-measured on every reply: two slow ones in a row are reported, never punished
          if (r && Number.isFinite(r.realTimeFactor)) {
            status[id].metrics = { ...m, realTimeFactor: r.realTimeFactor, firstAudioMs: Number.isFinite(r.firstAudioMs) ? r.firstAudioMs : m?.firstAudioMs };
            slowStreak = r.realTimeFactor < config.minRealTimeFactor ? slowStreak + 1 : 0;
            if (slowStreak === 2) say("slow", voiceOf(id).label + " is reading slower than speech here (" + r.realTimeFactor.toFixed(1) + "×), so replies pause. You can pick another voice.");
          }
          return r;
        } catch (e) { setMem(id, "unloaded"); throw e; }
        finally { lease.release(); markSpeaking(id, false); afterSpeak(id); }
      };
      return {
        engine: { speak, terminate: () => engine.terminate?.(), fail: (err) => ctl.engineFailed(err) },
        options: { startDelayMs: Number.isFinite(lead) ? lead : 0, firstChunkMs, betweenMs, createContext }
      };
    },

    /** The voice failed or stalled while reading. That reply was read by the system voice; say why, and keep the choice (it stays selected). */
    engineFailed(err) {
      const id = record.selected;
      if (id === "os" || !status[id] || status[id].state !== "ready") return;
      sessionFallback = true; // this reply is read by the system voice either way
      const reason = err?.message || String(err);
      // A deploy replaces the old release folder, so a page left open cannot start the voice worker any more. That is the page's problem, not the voice's:
      // say so, ask for the update, and do not count it against the voice.
      Promise.resolve().then(outdated).catch(() => false).then((stale) => {
        if (stale) {
          sessionFallback = false; onOutdated();
          say("error", voiceOf(id).label + " could not start because the app was updated while this page was open. Reload the page and it will work; the voice is still downloaded. This reply was read by the system voice.", { stale: true });
          return;
        }
        failStreak++;
        noteFailure(id, "while reading: " + reason);
        if (failStreak >= 2) { record.selected = "os"; save(); say("error", voiceOf(id).label + " failed twice (" + reason + "), so reading went back to the system voice. Choose it again to retry.", { memory: true }); }
        else say("error", voiceOf(id).label + " could not read that (" + reason + "). The system voice read it instead.", { memory: true });
      });
    },
  };

  async function download(id) {
    const ac = new AbortController(); aborts.set(id, ac);
    record.pending = { id, at: now() }; save();
    const plain = (e) => String(e?.message || e);
    let stage = "download";
    try {
      const engine = await engineFor(id);
      setStatus(id, { state: "installing", progress: { done: 0, total: voiceOf(id).bytes, phase: "connecting" }, error: null });
      // the engine reports one object per step ({ overallLoaded, overallTotal, phase }); older fakes call (done, total)
      await engine.install((a, b) => {
        const o = a && typeof a === "object";
        setStatus(id, { progress: { done: o ? a.overallLoaded : a, total: o ? a.overallTotal : b, phase: o ? a.phase || null : null, attempt: o ? a.retryAttempt || null : null } });
      }, { signal: ac.signal });
      stage = "test"; setStatus(id, { state: "testing", progress: null });
      // the self-test cannot wait for ever: with no sound inside the limit the worker is stopped and the setup fails with that reason
      const chunks = []; let timer;
      const metrics = await Promise.race([
        engine.speak(SAMPLE_TEXT, { onChunk: (c, rate) => chunks.push(unpackChunk(c, rate)), speed: 1 }),
        new Promise((_, reject) => { timer = setTimeout(() => { try { engine.terminate?.(); } catch { /* gone */ } reject(Object.assign(new Error("the voice made no sound within " + Math.round(selfTestTimeoutMs / 1000) + " s"), { name: "TimeoutError" })); }, selfTestTimeoutMs); })
      ]).finally(() => clearTimeout(timer));
      let bytes = 0; try { bytes = (await engine.status()).bytes || 0; } catch { /* unknown */ }
      status[id] = { state: "ready", progress: null, bytes, error: null, metrics }; setMem(id, "loaded"); armIdle(); // the self-test left it in memory
      await unloadOthers(id);
      notice = null; delete record.failures[id]; record.selected = id; record.pending = null; sessionFallback = false; failStreak = 0; slowStreak = 0; save(); emit();
      // the person hears the voice at once, and is told if it is slow here (information only: the voice stays)
      const p = (player = createGaplessPlayer({ createContext })); for (const [s, r] of chunks) p.push(s, r); p.finish().catch(() => {});
      if (!voiceIsFastEnough({ ...metrics, typicalReplySeconds: TYPICAL_REPLY_SECONDS }, config)) say("slow", voiceOf(id).label + " runs at " + (metrics.realTimeFactor ?? 0).toFixed(1) + "× real time on this device, so replies will pause. It is selected; you can pick another voice any time.");
      // the phone's side switch (silent mode) mutes a web page's sound on older iOS; the page cannot detect it, so the person is told where to look
      else if (ios) say("tip", hasAudioSession() ? "Playing a sample. If you hear nothing, check the volume and the silent switch on the side of the phone." : "Playing a sample. On this version of iOS the silent switch on the side of the phone mutes downloaded voices: flip it, or use headphones.");
      return { ok: true, metrics };
    } catch (err) {
      record.pending = null;
      await removeFiles(id); // never leave half a download behind
      if (err?.name === "AbortError") { status[id] = { state: "none", progress: null, bytes: 0, error: null, metrics: null }; save(); emit(); return { ok: false, cancelled: true }; }
      noteFailure(id, plain(err));
      status[id] = { state: "failed", progress: null, bytes: 0, error: plain(err), metrics: null };
      let stale = false; try { stale = await outdated(); } catch { /* ignore */ }
      if (stale) onOutdated();
      say("error", voiceOf(id).label + " could not be set up: " + plain(err) + ". Nothing was kept. " + (stale ? "The app was updated while this page was open: reload the page, then try again." : "You can try again."), { stale, memory: stage === "test" && !stale });
      return { ok: false, reason: plain(err), outdated: stale };
    } finally { aborts.delete(id); }
  }

  return ctl;
}
