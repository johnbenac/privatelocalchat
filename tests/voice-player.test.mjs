import test from "node:test";
import assert from "node:assert/strict";


test("on iPhone the audio session is set to playback while a player plays and put back after, so the ringer switch and the earpiece do not silence it", async () => {
  const { createGaplessPlayer } = await import("../chat/voice/voice-player.mjs");
  const { fakeAudioContext } = await import("./helpers/fake-voice-engine.mjs");
  const audioSession = { type: "auto" };
  const a = createGaplessPlayer({ createContext: fakeAudioContext, audioSession });
  assert.equal(audioSession.type, "auto", "nothing is claimed before there is sound");
  a.push(new Float32Array(2400).fill(0.1), 24000);
  assert.equal(audioSession.type, "playback");
  const b = createGaplessPlayer({ createContext: fakeAudioContext, audioSession });
  b.push(new Float32Array(2400).fill(0.1), 24000);
  a.stop();
  assert.equal(audioSession.type, "playback", "still playing for the second player");
  await b.finish();
  assert.equal(audioSession.type, "auto", "put back when the last player is done");
});

test("a browser without audioSession plays as before", async () => {
  const { createGaplessPlayer } = await import("../chat/voice/voice-player.mjs");
  const { fakeAudioContext } = await import("./helpers/fake-voice-engine.mjs");
  const p = createGaplessPlayer({ createContext: fakeAudioContext, audioSession: undefined });
  p.push(new Float32Array(2400).fill(0.1), 24000); await p.finish();
});

function mediaContext() {
  const ctx = { currentTime: 0, destination: { name: "speakers" }, links: [], created: 0, scheduled: [], resume() {}, close() {},
    createBuffer: (ch, n, rate) => ({ duration: n / rate, getChannelData: () => new Float32Array(n), copyToChannel() {} }),
    createMediaStreamDestination() { ctx.created++; return { name: "media", stream: { id: "stream" } }; },
    createBufferSource() { const s = { connect(to) { ctx.links.push(to.name); }, stop() {}, start(at) { ctx.scheduled.push(at); setTimeout(() => s.onended?.(), 1); } }; return s; } };
  return ctx;
}

test("on iOS the sound also goes through an audio element, which the ringer switch does not mute; elsewhere it goes straight to the speakers", async () => {
  const { createGaplessPlayer } = await import("../chat/voice/voice-player.mjs");
  let played = 0; const audio = { setAttribute() {}, play() { played++; return Promise.resolve(); }, pause() {}, srcObject: null };
  const ios = mediaContext();
  const a = createGaplessPlayer({ createContext: () => ios, viaMedia: true, createAudio: () => audio, audioSession: undefined });
  a.push(new Float32Array(2400).fill(0.1), 24000); a.push(new Float32Array(2400).fill(0.1), 24000);
  assert.deepEqual(ios.links, ["media", "media"], "both chunks feed the media stream"); assert.equal(ios.created, 1, "one stream per player"); assert.equal(played, 1);
  assert.equal(audio.srcObject.id, "stream"); await a.finish(); assert.equal(audio.srcObject, null, "released when done");
  const other = mediaContext();
  const b = createGaplessPlayer({ createContext: () => other, viaMedia: false, audioSession: undefined });
  b.push(new Float32Array(2400).fill(0.1), 24000); assert.deepEqual(other.links, ["speakers"]); assert.equal(other.created, 0); await b.finish();
});

test("if the audio element cannot start (no tap behind it), later chunks go straight to the speakers", async () => {
  const { createGaplessPlayer } = await import("../chat/voice/voice-player.mjs");
  const audio = { setAttribute() {}, play() { return Promise.reject(new Error("NotAllowedError")); }, pause() {}, srcObject: null };
  const ctx = mediaContext();
  const p = createGaplessPlayer({ createContext: () => ctx, viaMedia: true, createAudio: () => audio, audioSession: undefined });
  p.push(new Float32Array(2400).fill(0.1), 24000); await new Promise((r) => setTimeout(r, 5)); p.push(new Float32Array(2400).fill(0.1), 24000);
  assert.deepEqual(ctx.links, ["media", "speakers"]); await p.finish();
});
