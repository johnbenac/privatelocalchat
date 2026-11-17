// Bundle the voice workers (worker.js for Kitten, worker-kokoro.js for Kokoro) into chat/vendor/voice/ and copy the ONNX Runtime Web files it needs (plain SIMD threaded build only).
//   cd ops/voice && npm ci --ignore-scripts && cd ../.. && node ops/voice/build-worker.mjs
// esbuild is a dev dependency of ops/voice only; nothing in the app runtime imports it. Prints the SHA-256 of every produced file, which
// docs/VOICE-RUNTIME.md records. The build is deterministic for the pinned versions (ops/voice/package-lock.json).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = process.env.VOICE_NODE_MODULES || path.join(here, "node_modules");
if (!fs.existsSync(path.join(nm, "esbuild"))) throw new Error(`no esbuild in ${nm}: run "npm ci --ignore-scripts" in ops/voice first`);
const out = path.join(here, "../../chat/vendor/voice");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const { build } = await import(pathToFileURL(path.join(nm, "esbuild/lib/main.js")).href);
const common = {
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, treeShaking: true, legalComments: "linked",
  nodePaths: [nm],
  // the variant of onnxruntime-web that loads its WASM files from wasmPaths instead of inlining the loader
  conditions: ["onnxruntime-web-use-extern-wasm"],
  external: ["node:*", "fs", "path", "worker_threads", "os", "crypto"],
  logLevel: "info",
};
// the bundles contain GPL code, so they say so themselves (the minifier would otherwise drop every notice)
await build({
  ...common,
  entryPoints: [path.join(here, "worker.src.mjs")],
  outfile: path.join(out, "worker.js"),
  banner: { js: "/*! chat/vendor/voice/worker.js bundles eSpeak NG (GPL-3.0-or-later, https://github.com/espeak-ng/espeak-ng, via the npm package phonemizer 1.2.1), ONNX Runtime Web (MIT) and fflate (MIT). Private Local Chat is released under the GNU General Public License v3; see LICENSE and THIRD-PARTY-NOTICES.md. Rebuild: docs/VOICE-RUNTIME.md */" },
});
await build({
  ...common,
  entryPoints: [path.join(here, "worker-kokoro.src.mjs")],
  outfile: path.join(out, "worker-kokoro.js"),
  banner: { js: "/*! chat/vendor/voice/worker-kokoro.js bundles eSpeak NG (GPL-3.0-or-later, https://github.com/espeak-ng/espeak-ng, via the npm package phonemizer 1.2.1) and ONNX Runtime Web (MIT), and ports the text pipeline of kokoro-js (Apache-2.0). Private Local Chat is released under the GNU General Public License v3; see LICENSE and THIRD-PARTY-NOTICES.md. Rebuild: docs/VOICE-RUNTIME.md */" },
});

const dist = path.join(nm, "onnxruntime-web/dist");
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) fs.copyFileSync(path.join(dist, f), path.join(out, f));

const read = (p) => JSON.parse(fs.readFileSync(path.join(nm, p, "package.json"), "utf8"));
const ort = read("onnxruntime-web"), phonemizer = read("phonemizer"), fflate = read("fflate");
fs.writeFileSync(path.join(out, "VERSIONS.json"), JSON.stringify({
  onnxruntimeWeb: ort.version, onnxruntimeLicense: ort.license,
  phonemizer: phonemizer.version, phonemizerLicense: phonemizer.license, phonemizerEmbeds: "espeak-ng (GPL-3.0)",
  fflate: fflate.version, fflateLicense: fflate.license,
  model: "KittenML/kitten-tts-nano-0.8-int8", modelLicense: "Apache-2.0",
}, null, 2) + "\n");

fs.writeFileSync(path.join(out, "VERSIONS-kokoro.json"), JSON.stringify({
  onnxruntimeWeb: ort.version, onnxruntimeLicense: ort.license,
  phonemizer: phonemizer.version, phonemizerLicense: phonemizer.license, phonemizerEmbeds: "espeak-ng (GPL-3.0)",
  pipelinePortedFrom: "kokoro-js 1.2.1 (Apache-2.0)",
  model: "onnx-community/Kokoro-82M-v1.0-ONNX (model_quantized.onnx)", modelLicense: "Apache-2.0",
}, null, 2) + "\n");

// The .LEGAL.txt next to each worker: esbuild's linked comments, then the full notices of every package bundled into that worker.
// Licence texts are read from the npm packages (phonemizer, fflate); onnxruntime-web ships none, so its MIT text is the committed copy
// of microsoft/onnxruntime at the tag of the pinned version (ops/voice/licenses/).
const text = (p) => fs.readFileSync(p, "utf8").replace(/\s+$/, "") + "\n";
const rule = (title) => `\n\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}\n\n`;
const espeakNotice = (worker) => `${worker} contains eSpeak NG (https://github.com/espeak-ng/espeak-ng), compiled to JavaScript/WebAssembly and
distributed inside the npm package phonemizer ${phonemizer.version}. eSpeak NG is licensed under the GNU General Public License,
version 3 or later (the project README: "eSpeak NG Text-to-Speech is released under the GPL version 3 or later license.").

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published
by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The full licence text is served with this app at /LICENSE (the file LICENSE of the repository). Private Local Chat as a whole is
released under GPL-3.0.

Corresponding source:
  - eSpeak NG:        https://github.com/espeak-ng/espeak-ng
  - this program, including the script that rebuilds ${worker}:
                      https://github.com/johnbenac/privatelocalchat (ops/voice, docs/VOICE-RUNTIME.md)
Other notices and the data licences: /THIRD-PARTY-NOTICES.md
`;
function writeLegal(worker, packages) {
  const parts = [text(path.join(out, worker + ".LEGAL.txt"))];
  parts.push(rule("eSpeak NG (GPL-3.0-or-later)") + espeakNotice(worker));
  for (const [title, file] of packages) parts.push(rule(title) + text(file));
  fs.writeFileSync(path.join(out, worker + ".LEGAL.txt"), parts.join(""));
}
const ortEntry = [`ONNX Runtime Web ${ort.version} (${ort.license}), LICENSE of https://github.com/microsoft/onnxruntime at tag v${ort.version}`, path.join(here, "licenses", `onnxruntime-${ort.version}-LICENSE.txt`)];
const phonemizerEntry = [`phonemizer ${phonemizer.version} (${phonemizer.license}), npm package file LICENSE`, path.join(nm, "phonemizer/LICENSE")];
const fflateEntry = [`fflate ${fflate.version} (${fflate.license}), npm package file LICENSE`, path.join(nm, "fflate/LICENSE")];
writeLegal("worker.js", [ortEntry, fflateEntry, phonemizerEntry]);
writeLegal("worker-kokoro.js", [ortEntry, phonemizerEntry]);

for (const f of fs.readdirSync(out).sort()) {
  const bytes = fs.readFileSync(path.join(out, f));
  console.log(`${crypto.createHash("sha256").update(bytes).digest("hex")}  ${bytes.length}  ${f}`);
}
