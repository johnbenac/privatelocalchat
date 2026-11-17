// Unlock with Face ID, Touch ID or the phone's screen lock: a passkey whose WebAuthn PRF extension gives a secret that only the device's secure hardware can produce
// after the person has been recognised. That secret wraps the vault key (chat/vault/vault.mjs wrapWithSecret), beside the passphrase wrap, which stays.
// Nothing here pretends a recognised face is a key: if the browser does not return a PRF secret, this refuses and says so.
// Every browser call goes through `credentials` (navigator.credentials by default), so tests drive it with a fake authenticator.
//
// Apple passkeys sync through iCloud Keychain (and Google ones through Google Password Manager), so a passkey is NOT bound to one device. Each site address has its own.
import { toB64, fromB64, VaultError } from "./vault.mjs";

const enc = new TextEncoder();
const RP_NAME = "Private Local Chat";

export const passkeySupported = (g = globalThis) => Boolean(g.PublicKeyCredential && g.navigator?.credentials?.create && g.navigator?.credentials?.get);

/** What to tell the person for each way this can fail. */
export function passkeyMessage(error) {
  const name = error?.name || "", code = error?.code || "";
  if (code === "no-prf" || name === "NotSupportedError") return "This browser or device cannot use Face ID or Touch ID to unlock this app. Use your passphrase.";
  if (name === "NotAllowedError" || name === "AbortError") return "That was cancelled or not recognised. Try again, or type your passphrase.";
  if (name === "InvalidStateError") return "This device already has a passkey for this app.";
  if (name === "SecurityError") return "The browser would not use a passkey on this address.";
  if (code === "bad-key") return "That passkey did not unlock the vault. Type your passphrase.";
  if (code === "no-passkey") return "No passkey is set up on this device. Type your passphrase.";
  return error?.message || "Face ID or Touch ID did not work. Type your passphrase.";
}

const bytes = (value) => (value instanceof Uint8Array ? value : new Uint8Array(value));
const prfResult = (credential) => { const first = credential?.getClientExtensionResults?.()?.prf?.results?.first; return first ? bytes(first) : null; };

/** Ask for the PRF secret of an existing passkey (this is the Face ID prompt). */
export async function getSecret({ credentialId, salt, credentials = globalThis.navigator?.credentials, rpId = globalThis.location?.hostname, random = (n) => crypto.getRandomValues(new Uint8Array(n)), timeout = 60000 }) {
  const credential = await credentials.get({ publicKey: {
    challenge: random(32), rpId, timeout, userVerification: "required",
    allowCredentials: [{ type: "public-key", id: fromB64(credentialId), transports: ["internal", "hybrid"] }],
    extensions: { prf: { eval: { first: fromB64(salt) } } }
  } });
  const secret = prfResult(credential);
  if (!secret || secret.length < 16) throw Object.assign(new Error("The passkey gave no secret (PRF)."), { code: "no-prf" });
  return secret;
}

/**
 * Make a passkey and a header wrap for it. Needs the vault key bytes. Some browsers return the PRF secret at creation, others only on the next prompt: this handles both.
 * -> the wrap to store with vault.addWrap(). Throws with `code: "no-prf"` when the device cannot do PRF (nothing is stored then).
 */
export async function createPasskeyWrap({ dekBytes, wrapWithSecret, credentials = globalThis.navigator?.credentials, rpId = globalThis.location?.hostname, label = "This device", random = (n) => crypto.getRandomValues(new Uint8Array(n)), timeout = 60000 }) {
  const salt = random(32), userId = random(16);
  const credential = await credentials.create({ publicKey: {
    rp: { name: RP_NAME, id: rpId }, user: { id: userId, name: "private-local-chat", displayName: "Private Local Chat vault" }, challenge: random(32), timeout,
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
    extensions: { prf: { eval: { first: salt } } }
  } });
  const extension = credential?.getClientExtensionResults?.()?.prf;
  if (!extension || (extension.enabled === false && !extension.results?.first)) throw Object.assign(new Error("This device cannot make a passkey that holds a key."), { code: "no-prf" });
  const credentialId = toB64(bytes(credential.rawId));
  let secret = prfResult(credential);
  if (!secret) secret = await getSecret({ credentialId, salt: toB64(salt), credentials, rpId, random, timeout }); // the second prompt
  const id = "pk-" + credentialId.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return wrapWithSecret(dekBytes, secret, id, { credentialId, salt: toB64(salt), label, rpId, createdAt: Date.now() });
}

/** Unlock the vault with a passkey: the first passkey wrap that answers wins. */
export async function unlockWithPasskey({ vault, header, credentials = globalThis.navigator?.credentials, rpId = globalThis.location?.hostname }) {
  const wraps = (header.wraps || []).filter((w) => w.type === "passkey" && (!w.rpId || w.rpId === rpId));
  if (!wraps.length) throw Object.assign(new Error("No passkey is set up on this address."), { code: "no-passkey" });
  let last;
  for (const wrap of wraps) {
    try {
      const secret = await getSecret({ credentialId: wrap.credentialId, salt: wrap.salt, credentials, rpId });
      return await vault.unlockWithKey(header, await vault.unwrapWithSecret(wrap, secret));
    } catch (error) { last = error; if (error?.name === "NotAllowedError" || error?.name === "AbortError") break; }
  }
  throw Object.assign(new Error(passkeyMessage(last)), { cause: last, code: last?.code });
}
