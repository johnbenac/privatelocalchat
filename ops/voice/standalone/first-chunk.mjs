// SPDX-License-Identifier: AGPL-3.0-only
// Splits the FIRST chunk of a speak() at a comma (or semicolon, colon) so the first sound arrives sooner: a one-chunk sentence's first sound otherwise equals its whole synthesis time.
// Pure, no browser objects. `opt` is { minChars }: the cut is the first , ; : at least minChars characters in, not inside a number ("1,000"), leaving at least minRest characters after it.
export function findFirstCut(chunk, minChars, minRest = 12) {
  const text = String(chunk);
  for (let i = Math.max(0, minChars - 1); i < text.length - 1; i++) {
    const c = text[i];
    if (c !== "," && c !== ";" && c !== ":") continue;
    if (/\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) continue;   // 1,000  or  10:05
    if (text.slice(i + 1).trim().length < minRest) return -1;                      // too little left to be a chunk of its own: leave it whole
    return i + 1;
  }
  return -1;
}
export function splitFirst(chunks, opt) {
  const min = opt && Number.isInteger(opt.minChars) && opt.minChars > 0 ? opt.minChars : 0;
  if (!min || !chunks.length) return chunks;
  const cut = findFirstCut(chunks[0], min); if (cut < 0) return chunks;
  const head = chunks[0].slice(0, cut).trim(), tail = chunks[0].slice(cut).trim();
  return head && tail ? [head, tail, ...chunks.slice(1)] : chunks;
}
