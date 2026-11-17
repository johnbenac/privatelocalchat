// One consistent stroke-icon set (24x24, currentColor) so controls look the same everywhere and scale with text.
const P = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  edit: '<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  'volume-off': '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  paperclip: '<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  storage: '<path d="M4 14h16v5H4z"/><path d="M4 14l2.5-8h11L20 14"/><path d="M8 16.5h.01"/>',
  bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  book: '<path d="M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M5 19V5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-8 3-12 6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l5-5 4 4 2-2 3 3"/>',
  summarize: '<path d="M5 8h14M8 12h8M10 16h4"/>',
  ghost: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
  device: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.9A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1 0 8.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  share: '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 11l8-4M8 13l8 4"/>',
  transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  chats: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.01"/>',
  phone: '<path d="M20.5 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17 17 0 0 1-7.4-2.6 16.7 16.7 0 0 1-5.2-5.2A17 17 0 0 1 3.3 6.2a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.9.4 1.8.7 2.6a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14 14 0 0 0 5.2 5.2l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.7.6 2.6.7a1.8 1.8 0 0 1 1.5 1.8z"/>',
  hangup: '<g transform="rotate(135 12 12)"><path d="M20.5 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17 17 0 0 1-7.4-2.6 16.7 16.7 0 0 1-5.2-5.2A17 17 0 0 1 3.3 6.2a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.9.4 1.8.7 2.6a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14 14 0 0 0 5.2 5.2l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.7.6 2.6.7a1.8 1.8 0 0 1 1.5 1.8z"/></g>',
  'mic-off': '<path d="M4 4l16 16"/><path d="M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.7 3M12 18v3"/>',
  skip: '<path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/>',
  waveform: '<path d="M3 12h1.5M7.5 8v8M12 4v16M16.5 8v8M20 12h1"/>',
  compose: '<path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3M20 14v6h-6"/>'
};
export const ICON_NAMES = Object.keys(P);

// emoji the app used before; mapping them keeps old and new code visually identical
export const EMOJI_ICON = {
  "➕": "plus", "➖": "minus", "🕶️": "ghost", "📁": "folder", "⋮": "more", "✏️": "edit", "📋": "copy", "📤": "download", "🗑️": "trash", "🔗": "link",
  "📌": "pin", "📍": "pin", "🗄️": "archive", "🧬": "copy", "♻️": "refresh", "🌿": "branch", "⬇": "download", "📝": "edit", "🔊": "volume", "⏹": "stop",
  "🧠": "bookmark", "📚": "book", "💾": "storage", "🔒": "lock", "🧮": "calc", "📎": "paperclip", "🖼️": "image", "🎙️": "mic", "🎧": "headphones", "📞": "phone", "🎚️": "waveform", "📵": "hangup",
  "🔄": "refresh", "☀️": "sun", "🌙": "moon", "ℹ️": "info", "❌": "close", "☠️": "trash", "🗜": "summarize", "↻": "refresh", "▶": "play", "✕": "close",
  "📩": "send", "☰": "menu", "‹": "left", "›": "right"
};

const NS = "http://www.w3.org/2000/svg";
export function iconNode(name, { doc = globalThis.document, size = null } = {}) {
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "ico"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.9"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
  if (size) { svg.setAttribute("width", size); svg.setAttribute("height", size); }
  svg.innerHTML = P[name] || P.info;
  return svg;
}
/** "📋 Copy" -> { name: "copy", rest: "Copy" } ; null name when the text does not start with a known emoji. */
export function splitIcon(text) {
  const s = String(text);
  for (const e of Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length)) if (s.startsWith(e)) return { name: EMOJI_ICON[e], rest: s.slice(e.length).trim() };
  return { name: null, rest: s };
}
/** Replace a node's content with an icon plus its label ("📋 Copy"), or just the icon when there is no label. */
export function setIconLabel(node, text, { doc = globalThis.document } = {}) {
  const { name, rest } = splitIcon(text);
  node.textContent = "";
  if (name) node.appendChild(iconNode(name, { doc }));
  if (rest) { const span = doc.createElement("span"); span.className = "ico-label"; span.textContent = rest; node.appendChild(span); }
  return node;
}
