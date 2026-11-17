// The offer to turn on "One model at a time" after a model fails (a voice that would not start or read, the chat model out of memory or not loading).
// It is only an offer: it never turns anything on by itself, appears at most once per kind of model per page, never when the setting is already on, and
// never again after "Don't ask again". Not now just closes it.

/** Pure decision, so it is easy to test. */
export function shouldOffer({ policy, declined, offered, kind }) {
  return policy !== "one-at-a-time" && !declined && !offered.has(kind);
}

export function createMemoryOffer({ memory, doc = globalThis.document }) {
  const offered = new Set();
  let card = null;
  const close = () => { card?.remove(); card = null; };
  return {
    /** kind: "chat" | "voice" | ...; what: what failed, in the person's words ("the Kitten voice"); returns true when the offer was shown. */
    offer(kind, what) {
      const snap = memory.snapshot();
      if (!doc || !shouldOffer({ policy: snap.policy, declined: snap.offerDeclined, offered, kind })) return false;
      offered.add(kind); close();
      const h = (tag, attrs = {}, ...kids) => { const e = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === "text") e.textContent = v; else e.setAttribute(k, v); } e.append(...kids); return e; };
      const btn = (text, onclick, cls = "") => { const b = h("button", { type: "button", class: "memory-offer-btn " + cls, text }); b.addEventListener("click", onclick); return b; };
      card = h("div", { id: "memoryOffer", class: "memory-offer", role: "status", "aria-live": "polite" },
        h("p", { text: (what ? what.charAt(0).toUpperCase() + what.slice(1) + " did not work. " : "") + "This device may be short of memory. Turn on “One model at a time”? Other models are unloaded while one is in use, so it gets the whole device. Replies and reading start a little later because models load again when needed." }),
        h("div", { class: "memory-offer-actions" },
          btn("Turn on", () => { memory.setPolicy("one-at-a-time"); close(); }, "primary"),
          btn("Not now", close),
          btn("Don't ask again", () => { memory.declineOffer(); close(); })));
      doc.body.append(card);
      return true;
    },
    close,
  };
}
