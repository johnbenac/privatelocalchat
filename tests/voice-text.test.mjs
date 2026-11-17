import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeForSpeech, numberToWords } from "../chat/voice/voice-text.mjs";

// Golden cases: the output of the KittenTTS reference (TextPreprocessor()) for each input, made by ops/voice/gen-preprocess-golden.py.
const golden = JSON.parse(fs.readFileSync(new URL("./fixtures/kitten-preprocess-golden.json", import.meta.url), "utf8"));

// Documented exceptions: none. Every golden case is reproduced exactly. (Inputs on which the reference itself raises, such as "$," or
// "0.00001%", are not in the fixture; the port leaves such a match unchanged instead of throwing.)
const EXCEPTIONS = new Map();

test("the golden fixture is big enough", () => {
  assert.ok(golden.length >= 250, `only ${golden.length} cases`);
});

for (const [i, { input, expected }] of golden.entries()) {
  test(`golden ${i}: ${JSON.stringify(input).slice(0, 60)}`, () => {
    const got = normalizeForSpeech(input);
    if (EXCEPTIONS.has(input)) return assert.equal(got, EXCEPTIONS.get(input));
    assert.equal(got, expected);
  });
}

test("idempotent on already-normalised text (lower-case words and single spaces are a fixed point)", () => {
  let checked = 0;
  for (const { expected } of golden) {
    if (!/^[a-z]+(?: [a-z]+)*$/.test(expected)) continue;
    assert.equal(normalizeForSpeech(expected), expected);
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} fixed-point cases`);
});

test("never throws, on lone surrogates, control characters, odd digits and very long input", () => {
  const samples = [
    "\ud800", "a\udc00b", "\ud83d", "5\ud800%", "$\udfff5", "\u0000\u0001\u0002", "\u{1F600}".repeat(5000), "$,", "$.5", "0.00001%", "1e999999",
    "9".repeat(5000), "9".repeat(400) + ".5", "0.00001kg", "1e16%x", "٣".repeat(50), "-,", ",.", "1,.5", "$ ,", "a@b.cc ".repeat(2000),
    "1/0 3:99 99:99 999.999.999.999", "x".repeat(200000), "word ".repeat(40000), "1 ".repeat(40000), " ".repeat(100000) + "a",
  ];
  for (const s of samples) assert.equal(typeof normalizeForSpeech(s), "string");
  assert.equal(normalizeForSpeech(null), "");
  assert.equal(normalizeForSpeech(undefined), "");
});

test("number words follow the reference (BigInt, hundreds, the five scales)", () => {
  assert.equal(numberToWords(1200), "twelve hundred");
  assert.equal(numberToWords(1000), "one thousand");
  assert.equal(numberToWords(-42), "negative forty-two");
  assert.equal(numberToWords(2100), "two thousand one hundred");
  assert.equal(numberToWords(10n ** 15n), "");  // the reference drops anything above the trillions
});

test("the headline example from the voice task", () => {
  assert.equal(normalizeForSpeech("It costs $5.50 on Jan 3rd, and there are 365 days."),
    "it costs five dollars and fifty cents on jan third and there are three hundred sixty five days");
});

test("options: roman numerals, hashtags, mentions, keeping punctuation", () => {
  assert.equal(normalizeForSpeech("World War II ended.", { expandRomanNumerals: true }), "world war two ended");
  assert.equal(normalizeForSpeech("#NLP @bob hi", { removeHashtags: true, removeMentions: true }), "hi");
  assert.equal(normalizeForSpeech("Hi, 5 Dogs!", { removePunctuation: false, lowercase: false }), "Hi, five Dogs!");
});

test("speechChunks normalises before chunking, as the reference generate() does", async () => {
  const { speechChunks, softenAbbreviations } = await import("../chat/voice/voice-kitten.mjs");
  assert.deepEqual(speechChunks("It costs $5.50. Dr. Who has 3 cats!"), ["it costs five dollars and fifty cents,", "dr who has three cats,"]);
  assert.deepEqual(speechChunks("Ask Dr. Smith, e.g. about St. Louis. Then go."), ["ask dr smith, for example about st louis,", "then go,"]);
  assert.equal(softenAbbreviations("Fine. Next one."), "Fine. Next one.");
  assert.deepEqual(speechChunks("   "), []);
});
