// SPDX-License-Identifier: AGPL-3.0-only
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { validateFiles } from "./engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const voice = path.resolve(here, "..");
const repo = path.resolve(voice, "../..");
const require = createRequire(path.join(voice, "package.json"));
const { build } = require("esbuild");
const ortDir = path.resolve(path.dirname(require.resolve("onnxruntime-web")), "..");
const ortManifest = path.join(ortDir, "package.json");
const { version: ortVersion, license: ortLicense } = require(ortManifest);
const { version: esbuildVersion } = require("esbuild/package.json");
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

if (process.argv.length !== 3) throw new Error("Usage: build.mjs <new output directory>");
const out = path.resolve(process.argv[2]);
const worker = "worker-ears-standalone.js";
const wasm = "ort-wasm-simd-threaded.wasm";
const manifest = readJson(path.join(here, "ears-files.json"));
validateFiles(manifest.base, manifest.files);
const runtime = fs.readFileSync(path.join(ortDir, "dist", wasm));
const runtimePin = { path: wasm, bytes: runtime.length, sha256: sha(runtime) };
const ortNotice = `onnxruntime-${ortVersion}-LICENSE.txt`;
const license = fs.existsSync(path.join(voice, "LICENSE")) ? path.join(voice, "LICENSE") : path.join(repo, "LICENSE");

// Claim a new output directory exclusively so concurrent builds cannot interleave.
fs.mkdirSync(out);
const write = (relative, data) => {
  const dest = path.join(out, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
};
const copy = (source, dest) => write(dest, fs.readFileSync(source));
const json = (name, data) => write(name, JSON.stringify(data, null, 2) + "\n");

const options = {
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
  banner: { js: "// SPDX-License-Identifier: AGPL-3.0-only" },
};
await build({
  ...options, entryPoints: [path.join(here, "worker.src.mjs")], outfile: path.join(out, worker),
  external: ["node:*"], legalComments: "linked",
});
await build({
  ...options, entryPoints: [path.join(here, "engine.mjs")], outfile: path.join(out, "ears-engine.mjs"),
  define: { EARS_WASM_PIN: JSON.stringify(runtimePin) },
});
write(wasm, runtime);
copy(license, "LICENSE");
copy(license, "source/LICENSE");
copy(path.join(voice, "licenses", ortNotice), `licences/${ortNotice}`);
copy(path.join(voice, "licenses", ortNotice), `source/licenses/${ortNotice}`);
for (const name of ["whisper-weights-LICENSE.txt", "openai-whisper-LICENSE.txt"]) {
  copy(path.join(here, name), `licences/${name}`);
  copy(path.join(here, name), `source/ears/${name}`);
}
for (const name of ["engine.mjs", "worker.src.mjs", "whisper.mjs", "build.mjs", "ears-files.json"]) {
  copy(path.join(here, name), `source/ears/${name}`);
}
for (const name of ["package.json", "package-lock.json", "standalone/engine.mjs"]) {
  copy(path.join(voice, name), `source/${name}`);
}
copy(path.join(here, "ears-files.json"), "ears-files.json");
json("VERSIONS.json", {
  onnxruntimeWeb: ortVersion, onnxruntimeLicense: ortLicense, esbuild: esbuildVersion,
  model: manifest.model.id, modelRevision: manifest.model.sourceRevision,
  modelLicense: manifest.model.license, packageLicense: "AGPL-3.0-only",
});

write("README.md", `# Ears standalone

Ears transcribes English utterances of 0.3–30 seconds as 16 kHz mono Float32, using
Whisper tiny.en on the device in a single-threaded ONNX Runtime Web worker.

\`\`\`js
import { createEarsEngine } from "./ears-engine.mjs";
const engine = createEarsEngine({
  workerUrl: new URL("./${worker}", import.meta.url).href,
});
engine.init({ base: modelBase, files: manifest.files }); // manifest from ears-files.json
await engine.load({ signal, onProgress });
const { text, ms } = await engine.transcribe(samples, { signal });
\`\`\`

Host this folder on the page origin. Provide the immutable CDN base in place of
the placeholder in ears-files.json. Serve the decoder with Content-Encoding gzip
and expose Content-Encoding through CORS so the decoder's served representation
fits under 24 MiB. The file pins describe the decoded bytes. Serve the WASM with
application/wasm and the worker and modules with a JavaScript MIME type.
For a cross-origin model host, allow its origin in the page's connect-src.
The worker bundles the runtime JavaScript and gets the verified model and WASM
bytes from the main thread.

cancel() rejects the active transcription with aborted. Decoder cancellation is
cooperative between tokens. unload() terminates the worker and retains the
initialised file list and verified download cache. load() reports the actual
thread count, which is one.

Build from this folder's source with npm ci --ignore-scripts in source, then
node source/ears/build.mjs <new output directory>. PINS.json lists the model and
package sizes and hashes. SHA256SUMS checks the shipped files. See licences/ for
the ONNX Runtime and Whisper notices.
`);

const files = fs.readdirSync(out, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(out, path.join(entry.parentPath ?? entry.path, entry.name)))
  .sort()
  .map((name) => {
    const data = fs.readFileSync(path.join(out, name));
    if (data.length > 24 * 1024 * 1024) throw new Error(`Package file too large: ${name}`);
    return { path: name, bytes: data.length, sha256: sha(data) };
  });
json("PINS.json", {
  format: "ears-engine-pins/1", package: "ears-engine", files,
  downloadedByThePage: { base: manifest.base, files: manifest.files },
});
const sums = files.map((file) => `${file.sha256}  ${file.path}`).join("\n") + "\n";
write("SHA256SUMS", sums);
process.stdout.write(sums);
