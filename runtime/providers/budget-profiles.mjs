// Budget profiles (T1068) as DATA: {id, match, limitBytes, basis, measuredOn, evidence}. `basis` is "measured" (a limit found by a controlled run), "observed" (something happened on a named
// device, which is evidence but not a limit) or "stated". A device no profile matches gets the conservative unmeasured default of budget.mjs, which says so. Nothing here is a policy: it is the
// numbers a consumer's policy may read. See docs/E-MEASUREMENTS.md for every figure, its device, method and file.
export const BUDGET_PROFILES = Object.freeze([
  {
    id: "ios-safari-stated",
    match: { os: "ios" },
    // ADVISORY ONLY (the budget refuses against a measured limit alone). No kill point has been found on any phone. Observed survivals: iPhone 11 Pro (4 GB class, iOS 27.2) head + Kokoro + the speech-to-text engine
    // peaked at 992 MB in its largest WebContent process (1318 MB summed) and the tab survived (23 Nov 2026); the iPhone 15 Pro survived 734 MB with one engine (20 Nov). The owning application reported tab kills near
    // 640 to 710 MB without a method. The advisory threshold is set at the highest figure a phone is KNOWN to have survived, rounded down, so a load beyond what has ever been seen to work is flagged and nothing the phones
    // have run is. Other phones and other content are unmeasured.
    limitBytes: 990e6,
    basis: "stated",
    measuredOn: "threshold from the highest survival observed (iPhone 11 Pro, iOS 27.2, 992 MB largest process, 23 Nov 2026); kills near 640 to 710 MB reported by the owning application are unexplained and contradicted by this survival",
    evidence: "docs/E-MEASUREMENTS.md#iphone"
  }
]);
