// Is this browser window private (or restricted in the same way)? A page cannot be told directly, and it should not be: private windows exist so that sites cannot tell.
// But a private or ephemeral Safari window is recognisable by what it refuses, and that is exactly what matters here, because it cannot keep the app or a downloaded model for
// offline use. Measured on an iPhone 11 Pro in a private tab and a Safari automation session, and on WebKit under Playwright:
//   - OPFS (navigator.storage.getDirectory) is missing or rejects ("unknown transient reason");
//   - IndexedDB cannot store a Blob (only plain bytes);
//   - Service workers are missing or fail to register (in Private Browsing and in Lockdown Mode).
// Pure: the signals are passed in. Returns { state: "likely" | "possible" | "no", reasons: [...] }; the wording shown to a person is in runtime/offline-readiness.mjs.

const isSafari = (ua = "") => /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|EdgiOS\/|Edg\/|OPR\//.test(ua);
const isFirefox = (ua = "") => /Firefox\/|FxiOS\//.test(ua);

/**
 * signals: { opfs: true | false | null (null: the browser has no OPFS to ask), idbBlob: true | false | null, serviceWorker: "ok" | "missing" | "failed" | null, quotaBytes: number | null }
 */
export function guessPrivate({ userAgent = "", opfs = null, idbBlob = null, serviceWorker = null, quotaBytes = null } = {}) {
  const reasons = [];
  if (isSafari(userAgent)) {
    // Safari 15.2 and newer have OPFS in every normal window; a window without it, or one that cannot store a Blob, is private, ephemeral or restricted
    if (opfs === false) reasons.push("file-storage-refused");
    if (idbBlob === false) reasons.push("indexeddb-blobs-refused");
    if (serviceWorker === "missing" || serviceWorker === "failed") reasons.push("no-service-worker");
    const strong = reasons.some((r) => r !== "no-service-worker"); // a missing service worker alone is also Lockdown Mode or a blocked feature
    return { state: strong ? "likely" : reasons.length ? "possible" : "no", reasons };
  }
  if (isFirefox(userAgent)) {
    if (serviceWorker === "missing") reasons.push("no-service-worker");
    if (idbBlob === false) reasons.push("indexeddb-blobs-refused");
    return { state: reasons.length ? "possible" : "no", reasons };
  }
  // Chrome and other Chromium browsers keep everything in a private (incognito) window until it closes but allow all of it; the one visible difference is a small quota
  if (typeof quotaBytes === "number" && quotaBytes > 0 && quotaBytes < 300e6) reasons.push("small-storage-quota");
  if (opfs === false) reasons.push("file-storage-refused");
  return { state: reasons.length ? "possible" : "no", reasons };
}
