// Catalog-driven selection. Only a catalog-advertised alias is used; no model
// family, deployment name, or provider hostname is assumed.
export function selectServedModel(catalog, requested = "auto") {
  const entries = (Array.isArray(catalog) ? catalog : []).filter(m => typeof m?.id === "string" && m.id.trim());
  const ids = entries.flatMap(m => [m.id, ...(Array.isArray(m.slots_running) ? m.slots_running : []).filter(s => typeof s === "string").map(s => m.id + "@" + s)]);
  if (requested && requested !== "auto") {
    if (!ids.includes(requested)) throw new Error(`The provider does not currently list “${requested}”. Fetch models to select an available model, or follow the provider’s current model.`);
    return requested;
  }
  if (!entries.length) throw new Error("The provider lists no available models.");
  if (ids.includes("@chat")) return "@chat";
  const eligible = entries.filter(m => !Array.isArray(m.capabilities) || m.capabilities.includes("chat"));
  if (!eligible.length) throw new Error("The provider lists no chat-capable models.");
  return (eligible.find(m => m.is_default === true || m.default === true) || eligible.find(m => Array.isArray(m.capabilities) && m.capabilities.includes("chat") && !m.id.startsWith("@")) || eligible.find(m => !m.id.startsWith("@")) || eligible[0]).id;
}
