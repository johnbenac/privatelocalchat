// The message shown when this browser holds saved data from a newer version of the app than this one (chat/vault/data-formats.mjs).
// This version leaves that data exactly as it is. The message says so, says what will not be saved, and says how to get the newer version
// or save a copy first. `dialogs` is window.plcDialogs; nothing here uses a native dialog.
import { describeStore } from "./data-formats.mjs";

export function guardMessage(state) {
  const names = [...new Set([...(state.blocked || []).map(describeStore), ...(state.databases || []).map(() => "documents")])];
  const what = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] || "saved data";
  return "This browser holds " + what + " saved by a newer version of Private Local Chat. This version has left them exactly as they are and will not change them, so anything you change in "
    + (names.length > 1 ? "those" : "that") + " here will not be saved. Reload to get the newest version. To keep a copy first, use Settings, Storage and backups.";
}

let shown = "";
/** Show the message once for each different set of newer data. Resolves true when the person chose to reload. */
export async function showFormatGuard(dialogs, state, { reload = () => location.reload() } = {}) {
  const key = JSON.stringify([state.blocked, state.databases]);
  if (shown === key || !((state.blocked || []).length || (state.databases || []).length)) return false;
  shown = key;
  const wantsReload = await dialogs.confirm("Saved data from a newer version", guardMessage(state), "Reload now");
  if (wantsReload) reload();
  return Boolean(wantsReload);
}
