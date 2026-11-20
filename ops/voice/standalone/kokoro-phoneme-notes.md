# What the `ipa` field of a chunk is (Kokoro's phoneme text)

Written by the plc team from the pinned model's own tokenizer file and from running this package's pipeline; every statement below is either read from those files or measured, and says which.
Re-run the measurement with `node ops/voice/standalone/phoneme-survey.mjs` in the Private Local Chat repository (needs `npm ci --ignore-scripts` in `ops/voice`).

## 1. What `ipa` is (measured)

`ipa` is the string that was given to the model for that chunk: the output of **eSpeak NG** (through the npm package `phonemizer` 1.2.1; American English `en-us` for the voices whose id starts
with `a`, British `en` for `b`), after the clean-up of `postProcessPhonemes` in `source/voice-kokoro.mjs` (ported from kokoro-js 1.2.1). It is IPA text, with spaces between words and the
punctuation of the sentence kept. It is **not** a separate alphabet: apart from the substitutions in section 3 it is what eSpeak NG's IPA output looks like. Examples (af_heart):

| text | `ipa` |
|---|---|
| Hello! | `həlˈoʊ!` |
| This is a short sample of the voice. | `ðɪs ɪz ɐ ʃˈɔːɹt sˈæmpəl ʌvðə vˈɔɪs.` |
| the nearest train station | `ðə nˌɪɹɪst tɹˈeɪn stˈeɪʃən` |
| Please type anything | `plˈiːz tˈaɪp ˈɛnɪθˌɪŋ` |
| 2027 | `twˈɛnti twˈɛnti sˈɛvən` (numbers are spoken out before phonemizing) |
| a bird, a law | `ɐ bˈɜːd, ɐ lˈɔː` |

Things that matter for timing a mouth from it:
* **Diphthongs are two symbols in a row**, not one: `oʊ` (go), `aɪ` (my), `aʊ` (now), `eɪ` (say), `ɔɪ` (boy). **Affricates are two symbols too**: `tʃ` (cheese), `dʒ` (jump). The model's one-letter
  forms for these (capital letters, `ʤ`, `ʧ`) are **never emitted** by this pipeline (measured: no capital letter and no `ʤ` `ʧ` in any output).
* **Stress marks** `ˈ` (primary) and `ˌ` (secondary) come **before the stressed vowel**, inside the word; **length** `ː` follows the vowel it lengthens (`iː`, `ɔː`, `ɑː`). They are not sounds.
* The "g" is `ɡ` **U+0261** (LATIN SMALL LETTER SCRIPT G), not the ASCII letter `g`. The flap is `ɾ` (water: `wˈɔːɾɚ`); `ɚ` is the r-coloured schwa (American), `ɹ` is the English r.
* **British voices (`b…`) differ from American ones in the string** (measured, same sentences): `əʊ` instead of `oʊ` (`həlˈəʊ`), `ɒ` instead of `ɑ` or `ʌ` (`ɒv`, `lˈɒt`), no `ɹ` after a vowel (`ʃˈɔːt`, not `ʃˈɔːɹt`; `wˈɔːtə`, not `wˈɔːɾɚ`), `ə` where American has `ɚ`, `iə` for `ɪɹ` (`nˈiə`), and `a` in `sˈampəl`.
  All of those symbols are in the model's vocabulary, so a mouth table that knows them for both voices needs no special case for the language.
* It gives **no times**. Chunks are sentences (split at sentence ends and at long sentences), and the model decides its own timing.

## 2. The symbols measured (8 texts, voices af_heart and bf_emma): 50 distinct characters

` !,.:;?abdefhijklmnopstuvwzæðŋɐɑɒɔəɚɛɜɡɪɹɾʃʊʌʒˈˌːθ` (the first is the space). **Every one of them is in the model's vocabulary** (no character was dropped).
Not exhaustive: other texts can make eSpeak NG emit other symbols. **The model's tokenizer silently deletes any character that is not in its vocabulary** (the normalizer is a regular expression
that removes everything outside the list in section 4), so such a symbol is simply not spoken; it is not an error.

## 3. The substitutions the pipeline makes on eSpeak NG's output (read from the code, `postProcessPhonemes`)

`ʲ`→`j`, `r`→`ɹ`, `x`→`k`, `ɬ`→`l`; the word "kokoro" is respelled; a space is put before `hˈʌndɹɪd` ("hundred") when a vowel or `ɹ` or `ː` precedes it; a `z` after a space and before punctuation or the end is
joined to the word; in American voices "ninety" is respelled `…naɪndi`. Nothing else is changed.

## 4. The model's vocabulary (read from `tokenizer.json`, 115 symbols plus the ids 0 to 177 that the model uses)

The last column says whether the symbol appeared in the measurement of section 2. Names are the Unicode names (what the character is), **not** a claim about how Kokoro uses it. What the capital letters
`A I O Q S T W Y` and the arrows `↓ → ↗ ↘` mean to the model, and where they come from, is **not documented in any file this package holds, so it is not stated here**; this pipeline never emits them.

| symbol | code point | id | Unicode name | emitted in the survey |
|---|---|---:|---|---|
| `$` | U+0024 | 0 | dollar sign | no |
| `;` | U+003B | 1 | semicolon | yes |
| `:` | U+003A | 2 | colon | yes |
| `,` | U+002C | 3 | comma | yes |
| `.` | U+002E | 4 | full stop | yes |
| `!` | U+0021 | 5 | exclamation mark | yes |
| `?` | U+003F | 6 | question mark | yes |
| `—` | U+2014 | 9 | em dash | no |
| `…` | U+2026 | 10 | horizontal ellipsis | no |
| `"` | U+0022 | 11 | quotation mark | no |
| `(` | U+0028 | 12 | left parenthesis | no |
| `)` | U+0029 | 13 | right parenthesis | no |
| `“` | U+201C | 14 | left double quotation mark | no |
| `”` | U+201D | 15 | right double quotation mark | no |
| `(space)` | U+0020 | 16 | space | yes |
| `̃` | U+0303 | 17 | combining tilde | no |
| `ʣ` | U+02A3 | 18 | latin small letter dz digraph | no |
| `ʥ` | U+02A5 | 19 | latin small letter dz digraph with curl | no |
| `ʦ` | U+02A6 | 20 | latin small letter ts digraph | no |
| `ʨ` | U+02A8 | 21 | latin small letter tc digraph with curl | no |
| `ᵝ` | U+1D5D | 22 | modifier letter small beta | no |
| `ꭧ` | U+AB67 | 23 | latin small letter ts digraph with retroflex hook | no |
| `A` | U+0041 | 24 | latin capital letter a | no |
| `I` | U+0049 | 25 | latin capital letter i | no |
| `O` | U+004F | 31 | latin capital letter o | no |
| `Q` | U+0051 | 33 | latin capital letter q | no |
| `S` | U+0053 | 35 | latin capital letter s | no |
| `T` | U+0054 | 36 | latin capital letter t | no |
| `W` | U+0057 | 39 | latin capital letter w | no |
| `Y` | U+0059 | 41 | latin capital letter y | no |
| `ᵊ` | U+1D4A | 42 | modifier letter small schwa | no |
| `a` | U+0061 | 43 | latin small letter a | yes |
| `b` | U+0062 | 44 | latin small letter b | yes |
| `c` | U+0063 | 45 | latin small letter c | no |
| `d` | U+0064 | 46 | latin small letter d | yes |
| `e` | U+0065 | 47 | latin small letter e | yes |
| `f` | U+0066 | 48 | latin small letter f | yes |
| `h` | U+0068 | 50 | latin small letter h | yes |
| `i` | U+0069 | 51 | latin small letter i | yes |
| `j` | U+006A | 52 | latin small letter j | yes |
| `k` | U+006B | 53 | latin small letter k | yes |
| `l` | U+006C | 54 | latin small letter l | yes |
| `m` | U+006D | 55 | latin small letter m | yes |
| `n` | U+006E | 56 | latin small letter n | yes |
| `o` | U+006F | 57 | latin small letter o | yes |
| `p` | U+0070 | 58 | latin small letter p | yes |
| `q` | U+0071 | 59 | latin small letter q | no |
| `r` | U+0072 | 60 | latin small letter r | no |
| `s` | U+0073 | 61 | latin small letter s | yes |
| `t` | U+0074 | 62 | latin small letter t | yes |
| `u` | U+0075 | 63 | latin small letter u | yes |
| `v` | U+0076 | 64 | latin small letter v | yes |
| `w` | U+0077 | 65 | latin small letter w | yes |
| `x` | U+0078 | 66 | latin small letter x | no |
| `y` | U+0079 | 67 | latin small letter y | no |
| `z` | U+007A | 68 | latin small letter z | yes |
| `ɑ` | U+0251 | 69 | latin small letter alpha | yes |
| `ɐ` | U+0250 | 70 | latin small letter turned a | yes |
| `ɒ` | U+0252 | 71 | latin small letter turned alpha | yes |
| `æ` | U+00E6 | 72 | latin small letter ae | yes |
| `β` | U+03B2 | 75 | greek small letter beta | no |
| `ɔ` | U+0254 | 76 | latin small letter open o | yes |
| `ɕ` | U+0255 | 77 | latin small letter c with curl | no |
| `ç` | U+00E7 | 78 | latin small letter c with cedilla | no |
| `ɖ` | U+0256 | 80 | latin small letter d with tail | no |
| `ð` | U+00F0 | 81 | latin small letter eth | yes |
| `ʤ` | U+02A4 | 82 | latin small letter dezh digraph | no |
| `ə` | U+0259 | 83 | latin small letter schwa | yes |
| `ɚ` | U+025A | 85 | latin small letter schwa with hook | yes |
| `ɛ` | U+025B | 86 | latin small letter open e | yes |
| `ɜ` | U+025C | 87 | latin small letter reversed open e | yes |
| `ɟ` | U+025F | 90 | latin small letter dotless j with stroke | no |
| `ɡ` | U+0261 | 92 | latin small letter script g | yes |
| `ɥ` | U+0265 | 99 | latin small letter turned h | no |
| `ɨ` | U+0268 | 101 | latin small letter i with stroke | no |
| `ɪ` | U+026A | 102 | latin letter small capital i | yes |
| `ʝ` | U+029D | 103 | latin small letter j with crossed-tail | no |
| `ɯ` | U+026F | 110 | latin small letter turned m | no |
| `ɰ` | U+0270 | 111 | latin small letter turned m with long leg | no |
| `ŋ` | U+014B | 112 | latin small letter eng | yes |
| `ɳ` | U+0273 | 113 | latin small letter n with retroflex hook | no |
| `ɲ` | U+0272 | 114 | latin small letter n with left hook | no |
| `ɴ` | U+0274 | 115 | latin letter small capital n | no |
| `ø` | U+00F8 | 116 | latin small letter o with stroke | no |
| `ɸ` | U+0278 | 118 | latin small letter phi | no |
| `θ` | U+03B8 | 119 | greek small letter theta | yes |
| `œ` | U+0153 | 120 | latin small ligature oe | no |
| `ɹ` | U+0279 | 123 | latin small letter turned r | yes |
| `ɾ` | U+027E | 125 | latin small letter r with fishhook | yes |
| `ɻ` | U+027B | 126 | latin small letter turned r with hook | no |
| `ʁ` | U+0281 | 128 | latin letter small capital inverted r | no |
| `ɽ` | U+027D | 129 | latin small letter r with tail | no |
| `ʂ` | U+0282 | 130 | latin small letter s with hook | no |
| `ʃ` | U+0283 | 131 | latin small letter esh | yes |
| `ʈ` | U+0288 | 132 | latin small letter t with retroflex hook | no |
| `ʧ` | U+02A7 | 133 | latin small letter tesh digraph | no |
| `ʊ` | U+028A | 135 | latin small letter upsilon | yes |
| `ʋ` | U+028B | 136 | latin small letter v with hook | no |
| `ʌ` | U+028C | 138 | latin small letter turned v | yes |
| `ɣ` | U+0263 | 139 | latin small letter gamma | no |
| `ɤ` | U+0264 | 140 | latin small letter rams horn | no |
| `χ` | U+03C7 | 142 | greek small letter chi | no |
| `ʎ` | U+028E | 143 | latin small letter turned y | no |
| `ʒ` | U+0292 | 147 | latin small letter ezh | yes |
| `ʔ` | U+0294 | 148 | latin letter glottal stop | no |
| `ˈ` | U+02C8 | 156 | modifier letter vertical line | yes |
| `ˌ` | U+02CC | 157 | modifier letter low vertical line | yes |
| `ː` | U+02D0 | 158 | modifier letter triangular colon | yes |
| `ʰ` | U+02B0 | 162 | modifier letter small h | no |
| `ʲ` | U+02B2 | 164 | modifier letter small j | no |
| `↓` | U+2193 | 169 | downwards arrow | no |
| `→` | U+2192 | 171 | rightwards arrow | no |
| `↗` | U+2197 | 172 | north east arrow | no |
| `↘` | U+2198 | 173 | south east arrow | no |
| `ᵻ` | U+1D7B | 177 | latin small capital letter i with stroke | no |
