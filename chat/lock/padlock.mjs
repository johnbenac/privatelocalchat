// The padlock picture used on every lock screen (the app lock, the unlock screen of the encrypted vault, the "not locked" reminder).
// One drawing with named parts, so the CSS in chat/brand.css can move them:
//   pl-glow     a soft halo behind it          pl-shackle  the curved bar (it swings open and snaps shut)
//   pl-body     the case, with a gradient       pl-body-ok  the same case in green, faded in when the lock opens
//   pl-shine    a highlight along the top       pl-key      the keyhole
// The screen it sits on says what is happening with a class: `locking` (snaps shut), `unlocking` (opens, turns green), `denied` (a wrong passphrase: it shakes).
import { createPadlock3d } from "./padlock3d.mjs";

let count = 0;
const NS = "http://www.w3.org/2000/svg";
const node = (tag, attrs = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); kids.forEach((c) => n.appendChild(c)); return n; };
const stop = (offset, color) => node("stop", { offset, "stop-color": color });

/** The padlock: a real 3D one (chat/lock/padlock3d.mjs) where WebGL is available, else the flat drawing below. `open` is the "not locked" reminder's lifted bar. */
export function createPadlock(options = {}) { return createPadlock3d(options) || createSvgPadlock(options); }

/** The flat SVG padlock (the fallback). */
export function createSvgPadlock({ open = false, cls = "" } = {}) {
  const id = "pl" + ++count;
  const svg = node("svg", { viewBox: "0 0 64 72", "aria-hidden": "true", class: "padlock " + (open ? "open" : "closed") + (cls ? " " + cls : "") });
  svg.appendChild(node("defs", {}, [
    node("linearGradient", { id: id + "b", x1: 0, y1: 0, x2: 0, y2: 1 }, [stop(0, "var(--pl-top, #6a97f5)"), stop(0.55, "var(--pl-mid, #3f69d4)"), stop(1, "var(--pl-bottom, #2a4eb0)")]),
    node("linearGradient", { id: id + "k", x1: 0, y1: 0, x2: 0, y2: 1 }, [stop(0, "#6fe2a8"), stop(0.55, "#3cb77e"), stop(1, "#26895c")]),
    node("linearGradient", { id: id + "s", x1: 0, y1: 0, x2: 1, y2: 0 }, [stop(0, "var(--pl-steel-a, #eef2f8)"), stop(0.5, "var(--pl-steel-b, #9eabc2)"), stop(1, "var(--pl-steel-a, #eef2f8)")]),
    node("linearGradient", { id: id + "h", x1: 0, y1: 0, x2: 0, y2: 1 }, [stop(0, "#fff"), stop(1, "#fff")]),
    node("radialGradient", { id: id + "g", cx: 0.5, cy: 0.5, r: 0.5 }, [stop(0, "var(--pl-halo, rgba(90,141,238,.45))"), stop(1, "rgba(90,141,238,0)")]),
    node("radialGradient", { id: id + "d", cx: 0.5, cy: 0.5, r: 0.5 }, [stop(0, "rgba(10,20,50,.38)"), stop(1, "rgba(10,20,50,0)")]),
    node("radialGradient", { id: id + "e", cx: 0.5, cy: 0.5, r: 0.5 }, [stop(0, "var(--pl-keylight, rgba(140,190,255,.9))"), stop(1, "rgba(140,190,255,0)")])
  ]));
  svg.appendChild(node("circle", { class: "pl-glow", cx: 32, cy: 46, r: 34, fill: `url(#${id}g)` }));
  svg.appendChild(node("ellipse", { class: "pl-ground", cx: 32, cy: 68, rx: 20, ry: 3.2, fill: `url(#${id}d)` }));
  // the bar: brushed steel with a thin highlight along its left edge
  svg.appendChild(node("g", { class: "pl-shackle" }, [
    node("path", { d: "M21.5 34V24a10.5 10.5 0 0 1 21 0v10", fill: "none", stroke: `url(#${id}s)`, "stroke-width": 7, "stroke-linecap": "round" }),
    node("path", { d: "M21.5 34V24a10.5 10.5 0 0 1 21 0v10", fill: "none", stroke: "rgba(15,30,60,.28)", "stroke-width": 1, "stroke-linecap": "round", transform: "translate(0 0)" }),
    node("path", { d: "M19.4 33V24a12.6 12.6 0 0 1 8.2-11.8", fill: "none", stroke: `url(#${id}h)`, "stroke-opacity": 0.65, "stroke-width": 1.3, "stroke-linecap": "round" })
  ]));
  svg.appendChild(node("rect", { class: "pl-body", x: 10, y: 33, width: 44, height: 33, rx: 10.5, fill: `url(#${id}b)` }));
  svg.appendChild(node("rect", { class: "pl-body-ok", x: 10, y: 33, width: 44, height: 33, rx: 10.5, fill: `url(#${id}k)` }));
  svg.appendChild(node("rect", { class: "pl-edge", x: 10.6, y: 33.6, width: 42.8, height: 31.8, rx: 9.9, fill: "none", stroke: "#fff", "stroke-opacity": 0.28, "stroke-width": 1.1 }));
  svg.appendChild(node("path", { class: "pl-shine", d: "M14.5 44.5V43a8 8 0 0 1 8-8h19a8 8 0 0 1 8 8v1.5c-6-2.6-14-3.8-17.5-3.8S20.5 41.900 14.500 44.500z", fill: "#fff" }));
  svg.appendChild(node("g", { class: "pl-key" }, [
    node("circle", { class: "pl-keyglow", cx: 32, cy: 48.5, r: 8.5, fill: `url(#${id}e)` }),
    node("circle", { class: "pl-hole", cx: 32, cy: 47.5, r: 4.6 }),
    node("rect", { class: "pl-hole", x: 30, y: 49.5, width: 4, height: 9, rx: 2 }),
    node("circle", { cx: 30.6, cy: 46, r: 1.1, fill: "#fff", opacity: 0.5 })
  ]));
  return svg;
}

/** Play one of the padlock's moves on the screen that holds it: restarts the CSS animation even if the same move is asked for twice. */
export function playPadlock(screen, move, { ms = 700 } = {}) {
  screen.classList.remove("locking", "unlocking", "denied", "leaving");
  void screen.offsetWidth; // let the browser see it gone, so the animation starts again
  screen.classList.add(move);
  screen.querySelector(".padlock3d")?.__padlock?.play(move); // the 3D padlock moves itself
  if (move === "denied") window.setTimeout(() => screen.classList.remove("denied"), ms);
}
