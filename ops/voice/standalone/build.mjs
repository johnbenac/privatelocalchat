// SPDX-License-Identifier: AGPL-3.0-only
// Builds the standalone Kokoro engine package (docs/VOICE-STANDALONE.md): one folder a page can host and use without Private Local Chat.
//   cd ops/voice && npm ci --ignore-scripts && cd ../.. && node ops/voice/standalone/build.mjs <output folder> [--voices af_heart,am_michael,af_alloy]
// The output folder is wiped and rebuilt. The build is deterministic for the pinned versions (ops/voice/package-lock.json). It prints the SHA-256 of every file it wrote.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const nm = process.env.VOICE_NODE_MODULES || path.join(here, "../node_modules");
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--voices");
if (!out) throw new Error("usage: build.mjs <output folder> [--voices a,b,c]");
const voiceArg = args.indexOf("--voices") >= 0 ? args[args.indexOf("--voices") + 1] : "af_heart,am_michael,af_alloy";
const VOICES = voiceArg.split(",");
if (!fs.existsSync(path.join(nm, "esbuild"))) throw new Error(`no esbuild in ${nm}: run "npm ci --ignore-scripts" in ops/voice first`);

const WORKER = "worker-kokoro-standalone.js";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "licences"), { recursive: true });
fs.mkdirSync(path.join(out, "source"), { recursive: true });

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const ort = readJson(path.join(nm, "onnxruntime-web/package.json")), phonemizer = readJson(path.join(nm, "phonemizer/package.json"));
const pins = readJson(path.join(repo, "ops/cloudflare/voice-models.json")).kokoro_q8;
const owner = readJson(path.join(repo, "package.json"));

// ---- the worker bundle ----
const { build } = await import(pathToFileURL(path.join(nm, "esbuild/lib/main.js")).href);
await build({
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, treeShaking: true, legalComments: "linked", nodePaths: [nm],
  conditions: ["onnxruntime-web-use-extern-wasm"], external: ["node:*", "fs", "path", "worker_threads", "os", "crypto"], logLevel: "info",
  entryPoints: [path.join(here, "worker.src.mjs")], outfile: path.join(out, WORKER),
  banner: { js: `/*! ${WORKER} bundles eSpeak NG (GPL-3.0-or-later, https://github.com/espeak-ng/espeak-ng, via the npm package phonemizer ${phonemizer.version}) and ONNX Runtime Web ${ort.version} (MIT), and the Kokoro pipeline of Private Local Chat (AGPL-3.0-only). Notices and the corresponding source: ${WORKER}.LEGAL.txt and source/ beside this file. */` },
});
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) fs.copyFileSync(path.join(nm, "onnxruntime-web/dist", f), path.join(out, f));
fs.copyFileSync(path.join(here, "engine.mjs"), path.join(out, "kokoro-engine.mjs"));

// ---- the pinned file list (the model files and only the voices asked for) ----
const wanted = new Set(["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json", "config.json", ...VOICES.map((v) => `voices/${v}.bin`)]);
const roleOf = (p) => (p.startsWith("voices/") ? "voice" : p === "onnx/model_quantized.onnx" ? "model" : p.replace(/\.json$/, ""));
const files = pins.files.filter((f) => wanted.has(f.path)).map((f) => ({ path: f.path, role: roleOf(f.path), bytes: f.bytes, sha256: f.sha256 }));
if (files.length !== wanted.size) throw new Error("a requested voice is not in ops/cloudflare/voice-models.json: " + [...wanted].filter((p) => !files.some((f) => f.path === p)).join(", "));
const base = `https://cdn.aiofourown.com/${pins.prefix}`;
fs.writeFileSync(path.join(out, "kokoro-files.json"), JSON.stringify({ format: "kokoro-engine-files/1", model: pins.model, base, files }, null, 2) + "\n");

// ---- notices ----
const text = (p) => fs.readFileSync(p, "utf8").replace(/\s+$/, "") + "\n";
fs.copyFileSync(path.join(repo, "LICENSE"), path.join(out, "LICENSE"));
fs.copyFileSync(path.join(repo, "ops/cloudflare/licenses/kokoro-82m-v1.0-onnx-q8.txt"), path.join(out, "licences/kokoro-82m-v1.0-onnx-q8.txt"));
fs.copyFileSync(path.join(repo, `ops/voice/licenses/onnxruntime-${ort.version}-LICENSE.txt`), path.join(out, `licences/onnxruntime-${ort.version}-LICENSE.txt`));
fs.copyFileSync(path.join(nm, "phonemizer/LICENSE"), path.join(out, "licences/phonemizer-LICENSE.txt"));
const rule = (title) => `\n\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}\n\n`;
const legal = [text(path.join(out, WORKER + ".LEGAL.txt")),
  rule("eSpeak NG (GPL-3.0-or-later)") + `${WORKER} contains eSpeak NG (https://github.com/espeak-ng/espeak-ng), compiled to JavaScript/WebAssembly and distributed inside the npm package
phonemizer ${phonemizer.version}. eSpeak NG is licensed under the GNU General Public License, version 3 or later (the project README: "eSpeak NG Text-to-Speech is released
under the GPL version 3 or later license.").

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The rest of this package (the engine, the worker and the Kokoro pipeline) is released under the GNU Affero General Public License, version 3 only (the file LICENSE). The
GPL-3.0-or-later and AGPL-3.0 licences are compatible (AGPL-3.0 section 13).

Corresponding source: the folder source/ beside this file holds every source file of ${WORKER}, its build script and the lock file of its dependencies; eSpeak NG:
https://github.com/espeak-ng/espeak-ng ; the package phonemizer ${phonemizer.version}: https://github.com/xenova/phonemizer.js ; Private Local Chat: https://github.com/johnbenac/privatelocalchat
(ops/voice/standalone).`,
  rule(`ONNX Runtime Web ${ort.version} (${ort.license}), LICENSE of https://github.com/microsoft/onnxruntime at tag v${ort.version}`) + text(path.join(out, `licences/onnxruntime-${ort.version}-LICENSE.txt`)),
  rule(`phonemizer ${phonemizer.version} (${phonemizer.license}), npm package file LICENSE`) + text(path.join(out, "licences/phonemizer-LICENSE.txt")),
  rule("The Kokoro-82M model files (not part of this folder; fetched by the page)") + "The weights are Apache-2.0; the model card's data notice (CC BY training audio, synthetic audio) is in licences/kokoro-82m-v1.0-onnx-q8.txt.\n"];
fs.writeFileSync(path.join(out, WORKER + ".LEGAL.txt"), legal.join(""));

// ---- the corresponding source ----
for (const [from, to] of [[path.join(here, "worker.src.mjs"), "worker.src.mjs"], [path.join(here, "engine.mjs"), "engine.mjs"], [path.join(here, "build.mjs"), "build.mjs"],
  [path.join(here, "../stream-polyfill.mjs"), "stream-polyfill.mjs"], [path.join(repo, "chat/voice/voice-kokoro.mjs"), "voice-kokoro.mjs"],
  [path.join(here, "../package.json"), "package.json"], [path.join(here, "../package-lock.json"), "package-lock.json"]]) fs.copyFileSync(from, path.join(out, "source", to));
fs.writeFileSync(path.join(out, "VERSIONS.json"), JSON.stringify({
  onnxruntimeWeb: ort.version, onnxruntimeLicense: ort.license, phonemizer: phonemizer.version, phonemizerLicense: phonemizer.license, phonemizerEmbeds: "espeak-ng (GPL-3.0-or-later)",
  pipelinePortedFrom: "kokoro-js 1.2.1 (Apache-2.0)", model: pins.model.id, modelRevision: pins.model.sourceRevision, modelLicense: pins.model.license, voices: VOICES, packageLicense: "AGPL-3.0-only", builtFrom: "ops/voice/standalone of Private Local Chat " + owner.version,
}, null, 2) + "\n");

// ---- the list of what is in the folder, with sizes and hashes; then the README that quotes it ----
const listing = () => fs.readdirSync(out, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => path.relative(out, path.join(d.parentPath ?? d.path, d.name))).filter((p) => !["README.md", "PINS.json", "SHA256SUMS"].includes(p)).sort();
const entries = () => listing().map((p) => { const b = fs.readFileSync(path.join(out, p)); return { path: p, bytes: b.length, sha256: sha(b) }; });
const table = (rows) => ["| file | bytes | SHA-256 |", "|---|---:|---|", ...rows.map((r) => `| \`${r.path}\` | ${r.bytes.toLocaleString("en-US")} | \`${r.sha256}\` |`)].join("\n");
const shipped = entries();
const downloaded = files.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 }));
const dlTotal = downloaded.reduce((n, f) => n + f.bytes, 0);
const readme = fs.readFileSync(path.join(here, "README.template.md"), "utf8")
  .replaceAll("{{SHIPPED}}", table(shipped)).replaceAll("{{DOWNLOADED}}", table(downloaded)).replaceAll("{{DOWNLOAD_TOTAL}}", dlTotal.toLocaleString("en-US"))
  .replaceAll("{{BASE}}", base).replaceAll("{{VOICES}}", VOICES.join(", ")).replaceAll("{{ORT}}", ort.version).replaceAll("{{WORKER}}", WORKER)
  .replaceAll("{{MODEL_ONLY}}", String(dlTotal - files.filter((f) => f.role === "voice").reduce((n, f) => n + f.bytes, 0)));
fs.writeFileSync(path.join(out, "README.md"), readme);
const final = entries().concat([{ path: "README.md", bytes: fs.statSync(path.join(out, "README.md")).size, sha256: sha(fs.readFileSync(path.join(out, "README.md"))) }]).sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(path.join(out, "PINS.json"), JSON.stringify({ format: "kokoro-engine-pins/1", package: "kokoro-engine", files: final, downloadedByThePage: { base, files: downloaded } }, null, 2) + "\n");
fs.writeFileSync(path.join(out, "SHA256SUMS"), final.map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n");
for (const f of final) console.log(`${f.sha256}  ${String(f.bytes).padStart(9)}  ${f.path}`);
