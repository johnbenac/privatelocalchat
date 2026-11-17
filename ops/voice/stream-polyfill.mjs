// Safari has no async iteration on ReadableStream (checked on an iPhone 15 Pro: `ReadableStream.prototype[Symbol.asyncIterator]` is undefined). The
// phonemizer package unpacks its dictionary with `for await (const chunk of stream)`; without this its start-up fails inside the package, its "ready"
// promise never settles and every phonemize() call waits for ever, so the voice produced no sound and no error. This is imported FIRST by both workers.
if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) return; yield value; } }
    finally { reader.releaseLock(); }
  };
}
