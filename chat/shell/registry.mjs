// The app shell is data-driven: the icon rail, the Explore menu, the composer "+" menu and the settings sections are all lists
// of entries in one registry. Adding a place to the app means adding one entry (id, label, icon, order, visible(), open()).
import { appLocal } from "../vault/vault-store.mjs";

export function createRegistry(storage = appLocal) {
  const areas = new Map();
  const PIN_KEY = "plc.shell.pins.v1";
  let pins = null;
  const loadPins = () => {
    if (pins) return pins;
    try { const raw = JSON.parse(storage?.getItem(PIN_KEY) || "null"); pins = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}; } catch { pins = {}; }
    return pins;
  };
  const listeners = new Set();
  const changed = () => { for (const fn of [...listeners]) { try { fn(); } catch { /* a listener's failure is its own */ } } };
  return {
    /** Add or replace an entry. area: "rail" | "explore" | "plus" | "settings" | "header". */
    register(area, item) {
      if (!item?.id || !item.label) throw new Error("A shell entry needs an id and a label.");
      const list = areas.get(area) || new Map();
      list.set(item.id, { order: 100, visible: () => true, ...item, area });
      areas.set(area, list); changed();
      return item.id;
    },
    unregister(area, id) { areas.get(area)?.delete(id); changed(); },
    /** Visible entries of an area, in order. */
    list(area) {
      return [...(areas.get(area)?.values() || [])].filter((i) => { try { return i.visible() !== false; } catch { return false; } }).sort((a, b) => a.order - b.order);
    },
    get(area, id) { return areas.get(area)?.get(id) || null; },
    /** Explore items can be pinned to the rail (ChatGPT's pin toggle). */
    isPinned(id) { const p = loadPins(); return id in p ? Boolean(p[id]) : Boolean(areas.get("explore")?.get(id)?.pinnedByDefault); },
    setPinned(id, on) { const p = loadPins(); p[id] = Boolean(on); try { storage?.setItem(PIN_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } changed(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}

const DAY = 864e5;
export const DATE_LABELS = Object.freeze(["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"]);

/** Chats grouped like ChatGPT's list: pinned first, then by how recently they were used. Input order is kept inside a group. */
export function groupThreadsByDate(threads, now = Date.now()) {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const t0 = startOfToday.getTime();
  const buckets = new Map(DATE_LABELS.map((l) => [l, []]));
  for (const t of threads) {
    const at = Number.isFinite(t.updatedAt) ? t.updatedAt : Number.isFinite(t.createdAt) ? t.createdAt : 0;
    const label = t.pinned ? "Pinned" : at >= t0 ? "Today" : at >= t0 - DAY ? "Yesterday" : at >= t0 - 7 * DAY ? "Previous 7 days" : at >= t0 - 30 * DAY ? "Previous 30 days" : "Older";
    buckets.get(label).push(t);
  }
  return DATE_LABELS.map((label) => ({ label, items: buckets.get(label) })).filter((g) => g.items.length);
}

/** The greeting on an empty chat. Plain and calm; rotates by the hour so it is not the same every time. */
export function greeting(date = new Date()) {
  const lines = ["What’s on your mind?", "Where should we begin?", "How can I help?", "Ready when you are."];
  return lines[(date.getHours() + date.getDate()) % lines.length];
}
