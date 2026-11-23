// Reads the INDEX of an uncompressed tar (ustar, GNU long names, pax path/size records) through one function, `readRange(start, length) => Promise<Uint8Array>`: Node passes a file
// handle read, a browser passes `blob.slice(start, start + length).arrayBuffer()`, so the page and the command line read an archive with the same code and cannot disagree.
// Nothing is unpacked here. The index says what the archive holds, and what it must not hold: a name seen twice, a link or other non-regular member, a name that leaves the folder.
const MAX_EXTENSION = 1 << 20;   // a long name or pax record larger than 1 MiB is not a name
const text = (b) => new TextDecoder().decode(b);
const cut = (b) => { const i = b.indexOf(0); return text(i < 0 ? b : b.subarray(0, i)); };
const octal = (b) => parseInt(cut(b).trim() || "0", 8);

/** A name an extractor must never be handed: absolute, a drive letter, a backslash, a NUL, an empty, "." or ".." segment. */
export function isUnsafeName(name) {
  return typeof name !== "string" || name === "" || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\\") || name.includes("\0") || name.split("/").some((s, i, a) => s === ".." || s === "." || (s === "" && i !== a.length - 1));
}

/** => {members: [{name, offset, bytes}], duplicateMembers: [name], linked: [name], unsafeNames: [name]}; names are as stored, a leading "./" removed. */
export async function readTarIndex(readRange, size, { signal = null } = {}) {
  const members = [], seen = new Set(), dup = new Set(), linked = [], unsafe = [];
  let pos = 0, longName = null, pax = {};
  while (pos + 512 <= size) {
    signal?.throwIfAborted?.();
    const hdr = await readRange(pos, 512); pos += 512;
    if (hdr.every((x) => x === 0)) break;
    const type = String.fromCharCode(hdr[156] || 48);
    let n = octal(hdr.subarray(124, 136));
    let name = cut(hdr.subarray(0, 100)); const prefix = cut(hdr.subarray(345, 500)); if (prefix) name = prefix + "/" + name;
    if (!Number.isFinite(n) || n < 0) throw new RangeError("tar header with an unreadable size");
    if (type === "L" || type === "x" || type === "g") {
      // an extension record is read whole: refuse an absurd one BEFORE reading anything (a header may claim any size)
      if (n > MAX_EXTENSION || pos + n > size) throw new RangeError(`tar extension record of ${n} bytes is larger than allowed or past the end of the archive`);
      const body = await readRange(pos, n);
      if (type === "L") longName = cut(body);
      else if (type === "x") for (const m of text(body).matchAll(/(\d+) (\w+)=([^\n]*)\n/g)) pax[m[2]] = m[3];
      pos += Math.ceil(n / 512) * 512; continue;
    }
    if (pax.size !== undefined) { n = Number(pax.size); if (!Number.isFinite(n) || n < 0) throw new RangeError("tar pax size record is not a size"); }
    const final = (pax.path ?? longName ?? name).replace(/^(\.\/)+/, "");
    if (type === "0" || type === "\0") {
      if (pos + n > size) throw new RangeError(`tar member ${final} runs past the end of the archive`);
      if (isUnsafeName(final)) unsafe.push(final);
      if (seen.has(final)) dup.add(final); seen.add(final);
      members.push({ name: final, offset: pos, bytes: n });
    } else if (type !== "5") linked.push   /* sparse (S), links (1, 2), devices and fifos */(final === "" ? "." : final);   // hard link, symbolic link, device, fifo ...: never followed, always reported
    longName = null; pax = {};
    pos += Math.ceil(n / 512) * 512;
  }
  const s = (a) => [...new Set(a)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { members, duplicateMembers: s(dup), linked: s(linked), unsafeNames: s(unsafe) };
}
