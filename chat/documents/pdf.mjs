// Text out of a PDF, on this device, with PDF.js (vendored under ./vendor/pdfjs).
import { LIMITS } from "./documents.mjs";

let lib = null;
async function load() {
  if (lib) return lib;
  // PDF.js 4 uses Promise.withResolvers, which Safari before 17.4 lacks
  if (typeof Promise.withResolvers !== "function") Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  lib = await import("../vendor/pdfjs/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  return lib;
}

/** -> { pages:[{page,text}], pageCount, emptyPages } ; throws Error with a message fit to show. */
export async function extractPdf(bytes, { onProgress, signal } = {}) {
  const pdfjs = await load();
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise; }
  catch (e) {
    if (e?.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and try again.");
    throw new Error("This PDF could not be read" + (e?.message ? " (" + String(e.message).slice(0, 120) + ")" : "") + ".");
  }
  if (pdf.numPages > LIMITS.pages) { await pdf.destroy(); throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${LIMITS.pages}.`); }
  const pages = []; let emptyPages = 0, chars = 0;
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      const page = await pdf.getPage(n), content = await page.getTextContent();
      let text = ""; for (const item of content.items) text += item.str + (item.hasEOL ? "\n" : " ");
      text = text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      page.cleanup();
      if (!text) emptyPages++; else { pages.push({ page: n, text }); chars += text.length; }
      if (chars > LIMITS.chars) throw new Error("This PDF has more text than can be kept on this device.");
      onProgress?.(n, pdf.numPages);
    }
  } finally { await pdf.destroy(); }
  if (!pages.length) throw new Error("No selectable text was found in this PDF. It looks like a scan or images of pages, and reading those needs OCR, which isn’t available offline here yet.");
  return { pages, pageCount: pdf.numPages, emptyPages };
}
