// Production model provider (FAB-07p). Public surface:
//
//   page (main thread)
//     import { createModelHost } from "./model-host.mjs";          owns the host Worker, tier choice, model files, load state
//     const host = createModelHost();  await host.init({ autoLoad: true });
//     const port = host.openMindPort();                              one MessagePort per mind worker (after host.getState().host.state === "running")
//     mindWorker.postMessage({ port }, [port]);
//   mind worker
//     import { createProvider } from "./client.mjs";
//     const provider = createProvider(port);  await provider.ready();
//     const call = provider.generate({ attemptId, messages, maxTokens, responseFormat? }, { onToken, signal });
//     const terminal = await call.done;           // never rejects; exactly one of attempt-completed | attempt-failed | attempt-aborted
//   fabric adapter (fabric/mind/provider/harness-adapter.mjs) wraps the client; toProviderErrorFields() (errors.mjs) maps a failed terminal
//   to the contract's ProviderError fields (class, message, detail) and carries `advice` for the human.
export { createProvider, openPort } from "./client.mjs";
export { createModelHost } from "./model-host.mjs";
export { TIERS, TIER_ORDER, OFFICIAL_SOURCES, resolveSources, tierFiles, loadConfigFor } from "./catalog.mjs";
export { classifyEngineError, hostDiedError, toProviderErrorFields, parseOverflow, estimateTokens, ERROR_CLASSES } from "./errors.mjs";
export { compareInventory, planInstall, createRateTracker } from "./verify.mjs";
export { judgeStructured, extractJson, validateSchema } from "./structured.mjs";
