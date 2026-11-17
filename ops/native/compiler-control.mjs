#!/usr/bin/env node
// Adapted from Frank Hinek, MIT License; see compiler-control-LICENSE.txt.
// Upstream: https://github.com/frankhinek/webkit-wasm-compiler-memory-repro
// Revision: 16fb14700468a866bee731666060af274eb91d85
// Pads the largest function bodies of a WebAssembly module past JavaScriptCore's size limit for
// optimizing (OMG) compilation without changing what executes. Each chosen body gets
// `block; br 0; nop x N; end` after its locals; the branch skips the nops.
// JavaScriptCore does not OMG-compile bodies larger than maximumOMGCandidateCost (100,000 bytes).
// Usage:
//   node ops/native/compiler-control.mjs inspect <module.wasm>
//   node ops/native/compiler-control.mjs pad <in.wasm> <out.wasm> [--body=160000]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Each allowed input is an independently pinned artifact. Preparation does not select it for release.
const BASELINES=new Set([
  "065354247ab2a35b58cdfc909bfcf66367b715bee53a0e72856be89ddc235aaa", // Production owner-cleanup runtime.
  "6544e252a008a6d0e6e619ccbc19abce3745196cb3df4a23ac419b4098aeb080", // Source-built development model-owner cleanup control.
  "a772105af5a7a0872e7461f0e33ce36b4dc979d893f651100d85cbbd80d0e6bb",
  "1bf7ed18c5cf0071d5ce2651c952778103c65d75f658b8b9638f2988912ab1b8",
]);

function fail(message) {
  console.error(message);
  process.exit(2);
}
function readLeb(buf, offset) {
  let result = 0,
    shift = 0,
    byte;
  do {
    byte = buf[offset++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, offset];
}
function leb(value) {
  const out = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    out.push(byte);
  } while (value);
  return Buffer.from(out);
}
function sections(buf) {
  if (buf.readUInt32LE(0) !== 0x6d736100 || buf.readUInt32LE(4) !== 1) fail("not a WebAssembly 1.0 module");
  const list = [];
  let offset = 8;
  while (offset < buf.length) {
    const id = buf[offset];
    const [size, start] = readLeb(buf, offset + 1);
    list.push({ id, offset, start, end: start + size });
    offset = start + size;
  }
  return list;
}
function functionImports(buf, section) {
  if (!section) return 0;
  let [count, p] = readLeb(buf, section.start);
  let functions = 0;
  for (let i = 0; i < count; i++) {
    let length;
    [length, p] = readLeb(buf, p);
    p += length;
    [length, p] = readLeb(buf, p);
    p += length;
    const kind = buf[p++];
    if (kind === 0) {
      [, p] = readLeb(buf, p);
      functions++;
    } else if (kind === 1) {
      p++;
      const flags = buf[p++];
      [, p] = readLeb(buf, p);
      if (flags & 1) [, p] = readLeb(buf, p);
    } else if (kind === 2) {
      const flags = buf[p++];
      [, p] = readLeb(buf, p);
      if (flags & 1) [, p] = readLeb(buf, p);
    } else if (kind === 3) p += 2;
    else if (kind === 4) {
      p++;
      [, p] = readLeb(buf, p);
    } else fail(`unsupported import kind ${kind}`);
  }
  return functions;
}
function codeBodies(buf, section) {
  let [count, p] = readLeb(buf, section.start);
  const bodies = [];
  for (let i = 0; i < count; i++) {
    let size;
    [size, p] = readLeb(buf, p);
    bodies.push(Buffer.from(buf.subarray(p, p + size)));
    p += size;
  }
  return bodies;
}
function localsEnd(body) {
  let [groups, p] = readLeb(body, 0);
  for (let i = 0; i < groups; i++) {
    [, p] = readLeb(body, p);
    const type = body[p++];
    if (![0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f].includes(type)) fail(`unsupported local type 0x${type.toString(16)}`);
  }
  return p;
}
const codePayload = (bodies) => Buffer.concat([leb(bodies.length), ...bodies.flatMap((body) => [leb(body.length), body])]);
const replaceSection = (buf, section, payload) =>
  Buffer.concat([buf.subarray(0, section.offset), Buffer.from([section.id]), leb(payload.length), payload, buf.subarray(section.end)]);
const skippedNops = (count) => Buffer.concat([Buffer.from([0x02, 0x40, 0x0c, 0x00]), Buffer.alloc(count, 0x01), Buffer.from([0x0b])]);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// "function" counts imported functions first, as the WebAssembly spec does. "definedFunction"
// excludes them, which is the index JavaScriptCore logs and accepts in its OMG allowlist.
function inspect(buf, count = 6) {
  const list = sections(buf);
  const imports = functionImports(buf, list.find((s) => s.id === 2));
  const bodies = codeBodies(buf, list.find((s) => s.id === 10));
  return {
    importedFunctions: imports,
    definedFunctions: bodies.length,
    largest: bodies
      .map((body, i) => ({ function: imports + i, definedFunction: i, bytes: body.length }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, count),
  };
}

function pad(buf, targets, minimumBody) {
  const list = sections(buf);
  const code = list.find((s) => s.id === 10);
  const bodies = codeBodies(buf, code);
  const changes = [];
  for (const target of targets) {
    const body = bodies[target.definedFunction];
    const split = localsEnd(body);
    const nops = Math.max(0, minimumBody - body.length - 5);
    const padded = Buffer.concat([body.subarray(0, split), skippedNops(nops), body.subarray(split)]);
    changes.push({ ...target, bytes: undefined, beforeBytes: body.length, afterBytes: padded.length });
    bodies[target.definedFunction] = padded;
  }
  return { bytes: replaceSection(buf, code, codePayload(bodies)), changes };
}

function interfaceOf(bytes) {
  const module = new WebAssembly.Module(bytes);
  return JSON.stringify({ imports: WebAssembly.Module.imports(module), exports: WebAssembly.Module.exports(module) });
}

function verifyControl(bytes, manifest) {
  if (sha256(bytes) !== manifest.output.sha256 || bytes.length !== manifest.output.bytes) fail("candidate identity mismatch");
  const code = sections(bytes).find(s => s.id === 10);
  const bodies = codeBodies(bytes, code);
  if (manifest.changes.length !== 51 || new Set(manifest.changes.map(c => c.definedFunction)).size !== 51) fail("expected 51 unique changed bodies");
  for (const change of manifest.changes) {
    const body = bodies[change.definedFunction], split = localsEnd(body);
    const extra = change.afterBytes - change.beforeBytes;
    if (body.length !== 160000 || body.length !== change.afterBytes || extra < 5 || change.beforeBytes <= 20000 || change.beforeBytes > 100000) fail("unexpected body bounds");
    const padding = body.subarray(split, split + extra);
    if (!padding.subarray(0,4).equals(Buffer.from([2,64,12,0])) || padding.at(-1) !== 11 || !padding.subarray(4,-1).every(b => b === 1)) fail("padding is not a branch-skipped nop block");
    bodies[change.definedFunction] = Buffer.concat([body.subarray(0,split),body.subarray(split+extra)]);
  }
  const restored = replaceSection(bytes,code,codePayload(bodies));
  if (sha256(restored) !== manifest.source.sha256 || restored.length !== manifest.source.bytes || !BASELINES.has(manifest.source.sha256)) fail("restored source differs from pinned baseline");
  if (!WebAssembly.validate(bytes) || interfaceOf(restored) !== interfaceOf(bytes)) fail("invalid or changed module interface");
  return {sourceSha256:sha256(restored),candidateSha256:sha256(bytes),changedBodies:51,onlySkippedPadding:true};
}

const [command, ...rest] = process.argv.slice(2);
const positional = rest.filter((arg) => !arg.startsWith("--"));
const options = Object.fromEntries(
  rest.filter((arg) => arg.startsWith("--")).map((arg) => {
    const match = /^--([^=]+)=(\d+)$/.exec(arg);
    if (!match) fail(`unexpected option ${arg}`);
    return [match[1], Number(match[2])];
  }),
);
if (command === "verify" && positional.length === 2) {
  console.log(JSON.stringify(verifyControl(fs.readFileSync(positional[0]), JSON.parse(fs.readFileSync(positional[1],"utf8")))));
} else if (command === "inspect" && positional.length === 1) {
  console.log(JSON.stringify(inspect(fs.readFileSync(positional[0]), options.count ?? 6), null, 2));
} else if (command === "pad" && positional.length === 2) {
  const [input, output] = positional;
  const body = options.body ?? 160_000;
  const original = fs.readFileSync(input);
  if (!BASELINES.has(sha256(original))) fail("compiler control requires a pinned development or clean production baseline");
  const targets = inspect(original, 100000).largest.filter(body => body.bytes > 20000 && body.bytes <= 100000);
  if (targets.length !== 51) fail("expected exactly 51 candidate bodies");
  const padded = pad(original, targets, body);
  if (!WebAssembly.validate(padded.bytes)) fail("padded module does not validate");
  if (interfaceOf(original) !== interfaceOf(padded.bytes)) fail("padding changed imports or exports");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, padded.bytes);
  const manifest = {
    source: { file: path.basename(input), sha256: sha256(original), bytes: original.length },
    output: { file: path.basename(output), sha256: sha256(padded.bytes), bytes: padded.bytes.length },
    paddedBodyBytes: body,
    changes: padded.changes,
    validation: "WebAssembly.validate is true and imports and exports are unchanged (checked in Node)",
  };
  fs.writeFileSync(path.join(path.dirname(output), "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
} else {
  fail("usage: pad-wasm.mjs inspect <module.wasm> | pad-wasm.mjs pad <in.wasm> <out.wasm> [--body=160000]");
}
