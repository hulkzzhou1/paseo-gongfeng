export type DescriptionBlock = { kind: "paragraph" | "heading" | "list" | "quote" | "code"; text: string; level?: number; marker?: string };
export function descriptionExcerpt(source: string): string {
  const text = Array.from(source.replace(/\s+/g, " ").trim());
  return text.slice(0, 120).join("") + (text.length > 120 ? "…" : "");
}
export function descriptionBlocks(source: string): DescriptionBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") }); paragraph = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      flush(); const code: string[] = [];
      const closing = new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (++i < lines.length && !closing.test(lines[i])) code.push(lines[i]);
      blocks.push({ kind: "code", text: code.join("\n"), marker: fence[2].trim() }); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line), list = /^\s*([-*+] |\d+[.)] )(.+)$/.exec(line), quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading || list || quote) {
      flush();
      if (heading) blocks.push({ kind: "heading", text: heading[2], level: heading[1].length });
      else if (list) blocks.push({ kind: "list", text: list[2], marker: /^\d/.test(list[1]) ? list[1].trim() : "•" });
      else if (quote) blocks.push({ kind: "quote", text: quote[1] });
    } else paragraph.push(line);
  }
  flush(); return blocks;
}

export function descriptionLink(raw: string, base?: string | null): string | null {
  try { const url = new URL(raw, base ?? undefined); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
