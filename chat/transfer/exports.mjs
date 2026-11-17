// What an answer can be saved as: the whole text, each code block as a file, a table as CSV, a JSON block as JSON.
import { parseMarkdown, parseInline } from "../markdown.mjs";

const EXT = { javascript: "js", js: "js", typescript: "ts", ts: "ts", python: "py", py: "py", html: "html", css: "css", json: "json", bash: "sh", sh: "sh", shell: "sh", markdown: "md", md: "md", csv: "csv", sql: "sql", c: "c", cpp: "cpp", java: "java", go: "go", rust: "rs", yaml: "yml", yml: "yml", xml: "xml", text: "txt", "": "txt" };
const MIME = { csv: "text/csv", json: "application/json", html: "text/html", md: "text/markdown", xml: "application/xml" };
export const extensionFor = (lang) => EXT[String(lang || "").toLowerCase()] || "txt";
const csvCell = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const plain = (nodes) => nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "img" ? n.alt : n.c ? plain(n.c) : n.t === "br" ? " " : "")).join("");

export const slug = (s, fallback = "answer") => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || fallback;

export function stripMarkdown(text) {
  const out = [];
  for (const b of parseMarkdown(text)) {
    if (b.t === "p" || b.t === "h") out.push(plain(b.c));
    else if (b.t === "code") out.push(b.text);
    else if (b.t === "ul" || b.t === "ol") out.push(b.items.map((it, i) => (b.t === "ol" ? `${b.start + i}. ` : "- ") + it.c.map((x) => (x.c && Array.isArray(x.c) && x.t === "p" ? plain(x.c) : "")).join(" ").trim()).join("\n"));
    else if (b.t === "quote") out.push(b.c.map((x) => (x.c ? plain(x.c) : "")).join("\n"));
    else if (b.t === "table") { out.push([b.head, ...b.rows].map((r) => r.map(plain).join("\t")).join("\n")); }
  }
  return out.join("\n\n");
}

/** [{ label, filename, mime, text }] best-fit first. */
export function exportsFor(text, baseName = "answer") {
  const base = slug(baseName), out = [];
  out.push({ label: "Markdown (.md)", filename: `${base}.md`, mime: "text/markdown", text });
  out.push({ label: "Plain text (.txt)", filename: `${base}.txt`, mime: "text/plain", text: stripMarkdown(text) });
  const blocks = parseMarkdown(text);
  let tables = 0, codes = 0;
  for (const b of blocks) {
    if (b.t === "table") {
      tables++;
      const rows = [b.head, ...b.rows].map((r) => r.map((c) => csvCell(plain(c))).join(",")).join("\n");
      out.push({ label: `Table ${tables} as CSV (.csv)`, filename: `${base}-table${tables > 1 ? "-" + tables : ""}.csv`, mime: "text/csv", text: rows + "\n" });
    } else if (b.t === "code" && b.text.trim()) {
      codes++;
      const ext = extensionFor(b.lang);
      let body = b.text;
      if (ext === "json") { try { body = JSON.stringify(JSON.parse(b.text), null, 2); } catch { /* keep as written */ } }
      out.push({ label: `Code block ${codes}${b.lang ? " (" + b.lang + ")" : ""} (.${ext})`, filename: `${base}-${codes}.${ext}`, mime: MIME[ext] || "text/plain", text: body.endsWith("\n") ? body : body + "\n" });
    }
  }
  return out;
}
