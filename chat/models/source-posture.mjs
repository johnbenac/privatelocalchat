import { normalizeSources } from "../../runtime/providers/sources-core.mjs";

export function sourcePosture(mode, operatorSources) {
  if (mode !== "curated") return { mode: "open" };
  const approved = new Set(normalizeSources(operatorSources).map(({ base }) => base));
  return { mode: "curated", approve: (base) => approved.has(base) };
}
