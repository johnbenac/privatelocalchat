// A zip reader that is safe on files someone else made. It needs only Node.js, so it ships in the release zip (docs/RELEASING.md).
//
//   listZip(bytes, limits?)            the entries of a zip, read from its central directory
//   extractZip(zipPath, dir, limits?)  unpacks into a new or empty folder; on any refusal removes what it wrote and throws
//
// Every refusal is an Error whose message names the entry and the rule. Nothing is written outside the destination, nothing is
// inflated beyond the size the entry declares, and every file is checked against its CRC-32 and its declared size.
import {readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync, chmodSync, rmSync} from 'node:fs';
import {inflateRawSync, crc32} from 'node:zlib';
import path from 'node:path';

export const DEFAULT_LIMITS = Object.freeze({maxEntries: 20000, maxTotalBytes: 2 * 1024 ** 3});

const END_SIGNATURE = 0x06054b50, ZIP64_LOCATOR = 0x07064b50, CENTRAL_SIGNATURE = 0x02014b50, LOCAL_SIGNATURE = 0x04034b50;
const NOT_A_ZIP = 'This is not a zip file, or it is damaged or cut short. Download it again and check its checksum.';
const ZIP64 = 'Zip64 archives (files over 4 GB, or more than 65 535 entries) are not supported. Use the release zips from the releases page.';

/** Why `name` may not be used as a path inside the destination, or null. */
function nameProblem(name) {
  if (name === '') return 'its name is empty';
  if (name.includes('\0')) return 'its name contains a NUL character';
  if (name.includes('\\')) return 'its name contains a backslash';
  if (name.startsWith('/')) return 'its name is an absolute path';
  if (/^[A-Za-z]:/.test(name)) return 'its name starts with a drive letter';
  if (name.split('/').includes('..')) return 'its name has a ".." path segment';
  return null;
}

const decoder = new TextDecoder('utf-8', {fatal: true});

/** The entries of the zip in `bytes`: [{name, size, compressedSize, method, crc, mode, isDirectory, ...}]. Throws an Error with a plain message. */
export function listZip(bytes, limits = {}) { return readDirectory(bytes, limits).entries; }

function readDirectory(bytes, limits) {
  const {maxEntries, maxTotalBytes} = {...DEFAULT_LIMITS, ...limits};
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 22) throw new Error(NOT_A_ZIP);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (bytes.readUInt32LE(i) === END_SIGNATURE && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error(NOT_A_ZIP);
  if (end >= 20 && bytes.readUInt32LE(end - 20) === ZIP64_LOCATOR) throw new Error(ZIP64);
  const disk = bytes.readUInt16LE(end + 4), directoryDisk = bytes.readUInt16LE(end + 6);
  const count = bytes.readUInt16LE(end + 10), thisDisk = bytes.readUInt16LE(end + 8);
  const directorySize = bytes.readUInt32LE(end + 12), directoryOffset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error(ZIP64);
  if (disk !== 0 || directoryDisk !== 0 || thisDisk !== count) throw new Error('This zip is split over several files, which is not supported. Use the single-file release zip.');
  if (count > maxEntries) throw new Error(`This zip holds ${count} entries, more than the limit of ${maxEntries}. It is refused as a precaution.`);
  if (directoryOffset + directorySize > end) throw new Error('The zip is damaged: its central directory points outside the file. Download it again.');

  const entries = [], seen = new Set();
  let at = directoryOffset, total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw new Error(`The zip is damaged: central directory entry ${n + 1} is missing or malformed.`);
    const madeBy = bytes.readUInt16LE(at + 4), flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16), compressedSize = bytes.readUInt32LE(at + 20), size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28), extraLength = bytes.readUInt16LE(at + 30), commentLength = bytes.readUInt16LE(at + 32);
    const attributes = bytes.readUInt32LE(at + 38), offset = bytes.readUInt32LE(at + 42);
    if (at + 46 + nameLength + extraLength + commentLength > end) throw new Error(`The zip is damaged: central directory entry ${n + 1} runs past the end of the directory.`);
    const rawName = bytes.subarray(at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    let name;
    try { name = decoder.decode(rawName); } catch { throw new Error(`Entry ${n + 1} is refused: its name is not valid UTF-8.`); }
    const refuse = (why) => new Error(`Entry "${name}" is refused: ${why}.`);
    const problem = nameProblem(name);
    if (problem) throw refuse(problem);
    const isDirectory = name.endsWith('/');
    const key = isDirectory ? name.slice(0, -1) : name;
    if (key === '') throw refuse('its name is empty');
    if (seen.has(key)) throw refuse('another entry has the same name');
    seen.add(key);
    const mode = madeBy >> 8 === 3 ? (attributes >>> 16) & 0xffff : 0;
    if (madeBy >> 8 === 3 && (mode & 0o170000) === 0o120000) throw refuse('it is a symbolic link, which could point outside the destination');
    if (flags & 1 || flags & 0x40) throw refuse('it is encrypted, and encrypted entries are not supported');
    if (method !== 0 && method !== 8) throw refuse(`it uses compression method ${method}; only stored (0) and deflate (8) are supported`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw refuse('it needs zip64, which is not supported');
    if (isDirectory && (size !== 0 || compressedSize !== 0 && method === 0)) throw refuse('it is a folder but declares content');
    total += size;
    if (total > maxTotalBytes) throw new Error(`This zip would unpack to more than ${maxTotalBytes} bytes (stopped at "${name}"). It is refused as a precaution.`);
    // offset and rawName are for the extractor; they are not enumerable, so a listing shows only the documented fields
    entries.push(Object.defineProperties({name, size, compressedSize, method, crc, mode, isDirectory}, {offset: {value: offset}, rawName: {value: rawName}}));
  }
  return {entries, directoryStart: directoryOffset};
}

/** The bytes an entry holds, verified against its declared size and CRC-32. */
function entryData(bytes, entry, directoryStart) {
  const refuse = (why) => new Error(`Entry "${entry.name}" is refused: ${why}.`);
  const at = entry.offset;
  if (at + 30 > directoryStart || bytes.readUInt32LE(at) !== LOCAL_SIGNATURE) throw refuse('its local header is missing, so the zip is damaged');
  const nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28);
  const start = at + 30 + nameLength + extraLength;
  if (!bytes.subarray(at + 30, at + 30 + nameLength).equals(entry.rawName)) throw refuse('its local header names another file, so the zip is damaged');
  if (start + entry.compressedSize > directoryStart) throw refuse('its data runs past the end of the file, so the zip is damaged or cut short');
  const body = bytes.subarray(start, start + entry.compressedSize);
  let data;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) throw refuse('it is stored but its two sizes differ');
    data = body;
  } else {
    try { data = inflateRawSync(body, {maxOutputLength: Math.max(entry.size, 1)}); }
    catch (error) {
      if (error.code === 'ERR_BUFFER_TOO_LARGE') throw refuse(`it inflates to more than the ${entry.size} bytes it declares`);
      throw refuse('its compressed data is damaged');
    }
  }
  if (data.length !== entry.size) throw refuse(`it inflates to ${data.length} bytes but declares ${entry.size}`);
  if (crc32(data) !== entry.crc) throw refuse('its CRC-32 does not match, so the data is damaged');
  return data;
}

/** Unpacks `zipPath` into `destDir` (new, or an empty folder) and returns the relative names of the files written. On a refusal removes what it wrote. */
export function extractZip(zipPath, destDir, limits = {}) {
  const dest = path.resolve(destDir);
  if (existsSync(dest)) {
    if (!statSync(dest).isDirectory()) throw new Error(`${dest} exists and is not a folder. Choose a folder that does not exist yet.`);
    if (readdirSync(dest).length) throw new Error(`${dest} is not empty. Unpack into a folder that does not exist or is empty.`);
  }
  const bytes = readFileSync(zipPath);
  const {entries, directoryStart} = readDirectory(bytes, limits);
  const files = [], folders = [];
  try {
    const first = mkdirSync(dest, {recursive: true});
    if (first) folders.push(first);
    for (const entry of entries) {
      const target = path.resolve(dest, entry.name);
      if (target !== dest && !target.startsWith(dest + path.sep)) throw new Error(`Entry "${entry.name}" is refused: it would be written outside the destination.`);
      if (entry.isDirectory) {
        entryData(bytes, entry, directoryStart); // a folder's own checks (it must declare no content)
        const made = mkdirSync(target, {recursive: true});
        if (made) folders.push(made);
        continue;
      }
      const data = entryData(bytes, entry, directoryStart);
      const made = mkdirSync(path.dirname(target), {recursive: true});
      if (made) folders.push(made);
      try { writeFileSync(target, data, {flag: 'wx'}); }
      catch (error) { throw new Error(`Entry "${entry.name}" cannot be written: ${error.code === 'EEXIST' ? 'a file or folder of that name is already there (two entries clash)' : error.message}.`); }
      files.push(target);
      chmodSync(target, entry.mode & 0o100 ? 0o755 : 0o644);
    }
  } catch (error) {
    for (const file of files) rmSync(file, {force: true});
    for (const folder of folders.reverse()) rmSync(folder, {recursive: true, force: true}); // only folders this call made, now holding only what it wrote
    throw error;
  }
  return files.map((f) => path.relative(dest, f).split(path.sep).join('/'));
}
