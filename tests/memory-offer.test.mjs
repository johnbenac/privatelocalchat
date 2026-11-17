import test from "node:test";
import assert from "node:assert/strict";
import { shouldOffer } from "../chat/models/memory-offer.mjs";

test("the offer is made once per kind, never when the setting is on, never after Don't ask again", () => {
  const offered = new Set();
  assert.equal(shouldOffer({ policy: "keep", declined: false, offered, kind: "voice" }), true);
  assert.equal(shouldOffer({ policy: "one-at-a-time", declined: false, offered, kind: "voice" }), false);
  assert.equal(shouldOffer({ policy: "keep", declined: true, offered, kind: "voice" }), false);
  offered.add("voice");
  assert.equal(shouldOffer({ policy: "keep", declined: false, offered, kind: "voice" }), false);
  assert.equal(shouldOffer({ policy: "keep", declined: false, offered, kind: "chat" }), true, "another kind of model is offered separately");
});
