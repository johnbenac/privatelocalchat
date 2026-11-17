// Safe Markdown for assistant answers.
// parseMarkdown(text) -> block AST (pure, tested in Node); renderMarkdown(text, document) -> DocumentFragment.
// Nothing here ever touches innerHTML: text reaches the page only through textContent, so generated HTML is shown as text
// and cannot run. Images are never fetched (they render as a labelled link the reader can choose to open), and only
// http(s)/mailto links are made clickable.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
export const safeHref = (href) => {
  const h = String(href ?? "").trim();
  return SAFE_LINK.test(h) && !/[\u0000-\u001f\s]/.test(h) ? h : null;
};

// ---- inline -------------------------------------------------------------------------------------------------------
const AUTOLINK = /https?:\/\/[^\s<>()\[\]]+[^\s<>()\[\].,;:!?'")\]]/y;

export function parseInline(src) {
  const out = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", v: text }); text = ""; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length && /[\\`*_{}\[\]()#+\-.!~|>]/.test(src[i + 1])) { text += src[i + 1]; i += 2; continue; }
    if (c === "`") {
      let n = 1; while (src[i + n] === "`") n++;
      const fence = "`".repeat(n), end = src.indexOf(fence, i + n);
      if (end > i + n - 1 && end !== -1) { flush(); out.push({ t: "code", v: src.slice(i + n, end).replace(/^ (.*) $/s, "$1") }); i = end + n; continue; }
      text += fence; i += n; continue;
    }
    if (c === "!" && src[i + 1] === "[" || c === "[") {
      const image = c === "!", open = image ? i + 1 : i;
      let depth = 0, j = open;
      for (; j < src.length; j++) { if (src[j] === "\\") { j++; continue; } if (src[j] === "[") depth++; else if (src[j] === "]" && --depth === 0) break; }
      if (j < src.length && src[j + 1] === "(") {
        let k = j + 2, paren = 1;
        for (; k < src.length; k++) { if (src[k] === "(") paren++; else if (src[k] === ")" && --paren === 0) break; }
        if (k < src.length) {
          const label = src.slice(open + 1, j), dest = src.slice(j + 2, k).trim().replace(/\s+["'][^"']*["']$/, "").replace(/^<(.*)>$/, "$1");
          flush();
          if (image) out.push({ t: "img", alt: label, src: dest });
          else out.push({ t: "a", href: dest, c: parseInline(label) });
          i = k + 1; continue;
        }
      }
    }
    if (c === "h" && (src.startsWith("http://", i) || src.startsWith("https://", i))) {
      AUTOLINK.lastIndex = i; const m = AUTOLINK.exec(src);
      if (m) { flush(); out.push({ t: "a", href: m[0], c: [{ t: "text", v: m[0] }] }); i += m[0].length; continue; }
    }
    if (c === "*" || c === "_" || c === "~") {
      const double = src[i + 1] === c && (c !== "~" || true);
      const marks = double ? c + c : c;
      if (c === "~" && !double) { text += c; i++; continue; }
      const closeAt = leftFlanking(src, i, marks.length) ? findClose(src, i + marks.length, marks) : -1;
      const inner = closeAt === -1 ? null : src.slice(i + marks.length, closeAt);
      const wordy = c === "_" && i > 0 && /\w/.test(src[i - 1]);
      if (inner && inner.trim() && !/^\s/.test(inner) && !/\s$/.test(inner) && !wordy) {
        flush(); out.push({ t: c === "~" ? "del" : double ? "strong" : "em", c: parseInline(inner) }); i = closeAt + marks.length; continue;
      }
      text += c; i++; continue;
    }
    if (c === "\n") { const trimmed = text.replace(/ +$/, ""); const hard = text.length - trimmed.length >= 2; text = trimmed; flush(); out.push(hard ? { t: "br" } : { t: "text", v: " " }); i++; continue; }
    text += c; i++;
  }
  flush();
  return out.reduce((merged, n) => { const last = merged[merged.length - 1]; if (n.t === "text" && last?.t === "text") last.v += n.v; else merged.push(n); return merged; }, []);
}

// CommonMark flanking rules: "12*(3+4) = 6*7" has no emphasis in it, "a * b" neither, "**84**" and "*word*" do.
const isSpace = (ch) => ch === undefined || /\s/.test(ch);
const isPunct = (ch) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);
function leftFlanking(src, at, len) {
  const prev = src[at - 1], next = src[at + len];
  return !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
}
function rightFlanking(src, at, len) {
  const prev = src[at - 1], next = src[at + len];
  return !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));
}

function findClose(src, from, marks) {
  for (let j = from; j <= src.length - marks.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "`") { const e = src.indexOf("`", j + 1); if (e === -1) return -1; j = e; continue; }
    if (src.startsWith(marks, j) && j > from && rightFlanking(src, j, marks.length)) {
      if (marks.length === 1 && src[j + 1] === marks) { j++; continue; }
      if (marks[0] === "_" && /\w/.test(src[j + marks.length] || "")) continue;
      return j;
    }
  }
  return -1;
}

// ---- blocks -------------------------------------------------------------------------------------------------------
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const indentOf = (s) => s.match(/^\s*/)[0].replace(/\t/g, "    ").length;

const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = []; let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { cells.push(cur.trim()); cur = ""; } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
};

export function parseMarkdown(text) {
  return parseBlocks(String(text ?? "").replace(/\r\n?/g, "\n").split("\n"));
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  const isBlank = (l) => !l.trim();
  const startsBlock = (l, next) => FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || LIST.test(l) || (l.includes("|") && next !== undefined && TABLE_SEP.test(next) && next.includes("-"));
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m = FENCE.exec(line);
    if (m) {
      const fence = m[1], lang = m[2]; const body = []; i++;
      const closer = new RegExp("^\\s{0,3}" + fence[0] + "{" + fence.length + ",}\\s*$");
      while (i < lines.length && !closer.test(lines[i])) body.push(lines[i++]);
      const closed = i < lines.length; if (closed) i++;
      blocks.push({ t: "code", lang, text: body.join("\n"), open: !closed });
      continue;
    }
    if ((m = HEADING.exec(line))) { blocks.push({ t: "h", level: m[1].length, c: parseInline(m[2]) }); i++; continue; }
    if (HR.test(line) && !LIST.test(line.replace(/^\s*[-*+]\s*$/, "x"))) { blocks.push({ t: "hr" }); i++; continue; }
    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && (QUOTE.test(lines[i]) || (!isBlank(lines[i]) && inner.length && !startsBlock(lines[i], lines[i + 1])))) { const q = QUOTE.exec(lines[i]); inner.push(q ? q[1] : lines[i]); i++; }
      blocks.push({ t: "quote", c: parseBlocks(inner) });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line), seps = splitRow(lines[i + 1]);
      if (head.length === seps.length || head.length > 1) {
        const align = seps.map((s) => (s.startsWith(":") && s.endsWith(":") ? "center" : s.endsWith(":") ? "right" : s.startsWith(":") ? "left" : null));
        i += 2; const rows = [];
        while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) { const r = splitRow(lines[i++]); while (r.length < head.length) r.push(""); rows.push(r.slice(0, head.length)); }
        blocks.push({ t: "table", align, head: head.map(parseInline), rows: rows.map((r) => r.map(parseInline)) });
        continue;
      }
    }
    if ((m = LIST.exec(line))) {
      const base = indentOf(m[1]), ordered = /\d/.test(m[2]), start = ordered ? parseInt(m[2], 10) : 1, items = [];
      while (i < lines.length) {
        const lm = LIST.exec(lines[i]);
        if (!lm || indentOf(lm[1]) > base + 1 || indentOf(lm[1]) < base || /\d/.test(lm[2]) !== ordered) break;
        const content = [lm[3]]; const width = lm[1].length + lm[2].length + 1; i++;
        while (i < lines.length) {
          const l = lines[i];
          if (isBlank(l)) { const nextLine = lines.slice(i + 1).find((x) => !isBlank(x)); if (nextLine !== undefined && indentOf(nextLine) > base && !(LIST.test(nextLine) && indentOf(nextLine) <= base + 1)) { content.push(""); i++; continue; } break; }
          const li = LIST.exec(l);
          if (indentOf(l) > base + 1 || (!li && indentOf(l) > base)) { content.push(l.slice(Math.min(width, l.match(/^\s*/)[0].length))); i++; continue; }
          if (!li && !startsBlock(l, lines[i + 1])) { content.push(l.trim()); i++; continue; }
          break;
        }
        const task = /^\[([ xX])\]\s+/.exec(content[0]);
        if (task) content[0] = content[0].slice(task[0].length);
        items.push({ c: parseBlocks(content), ...(task ? { task: task[1] !== " " } : {}) });
        while (i < lines.length && isBlank(lines[i]) && LIST.test(lines.slice(i + 1).find((x) => !isBlank(x)) ?? "")) i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", start, items });
      continue;
    }
    const para = [line]; i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++]);
    blocks.push({ t: "p", c: parseInline(para.join("\n").replace(/^\s+/, "")) });
  }
  return blocks;
}

// ---- DOM ----------------------------------------------------------------------------------------------------------
const ICON = { copy: "Copy", download: "Download" };

function inlineDom(nodes, doc, parent) {
  for (const n of nodes) {
    let el;
    switch (n.t) {
      case "text": parent.appendChild(doc.createTextNode(n.v)); continue;
      case "br": parent.appendChild(doc.createElement("br")); continue;
      case "code": el = doc.createElement("code"); el.textContent = n.v; break;
      case "strong": case "em": el = doc.createElement(n.t); inlineDom(n.c, doc, el); break;
      case "del": el = doc.createElement("del"); inlineDom(n.c, doc, el); break;
      case "a": {
        const href = safeHref(n.href);
        if (!href) { inlineDom(n.c, doc, parent); continue; }
        el = doc.createElement("a"); el.href = href; el.target = "_blank"; el.rel = "noopener noreferrer nofollow"; inlineDom(n.c, doc, el); break;
      }
      case "img": {
        // never fetched: show what the model referred to, and let the reader open it deliberately
        const href = safeHref(n.src), label = "Image: " + (n.alt || n.src);
        if (href) { el = doc.createElement("a"); el.href = href; el.target = "_blank"; el.rel = "noopener noreferrer nofollow"; el.textContent = label; el.className = "md-image-link"; }
        else el = doc.createTextNode(label);
        break;
      }
      default: continue;
    }
    parent.appendChild(el);
  }
}

function blockDom(blocks, doc, parent) {
  for (const b of blocks) {
    let el;
    switch (b.t) {
      case "p": el = doc.createElement("p"); inlineDom(b.c, doc, el); break;
      case "h": el = doc.createElement("h" + Math.min(6, b.level + 2 > 6 ? 6 : b.level + 2)); el.className = "md-heading"; inlineDom(b.c, doc, el); break;
      case "hr": el = doc.createElement("hr"); break;
      case "quote": el = doc.createElement("blockquote"); blockDom(b.c, doc, el); break;
      case "ul": case "ol":
        el = doc.createElement(b.t);
        if (b.t === "ol" && b.start !== 1) el.start = b.start;
        for (const item of b.items) {
          const li = doc.createElement("li");
          if ("task" in item) { const box = doc.createElement("input"); box.type = "checkbox"; box.checked = item.task; box.disabled = true; box.setAttribute("aria-label", item.task ? "done" : "not done"); li.appendChild(box); li.appendChild(doc.createTextNode(" ")); }
          const tight = item.c.length === 1 && item.c[0].t === "p";
          if (tight) inlineDom(item.c[0].c, doc, li); else blockDom(item.c, doc, li);
          el.appendChild(li);
        }
        break;
      case "code": {
        el = doc.createElement("div"); el.className = "code-block";
        const bar = doc.createElement("div"); bar.className = "code-bar";
        const label = doc.createElement("span"); label.className = "code-lang"; label.textContent = b.lang || "text"; bar.appendChild(label);
        for (const action of ["copy", "download"]) {
          const btn = doc.createElement("button"); btn.type = "button"; btn.className = "code-action"; btn.dataset.action = action + "-code"; btn.textContent = ICON[action];
          btn.setAttribute("aria-label", ICON[action] + " code" + (b.lang ? " (" + b.lang + ")" : "")); bar.appendChild(btn);
        }
        const pre = doc.createElement("pre"), code = doc.createElement("code"); code.textContent = b.text; if (b.lang) code.dataset.lang = b.lang;
        pre.tabIndex = 0; pre.appendChild(code); el.append(bar, pre);
        break;
      }
      case "table": {
        el = doc.createElement("div"); el.className = "table-wrap"; el.tabIndex = 0; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Table");
        const table = doc.createElement("table"), thead = doc.createElement("thead"), tr = doc.createElement("tr");
        b.head.forEach((cell, c) => { const th = doc.createElement("th"); th.scope = "col"; if (b.align[c]) th.style.textAlign = b.align[c]; inlineDom(cell, doc, th); tr.appendChild(th); });
        thead.appendChild(tr); table.appendChild(thead);
        const tbody = doc.createElement("tbody");
        for (const row of b.rows) { const r = doc.createElement("tr"); row.forEach((cell, c) => { const td = doc.createElement("td"); if (b.align[c]) td.style.textAlign = b.align[c]; inlineDom(cell, doc, td); r.appendChild(td); }); tbody.appendChild(r); }
        table.appendChild(tbody); el.appendChild(table);
        break;
      }
      default: continue;
    }
    parent.appendChild(el);
  }
}

export function renderMarkdown(text, doc = globalThis.document) {
  const frag = doc.createDocumentFragment();
  blockDom(parseMarkdown(text), doc, frag);
  return frag;
}

/** The raw code of every fenced block in a message, in order (used by Copy / Download on a code block). */
export const codeBlocksOf = (text) => parseMarkdown(text).filter((b) => b.t === "code");
