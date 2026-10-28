export type DescriptionBlock = { kind: "paragraph" | "heading" | "list" | "quote" | "code"; text: string; level?: number; marker?: string; checked?: boolean }
  | { kind: "table"; text: string; headers: string[]; alignments: ("left" | "center" | "right")[]; rows: string[][] };

function tableCells(line: string): string[] {
  const cells: string[] = []; let cell = "";
  line = line.trim();
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && i + 1 < line.length) { cell += line[i + 1] === "|" ? "|" : line[i] + line[i + 1]; i++; }
    else if (line[i] === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += line[i];
  }
  cells.push(cell.trim());
  if (line.startsWith("|")) cells.shift();
  if (cells.length > 1 && cells.at(-1) === "" && line.endsWith("|")) cells.pop();
  return cells;
}
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
    if (line.includes("|") && i + 1 < lines.length) {
      const headers = tableCells(line), separators = tableCells(lines[i + 1]);
      // shortcut: wider than 32 columns stays readable as text; extend for a real wider table.
      if (headers.length <= 32 && headers.length === separators.length && separators.every(cell => /^:?-+:?$/.test(cell))) {
        flush(); const start = i, rows: string[][] = []; i++;
        while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3,}|~{3,})/.test(lines[i + 1])) rows.push(tableCells(lines[++i]).slice(0, headers.length));
        blocks.push({ kind: "table", text: lines.slice(start, i + 1).join("\n"), headers, alignments: separators.map(cell => cell.endsWith(":") ? cell.startsWith(":") ? "center" : "right" : "left"), rows });
        continue;
      }
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line), list = /^\s*([-*+] |\d+[.)] )(.+)$/.exec(line), quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading || list || quote) {
      flush();
      if (heading) blocks.push({ kind: "heading", text: heading[2], level: heading[1].length });
      else if (list) {
        const task = /^\[([ xX])\]\s+(.*)$/.exec(list[2]);
        blocks.push({ kind: "list", text: task ? task[2] : list[2], marker: /^\d/.test(list[1]) ? list[1].trim() : "•", ...(task ? { checked: task[1].toLowerCase() === "x" } : {}) });
      }
      else if (quote) blocks.push({ kind: "quote", text: quote[1] });
    } else paragraph.push(line);
  }
  flush(); return blocks;
}

export function descriptionLink(raw: string, base?: string | null): string | null {
  try { const url = new URL(raw, base ?? undefined); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
