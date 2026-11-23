// Budget profiles (T1068) as DATA: {id, match, limitBytes, basis, measuredOn, evidence}. `basis` is "measured" (a limit found by a controlled run), "observed" (something happened on a named
// device, which is evidence but not a limit) or "stated". A device no profile matches gets the conservative unmeasured default of budget.mjs, which says so. Nothing here is a policy: it is the
// numbers a consumer's policy may read. See docs/E-MEASUREMENTS.md for every figure, its device, method and file.
export const BUDGET_PROFILES = Object.freeze([
  {
    id: "ios-safari-stated",
    match: { os: "ios" },
    // Set BELOW the lowest tab kill figure reported by the owning application (about 640 MB, method not given). OBSERVATION, not the limit: an iPhone 15 Pro (iOS 26.6, Safari) survived a 734 MB peak
    // with one ONNX synthesiser and a 3D head, but a survival is not a limit and the kill depends on content. One phone, one content; two engines in one or two Workers were NEVER measured there. Two phones survived above this figure (iPhone 15 Pro 734 MB; iPhone 11 Pro 759 MB peak, 22 Nov), so a limit from a STATED figure only ever advises: see budget.mjs.
    limitBytes: 600e6,
    basis: "stated",   // the LIMIT is the owning application's stated kill figure (about 640 MB, method not given), lowered; the iPhone run below is evidence, not a limit
    measuredOn: "limit stated from kills near 640 to 710 MB reported by the owning application (method not given); observation: iPhone 15 Pro, iOS 26.6, Safari, 20 Nov 2026, survived 734 MB peak / 684 MB steady (largest WebContent process)",
    evidence: "docs/E-MEASUREMENTS.md#iphone"
  }
]);
