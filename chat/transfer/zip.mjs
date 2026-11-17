// Just enough ZIP to pull one file out of a chatbot data export (stored or deflate entries). Browsers inflate with DecompressionStream.
const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function listEntries(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This does not look like a ZIP file.");
  const count = u16(bytes, eocd + 10); let p = u32(bytes, eocd + 16); const entries = [];
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("The ZIP file is damaged.");
    const method = u16(bytes, p + 10), size = u32(bytes, p + 20), nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32), local = u32(bytes, p + 42);
    entries.push({ name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)), method, compressedSize: size, offset: local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readEntry(bytes, entry, inflate = defaultInflate) {
  const p = entry.offset;
  if (u32(bytes, p) !== 0x04034b50) throw new Error("The ZIP file is damaged.");
  const start = p + 30 + u16(bytes, p + 26) + u16(bytes, p + 28);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflate(raw);
  throw new Error("This ZIP uses a compression method that is not supported.");
}

async function defaultInflate(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Find conversations.json (any folder) in a data-export ZIP and return its text. */
export async function readConversationsJson(bytes, inflate) {
  const entry = listEntries(bytes).find((e) => /(^|\/)conversations\.json$/i.test(e.name));
  if (!entry) throw new Error("conversations.json was not found inside the ZIP.");
  return new TextDecoder().decode(await readEntry(bytes, entry, inflate));
}
