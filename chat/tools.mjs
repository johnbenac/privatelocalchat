// Exact answers for things a language model should not guess: arithmetic, unit conversion and calendar questions.
// Nothing here uses eval: expressions go through a small parser.

// ---- arithmetic -----------------------------------------------------------------------------------------------------
const FUNCS = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp, min: Math.min, max: Math.max, pow: Math.pow, cbrt: Math.cbrt };
const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

export function tokenizeExpression(src) {
  const toks = []; const s = String(src).replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\*\*/g, "^").replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { toks.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i));
    if (id) { toks.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ("+-*/^%(),".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character “${c}”`);
  }
  return toks;
}

export function evaluate(src) {
  const toks = tokenizeExpression(src); let p = 0;
  const peek = () => toks[p], eat = (v) => { if (toks[p]?.t === "op" && toks[p].v === v) { p++; return true; } return false; };
  function expr() { let v = term(); for (;;) { if (eat("+")) v += term(); else if (eat("-")) v -= term(); else return v; } }
  function term() {
    let v = unary();
    for (;;) {
      if (eat("*")) v *= unary();
      else if (eat("/")) { const d = unary(); if (d === 0) throw new Error("Division by zero"); v /= d; }
      else if (peek()?.t === "id" && peek().v === "mod") { p++; const d = unary(); if (d === 0) throw new Error("Division by zero"); v %= d; }
      else if (peek() && (peek().t === "num" || (peek().t === "op" && peek().v === "(") || (peek().t === "id" && (peek().v in FUNCS || peek().v in CONSTS)))) v *= power(); // 2(3+4), 3 pi
      else return v;
    }
  }
  function unary() { if (eat("-")) return -unary(); if (eat("+")) return unary(); return power(); }
  function power() { const base = postfix(); if (eat("^")) return Math.pow(base, unary()); return base; }
  function postfix() { let v = primary(); while (eat("%")) v /= 100; return v; }
  function primary() {
    const tk = toks[p++];
    if (!tk) throw new Error("The expression ends too soon");
    if (tk.t === "num") return tk.v;
    if (tk.t === "op" && tk.v === "(") { const v = expr(); if (!eat(")")) throw new Error("Missing closing parenthesis"); return v; }
    if (tk.t === "id") {
      if (tk.v in CONSTS) return CONSTS[tk.v];
      if (tk.v in FUNCS) {
        if (!eat("(")) throw new Error(`${tk.v} needs parentheses`);
        const args = []; if (!eat(")")) { do args.push(expr()); while (eat(",")); if (!eat(")")) throw new Error("Missing closing parenthesis"); }
        return FUNCS[tk.v](...args);
      }
      throw new Error(`Unknown name “${tk.v}”`);
    }
    throw new Error(`Unexpected “${tk.v}”`);
  }
  const value = expr();
  if (p < toks.length) throw new Error(`Unexpected “${toks[p].v}”`);
  if (!Number.isFinite(value)) throw new Error("The result is not a finite number");
  return value;
}

export function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const r = Number(n.toPrecision(12));
  if (Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-6 && r !== 0)) return r.toExponential().replace("e+", "e");
  return String(r);
}

// ---- units ----------------------------------------------------------------------------------------------------------
const U = {};
const def = (dim, base, entries) => { for (const [names, factor] of entries) for (const n of names.split("|")) U[n] = { dim, factor, base }; };
def("length", "m", [["m|meter|meters|metre|metres", 1], ["km|kilometer|kilometers|kilometre|kilometres", 1000], ["cm|centimeter|centimeters", 0.01], ["mm|millimeter|millimeters", 0.001], ["mi|mile|miles", 1609.344], ["yd|yard|yards", 0.9144], ["ft|foot|feet", 0.3048], ["in|inch|inches", 0.0254], ["nmi|nautical mile|nautical miles", 1852]]);
def("mass", "kg", [["kg|kilogram|kilograms|kilo|kilos", 1], ["g|gram|grams", 0.001], ["mg|milligram|milligrams", 1e-6], ["lb|lbs|pound|pounds", 0.45359237], ["oz|ounce|ounces", 0.028349523125], ["st|stone", 6.35029318], ["t|tonne|tonnes|metric ton|metric tons", 1000]]);
def("volume", "l", [["l|liter|liters|litre|litres", 1], ["ml|milliliter|milliliters|millilitre|millilitres", 0.001], ["gal|gallon|gallons|us gallon", 3.785411784], ["qt|quart|quarts", 0.946352946], ["pt|pint|pints", 0.473176473], ["cup|cups", 0.2365882365], ["floz|fl oz|fluid ounce|fluid ounces", 0.0295735295625], ["tbsp|tablespoon|tablespoons", 0.01478676478125], ["tsp|teaspoon|teaspoons", 0.00492892159375], ["m3|cubic meter|cubic meters", 1000]]);
def("area", "m2", [["m2|sqm|square meter|square meters|square metre|square metres", 1], ["km2|square kilometer|square kilometers", 1e6], ["ha|hectare|hectares", 1e4], ["acre|acres", 4046.8564224], ["ft2|sqft|square foot|square feet", 0.09290304], ["mi2|square mile|square miles", 2589988.110336]]);
def("speed", "m/s", [["m/s|mps", 1], ["km/h|kmh|kph|kmph", 1 / 3.6], ["mph|mi/h", 0.44704], ["kn|kt|knot|knots", 0.514444444], ["ft/s|fps", 0.3048]]);
def("time", "s", [["s|sec|second|seconds", 1], ["ms|millisecond|milliseconds", 0.001], ["min|minute|minutes", 60], ["h|hr|hour|hours", 3600], ["d|day|days", 86400], ["wk|week|weeks", 604800], ["yr|year|years", 31557600]]);
def("data", "byte", [["b|byte|bytes", 1], ["kb|kilobyte|kilobytes", 1e3], ["mb|megabyte|megabytes", 1e6], ["gb|gigabyte|gigabytes", 1e9], ["tb|terabyte|terabytes", 1e12], ["kib", 1024], ["mib", 1024 ** 2], ["gib", 1024 ** 3], ["tib", 1024 ** 4], ["bit|bits", 1 / 8]]);
const TEMP = { c: "c", celsius: "c", "°c": "c", "degrees celsius": "c", f: "f", fahrenheit: "f", "°f": "f", "degrees fahrenheit": "f", k: "k", kelvin: "k" };
const unitName = (s) => s.toLowerCase().replace(/[.\s]+$/g, "").replace(/^\s+/, "").replace(/\s+/g, " ").replace(/²/g, "2").replace(/³/g, "3");

export function convertUnits(value, fromRaw, toRaw) {
  const from = unitName(fromRaw), to = unitName(toRaw);
  if (TEMP[from] && TEMP[to]) {
    const f = TEMP[from], t = TEMP[to];
    const c = f === "c" ? value : f === "f" ? (value - 32) * 5 / 9 : value - 273.15;
    return t === "c" ? c : t === "f" ? c * 9 / 5 + 32 : c + 273.15;
  }
  const a = U[from], b = U[to];
  if (!a) throw new Error(`I don’t know the unit “${fromRaw.trim()}”`);
  if (!b) throw new Error(`I don’t know the unit “${toRaw.trim()}”`);
  if (a.dim !== b.dim) throw new Error(`${fromRaw.trim()} (${a.dim}) can’t be converted to ${toRaw.trim()} (${b.dim})`);
  return (value * a.factor) / b.factor;
}

// ---- dates ----------------------------------------------------------------------------------------------------------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthIndex = (s) => MONTHS.findIndex((m) => m === s.toLowerCase() || m.slice(0, 3) === s.toLowerCase().slice(0, 3) && s.length <= 4);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const DAY = 864e5;

export function parseDate(text, now = new Date()) {
  const s = String(text).trim().replace(/[?.!,]+$/, "").toLowerCase();
  const today = utc(now.getFullYear(), now.getMonth(), now.getDate());
  if (s === "today" || s === "now") return today;
  if (s === "tomorrow") return new Date(today.getTime() + DAY);
  if (s === "yesterday") return new Date(today.getTime() - DAY);
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return valid(utc(+m[1], +m[2] - 1, +m[3]), +m[1], +m[2] - 1, +m[3]);
  if ((m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s)) && monthIndex(m[1]) >= 0) return valid(utc(+m[3], monthIndex(m[1]), +m[2]), +m[3], monthIndex(m[1]), +m[2]);
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/.exec(s)) && monthIndex(m[2]) >= 0) return valid(utc(+m[3], monthIndex(m[2]), +m[1]), +m[3], monthIndex(m[2]), +m[1]);
  return null;
}
const valid = (d, y, m, day) => (d.getUTCFullYear() === y && d.getUTCMonth() === m && d.getUTCDate() === day ? d : null);
export const formatDate = (d) => `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][0].toUpperCase() + MONTHS[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()} (${d.toISOString().slice(0, 10)})`;
export function addToDate(d, n, unit) {
  const out = new Date(d.getTime());
  if (/^day/.test(unit)) out.setUTCDate(out.getUTCDate() + n);
  else if (/^week/.test(unit)) out.setUTCDate(out.getUTCDate() + 7 * n);
  else if (/^month/.test(unit)) { const day = out.getUTCDate(); out.setUTCDate(1); out.setUTCMonth(out.getUTCMonth() + n); const last = utc(out.getUTCFullYear(), out.getUTCMonth() + 1, 0).getUTCDate(); out.setUTCDate(Math.min(day, last)); }
  else if (/^year/.test(unit)) { const day = out.getUTCDate(), mo = out.getUTCMonth(); out.setUTCDate(1); out.setUTCFullYear(out.getUTCFullYear() + n); out.setUTCMonth(mo); const last = utc(out.getUTCFullYear(), mo + 1, 0).getUTCDate(); out.setUTCDate(Math.min(day, last)); }
  return out;
}
export const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);

const DATE_RE = "(?:today|tomorrow|yesterday|\\d{4}-\\d{1,2}-\\d{1,2}|[a-z]+\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[a-z]+\\.?,?\\s+\\d{4})";

/** One date question -> { label, result } or null. */
export function dateQuestion(text, now = new Date()) {
  const q = String(text).trim();
  let m;
  if ((m = new RegExp(`\\b(?:what\\s+)?day\\s+of\\s+the\\s+week\\s+(?:is|was|will)\\s+(?:be\\s+)?(${DATE_RE})`, "i").exec(q)) || (m = new RegExp(`\\bwhat\\s+day\\s+(?:is|was)\\s+(${DATE_RE})`, "i").exec(q))) {
    const d = parseDate(m[1], now); if (d) return { label: m[1].trim(), result: formatDate(d) };
  }
  if ((m = new RegExp(`\\b(?:how\\s+many\\s+days\\s+(?:are\\s+there\\s+)?(?:between|from|until|till|since)|days\\s+between)\\s+(${DATE_RE})(?:\\s+(?:and|to|until|till)\\s+(${DATE_RE}))?`, "i").exec(q))) {
    const a = parseDate(m[1], now), b = m[2] ? parseDate(m[2], now) : parseDate("today", now);
    const since = /since/i.test(m[0]);
    if (a && b) { const n = since && !m[2] ? daysBetween(a, b) : daysBetween(a, b); return { label: `${m[1].trim()} → ${m[2] ? m[2].trim() : "today"}`, result: `${n} day${Math.abs(n) === 1 ? "" : "s"}` }; }
  }
  if ((m = new RegExp(`(${DATE_RE})\\s*([+-])\\s*(\\d+)\\s*(days?|weeks?|months?|years?)`, "i").exec(q))) {
    const d = parseDate(m[1], now); if (d) { const out = addToDate(d, (m[2] === "-" ? -1 : 1) * Number(m[3]), m[4].toLowerCase()); return { label: `${m[1].trim()} ${m[2]} ${m[3]} ${m[4]}`, result: formatDate(out) }; }
  }
  if ((m = new RegExp(`(\\d+)\\s*(days?|weeks?|months?|years?)\\s+(from|after|before|ago)(?:\\s+(${DATE_RE}))?`, "i").exec(q))) {
    const base = m[4] ? parseDate(m[4], now) : parseDate("today", now); const sign = /before|ago/i.test(m[3]) ? -1 : 1;
    if (base) return { label: m[0].trim(), result: formatDate(addToDate(base, sign * Number(m[1]), m[2].toLowerCase())) };
  }
  if (/^(?:what(?:'s| is)?\s+)?(?:today'?s?\s+date|the\s+date(?:\s+today)?|what\s+day\s+is\s+(?:it|today))\W*$/i.test(q) || /\bwhat(?:'s| is)\s+(?:today'?s\s+date|the\s+date(?: today)?)\W*$/i.test(q) || /\bwhat\s+day\s+is\s+(?:it|today)\b/i.test(q) || /\btoday'?s\s+date\b/i.test(q))
    return { label: "today", result: formatDate(parseDate("today", now)) };
  return null;
}

// ---- finding exact questions inside a message -----------------------------------------------------------------------
const NUM = "-?\\d[\\d,]*(?:\\.\\d+)?";
const looksArithmetic = (s) => (s.match(/\d/g) || []).length >= 2 && /[*/^×÷+]|\s-\s|\)\s*-|-\s*\(|\*\*/.test(s) && !/\d{4}-\d{1,2}-\d{1,2}/.test(s);

export function calculate(src) {
  const text = String(src).trim().replace(/^=+|=+$/g, "").replace(/\bof\b/gi, "*");
  const pct = new RegExp(`^(${NUM})\\s*%\\s*\\*\\s*(${NUM})$`).exec(text.replace(/\s+/g, " "));
  const value = pct ? (evaluate(pct[1]) / 100) * evaluate(pct[2]) : evaluate(text);
  return formatNumber(value);
}

/** Pull out the parts of a message that have an exact answer. Returns [{ kind, label, result }]. */
export function detectTools(text, now = new Date()) {
  const out = [], seen = new Set(), add = (t) => { const k = t.kind + t.label; if (!seen.has(k) && out.length < 4) { seen.add(k); out.push(t); } };
  const q = String(text);
  const d = dateQuestion(q, now); if (d) add({ kind: "date", ...d });
  const conv = new RegExp(`(${NUM})\\s*(?:°\\s*)?([a-z][a-z0-9°/²³ ]{0,22}?)\\s+(?:to|in|into|as)\\s+(?:°\\s*)?([a-z][a-z0-9°/²³ ]{0,22}?)(?=[\\s?.!,;]*$|[?.!,;]\\s)`, "ig");
  for (const m of q.matchAll(conv)) {
    const words = m[3].trim().split(/\s+/);
    for (let k = Math.min(3, words.length); k >= 1; k--) { // "5 km to miles please" -> the unit is "miles"
      const target = words.slice(0, k).join(" ");
      try { const value = evaluate(m[1]); const r = convertUnits(value, m[2], target); add({ kind: "convert", label: `${m[1].trim()} ${m[2].trim()} to ${target}`, result: `${formatNumber(r)} ${target}` }); break; } catch { /* try a shorter unit name */ }
    }
  }
  for (const m of q.matchAll(new RegExp(`(${NUM})\\s*%\\s*of\\s*(${NUM})`, "ig"))) { try { add({ kind: "calc", label: m[0].trim(), result: calculate(m[0]) }); } catch { /* skip */ } }
  const cand = q.replace(new RegExp(`${NUM}\\s*%\\s*of\\s*${NUM}`, "ig"), " ").matchAll(/(?:^|[\s(=:])((?:[-+]?\(*\s*\d[\d,]*(?:\.\d+)?\s*\)*\s*(?:\*\*|[+\-*/^×÷])\s*)+[-+]?\(*\s*\d[\d,]*(?:\.\d+)?\s*\)*%?)/g);
  for (const m of cand) {
    const expr = m[1].trim();
    if (!looksArithmetic(expr)) continue;
    try { add({ kind: "calc", label: expr.replace(/\s+/g, " "), result: calculate(expr) }); } catch { /* not arithmetic */ }
  }
  return out;
}

/** /calc, /convert and /date typed on their own: answered right away without the model. */
export function runCommand(text, now = new Date()) {
  const m = /^\/(calc|convert|date)\b\s*(.*)$/is.exec(String(text).trim());
  if (!m) return null;
  const [, cmd, rest] = m;
  try {
    if (cmd === "calc") { if (!rest.trim()) throw new Error("Give me something to calculate, like /calc 12*(3+4)"); const r = calculate(rest); return { ok: true, label: rest.trim(), result: r, text: `${rest.trim()} = **${r}**` }; }
    if (cmd === "convert") {
      const c = new RegExp(`^(${NUM})\\s*(?:°\\s*)?(.+?)\\s+(?:to|in|into|as)\\s+(?:°\\s*)?(.+)$`, "i").exec(rest.trim());
      if (!c) throw new Error("Try /convert 5 km to miles");
      const r = convertUnits(evaluate(c[1]), c[2], c[3]); return { ok: true, label: rest.trim(), result: `${formatNumber(r)} ${c[3].trim()}`, text: `${c[1].trim()} ${c[2].trim()} = **${formatNumber(r)} ${c[3].trim()}**` };
    }
    const arg = rest.trim() || "today";
    const d = dateQuestion(/^(today|tomorrow|yesterday)$/i.test(arg) ? "what is the date " + arg : arg.replace(/^(days between)/i, "how many days between").replace(/^([\d\w ,.-]+)$/, (x) => (parseDate(x, now) ? "what day is " + x : x)), now);
    if (!d) { const direct = parseDate(arg, now); if (direct) return { ok: true, label: arg, result: formatDate(direct), text: `${arg}: **${formatDate(direct)}**` }; throw new Error("Try /date today, /date 2026-03-05, /date days between 2026-01-01 and 2026-03-05, or /date 2026-03-05 + 30 days"); }
    return { ok: true, label: d.label, result: d.result, text: `${d.label}: **${d.result}**` };
  } catch (e) { return { ok: false, text: `I couldn’t work that out: ${e.message}` }; }
}
