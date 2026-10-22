export type DiffLine = { kind: "context" | "add" | "remove" | "hunk" | "meta"; text: string; oldLine?: number; newLine?: number };

/** Only hunk headers establish line numbers; unknown content remains visible without invented positions. */
export function parseDiffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let oldLine = 0, newLine = 0, oldRemaining = 0, newRemaining = 0;
  return lines.map(raw => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (header) {
      oldLine = Number(header[1]); newLine = Number(header[3]);
      oldRemaining = Number(header[2] ?? 1); newRemaining = Number(header[4] ?? 1);
      return { kind: "hunk", text };
    }
    if (text.startsWith("\\")) return { kind: "meta", text };
    if (text.startsWith("+") && newRemaining > 0) { newRemaining--; return { kind: "add", text, newLine: newLine++ }; }
    if (text.startsWith("-") && oldRemaining > 0) { oldRemaining--; return { kind: "remove", text, oldLine: oldLine++ }; }
    if (text.startsWith(" ") && oldRemaining > 0 && newRemaining > 0) {
      oldRemaining--; newRemaining--;
      return { kind: "context", text, oldLine: oldLine++, newLine: newLine++ };
    }
    oldRemaining = 0; newRemaining = 0;
    return { kind: "meta", text };
  });
}
