// Passphrase protection with the browser's own WebCrypto: PBKDF2-SHA-256 -> AES-256-GCM. Nothing is sent anywhere.
// There is no recovery: a forgotten passphrase cannot be reset (that is what makes it a lock).

export const BACKUP_FORMAT = "plc-encrypted-backup/1";
export const DEFAULT_ITERATIONS = 600_000;
const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const toB64 = (bytes) => { let s = ""; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations) {
  const material = await subtle().importKey("raw", enc.encode(String(passphrase).normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** -> a JSON-safe envelope. `meta` is authenticated (changing it makes decryption fail) but not secret. */
export async function encryptString(plaintext, passphrase, { iterations = DEFAULT_ITERATIONS, meta = {} } = {}) {
  if (!passphrase) throw new Error("A passphrase is required.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const aad = enc.encode(JSON.stringify(meta));
  const data = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, enc.encode(plaintext));
  return { format: BACKUP_FORMAT, kdf: "PBKDF2-SHA256", iterations, salt: toB64(salt), iv: toB64(iv), meta, data: toB64(data) };
}

export async function decryptString(envelope, passphrase) {
  if (!envelope || envelope.format !== BACKUP_FORMAT) throw new Error("This is not an encrypted backup from this app.");
  if (!Number.isInteger(envelope.iterations) || envelope.iterations < 1000 || envelope.iterations > 5_000_000) throw new Error("The backup file is damaged.");
  try {
    const key = await deriveKey(passphrase, fromB64(envelope.salt), envelope.iterations);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv), additionalData: enc.encode(JSON.stringify(envelope.meta ?? {})) }, key, fromB64(envelope.data));
    return dec.decode(plain);
  } catch { throw Object.assign(new Error("That passphrase did not unlock the backup, or the file was changed."), { code: "bad-passphrase" }); }
}

export const isEncryptedBackup = (data) => Boolean(data && typeof data === "object" && data.format === BACKUP_FORMAT);

// ---- app lock ---------------------------------------------------------------------------------------------------------
const CHECK = "plc-lock-ok";
export async function createLock(passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
  const env = await encryptString(CHECK, passphrase, { iterations, meta: { purpose: "lock" } });
  return { v: 1, salt: env.salt, iv: env.iv, iterations: env.iterations, data: env.data };
}
export async function verifyLock(lock, passphrase) {
  try { return (await decryptString({ format: BACKUP_FORMAT, meta: { purpose: "lock" }, ...lock }, passphrase)) === CHECK; } catch { return false; }
}
/** Seconds to wait after repeated wrong passphrases: 0 for the first four, then 2, 4, 8 ... up to 60. */
export const lockDelaySeconds = (failures) => (failures < 5 ? 0 : Math.min(60, 2 ** (failures - 4)));
