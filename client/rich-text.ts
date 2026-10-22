import { descriptionBlocks, descriptionLink, type DescriptionBlock } from "./description-blocks.ts";

export type RichToken = { kind: "text" | "code"; text: string }
  | { kind: "strong" | "emphasis"; children: RichToken[] }
  | { kind: "link"; href: string; children: RichToken[] }
  | { kind: "image"; src: string; alt: string };
export type RichBlock = DescriptionBlock | { kind: "rule"; text: string };

function entities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|hellip);/gi, (raw, name: string) => {
    if (!name.startsWith("#")) return named[name.toLowerCase()] ?? raw;
    const value = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : "�";
  });
}
function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return entities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}
function image(src: string, alt: string, base?: string | null): RichToken {
  const url = src.trim() ? descriptionLink(src, base) : null;
  if (!alt && url) {
    const parsed = new URL(url);
    if (parsed.hostname === "img.shields.io" && parsed.pathname.startsWith("/badge/")) {
      try { alt = decodeURIComponent(parsed.pathname.slice(7)).split("-").slice(0, 2).join(" · "); } catch { /* Keep the generic label for malformed badge names. */ }
    }
  }
  return url && new URL(url).protocol === "https:" ? { kind: "image", src: url, alt: alt || "图片" } : { kind: "text", text: alt || "图片不可用" };
}

// Produce only text, known formatting, validated links and images; never render upstream HTML itself.
// shortcut: inline code delimiters are limited to 32 backticks; extend if real content needs longer runs.
export function richInline(text: string, base?: string | null, depth = 0): RichToken[] {
  if (depth > 6) return [{ kind: "text", text: entities(text.replace(/<[^<>]*>/g, "")) }];
  const tokens: RichToken[] = [];
  // Index matching tags once; malformed pairs must not rescan the same suffix.
  const pairs = new Map<number, { start: number; end: number }>(), stacks = new Map<string, number[]>();
  for (const tag of text.matchAll(/<(a|strong|b|em|i|code)\b[^<>]*>|<\/(a|strong|b|em|i|code)\s*>/gi)) {
    const name = (tag[1] || tag[2]).toLowerCase(), stack = stacks.get(name) ?? [];
    if (tag[1]) { stack.push(tag.index!); stacks.set(name, stack); }
    else { const start = stack.pop(); if (start !== undefined) pairs.set(start, { start: tag.index!, end: tag.index! + tag[0].length }); }
  }
  const matcher = /(`{1,32})([^`\n]+)\1|\[!\[([^\[\]\n]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)|(!?)\[([^\[\]\n]*)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|<(a|strong|b|em|i|code)\b[^<>]*>|<img\b[^<>]*>|<[^<>]*>/gi;
  let cursor = 0;
  const plain = (value: string) => { if (value) tokens.push({ kind: "text", text: entities(value).replace(/[ \t]{2,}/g, " ") }); };
  const children = (value: string) => richInline(value, base, depth + 1);
  const link = (href: string, content: RichToken[]) => {
    const safe = href.trim() ? descriptionLink(entities(href), base) : null;
    if (safe) tokens.push({ kind: "link", href: safe, children: content }); else tokens.push(...content);
  };
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    plain(text.slice(cursor, match.index)); cursor = match.index! + match[0].length;
    if (match[1]) tokens.push({ kind: "code", text: match[2] });
    else if (match[5]) link(match[5], [image(entities(match[4]), entities(match[3]), base)]);
    else if (match[8]) { if (match[6]) tokens.push(image(entities(match[8]), entities(match[7]), base)); else link(match[8], children(match[7])); }
    else if (match[9] || match[10]) tokens.push({ kind: match[9] ? "strong" : "emphasis", children: children(match[9] || match[10]) });
    else if (match[11]) {
      const end = pairs.get(match.index!);
      if (!end) continue;
      const body = text.slice(cursor, end.start), name = match[11].toLowerCase();
      cursor = matcher.lastIndex = end.end;
      if (name === "a") link(attribute(match[0], "href"), children(body));
      else if (name === "code") tokens.push({ kind: "code", text: entities(body) });
      else tokens.push({ kind: /^(strong|b)$/.test(name) ? "strong" : "emphasis", children: children(body) });
    } else if (/^<img\b/i.test(match[0])) tokens.push(image(attribute(match[0], "src"), attribute(match[0], "alt"), base));
  }
  plain(text.slice(cursor)); return tokens;
}

export function richBlocks(source: string): RichBlock[] {
  source = source.replace(/\r\n/g, "\n");
  const blocks: RichBlock[] = [];
  const append = (text: string) => {
    const normalized = text.split(/(`{1,32}[^`\n]+`{1,32})/g).map((part, index) => index % 2 ? part : part
      .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
      .replace(/<(script|style|iframe|object|svg)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
      .replace(/<h([1-6])\b[^<>]*>/gi, (_tag, n: string) => `\n${"#".repeat(Number(n))} `).replace(/<\/h[1-6]\s*>/gi, "\n")
      .replace(/<li\b[^<>]*>/gi, "\n- ").replace(/<hr\b[^<>]*>/gi, "\n---\n")
      .replace(/<\/?(?:div|p|section|article|ul|ol|li|blockquote)\b[^<>]*>/gi, "\n").replace(/<br\s*\/?\s*>/gi, "\n")
    ).join("");
    blocks.push(...descriptionBlocks(normalized).map(part => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(part.text) ? { kind: "rule" as const, text: "" } : part));
  };
  // Protect code before Markdown paragraphs or HTML wrappers can split its contents.
  const pattern = /^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)(?:\n|$)|(`{1,32})([^`\n]+)\3|<pre\b[^<>]*>/gim;
  let cursor = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (match[3]) continue;
    append(source.slice(cursor, match.index));
    const start = pattern.lastIndex;
    const closing = match[1] ? new RegExp(`^[ \\t]{0,3}${match[1][0]}{${match[1].length},}[ \\t]*$`, "gm") : /<\/pre\s*>/gi;
    closing.lastIndex = start;
    const end = closing.exec(source);
    let text = source.slice(start, end?.index ?? source.length);
    if (match[1]) text = text.replace(/\n$/, "");
    else text = entities(text.replace(/^<code\b[^<>]*>/i, "").replace(/<\/code\s*>$/i, ""));
    blocks.push({ kind: "code", text, ...(match[1] ? { marker: match[2].trim() } : {}) });
    cursor = pattern.lastIndex = end ? closing.lastIndex : source.length;
  }
  append(source.slice(cursor));
  return blocks;
}
