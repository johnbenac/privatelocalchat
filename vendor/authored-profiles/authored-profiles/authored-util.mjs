/** Small pure helpers shared by the authored validators and the receiving projections. */
export const sorted = x => x && typeof x === 'object' ? Array.isArray(x) ? x.map(sorted) :
  Object.fromEntries(Object.keys(x).sort().map(k => [k, sorted(x[k])])) : x;
export const same = (x, y) => JSON.stringify(sorted(x)) === JSON.stringify(sorted(y));
export const problem = (code, path, message) => ({code, path, message});
