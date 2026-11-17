// The three ways the app talks to a connected provider, as pure functions: how a request is built (URL, headers, body), how its streamed answer is read, how the list of
// models is asked for and read. No DOM, no network: the caller passes the messages in and does the fetch.
//
//   chat       OpenAI Chat Completions (POST .../chat/completions). What most providers and local servers speak.
//   responses  OpenAI Responses API (POST .../responses). OpenAI's current API; also xAI, OpenRouter, Azure, Ollama, LM Studio, vLLM and others.
//   anthropic  Anthropic Messages API (POST .../messages), called straight from the browser with Anthropic's browser-access header.
//
// Messages come in OpenAI shape: { role: "system" | "user" | "assistant", content: string | [{ type: "text", text }, { type: "image_url", image_url: { url } }] }.
// Request and event shapes follow the providers' documentation (Anthropic API version 2026-10-21 and the Responses streaming events); docs/PROVIDERS-PLAN.md lists the sources.

import { createSseParser, readChatStream } from "../stream.mjs";
import { deriveChatCompletionsUrl, deriveResponsesUrl, deriveMessagesUrl, deriveModelsUrl, parseModelIds } from "./endpoint-urls.mjs";

export const API_FORMATS = Object.freeze({
  chat: Object.freeze({ id: "chat", label: "Chat Completions", note: "OpenAI's older chat API, spoken by most providers and local servers." }),
  responses: Object.freeze({ id: "responses", label: "Responses API", note: "OpenAI's current API, also offered by xAI, OpenRouter, Azure and several local servers." }),
  anthropic: Object.freeze({ id: "anthropic", label: "Anthropic Messages", note: "Anthropic's own API." }),
});
export const FORMAT_IDS = Object.freeze(Object.keys(API_FORMATS));
export const ANTHROPIC_VERSION = "2026-10-21";
/** Anthropic needs a limit on every request. 16,000 is within every current Claude model's output limit; a reply stops earlier on its own. */
export const ANTHROPIC_MAX_TOKENS = 16000;

export const isFormat = (value) => typeof value === "string" && Object.hasOwn(API_FORMATS, value);
/** The format to use: the person's explicit choice, else the provider's own default, else Chat Completions. */
export const effectiveFormat = (explicit, option) => (isFormat(explicit) ? explicit : isFormat(option?.format) ? option.format : "chat");

// ---- messages ---------------------------------------------------------------------------------------------------------------------------------------------------------

const textOf = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n") : "");
const imagesOf = (content) => (Array.isArray(content) ? content.filter((p) => p?.type === "image_url" && (p.image_url?.url || typeof p.image_url === "string")).map((p) => p.image_url?.url || p.image_url) : []);

/** Responses API input: system text becomes `instructions`; the rest are role items with input_text / output_text / input_image parts. */
export function toResponsesInput(messages) {
  const instructions = [];
  const input = [];
  for (const m of messages || []) {
    const text = textOf(m.content), images = imagesOf(m.content);
    if (m.role === "system") { if (text.trim()) instructions.push(text); continue; }
    if (!text.trim() && !images.length) continue;
    if (m.role === "assistant") { input.push({ role: "assistant", content: [{ type: "output_text", text }] }); continue; }
    const content = [];
    if (text) content.push({ type: "input_text", text });
    for (const url of images) content.push({ type: "input_image", image_url: url });
    input.push({ role: "user", content });
  }
  return { instructions: instructions.join("\n\n") || undefined, input };
}

const DATA_URL = /^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/s;
/** Anthropic Messages: system text separate, user/assistant messages with text and image blocks, nothing empty (Anthropic rejects an empty text block). */
export function toAnthropicMessages(messages) {
  const system = [];
  const out = [];
  for (const m of messages || []) {
    const text = textOf(m.content), images = imagesOf(m.content);
    if (m.role === "system") { if (text.trim()) system.push(text); continue; }
    const role = m.role === "assistant" ? "assistant" : "user";
    const blocks = [];
    for (const url of role === "user" ? images : []) {
      const data = DATA_URL.exec(url);
      blocks.push(data ? { type: "image", source: { type: "base64", media_type: data[1], data: data[2] } } : { type: "image", source: { type: "url", url } });
    }
    if (text.trim()) blocks.push({ type: "text", text });
    if (!blocks.length) continue;
    out.push({ role, content: blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks });
  }
  if (out.length && out[0].role !== "user") out.unshift({ role: "user", content: "(The conversation so far.)" });
  return { system: system.join("\n\n") || undefined, messages: out };
}

// ---- requests ---------------------------------------------------------------------------------------------------------------------------------------------------------

/** Headers that carry the key. `authStyle`: "bearer" (default), "api-key" (Azure) or "x-api-key". Anthropic always uses x-api-key and its version and browser-access headers. */
export function authHeaders({ format, authStyle, token }) {
  const headers = {};
  if (format === "anthropic") {
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    headers["anthropic-dangerous-direct-browser-access"] = "true"; // the header Anthropic requires to allow a browser to call it with the person's own key
    if (token) headers["x-api-key"] = token;
    return headers;
  }
  if (token) {
    if (authStyle === "api-key") headers["api-key"] = token;
    else if (authStyle === "x-api-key") headers["x-api-key"] = token;
    else headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** { url, init } for fetch. `messages` are already in OpenAI shape (images as data URLs). */
export function buildApiRequest({ format = "chat", endpoint, model, messages, token = "", authStyle = "", stream = true, base }) {
  const headers = { "Content-Type": "application/json", ...authHeaders({ format, authStyle, token }) };
  let url, body;
  if (format === "responses") {
    const { instructions, input } = toResponsesInput(messages);
    url = deriveResponsesUrl(endpoint, base);
    body = { model, input, ...(instructions ? { instructions } : {}), store: false, ...(stream ? { stream: true } : {}) }; // store:false: nothing is kept on the provider's side by default
  } else if (format === "anthropic") {
    const converted = toAnthropicMessages(messages);
    url = deriveMessagesUrl(endpoint, base);
    body = { model, max_tokens: ANTHROPIC_MAX_TOKENS, ...(converted.system ? { system: converted.system } : {}), messages: converted.messages, ...(stream ? { stream: true } : {}) };
  } else {
    url = deriveChatCompletionsUrl(endpoint, base);
    body = { model, messages, ...(stream ? { stream: true } : {}) };
  }
  return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
}

/** { url, init } for the list of models. `modelsUrl` is a provider's own address when it is not .../models under the endpoint. */
export function buildModelsRequest({ format = "chat", endpoint, token = "", authStyle = "", modelsUrl = "", base }) {
  let url = modelsUrl || deriveModelsUrl(endpoint, base);
  if (format === "anthropic" && !/[?&]limit=/.test(url)) url += (url.includes("?") ? "&" : "?") + "limit=1000";
  return { url, init: { method: "GET", headers: { Accept: "application/json", ...authHeaders({ format, authStyle, token }) } } };
}

export function modelIdsFrom(data, option) { return parseModelIds(data, { stripPrefix: option?.stripModelPrefix || "" }); }

// ---- answers ----------------------------------------------------------------------------------------------------------------------------------------------------------

const fail = (message) => Object.assign(new Error(String(message || "The provider reported an error.")), { providerError: true });

const RESPONSES_FINISH = { max_output_tokens: "length", content_filter: "content_filter" };
const ANTHROPIC_FINISH = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", model_context_window_exceeded: "length", refusal: "content_filter", pause_turn: "stop", tool_use: "stop" };

/** The text of a complete (not streamed) Responses answer. */
export function responsesText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output || []).filter((o) => o?.type === "message").flatMap((o) => o.content || []).filter((c) => c?.type === "output_text" || c?.type === "refusal").map((c) => c.text || c.refusal || "").join("");
}
/** The text of a complete (not streamed) Anthropic answer. */
export function anthropicText(data) {
  return (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text || "").join("");
}

async function readEventStream(response, { signal, onEvent, onText }) {
  let text = "";
  const state = { text: "", finishReason: null };
  const parser = createSseParser((data) => {
    if (data.trim() === "[DONE]") return;
    let json; try { json = JSON.parse(data); } catch { return; }
    onEvent(json, state);
    if (state.text !== text) { text = state.text; onText?.(text); }
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
    if (signal?.aborted || error?.name === "AbortError") throw Object.assign(new DOMException("Generation stopped.", "AbortError"), { partialText: state.text });
    throw Object.assign(error, { partialText: state.text });
  } finally { try { reader.releaseLock(); } catch { /* already released */ } }
  return { text: state.text, finishReason: state.finishReason || "stop", streamed: true };
}

const isStream = (response) => Boolean(response.body) && /event-stream|ndjson/i.test(response.headers?.get?.("content-type") || "");

/** Read a provider's reply, streamed or not, in the format it was asked for: { text, finishReason }. onDelta(delta, fullText) is called as text arrives. */
export async function readApiStream(format, response, { signal, onDelta } = {}) {
  if (format === "chat") return readChatStream(response, { signal, onDelta });
  const onText = (full, previous) => onDelta?.(full.slice(previous.length), full);
  if (!isStream(response)) {
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { return { text: raw, finishReason: "stop", streamed: false }; }
    if (data?.error) throw fail(data.error.message || data.error);
    const text = (format === "responses" ? responsesText(data) : anthropicText(data)) || JSON.stringify(data);
    onDelta?.(text, text);
    const finish = format === "responses" ? RESPONSES_FINISH[data?.incomplete_details?.reason] : ANTHROPIC_FINISH[data?.stop_reason];
    return { text, finishReason: finish || "stop", streamed: false };
  }
  let previous = "";
  const emit = (full) => { onText(full, previous); previous = full; };
  if (format === "responses") {
    return readEventStream(response, { signal, onText: emit, onEvent(event, state) {
      switch (event?.type) {
        case "response.output_text.delta": case "response.refusal.delta": if (typeof event.delta === "string") state.text += event.delta; break;
        case "response.completed": if (!state.text) state.text = responsesText(event.response); state.finishReason = state.finishReason || "stop"; break;
        case "response.incomplete": state.finishReason = RESPONSES_FINISH[event.response?.incomplete_details?.reason] || "length"; break;
        case "response.failed": throw fail(event.response?.error?.message);
        case "error": throw fail(event.message || event.error?.message);
        default: break;
      }
    } });
  }
  return readEventStream(response, { signal, onText: emit, onEvent(event, state) {
    switch (event?.type) {
      case "content_block_delta": if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") state.text += event.delta.text; break;
      case "message_delta": if (event.delta?.stop_reason) state.finishReason = ANTHROPIC_FINISH[event.delta.stop_reason] || "stop"; break;
      case "error": throw fail(event.error?.message);
      default: break; // message_start, content_block_start/stop, ping, message_stop, thinking deltas
    }
  } });
}

/** The provider's own explanation in an error response body, or "". */
export function errorDetail(data) { return String(data?.error?.message || (typeof data?.error === "string" ? data.error : "") || data?.message || "").slice(0, 300); }
