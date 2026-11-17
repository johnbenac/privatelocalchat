// Text normalisation for speech: a plain-ESM port of KittenTTS's text pre-processor (kittentts/preprocess.py, class TextPreprocessor), which
// the reference runs on the text BEFORE it is cut into chunks (onnx_model.py generate(): `text = self.preprocessor(text)`, then chunk_text).
// With the default options it expands numbers, currency, percentages, times, ordinals, units, fractions, decades, phone numbers, IP
// addresses, ranges and scientific notation to English words, expands contractions, drops HTML tags, URLs and e-mail addresses, then removes
// every punctuation mark, lower-cases and collapses whitespace. (So, as in the reference, sentence punctuation is gone by the time the text is
// chunked: a short text becomes one chunk.) tests/fixtures/kitten-preprocess-golden.json holds the reference's own output for hundreds of inputs.
//
// Python's regex engine is Unicode aware where JavaScript's is not: \w, \d, \s and \b are rebuilt below from \p{L}\p{N}_, \p{Nd} and the
// whitespace set of str.isspace() (JS \w is ASCII only, a bug this project has hit before). Numbers use BigInt, as Python ints are unbounded.
// Where the Python reference would raise (a ValueError on input like "$," or "0.00001%", see float repr below) this port leaves the text
// as it was instead of throwing.

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALE = ["", "thousand", "million", "billion", "trillion"];
const ORDINAL_EXCEPTIONS = { one: "first", two: "second", three: "third", four: "fourth", five: "fifth", six: "sixth", seven: "seventh",
  eight: "eighth", nine: "ninth", twelve: "twelfth" };
const CURRENCY = { "$": "dollar", "€": "euro", "£": "pound", "¥": "yen", "₹": "rupee", "₩": "won", "₿": "bitcoin" };
const SCALE_WORDS = { K: "thousand", M: "million", B: "billion", T: "trillion" };
const DIGIT_WORDS = ["zero", ...ONES.slice(1, 10)];
const UNIT_WORDS = { km: "kilometers", kg: "kilograms", mg: "milligrams", ml: "milliliters", gb: "gigabytes", mb: "megabytes", kb: "kilobytes",
  tb: "terabytes", hz: "hertz", khz: "kilohertz", mhz: "megahertz", ghz: "gigahertz", mph: "miles per hour", kph: "kilometers per hour",
  ms: "milliseconds", ns: "nanoseconds", "µs": "microseconds", "°c": "degrees Celsius", "c°": "degrees Celsius",
  "°f": "degrees Fahrenheit", "f°": "degrees Fahrenheit" };
const DECADES = ["hundreds", "tens", "twenties", "thirties", "forties", "fifties", "sixties", "seventies", "eighties", "nineties"];
const STOPWORDS = new Set(["a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "was", "are",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "this", "that",
  "these", "those", "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "she", "him", "her", "they", "them", "their"]);

// ---- Python regex classes in JavaScript ---------------------------------------------------------------------------------------------------
const WC = "\\p{L}\\p{N}_";                       // inside [...]: Python \w
const W = `[${WC}]`;
const D = "\\p{Nd}";                              // Python \d (decimal digits of any script)
const SC = "\\t-\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"; // str.isspace()
const S = `[${SC}]`;
const NS = `[^${SC}]`;
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`; // Python \b
const re = (src, flags = "gu") => new RegExp(src, flags);

const RE_URL = re(`https?://${NS}+|www\\.${NS}+`);
const RE_EMAIL = re(`${B}[${WC}.+-]+@[${WC}-]+\\.[a-z]{2,}${B}`, "giu");
const RE_HASHTAG = re(`#${W}+`);
const RE_MENTION = re(`@${W}+`);
const RE_HTML = re("<[^>]+>");
const RE_PUNCT = re(`[^${WC}${SC}]`);
const RE_SPACES = re(`${S}+`);
const RE_NUMBER = re(`(?<![a-zA-Z])-?[${D},]+(?:\\.${D}+)?`);
const RE_ORDINAL = re(`${B}(${D}+)(st|nd|rd|th)${B}`, "giu");
const RE_PERCENT = re(`(-?[${D},]+(?:\\.${D}+)?)${S}*%`);
const RE_CURRENCY = re(`([$€£¥₹₩₿])${S}*([${D},]+(?:\\.${D}+)?)${S}*([KMBT])?(?![a-zA-Z${D}])`);
const RE_TIME = re(`${B}(${D}{1,2}):(${D}{2})(?::(${D}{2}))?${S}*(am|pm)?${B}`, "giu");
const RE_RANGE = re(`(?<!${W})(${D}+)-(${D}+)(?!${W})`);
const RE_MODEL_VER = re(`${B}([a-zA-Z][a-zA-Z0-9]*)-(${D}[${D}.]*)(?=[^${D}.]|$)`);
const RE_UNIT = re(`(${D}+(?:\\.${D}+)?)${S}*(km|kg|mg|ml|gb|mb|kb|tb|hz|khz|mhz|ghz|mph|kph|°[cCfF]|[cCfF]°|ms|ns|µs)${B}`, "giu");
const RE_SCALE = re(`(?<![a-zA-Z])(${D}+(?:\\.${D}+)?)${S}*([KMBT])(?![a-zA-Z${D}])`);
const RE_SCI = re(`(?<![a-zA-Z${D}])(-?${D}+(?:\\.${D}+)?)[eE]([+-]?${D}+)(?![a-zA-Z${D}])`);
const RE_FRACTION = re(`${B}(${D}+)${S}*/${S}*(${D}+)${B}`);
const RE_DECADE = re(`${B}(${D}{1,3})0s${B}`);
const RE_LEAD_DEC = re(`(?<!${D})\\.(${D})`);
const RE_NEG_LEAD_DEC = re(`(?<!${D})(-)\\.(${D})`);
const RE_IP = re(`${B}(${D}{1,3})\\.(${D}{1,3})\\.(${D}{1,3})\\.(${D}{1,3})${B}`);
const RE_PHONE11 = re(`(?<!${D}-)(?<!${D})${B}(${D}{1,2})-(${D}{3})-(${D}{3})-(${D}{4})${B}(?!-${D})`);
const RE_PHONE10 = re(`(?<!${D}-)(?<!${D})${B}(${D}{3})-(${D}{3})-(${D}{4})${B}(?!-${D})`);
const RE_PHONE7 = re(`(?<!${D}-)${B}(${D}{3})-(${D}{4})${B}(?!-${D})`);
const RE_ROMAN = re(`${B}(M{0,4})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})${B}`);
const RE_TITLE_WORDS = re(`${B}(war|chapter|part|volume|act|scene|book|section|article|king|queen|pope|louis|henry|edward|george|william|james|phase|round|level|stage|class|type|version|episode|season)${B}`, "iu");
const CONTRACTIONS = [
  [re(`${B}can't${B}`, "giu"), () => "cannot"], [re(`${B}won't${B}`, "giu"), () => "will not"], [re(`${B}shan't${B}`, "giu"), () => "shall not"],
  [re(`${B}ain't${B}`, "giu"), () => "is not"], [re(`${B}let's${B}`, "giu"), () => "let us"],
  [re(`${B}(${W}+)n't${B}`, "giu"), (m, a) => `${a} not`], [re(`${B}(${W}+)'re${B}`, "giu"), (m, a) => `${a} are`],
  [re(`${B}(${W}+)'ve${B}`, "giu"), (m, a) => `${a} have`], [re(`${B}(${W}+)'ll${B}`, "giu"), (m, a) => `${a} will`],
  [re(`${B}(${W}+)'d${B}`, "giu"), (m, a) => `${a} would`], [re(`${B}(${W}+)'m${B}`, "giu"), (m, a) => `${a} am`],
  [re(`${B}it's${B}`, "giu"), () => "it is"],
];

// ---- helpers -------------------------------------------------------------------------------------------------------------------------------
const NON_ASCII_ND = /[^\x00-\x7f]/u;
const ND = /^\p{Nd}$/u;
const digitCache = new Map();
function digitValue(ch) { // value of a decimal digit of any script: Nd blocks are runs of ten starting at zero
  let v = digitCache.get(ch);
  if (v !== undefined) return v;
  let cp = ch.codePointAt(0), n = 0;
  while (cp - n - 1 >= 0 && ND.test(String.fromCodePoint(cp - n - 1))) n++;
  v = n % 10;
  digitCache.set(ch, v);
  return v;
}
/** Python's int()/float() read every script's decimal digits; JS Number()/BigInt() do not. */
const ascii = (s) => (NON_ASCII_ND.test(s) ? s.replace(/\p{Nd}/gu, (c) => (c.charCodeAt(0) < 128 ? c : String(digitValue(c)))) : s);
const big = (s) => BigInt(ascii(s));
const SPACE_TEST = new RegExp(`^${S}$`, "u");
function strip(s) { // str.strip(): the isspace() set, not JS trim()
  let a = 0, b = s.length;
  while (a < b && SPACE_TEST.test(s[a])) a++;
  while (b > a && SPACE_TEST.test(s[b - 1])) b--;
  return s.slice(a, b);
}

/** Python's repr(float) for the finite range where it prints plainly; null where it would print an exponent (the reference then raises). */
function pyFloatText(raw) {
  const n = Number(ascii(raw));
  if (!Number.isFinite(n)) return null;
  if (n === 0) return Object.is(n, -0) ? "-0.0" : "0.0";
  const a = Math.abs(n);
  if (a >= 1e16 || a < 1e-4) return null;
  const t = String(n);
  return Number.isInteger(n) ? t + ".0" : t;
}

function threeDigits(n) { // 1..999
  const parts = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r < 20) { if (r) parts.push(ONES[r]); }
  else { const t = TENS[Math.floor(r / 10)], o = ONES[r % 10]; parts.push(o ? `${t}-${o}` : t); }
  return parts.join(" ");
}

export function numberToWords(n) {
  n = typeof n === "bigint" ? n : BigInt(n);
  if (n === 0n) return "zero";
  if (n < 0n) return `negative ${numberToWords(-n)}`;
  if (n >= 100n && n <= 9999n && n % 100n === 0n && n % 1000n !== 0n) {
    const h = Number(n / 100n);
    if (h < 20) return `${ONES[h]} hundred`;
  }
  const parts = [];
  for (const scale of SCALE) {
    const chunk = Number(n % 1000n);
    if (chunk) { const w = threeDigits(chunk); parts.push(scale ? `${w} ${scale}`.trim() : w); }
    n /= 1000n;
    if (n === 0n) break;
  }
  return parts.reverse().join(" ");
}

/** value: a numeric string (digits, one optional "." and sign) or a pyFloatText() result. */
function floatToWords(text, sep = "point") {
  text = ascii(String(text));
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  let result;
  if (text.includes(".")) {
    const i = text.indexOf(".");
    const ip = text.slice(0, i), dp = text.slice(i + 1);
    const intWords = ip ? numberToWords(BigInt(ip)) : "zero";
    result = `${intWords} ${sep} ${[...dp].map((d) => DIGIT_WORDS[Number(d)]).join(" ")}`;
  } else result = numberToWords(BigInt(text));
  return negative ? `negative ${result}` : result;
}

function ordinalSuffix(n) {
  const word = numberToWords(n);
  let prefix, last, joiner;
  if (word.includes("-")) { const i = word.lastIndexOf("-"); prefix = word.slice(0, i); last = word.slice(i + 1); joiner = "-"; }
  else {
    const i = word.lastIndexOf(" ");
    if (i >= 0) { prefix = word.slice(0, i); last = word.slice(i + 1); joiner = " "; } else { prefix = ""; last = word; joiner = ""; }
  }
  let lastOrd;
  if (Object.prototype.hasOwnProperty.call(ORDINAL_EXCEPTIONS, last)) lastOrd = ORDINAL_EXCEPTIONS[last];
  else if (last.endsWith("t")) lastOrd = last + "h";
  else if (last.endsWith("e")) lastOrd = last.slice(0, -1) + "th";
  else lastOrd = last + "th";
  return prefix ? `${prefix}${joiner}${lastOrd}` : lastOrd;
}

function romanToInt(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0, prev = 0;
  for (const ch of [...s.toUpperCase()].reverse()) { const c = val[ch]; result += c >= prev ? c : -c; prev = c; }
  return result;
}

// ---- expansions (each leaves a match untouched where the reference would raise) ------------------------------------------------------------
const safe = (fn) => (m, ...a) => { try { return fn(m, ...a); } catch { return m; } };

const expandOrdinals = (t) => t.replace(RE_ORDINAL, safe((m, d) => ordinalSuffix(big(d))));
const expandPercentages = (t) => t.replace(RE_PERCENT, safe((m, g) => {
  const raw = ascii(g).replaceAll(",", "");
  if (raw.includes(".")) { const f = pyFloatText(raw); if (f === null || !f.includes(".")) throw new Error("float repr"); return floatToWords(f) + " percent"; }
  return numberToWords(big(raw)) + " percent";
}));
const expandCurrency = (t) => t.replace(RE_CURRENCY, safe((m, symbol, g, suffix) => {
  const raw = ascii(g).replaceAll(",", "");
  const unit = CURRENCY[symbol] ?? "";
  if (suffix) {
    const num = raw.includes(".") ? floatToWords(raw) : numberToWords(big(raw));
    return `${num} ${SCALE_WORDS[suffix]} ${unit}${unit ? "s" : ""}`.trim();
  }
  if (raw.includes(".")) {
    const i = raw.indexOf(".");
    const ip = raw.slice(0, i), dp = raw.slice(i + 1);
    const decVal = Number(dp.slice(0, 2).padEnd(2, "0"));
    const intWords = numberToWords(BigInt(ip));
    let result = unit ? `${intWords} ${unit}s` : intWords;
    if (decVal) result += ` and ${numberToWords(decVal)} cent${decVal !== 1 ? "s" : ""}`;
    return result;
  }
  const val = BigInt(raw);
  const words = numberToWords(val);
  return unit ? `${words} ${unit}${val !== 1n ? "s" : ""}` : words;
}));
const expandTime = (t) => t.replace(RE_TIME, safe((m, hh, mm, ss, ap) => {
  const h = Number(ascii(hh)), mins = Number(ascii(mm));
  const suffix = ap ? " " + ap.toLowerCase() : "";
  const hw = numberToWords(h);
  if (mins === 0) return ap ? `${hw}${suffix}` : `${hw} hundred${suffix}`;
  if (mins < 10) return `${hw} oh ${numberToWords(mins)}${suffix}`;
  return `${hw} ${numberToWords(mins)}${suffix}`;
}));
const expandRanges = (t) => t.replace(RE_RANGE, safe((m, a, b) => `${numberToWords(big(a))} to ${numberToWords(big(b))}`));
const expandModelNames = (t) => t.replace(RE_MODEL_VER, (m, a, b) => `${a} ${b}`);
const expandUnits = (t) => t.replace(RE_UNIT, safe((m, g, u) => {
  const raw = ascii(g);
  const expanded = UNIT_WORDS[u.toLowerCase()] ?? u;
  let num;
  if (raw.includes(".")) { const f = pyFloatText(raw); if (f === null) throw new Error("float repr"); num = floatToWords(f); } else num = numberToWords(BigInt(raw));
  return `${num} ${expanded}`;
}));
const expandScaleSuffixes = (t) => t.replace(RE_SCALE, safe((m, g, s) => {
  const raw = ascii(g);
  return `${raw.includes(".") ? floatToWords(raw) : numberToWords(BigInt(raw))} ${SCALE_WORDS[s] ?? s}`;
}));
const expandSci = (t) => t.replace(RE_SCI, safe((m, c, e) => {
  const coeff = ascii(c), exp = BigInt(ascii(e));
  const words = coeff.includes(".") ? floatToWords(coeff) : numberToWords(BigInt(coeff));
  return `${words} times ten to the ${exp < 0n ? "negative " : ""}${numberToWords(exp < 0n ? -exp : exp)}`;
}));
const expandFractions = (t) => t.replace(RE_FRACTION, safe((m, a, b) => {
  const num = big(a), den = big(b);
  if (den === 0n) return m;
  const nw = numberToWords(num);
  let dw;
  if (den === 2n) dw = num === 1n ? "half" : "halves";
  else if (den === 4n) dw = num === 1n ? "quarter" : "quarters";
  else { dw = ordinalSuffix(den); if (num !== 1n) dw += "s"; }
  return `${nw} ${dw}`;
}));
const expandDecades = (t) => t.replace(RE_DECADE, safe((m, g) => {
  const base = Number(ascii(g));
  const word = DECADES[base % 10];
  if (base < 10) return word;
  return `${numberToWords(Math.floor(base / 10))} ${word}`;
}));
const spell = (s) => [...ascii(s)].map((c) => DIGIT_WORDS[Number(c)]).join(" ");
const expandIp = (t) => t.replace(RE_IP, (m, ...g) => g.slice(0, 4).map(spell).join(" dot "));
const expandPhones = (t) => {
  const join = (m, ...g) => g.slice(0, m.split("-").length).map(spell).join(" ");
  return t.replace(RE_PHONE11, join).replace(RE_PHONE10, join).replace(RE_PHONE7, join);
};
const normalizeLeadingDecimals = (t) => t.replace(RE_NEG_LEAD_DEC, (m, a, d) => `${a}0.${d}`).replace(RE_LEAD_DEC, (m, d) => `0.${d}`);
const expandRoman = (text) => text.replace(RE_ROMAN, (m, ...g) => {
  const offset = g[g.length - 2];
  if (!strip(m)) return m;
  if (m.length === 1 && "IVX".includes(m) && !RE_TITLE_WORDS.test(text.slice(Math.max(0, offset - 30), offset))) return m;
  const v = romanToInt(m);
  return v === 0 ? m : numberToWords(v);
});
const expandContractions = (t) => { for (const [rx, fn] of CONTRACTIONS) t = t.replace(rx, fn); return t; };
const replaceNumbers = (t, floats) => t.replace(RE_NUMBER, (m) => {
  const raw = ascii(m).replaceAll(",", "");
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return m; // float("") and friends raise ValueError in the reference
  try {
    if (raw.includes(".") && floats) return floatToWords(raw);
    const x = Number(raw);
    if (!Number.isFinite(x)) return m; // OverflowError
    return numberToWords(BigInt(Math.trunc(x)));
  } catch { return m; }
});
const removeAccents = (t) => t.normalize("NFD").replace(/\p{Mn}/gu, "");

export const DEFAULT_OPTIONS = Object.freeze({
  lowercase: true, replaceNumbers: true, replaceFloats: true, expandContractions: true, expandModelNames: true, expandOrdinals: true,
  expandPercentages: true, expandCurrency: true, expandTime: true, expandRanges: true, expandUnits: true, expandScaleSuffixes: true,
  expandScientificNotation: true, expandFractions: true, expandDecades: true, expandPhoneNumbers: true, expandIpAddresses: true,
  normalizeLeadingDecimals: true, expandRomanNumerals: false, removeUrls: true, removeEmails: true, removeHtml: true, removeHashtags: false,
  removeMentions: false, removePunctuation: true, removeStopwords: false, stopwords: null, normalizeUnicode: true, removeAccents: false,
  removeExtraWhitespace: true,
});

/** The reference's TextPreprocessor()(text), step for step. Options use camelCase names of the Python constructor arguments. */
export function normalizeForSpeech(text, options = {}) {
  const c = { ...DEFAULT_OPTIONS, ...options };
  let t = String(text ?? "");
  if (c.normalizeUnicode) t = t.normalize("NFC");
  if (c.removeHtml) t = t.replace(RE_HTML, " ");
  if (c.removeUrls) t = strip(t.replace(RE_URL, ""));
  if (c.removeEmails) t = strip(t.replace(RE_EMAIL, ""));
  if (c.removeHashtags) t = t.replace(RE_HASHTAG, "");
  if (c.removeMentions) t = t.replace(RE_MENTION, "");
  if (c.expandContractions) t = expandContractions(t);
  if (c.expandIpAddresses) t = expandIp(t);
  if (c.normalizeLeadingDecimals) t = normalizeLeadingDecimals(t);
  if (c.expandCurrency) t = expandCurrency(t);
  if (c.expandPercentages) t = expandPercentages(t);
  if (c.expandScientificNotation) t = expandSci(t);
  if (c.expandTime) t = expandTime(t);
  if (c.expandOrdinals) t = expandOrdinals(t);
  if (c.expandUnits) t = expandUnits(t);
  if (c.expandScaleSuffixes) t = expandScaleSuffixes(t);
  if (c.expandFractions) t = expandFractions(t);
  if (c.expandDecades) t = expandDecades(t);
  if (c.expandPhoneNumbers) t = expandPhones(t);
  if (c.expandRanges) t = expandRanges(t);
  if (c.expandModelNames) t = expandModelNames(t);
  if (c.expandRomanNumerals) t = expandRoman(t);
  if (c.replaceNumbers) t = replaceNumbers(t, c.replaceFloats);
  if (c.removeAccents) t = removeAccents(t);
  if (c.removePunctuation) t = t.replace(RE_PUNCT, " ");
  if (c.lowercase) t = t.toLowerCase();
  if (c.removeStopwords) {
    const stop = c.stopwords ? new Set(c.stopwords) : STOPWORDS;
    t = t.split(RE_SPACES).filter((w) => w && !stop.has(w.toLowerCase())).join(" ");
  }
  if (c.removeExtraWhitespace) t = strip(t.replace(RE_SPACES, " "));
  return t;
}
