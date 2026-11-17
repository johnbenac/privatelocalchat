// When should a downloaded model load by itself? At start-up and when on-device chat is chosen, as long as nothing is in the
// way. Never twice in a row after a failure, and never straight after the person chose to free memory.
export function shouldAutoLoad({ mode, alreadyTried, userFreed, supported, busy, generating, installed, loadState, downloadPending }) {
  if (mode !== 'local' || alreadyTried || userFreed) return false;
  if (!supported || busy || generating || downloadPending) return false;
  return installed === true && loadState === 'unloaded';
}
