// Voice notes: any text can be played like a voice message, with the words underneath.
//
// The sound is the browser's own text-to-speech, spoken one sentence at a time, so a note can be paused, resumed, skipped to a sentence and
// sped up, but it is not an audio file: nothing is recorded or stored, and the length shown is an estimate from the word count. All the
// browser parts are injected (speakOne), so the player is testable without a voice.

export const SPEEDS = Object.freeze([1, 1.25, 1.5, 2]);
const WORDS_PER_SECOND = 2.6; // a calm speaking pace at normal speed

/** Sentences to speak, one segment each; very short ones are joined to the next. */
export function splitSegments(text, { minChars = 24 } = {}) {
  const plain = String(text || "").replace(/\r/g, "").trim();
  if (!plain) return [];
  const parts = plain.split(/(?<=[.!?…。！？])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (out.length && out.at(-1).length < minChars) out[out.length - 1] += " " + p; else out.push(p);
  }
  if (out.length > 1 && out.at(-1).length < minChars) { const last = out.pop(); out[out.length - 1] += " " + last; }
  return out;
}

export const wordCount = (text) => (String(text).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
export const estimateSeconds = (text, rate = 1) => Math.max(1, Math.round(wordCount(text) / (WORDS_PER_SECOND * (rate || 1))));
export function formatClock(totalSeconds) {
  const t = Math.max(0, Math.floor(Number(totalSeconds) || 0)), m = Math.floor(t / 60), s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A stable, natural-looking set of bar heights (0.25-1) for a note, so the same note always looks the same. */
export function waveformBars(seed, count = 36) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const out = [];
  let envelope = 0.5;
  for (let i = 0; i < count; i++) {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    envelope = Math.min(1, Math.max(0.25, envelope + ((h % 1000) / 1000 - 0.5) * 0.7));
    out.push(Math.round(envelope * 100) / 100);
  }
  return out;
}

/**
 * Plays segments in order. speakOne(text, rate) -> { done: Promise, stop() } (the page's text-to-speech).
 * State: idle | playing | paused | ended. Seeking and speed changes take effect from the sentence being said.
 */
export function createVoicePlayer({ segments, speakOne, rate = 1, onChange = () => {} }) {
  const parts = segments.slice();
  const words = parts.map(wordCount), totalWords = words.reduce((a, b) => a + b, 0) || 1;
  let state = "idle", index = 0, speed = rate, current = null, run = 0;
  const emit = () => onChange({ state, index, count: parts.length, fraction: fractionAt(index), rate: speed });
  const fractionAt = (i) => (state === "ended" ? 1 : words.slice(0, i).reduce((a, b) => a + b, 0) / totalWords);

  async function loop(mine) {
    while (mine === run && index < parts.length) {
      emit();
      let failed = false;
      try { current = speakOne(parts[index], speed); await current.done; } catch { failed = true; }
      current = null;
      if (mine !== run) return;
      if (failed) { state = "paused"; emit(); return; }
      index++;
    }
    if (mine === run) { state = "ended"; index = Math.max(0, parts.length - 1); emit(); }
  }
  const halt = () => { run++; const c = current; current = null; try { c?.stop(); } catch { /* nothing playing */ } };

  return {
    get state() { return state; }, get index() { return index; }, get count() { return parts.length; }, get rate() { return speed; },
    get fraction() { return fractionAt(index); },
    totalSeconds() { return estimateSeconds(parts.join(" "), speed); },
    elapsedSeconds() { return Math.round(this.fraction * this.totalSeconds()); },
    play() { if (!parts.length) return; if (state === "ended") index = 0; halt(); state = "playing"; loop(run); },
    pause() { if (state !== "playing") return; halt(); state = "paused"; emit(); },
    toggle() { state === "playing" ? this.pause() : this.play(); },
    seek(i) { index = Math.min(Math.max(0, Math.floor(i)), Math.max(0, parts.length - 1)); if (state === "ended") state = "paused"; if (state === "playing") { halt(); loop(run); } else emit(); },
    seekFraction(f) { let acc = 0; const target = Math.min(1, Math.max(0, f)) * totalWords; let i = 0; while (i < parts.length - 1 && acc + words[i] <= target) { acc += words[i]; i++; } this.seek(i); },
    setRate(r) { speed = r; if (state === "playing") { halt(); state = "playing"; loop(run); } else emit(); },
    stop() { halt(); state = "idle"; index = 0; emit(); }
  };
}

const el = (doc, tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

// Only one note speaks at a time.
let playing = null;
export function stopOtherNotes(except) { if (playing && playing !== except) { try { playing.stop(); } catch { /* gone */ } } }

/**
 * The voice-note control: a play button, a waveform that can be scrubbed, the (estimated) length, a speed button and a "Show text" toggle.
 * `transcript` is an existing element holding the words (it is hidden until "Show text"). Returns { element, player, destroy }.
 */
export function mountVoiceNote(container, { doc = document, text, from = "Roberta", speakOne, transcript = null, rate = 1, onRate = () => {}, onPlay = () => {}, startExpanded = false, id = "" }) {
  const segments = splitSegments(text);
  const player = createVoicePlayer({ segments, speakOne, rate, onChange: render });
  const root = el(doc, "div", "voice-note"); root.dataset.state = "idle";
  const play = el(doc, "button", "vn-play"); play.type = "button";
  const icon = el(doc, "span", "vn-icon"); icon.setAttribute("aria-hidden", "true"); play.appendChild(icon);
  const wave = el(doc, "div", "vn-wave"); wave.setAttribute("role", "slider"); wave.tabIndex = 0; wave.setAttribute("aria-label", "Position in the voice note");
  const bars = waveformBars(id || text, 30).map((h) => { const b = el(doc, "span", "vn-bar"); b.style.height = Math.round(h * 100) + "%"; wave.appendChild(b); return b; });
  const clock = el(doc, "span", "vn-clock");
  const speedBtn = el(doc, "button", "vn-speed"); speedBtn.type = "button";
  const toggle = el(doc, "button", "vn-text-toggle"); toggle.type = "button";
  const line = el(doc, "div", "vn-line"); line.append(play, wave, clock, speedBtn);
  const meta = el(doc, "div", "vn-meta"); meta.append(el(doc, "span", "vn-from", `Voice note from ${from}`), toggle);
  root.append(line, meta);
  container.appendChild(root);
  let expanded = startExpanded;

  function render(s = { state: player.state, index: player.index, fraction: player.fraction }) {
    const st = s.state;
    root.dataset.state = st;
    const total = player.totalSeconds();
    play.setAttribute("aria-label", (st === "playing" ? "Pause" : "Play") + ` voice note from ${from}, about ${total} seconds`);
    play.setAttribute("aria-pressed", String(st === "playing"));
    clock.textContent = st === "playing" || st === "paused" ? `${formatClock(player.elapsedSeconds())} / ${formatClock(total)}` : formatClock(total);
    const played = Math.round(s.fraction * bars.length);
    bars.forEach((b, i) => b.classList.toggle("played", i < played));
    wave.setAttribute("aria-valuemin", "1"); wave.setAttribute("aria-valuemax", String(Math.max(1, player.count))); wave.setAttribute("aria-valuenow", String(Math.min(player.count, (s.index || 0) + 1)));
    wave.setAttribute("aria-valuetext", `Sentence ${Math.min(player.count, (s.index || 0) + 1)} of ${player.count}`);
    speedBtn.textContent = `${player.rate}×`; speedBtn.setAttribute("aria-label", `Speed ${player.rate} times. Change speed`);
    if (st === "playing") { playing = player; onPlay(player); } else if (playing === player) playing = null;
    if (transcript) { transcript.hidden = !expanded; }
    toggle.textContent = expanded ? "Hide text" : "Show text"; toggle.setAttribute("aria-expanded", String(expanded));
  }
  play.addEventListener("click", () => { stopOtherNotes(player); player.toggle(); });
  speedBtn.addEventListener("click", () => { const i = SPEEDS.indexOf(player.rate); const next = SPEEDS[(i + 1) % SPEEDS.length]; player.setRate(next); onRate(next); });
  toggle.addEventListener("click", () => { expanded = !expanded; render(); });
  wave.addEventListener("click", (e) => { const r = wave.getBoundingClientRect(); if (r.width) { stopOtherNotes(player); player.seekFraction((e.clientX - r.left) / r.width); if (player.state === "idle" || player.state === "paused") player.play(); } });
  wave.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); player.seek(player.index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); player.seek(player.index - 1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); stopOtherNotes(player); player.toggle(); }
  });
  render();
  return { element: root, player, destroy() { player.stop(); root.remove(); } };
}
