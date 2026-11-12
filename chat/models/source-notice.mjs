// The model-source notice (docs/APP-CONFIG.md): the first time a model is about to download on a copy that is not our own site, say where the files come from.
//
// It is shown when the active source is the shipped default (the project's content delivery network) and the copy has no site identity in its manifest, so no address of ours is compared
// with the page's. It is shown once. Whoever runs a copy can use their own source by setting it in config/app-config.json; the Model source row in Settings, Models says what is in use.
import { appConfig } from "../../runtime/config/app-config.mjs";
import { siteLinks } from "../site/site-links.mjs";

export const NOTICE_KEY = "plc.modelSourceNotice.v1";

/** Whether the notice applies to this copy: the shipped source, and not the site that ships it. */
export function noticeApplies({ config = appConfig(), site = siteLinks().site } = {}) {
  return config.isDefaultSource() && !site;
}

/** The host the files come from, for display ("assets.example.org"), or "this host" for a path on the copy's own host. */
export function sourceHost(config = appConfig()) {
  try { const u = new URL(config.modelRoot()); return u.host; } catch { return "this host"; }
}

/**
 * Resolves true to go on with the download, false when the person cancels it. `storage` is the app's local storage; `dialogs` is window.plcDialogs; `openSettings` shows Settings, Models.
 * Anything that goes wrong lets the download go on: the notice informs, it must never be the reason a download cannot start.
 */
export async function ensureSourceNotice({ storage, dialogs, openSettings = null, config = appConfig(), site = siteLinks().site } = {}) {
  try {
    if (!noticeApplies({ config, site })) return true;
    if (storage.getItem(NOTICE_KEY)) return true;
    if (!dialogs?.confirm) return true;
    const host = sourceHost(config);
    const title = "Where the models come from";
    const message = `The model files are downloaded from the Private Local Chat project's content delivery network at ${host}. That host sees that a download is requested, as any web host does, and nothing you type. ` +
      "If you run this copy yourself, you can use your own source instead: set it in config/app-config.json. The Model source row in Settings, Models shows what is in use.";
    const go = await dialogs.confirm(title, message, "Download", { danger: false });
    if (!go) return false;
    try { storage.setItem(NOTICE_KEY, "1"); } catch { /* shown again next time */ }
    return true;
  } catch { return true; }
}
