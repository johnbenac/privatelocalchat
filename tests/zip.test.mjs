// scripts/zip.mjs: the reader the operator tools unpack a downloaded release with. It must read what ordinary zip tools and our own writer make,
// and refuse what someone could craft to write outside the destination, fill the disk or pass damaged data off as good.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {deflateRawSync, crc32} from 'node:zlib';
import {listZip, extractZip} from '../scripts/zip.mjs';
import {makeZip, packageRelease} from '../scripts/package-release.mjs';

const scratch = mkdtempSync(path.join(tmpdir(), 'plc-zip-'));
test.after(() => rmSync(scratch, {recursive: true, force: true}));
let counter = 0;
const fresh = (name = 'x') => path.join(scratch, `${name}-${counter++}`);
const put = (bytes) => { const file = fresh('zip') + '.zip'; writeFileSync(file, bytes); return file; };
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const python = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args], {encoding: 'utf8', maxBuffer: 1 << 28});

/** Every file under dir: { 'a/b': {bytes, mode} } */
function tree(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tree(full, base, out);
    else out[path.relative(base, full).split(path.sep).join('/')] = {bytes: readFileSync(full), mode: statSync(full).mode & 0o777};
  }
  return out;
}

/**
 * A zip built byte by byte. entry: {name, data, method (0|8), mode, flags, madeBy (host byte, default 3), attrs (overrides the external attributes),
 * crc, size, compressedSize (override what is declared), localName, localExtra, descriptor (sizes after the data)}.
 */
function craft(entries, {comment = '', directoryOffsetDelta = 0} = {}) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '');
    const method = e.method ?? 0;
    const body = e.body ?? (method === 8 ? deflateRawSync(data) : data);
    const name = Buffer.from(e.name, 'utf8');
    const localName = Buffer.from(e.localName ?? e.name, 'utf8');
    const extra = e.localExtra ?? Buffer.alloc(0);
    const crc = e.crc ?? crc32(data), size = e.size ?? data.length, compressedSize = e.compressedSize ?? body.length;
    const flags = (e.flags ?? 0x0800) | (e.descriptor ? 8 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!e.descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressedSize, 18); local.writeUInt32LE(size, 22); }
    local.writeUInt16LE(localName.length, 26); local.writeUInt16LE(extra.length, 28);
    const tail = e.descriptor ? (() => { const d = Buffer.alloc(16); d.writeUInt32LE(0x08074b50, 0); d.writeUInt32LE(crc, 4); d.writeUInt32LE(compressedSize, 8); d.writeUInt32LE(size, 12); return d; })() : Buffer.alloc(0);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(((e.madeBy ?? 3) << 8) | 20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(flags, 8); head.writeUInt16LE(method, 10);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(compressedSize, 20); head.writeUInt32LE(size, 24); head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(e.attrs ?? (((0o100000 | (e.mode ?? 0o644)) << 16) >>> 0), 38); head.writeUInt32LE(e.offset ?? offset, 42);
    central.push(head, name);
    parts.push(local, localName, extra, body, tail);
    offset += 30 + localName.length + extra.length + body.length + tail.length;
  }
  const directory = Buffer.concat(central);
  const commentBytes = Buffer.from(comment);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset + directoryOffsetDelta, 16); end.writeUInt16LE(commentBytes.length, 20);
  return Buffer.concat([...parts, directory, end, commentBytes]);
}

const refuses = (bytes, pattern, limits) => {
  const dest = fresh('dest');
  assert.throws(() => extractZip(put(bytes), dest, limits), pattern);
  assert.ok(!existsSync(dest) || readdirSync(dest).length === 0, 'nothing is left in the destination after a refusal');
};

// ---- good zips -----------------------------------------------------------------------------------------------------------------------------------------
test('zips made by makeZip extract to the same bytes and modes', () => {
  const noise = Buffer.concat(Array.from({length: 128}, (_, i) => createHash('sha256').update('n' + i).digest()));
  const input = {
    'f/empty': {bytes: Buffer.alloc(0), mode: 0o644},
    'f/ünï/名前.txt': {bytes: Buffer.from('unicode name'), mode: 0o644},
    'f/deflates.txt': {bytes: Buffer.from('abc'.repeat(5000)), mode: 0o644},
    'f/noise.bin': {bytes: noise, mode: 0o644},
    'f/run.mjs': {bytes: Buffer.from('#!/usr/bin/env node\n'), mode: 0o755}
  };
  const bytes = makeZip(Object.entries(input).map(([name, v]) => ({name, data: v.bytes, mode: v.mode})), 1762927272);
  const listed = listZip(bytes);
  assert.deepEqual(listed.map((e) => e.name), Object.keys(input).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  assert.deepEqual(Object.keys(listed[0]).sort(), ['compressedSize', 'crc', 'isDirectory', 'method', 'mode', 'name', 'size']);
  assert.equal(listed.find((e) => e.name === 'f/deflates.txt').method, 8);
  assert.equal(listed.find((e) => e.name === 'f/noise.bin').method, 0);
  const dest = fresh('rt');
  const written = extractZip(put(bytes), dest);
  assert.deepEqual([...written].sort(), Object.keys(input).sort());
  assert.deepEqual(tree(dest), input);
});

test('zips written by Python (deflated, stored, with folder entries) extract correctly', () => {
  const file = fresh('py') + '.zip';
  python(`import sys,zipfile
z=zipfile.ZipFile(sys.argv[1],"w")
z.writestr(zipfile.ZipInfo("d/"),"")
i=zipfile.ZipInfo("d/a.txt");i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,"hello "*400)
i=zipfile.ZipInfo("d/b.bin");i.compress_type=zipfile.ZIP_STORED;i.external_attr=0o100755<<16;z.writestr(i,bytes(range(256)))
i=zipfile.ZipInfo("d/ü.txt");i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,"x")
z.close()`, file);
  const dest = fresh('py-out');
  extractZip(file, dest);
  const t = tree(dest);
  assert.deepEqual(Object.keys(t).sort(), ['d/a.txt', 'd/b.bin', 'd/ü.txt']);
  assert.equal(t['d/a.txt'].bytes.toString(), 'hello '.repeat(400));
  assert.deepEqual(t['d/b.bin'].bytes, Buffer.from(Array.from({length: 256}, (_, i) => i)));
  assert.deepEqual([t['d/a.txt'].mode, t['d/b.bin'].mode], [0o644, 0o755]);
});

test('a zip with sizes after the data (a data descriptor), written by Python to a stream that cannot seek, extracts correctly', () => {
  const file = fresh('stream') + '.zip';
  python(`import sys,zipfile
class W:
  def __init__(s,f): s.f=f
  def write(s,b): return s.f.write(b)
  def flush(s): s.f.flush()
f=open(sys.argv[1],"wb")
z=zipfile.ZipFile(W(f),"w",zipfile.ZIP_DEFLATED)
z.writestr("s/one.txt","streamed "*300)
z.writestr("s/two.txt","two")
z.close();f.close()`, file);
  const bytes = readFileSync(file);
  assert.ok(bytes.readUInt16LE(6) & 8, 'the zip really uses data descriptors');
  const dest = fresh('stream-out');
  extractZip(file, dest);
  assert.equal(readFileSync(path.join(dest, 's/one.txt'), 'utf8'), 'streamed '.repeat(300));
  assert.equal(readFileSync(path.join(dest, 's/two.txt'), 'utf8'), 'two');
});

test('flag bit 3, local name/extra lengths that differ from the central ones, folder entries and a zip comment are read correctly', () => {
  const bytes = craft([
    {name: 'dir/', data: ''},
    {name: 'dir/a.txt', data: 'a'.repeat(1000), method: 8, descriptor: true, localExtra: Buffer.alloc(11, 7)},
    {name: 'dir/b.txt', data: 'bee', mode: 0o755}
  ], {comment: 'a comment'});
  const dest = fresh('flags');
  extractZip(put(bytes), dest);
  assert.deepEqual(Object.keys(tree(dest)), ['dir/a.txt', 'dir/b.txt']);
  assert.equal(readFileSync(path.join(dest, 'dir/a.txt'), 'utf8'), 'a'.repeat(1000));
  assert.equal(statSync(path.join(dest, 'dir/b.txt')).mode & 0o777, 0o755);
});

test('a destination folder that exists and is empty is accepted, and missing parents are made', () => {
  const dest = path.join(fresh('empty'), 'deep');
  mkdirSync(path.dirname(dest));
  extractZip(put(craft([{name: 'a/b.txt', data: 'x'}])), dest);
  assert.equal(readFileSync(path.join(dest, 'a/b.txt'), 'utf8'), 'x');
  const empty = fresh('already');
  mkdirSync(empty);
  extractZip(put(craft([{name: 'c.txt', data: 'y'}])), empty);
  assert.equal(readFileSync(path.join(empty, 'c.txt'), 'utf8'), 'y');
});

// ---- the main proof: a real release zip -------------------------------------------------------------------------------------------------------------------
test('a real release zip extracts to exactly what unzip and Python read from it', async () => {
  const work = mkdtempSync(path.join(process.cwd(), '.tmp-zipwork-'));
  try {
    const zip = await packageRelease({target: 'app', version: '0.0.1', commit: HEAD, outDir: fresh('rel'), workDir: work});
    const dest = fresh('real');
    const written = extractZip(zip, dest);
    const reference = JSON.parse(python(`import sys,json,zipfile,hashlib
z=zipfile.ZipFile(sys.argv[1])
print(json.dumps({i.filename:[hashlib.sha256(z.read(i)).hexdigest(),(i.external_attr>>16)&0o777] for i in z.infolist() if not i.is_dir()}))`, zip));
    assert.ok(Object.keys(reference).length > 100, 'a real build has many files');
    assert.deepEqual([...written].sort(), Object.keys(reference).sort());
    const got = tree(dest);
    for (const [name, [sha, mode]] of Object.entries(reference)) {
      assert.equal(createHash('sha256').update(got[name].bytes).digest('hex'), sha, name);
      assert.equal(got[name].mode, mode & 0o100 ? 0o755 : 0o644, name);
    }
    // and the tool most people have
    const some = Object.keys(reference).filter((n) => n.endsWith('/index.html') || n.endsWith('/serve.mjs'));
    assert.ok(some.length >= 2);
    for (const name of some) assert.ok(execFileSync('unzip', ['-p', zip, name], {maxBuffer: 1 << 28}).equals(got[name].bytes), name);
    // a flipped byte in the real zip is caught
    const bad = Buffer.from(readFileSync(zip));
    bad[Math.floor(bad.length / 3)] ^= 0xff;
    refuses(bad, /Entry "|damaged|not a zip/);
  } finally { rmSync(work, {recursive: true, force: true}); }
});

// ---- refusals (each one a negative control) ---------------------------------------------------------------------------------------------------------------
for (const [label, name, rule] of [
  ['an empty name', '', /name is empty/],
  ['an absolute name', '/etc/passwd', /absolute/],
  ['a .. segment', 'a/../../x', /"\.\." path segment/],
  ['a leading ..', '../x', /"\.\." path segment/],
  ['a backslash', 'a\\b.txt', /backslash/],
  ['a NUL', 'a\0b.txt', /NUL/],
  ['a drive letter', 'C:evil.txt', /drive letter/],
  ['a drive letter with a slash', 'c:/evil.txt', /drive letter/]
]) {
  test(`refuses ${label} in a name`, () => refuses(craft([{name: 'ok.txt', data: 'fine'}, {name, data: 'x'}]), new RegExp(`Entry "${name.replace(/[\\.\0]/g, '.')}" is refused.*${rule.source}|Entry "[^"]*" is refused: ${rule.source}`, 's')));
}
test('refuses a name that is not valid UTF-8', () => {
  const bytes = Buffer.from(craft([{name: 'abc', data: 'x'}]));
  bytes[bytes.lastIndexOf('abc')] = 0xff; // the central name
  refuses(bytes, /not valid UTF-8/);
});
test('refuses two entries with the same name, also when one is a folder', () => {
  refuses(craft([{name: 'a.txt', data: '1'}, {name: 'a.txt', data: '2'}]), /Entry "a\.txt" is refused: another entry has the same name/);
  refuses(craft([{name: 'a', data: ''}, {name: 'a/', data: ''}]), /another entry has the same name/);
});
test('refuses a symbolic link', () => {
  refuses(craft([{name: 'link', data: '/etc/passwd', attrs: ((0o120777 << 16) >>> 0)}]), /Entry "link" is refused: it is a symbolic link/);
});
test('a file whose attributes say symlink from a non-unix host is not mistaken for one', () => {
  const dest = fresh('dos');
  extractZip(put(craft([{name: 'plain.txt', data: 'x', madeBy: 0, attrs: ((0o120777 << 16) >>> 0)}])), dest);
  assert.equal(readFileSync(path.join(dest, 'plain.txt'), 'utf8'), 'x');
  assert.equal(statSync(path.join(dest, 'plain.txt')).mode & 0o777, 0o644);
});
test('refuses compression methods other than stored and deflate', () => {
  for (const method of [1, 9, 12, 14, 93, 99]) refuses(craft([{name: 'm.bin', data: 'x', method, body: Buffer.from('x')}]), new RegExp(`Entry "m\\.bin" is refused: it uses compression method ${method}`));
});
test('refuses an encrypted entry', () => {
  refuses(craft([{name: 'secret.txt', data: 'x', flags: 0x0801}]), /Entry "secret\.txt" is refused: it is encrypted/);
  refuses(craft([{name: 'secret.txt', data: 'x', flags: 0x0840}]), /it is encrypted/);
});
test('refuses zip64: a 0xFFFFFFFF size or offset, or a zip64 end record', () => {
  refuses(craft([{name: 'big', data: 'x', size: 0xffffffff}]), /Entry "big" is refused: it needs zip64/);
  refuses(craft([{name: 'big', data: 'x', compressedSize: 0xffffffff}]), /needs zip64/);
  refuses(craft([{name: 'big', data: 'x', offset: 0xffffffff}]), /needs zip64/);
  const plain = craft([{name: 'a', data: 'x'}]);
  const end = plain.length - 22;
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  refuses(Buffer.concat([plain.subarray(0, end), locator, plain.subarray(end)]), /Zip64/);
  const counted = Buffer.from(plain);
  counted.writeUInt16LE(0xffff, end + 10);
  refuses(counted, /Zip64/);
});
test('refuses more entries than the limit, and more declared bytes than the limit', () => {
  const many = craft(Array.from({length: 6}, (_, i) => ({name: `f${i}`, data: 'x'})));
  refuses(many, /6 entries, more than the limit of 5/, {maxEntries: 5});
  assert.equal(listZip(many, {maxEntries: 6}).length, 6);
  const sized = craft([{name: 'a', data: 'x'.repeat(600)}, {name: 'b', data: 'x'.repeat(600)}]);
  refuses(sized, /more than 1000 bytes \(stopped at "b"\)/, {maxTotalBytes: 1000});
  assert.equal(listZip(sized, {maxTotalBytes: 1200}).length, 2);
  assert.equal(listZip(sized).length, 2, 'the defaults allow it');
});
test('refuses an entry that is larger than it declares, without inflating more than declared', () => {
  const bomb = 'a'.repeat(5_000_000);
  const bytes = craft([{name: 'bomb.txt', data: bomb, method: 8, size: 10}]);
  assert.ok(bytes.length < 20_000, 'the zip is small');
  refuses(bytes, /Entry "bomb\.txt" is refused: it inflates to more than the 10 bytes it declares/);
});
test('refuses an entry that is smaller than it declares, and a stored one whose sizes differ', () => {
  refuses(craft([{name: 's.txt', data: 'abc', method: 8, size: 1000}]), /Entry "s\.txt" is refused: it inflates to 3 bytes but declares 1000/);
  refuses(craft([{name: 's.txt', data: 'abc', method: 0, size: 2}]), /stored but its two sizes differ/);
});
test('refuses a wrong CRC-32', () => {
  refuses(craft([{name: 'c.txt', data: 'abc', crc: crc32(Buffer.from('abd'))}]), /Entry "c\.txt" is refused: its CRC-32 does not match/);
  refuses(craft([{name: 'c.txt', data: 'abc'.repeat(50), method: 8, crc: 1}]), /CRC-32 does not match/);
});
test('refuses a flipped byte in stored data (the CRC catches it)', () => {
  const bytes = Buffer.from(craft([{name: 'c.txt', data: 'hello world'}]));
  bytes[bytes.indexOf('hello world') + 3] ^= 1;
  refuses(bytes, /CRC-32 does not match/);
});
test('refuses damaged deflate data', () => {
  const bytes = Buffer.from(craft([{name: 'd.txt', data: 'q'.repeat(2000), method: 8, body: Buffer.alloc(8, 0xff), size: 2000}]));
  refuses(bytes, /Entry "d\.txt" is refused: its compressed data is damaged/);
});
test('refuses a folder entry that declares content', () => {
  refuses(craft([{name: 'd/', data: 'content'}]), /Entry "d\/" is refused: it is a folder but declares content/);
});
test('refuses a local header that names another file, or is missing, or whose data runs past the file', () => {
  refuses(craft([{name: 'a.txt', data: 'x', localName: 'b.txt'}]), /Entry "a\.txt" is refused: its local header names another file/);
  refuses(craft([{name: 'a.txt', data: 'x', offset: 7}]), /Entry "a\.txt" is refused: its local header is missing/);
  refuses(craft([{name: 'a.txt', data: 'xyz', compressedSize: 999, size: 999}]), /data runs past the end of the file/);
});
test('refuses a file that is cut short, and a real zip that is truncated', () => {
  const whole = craft([{name: 'a.txt', data: 'x'.repeat(100), method: 8}, {name: 'b.txt', data: 'y'}]);
  for (const cut of [1, 10, 22, 60, whole.length - 30]) refuses(whole.subarray(0, whole.length - cut), /not a zip file, or it is damaged or cut short|central directory|damaged/);
  const real = makeZip([{name: 'f/a.txt', data: Buffer.from('abc'.repeat(100)), mode: 0o644}], 1762927272);
  refuses(real.subarray(0, real.length - 5), /not a zip file/);
  refuses(real.subarray(10), /damaged|central directory/);
});
test('refuses a central directory that points outside the file', () => {
  refuses(craft([{name: 'a.txt', data: 'x'}], {directoryOffsetDelta: 5000}), /central directory points outside the file/);
  const bytes = Buffer.from(craft([{name: 'a.txt', data: 'x'}]));
  bytes.writeUInt32LE(0xfffffff0, bytes.length - 22 + 12);
  refuses(bytes, /central directory points outside the file/);
});
test('refuses a zip that says it has more entries than its directory holds', () => {
  const bytes = Buffer.from(craft([{name: 'a.txt', data: 'x'}]));
  bytes.writeUInt16LE(3, bytes.length - 22 + 8); bytes.writeUInt16LE(3, bytes.length - 22 + 10);
  refuses(bytes, /damaged/);
});
test('refuses a destination that is not empty, or is a file, and leaves what was there alone', () => {
  const zip = put(craft([{name: 'new.txt', data: 'n'}]));
  const dest = fresh('busy');
  mkdirSync(dest);
  writeFileSync(path.join(dest, 'mine.txt'), 'mine');
  assert.throws(() => extractZip(zip, dest), /is not empty/);
  assert.deepEqual(readdirSync(dest), ['mine.txt']);
  const file = fresh('afile');
  writeFileSync(file, 'x');
  assert.throws(() => extractZip(zip, file), /not a folder/);
  assert.equal(readFileSync(file, 'utf8'), 'x');
});
test('refuses what is not a zip: garbage, an empty buffer, an empty file', () => {
  assert.throws(() => listZip(Buffer.alloc(0)), /not a zip file/);
  assert.throws(() => listZip(Buffer.from('this is definitely not a zip file, just some text that is long enough')), /not a zip file/);
  assert.throws(() => listZip(Buffer.alloc(100000, 0x50)), /not a zip file/);
  refuses(Buffer.alloc(0), /not a zip file/);
});
test('cleans up after a refusal in the middle: earlier files and folders are removed, a destination that was there stays', () => {
  const bytes = craft([
    {name: 'a/one.txt', data: '1'}, {name: 'a/b/two.txt', data: '2'}, {name: 'z/three.txt', data: 'abc', crc: 5}
  ]);
  const dest = fresh('mid');
  assert.throws(() => extractZip(put(bytes), dest), /Entry "z\/three\.txt" is refused: its CRC-32/);
  assert.ok(!existsSync(dest), 'a destination the call made is removed whole');
  const there = fresh('mid-there');
  mkdirSync(there);
  assert.throws(() => extractZip(put(bytes), there), /three\.txt/);
  assert.ok(existsSync(there) && readdirSync(there).length === 0, 'an empty destination that was there stays, and is empty again');
});
test('cleans up when two entries clash as a file and a folder', () => {
  const dest = fresh('clash');
  assert.throws(() => extractZip(put(craft([{name: 'x', data: '1'}, {name: 'x/y', data: '2'}])), dest));
  assert.ok(!existsSync(dest) || readdirSync(dest).length === 0);
});

test('the table CRC-32 used on a Node without zlib.crc32 gives the same result as the built-in', async () => {
  const {crc32Table, crc32} = await import('../scripts/zip.mjs');
  const {crc32: builtin} = await import('node:zlib');
  assert.equal(typeof crc32, 'function');
  const samples = [Buffer.alloc(0), Buffer.from('a'), Buffer.from('The quick brown fox jumps over the lazy dog'), Buffer.from(Array.from({length: 70000}, (_, i) => (i * 31 + 7) & 0xff))];
  for (const data of samples) assert.equal(crc32Table(data), builtin(data), 'length ' + data.length);
  assert.equal(crc32Table(Buffer.from('123456789')), 0xcbf43926, 'the standard check value');
});
