# Connected providers: list and API formats

Living plan. Code: `chat/provider/endpoint-options.mjs` (the list), `chat/provider/api-formats.mjs` (the three request formats), `chat/provider/endpoint-urls.mjs`, `chat/provider/provider-settings.mjs` (the form), `chat/core/sender.mjs` (sending). Tests: `tests/api-formats.test.mjs`, `tests/endpoint-options.test.mjs`, `tests/endpoint-urls.test.mjs`, `tests/e2e/providers.e2e.mjs` (the fake provider in `tests/e2e/fake-api.mjs` speaks all three).

## Why this was redone (2026-11-04)

The list was a year old, had no Anthropic and sent every request as Chat Completions. Providers have moved: OpenAI's current API is Responses, Anthropic allows direct browser calls with a header, and several listed services had closed or stopped accepting calls from a web page.

## The three formats

| Format | Path | Key header | Notes |
| --- | --- | --- | --- |
| Chat Completions | `/chat/completions` | `Authorization: Bearer` | what most providers and local servers speak |
| Responses | `/responses` | `Authorization: Bearer` (Azure: `api-key`) | `input` items plus `instructions`, `store: false` so nothing is kept by default; streamed `response.output_text.delta`, ended by `response.completed` / `response.incomplete` / `response.failed` / `error` |
| Anthropic Messages | `/messages` | `x-api-key`, `anthropic-version: 2026-10-21`, `anthropic-dangerous-direct-browser-access: true` | `max_tokens` is required (16000); system text is a separate field; streamed `content_block_delta` / `text_delta`, `message_delta.stop_reason` |

Gemini is reached through its OpenAI-compatible endpoint (its model ids come with a `models/` prefix, which is stripped). Each list entry has a default `format`; the person can override it with the API format menu (`config.format`), and a provider picked from the list resets it.

## Rule for being in the list

A provider is listed only if a web page can call it: a keyless CORS preflight from `https://privatelocal.chat` was answered with the headers the request needs. A provider that fails this is left out, because it would only produce a confusing error. Documentation links in the hints were opened and checked.

Left out because they do not allow browser calls (re-check from time to time): SambaNova, GitHub Models, NVIDIA NIM, Ollama Cloud, Cloudflare Workers AI (the AI Gateway compat endpoint is listed instead), AWS Bedrock. Removed because they closed or no longer answer: Anyscale (404), RunPod, Baseten, LoRAX, a bare TGI entry. A saved endpoint that is no longer in the list shows as Custom and keeps working.

## Decisions

* Hints carry no model names: they age fastest. The model menu is filled from the provider's own model list.
* Tool use, reasoning blocks and files are not sent in any format; this is a text (and picture) chat.
* Settings transfer still carries only endpoint, model and theme, so the receiving browser takes the provider's default format. A custom server on the Responses API needs the menu set again there (`docs/TECHNICAL-DEBT.md`).

## Log

* 2026-11-04: rebuilt the list in groups, added the three formats, Anthropic, Azure, xAI, Responses for OpenAI; tests and e2e added; Privacy and Updates revised.
