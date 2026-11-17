// Finds names a script uses but never declares (a typo, or a variable left behind when a feature moved out of index.html and nothing complained until someone
// clicked the button). Approximate on purpose: a name declared anywhere in the same file counts as declared, so it finds missing names, not shadowing.
import { parse } from "acorn";

const GLOBALS = new Set(("window document navigator location localStorage sessionStorage console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch URL URLSearchParams Blob File FileReader FormData Headers Request Response AbortController AbortSignal Event CustomEvent EventTarget Node NodeFilter Element HTMLElement MutationObserver ResizeObserver IntersectionObserver Promise Object Array String Number Boolean Math JSON Date Map Set WeakMap WeakSet Symbol Error TypeError RangeError DOMException Intl RegExp parseInt parseFloat isNaN isFinite NaN Infinity undefined globalThis crypto performance indexedDB IDBKeyRange structuredClone TextEncoder TextDecoder atob btoa encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array BigInt64Array ArrayBuffer DataView Worker SpeechSynthesisUtterance speechSynthesis queueMicrotask matchMedia getComputedStyle open Audio AudioContext Image Option Notification screen history self MessageChannel BroadcastChannel WebAssembly caches Reflect Proxy BigInt arguments process CSS ReadableStream TransformStream WritableStream CompressionStream DecompressionStream Intl SharedArrayBuffer OffscreenCanvas createImageBitmap ImageData Path2D BeforeUnloadEvent KeyboardEvent MouseEvent PointerEvent DragEvent ClipboardEvent DataTransfer HTMLInputElement getSelection devicePixelRatio innerWidth innerHeight requestIdleCallback FinalizationRegistry WeakRef EvalError SyntaxError URIError AggregateError Atomics").split(" "));

export function undeclaredNames(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  const declared = new Set(), used = new Map();
  const pat = (n) => {
    if (!n) return;
    if (n.type === "Identifier") declared.add(n.name);
    else if (n.type === "ObjectPattern") n.properties.forEach((p) => pat(p.value || p.argument));
    else if (n.type === "ArrayPattern") n.elements.forEach(pat);
    else if (n.type === "AssignmentPattern") pat(n.left);
    else if (n.type === "RestElement") pat(n.argument);
  };
  const walk = (n, parent, key) => {
    if (!n || typeof n.type !== "string") return;
    switch (n.type) {
      case "VariableDeclarator": pat(n.id); break;
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": if (n.id) declared.add(n.id.name); n.params.forEach(pat); break;
      case "ClassDeclaration": case "ClassExpression": if (n.id) declared.add(n.id.name); break;
      case "CatchClause": pat(n.param); break;
      case "ImportSpecifier": case "ImportDefaultSpecifier": case "ImportNamespaceSpecifier": declared.add(n.local.name); return;
      case "MetaProperty": return; // import.meta
      case "ExportSpecifier": if (parent?.source) return; if (!used.has(n.local.name)) used.set(n.local.name, n.start); return;
      case "Identifier": {
        const notAReference = (parent?.type === "MemberExpression" && key === "property" && !parent.computed) || (parent?.type === "Property" && key === "key" && !parent.computed)
          || (parent?.type === "MethodDefinition" && key === "key") || (parent?.type === "PropertyDefinition" && key === "key") || ["LabeledStatement", "BreakStatement", "ContinueStatement"].includes(parent?.type);
        if (!notAReference && !used.has(n.name)) used.set(n.name, n.start);
        return;
      }
    }
    for (const k of Object.keys(n)) {
      if (k === "type" || k === "start" || k === "end") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, n, k)); else if (v && typeof v.type === "string") walk(v, n, k);
    }
  };
  walk(ast, null, null);
  const line = (pos) => source.slice(0, pos).split("\n").length;
  return [...used].filter(([name]) => !declared.has(name) && !GLOBALS.has(name)).map(([name, pos]) => ({ name, line: line(pos) }));
}
