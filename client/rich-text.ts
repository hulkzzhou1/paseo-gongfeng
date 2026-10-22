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
  const pattern = /(`{1,32})([^`\n]+)\1|\[!\[([^\[\]\n]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)|(!?)\[([^\[\]\n]*)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|<a\b[^<>]*>([\s\S]*?)<\/a\s*>|<(strong|b|em|i|code)\b[^<>]*>([\s\S]*?)<\/\12\s*>|<img\b[^<>]*>|<[^<>]*>/gi;
  // Unclosed HTML pairs stay plain; avoid rescanning the remaining body for every opening tag.
  const source = pattern.source
    .replace("<a\\b", /<\/a\s*>/i.test(text) ? "<a\\b" : "(?!)<a\\b")
    .replace("<(strong|b|em|i|code)", /<\/(?:strong|b|em|i|code)\s*>/i.test(text) ? "<(strong|b|em|i|code)" : "(?!)<(strong|b|em|i|code)");
  const matcher = new RegExp(source, "gi");
  let cursor = 0;
  const plain = (value: string) => { if (value) tokens.push({ kind: "text", text: entities(value).replace(/[ \t]{2,}/g, " ") }); };
  const children = (value: string) => richInline(value, base, depth + 1);
  const link = (href: string, content: RichToken[]) => {
    const safe = href.trim() ? descriptionLink(entities(href), base) : null;
    if (safe) tokens.push({ kind: "link", href: safe, children: content }); else tokens.push(...content);
  };
  for (const match of text.matchAll(matcher)) {
    plain(text.slice(cursor, match.index)); cursor = match.index! + match[0].length;
    if (match[1]) tokens.push({ kind: "code", text: match[2] });
    else if (match[5]) link(match[5], [image(entities(match[4]), entities(match[3]), base)]);
    else if (match[8]) { if (match[6]) tokens.push(image(entities(match[8]), entities(match[7]), base)); else link(match[8], children(match[7])); }
    else if (match[9] || match[10]) tokens.push({ kind: match[9] ? "strong" : "emphasis", children: children(match[9] || match[10]) });
    else if (match[11] !== undefined) link(attribute(match[0], "href"), children(match[11]));
    else if (match[12]) {
      if (match[12].toLowerCase() === "code") tokens.push({ kind: "code", text: entities(match[13]) });
      else tokens.push({ kind: /^(strong|b)$/i.test(match[12]) ? "strong" : "emphasis", children: children(match[13]) });
    } else if (/^<img\b/i.test(match[0])) tokens.push(image(attribute(match[0], "src"), attribute(match[0], "alt"), base));
  }
  plain(text.slice(cursor)); return tokens;
}

export function richBlocks(source: string): RichBlock[] {
  return descriptionBlocks(source).flatMap((block): RichBlock[] => {
    if (block.kind === "code") return [block];
    const chunks = block.text.split(/(<pre\b[^<>]*>[\s\S]*?<\/pre\s*>)/gi);
    return chunks.flatMap((chunk): RichBlock[] => {
      if (/^<pre\b/i.test(chunk)) return [{ kind: "code", text: entities(chunk.replace(/^<pre\b[^<>]*>(?:<code\b[^<>]*>)?/i, "").replace(/(?:<\/code\s*>)?<\/pre\s*>$/i, "")) }];
      const normalized = chunk.split(/(`+[^`\n]*`+)/g).map((part, index) => index % 2 ? part : part
        .replace(/<!--([\s\S]*?)-->/g, "")
        .replace(/<(script|style|iframe|object|svg)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
        .replace(/<h([1-6])\b[^<>]*>/gi, (_tag, n: string) => `\n${"#".repeat(Number(n))} `).replace(/<\/h[1-6]\s*>/gi, "\n")
        .replace(/<li\b[^<>]*>/gi, "\n- ").replace(/<hr\b[^<>]*>/gi, "\n---\n")
        .replace(/<\/?(?:div|p|section|article|ul|ol|li|blockquote)\b[^<>]*>/gi, "\n").replace(/<br\s*\/?\s*>/gi, "\n")
      ).join("");
      return descriptionBlocks(normalized).map(part => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(part.text) ? { kind: "rule" as const, text: "" }
        : block.kind !== "paragraph" && part.kind === "paragraph" ? { ...block, text: part.text } : part);
    });
  });
}
