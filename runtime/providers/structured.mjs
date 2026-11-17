// Provenance: copied from spikes/llm/provider/structured.js (FAB-02), unchanged apart from the file name. Pure functions, no DOM.
// Structured-output helpers shared by every adapter. Pure functions, no DOM, testable in Node.
// Rule from the fabric: a malformed structured result is a LOUD failure (attempt-failed, phase "structured"),
// never a silently repaired value. extractJson() only strips Markdown fences and surrounding prose when the
// remaining text parses as exactly one JSON value; it reports HOW it got the value so callers can see repairs.

import { stripEmptyThink } from "./think.mjs";

export function extractJson(text) {
  const raw = stripEmptyThink(text); // Qwen3.5 may start with an empty think block even when thinking is off
  const trimmed = raw.trim();
  const tries = [["as-is", trimmed]];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) tries.push(["fenced", fence[1].trim()]);
  const first = trimmed.search(/[{[]/);
  if (first > 0) {
    const open = trimmed[first]; const close = open === "{" ? "}" : "]";
    const last = trimmed.lastIndexOf(close);
    if (last > first) tries.push(["sliced", trimmed.slice(first, last + 1)]);
  }
  let lastError = "no JSON value found";
  for (const [how, candidate] of tries) {
    try { return { ok: true, how, value: JSON.parse(candidate) }; } catch (e) { lastError = e.message; }
  }
  return { ok: false, error: lastError };
}

// Small JSON-Schema subset: type, enum, const, required, properties, additionalProperties:false, items,
// minimum, maximum, minLength, maxLength, minItems, maxItems. Enough to judge model output; not a general validator.
export function validateSchema(value, schema, path = "$") {
  const errors = [];
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const types = schema.type ? [].concat(schema.type) : null;
  if (types) {
    const t = typeOf(value);
    const ok = types.some((want) => want === t || (want === "number" && t === "integer"));
    if (!ok) return [`${path}: expected ${types.join("|")}, got ${t}`];
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${path}: not in enum ${JSON.stringify(schema.enum)}`);
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: expected const`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: > maximum ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validateSchema(v, schema.items, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}.${k}: required`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) errors.push(...validateSchema(value[k], sub, `${path}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(schema.properties || {})[k]) errors.push(`${path}.${k}: unexpected property`);
  }
  return errors;
}

// Evaluate a finished text against a request's responseFormat. Returns a StructuredReport (see PROVIDER-INTERFACE.md).
export function judgeStructured(text, responseFormat) {
  // Tolerant: only the two structured types we know are judged; anything else (or no type) is treated as plain text, not an error.
  if (!responseFormat || (responseFormat.type !== "json_object" && responseFormat.type !== "json_schema")) return null;
  const ex = extractJson(text);
  if (!ex.ok) return { requested: responseFormat.type, valid: false, stage: "parse", error: ex.error };
  const errors = responseFormat.schema ? validateSchema(ex.value, responseFormat.schema) : [];
  return { requested: responseFormat.type, valid: errors.length === 0, stage: errors.length ? "schema" : "ok", how: ex.how, errors: errors.slice(0, 8), value: ex.value };
}
