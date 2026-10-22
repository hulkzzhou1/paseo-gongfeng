import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiffLines } from "./diff-lines.ts";

test("unified diff keeps independent line numbers across changes and hunks", () => {
  const lines = parseDiffLines("@@ -4,2 +4,3 @@\n same\n-old\n+new\n+extra\n@@ -20 +21 @@\n-before\n+after\n");
  assert.deepEqual(lines.filter(l => l.kind !== "hunk").map(l => [l.kind, l.oldLine, l.newLine]), [
    ["context", 4, 4], ["remove", 5, undefined], ["add", undefined, 5], ["add", undefined, 6], ["remove", 20, undefined], ["add", undefined, 21],
  ]);
});
test("file headers, binary and malformed data do not invent line numbers", () => {
  const lines = parseDiffLines("--- a/file\n+++ b/file\nBinary files differ\n@@ invalid\n+unverified\n");
  assert.ok(lines.every(l => l.kind === "meta" && l.oldLine === undefined && l.newLine === undefined));
});
test("new and deleted files honor zero ranges and missing newline markers", () => {
  assert.deepEqual(parseDiffLines("@@ -0,0 +1 @@\n+new\n\\ No newline at end of file\n").map(l => l.kind), ["hunk", "add", "meta"]);
  const removed = parseDiffLines("@@ -1 +0,0 @@\n-old");
  assert.equal(removed[1].oldLine, 1);
  assert.equal(removed[1].newLine, undefined);
});
test("a source line resembling a file header is still a change inside a hunk", () => {
  assert.deepEqual(parseDiffLines("@@ -1 +1 @@\n---old\n+++new").map(l => l.kind), ["hunk", "remove", "add"]);
});
test("empty input, CRLF and exhausted ranges remain faithful", () => {
  assert.deepEqual(parseDiffLines(""), []);
  const lines = parseDiffLines("@@ -1 +1 @@\r\n-a\r\n+b\r\n+outside\r\n");
  assert.equal(lines[2].text, "+b");
  assert.equal(lines[3].kind, "meta");
});
