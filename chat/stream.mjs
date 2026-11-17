// Server-sent-event reader for OpenAI-compatible chat completion streams.
// readChatStream(response, { onDelta, signal }) -> { text, finishReason }
// A body that is plain JSON (a provider that ignores stream:true) is read as one complete answer.

export function createSseParser(onData) {
  let buffer = "";
  const handle = (block) => {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (data) onData(data);
  };
  return {
    push(chunk) {
      buffer += chunk;
      let m;
      while ((m = /\r?\n\r?\n/.exec(buffer))) { handle(buffer.slice(0, m.index)); buffer = buffer.slice(m.index + m[0].length); }
    },
    end() { if (buffer.trim()) handle(buffer); buffer = ""; }
  };
}

export const answerOf = (data) => {
  const choice = Array.isArray(data?.choices) && data.choices.length ? data.choices[0] : null;
  return choice?.message?.content ?? choice?.text ?? (typeof data?.answer === "string" ? data.answer : "");
};

export async function readChatStream(response, { onDelta, signal } = {}) {
  const type = response.headers?.get?.("content-type") || "";
  if (!response.body || !/event-stream|ndjson/i.test(type)) {
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { return { text: raw, finishReason: "stop", streamed: false }; }
    const text = answerOf(data) || JSON.stringify(data);
    if (text) onDelta?.(text, text);
    return { text, finishReason: data?.choices?.[0]?.finish_reason || "stop", streamed: false };
  }
  let text = "", finishReason = null;
  const parser = createSseParser((data) => {
    if (data.trim() === "[DONE]") return;
    let json; try { json = JSON.parse(data); } catch { return; }
    if (json?.error) throw Object.assign(new Error(json.error.message || json.error), { providerError: true });
    const choice = json?.choices?.[0]; if (!choice) return;
    const delta = choice.delta?.content ?? choice.text ?? "";
    if (delta) { text += delta; onDelta?.(delta, text); }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  try {
    for (;;) {
      if (signal?.aborted) throw Object.assign(new Error("Generation stopped."), { name: "AbortError" });
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode()); parser.end();
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw Object.assign(new DOMException("Generation stopped.", "AbortError"), { partialText: text });
    throw Object.assign(error, { partialText: text });
  } finally { try { reader.releaseLock(); } catch { /* already released */ } }
  return { text, finishReason: finishReason || "stop", streamed: true };
}
