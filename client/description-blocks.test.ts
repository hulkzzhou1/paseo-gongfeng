import assert from "node:assert/strict";
import { test } from "node:test";
import { descriptionBlocks, descriptionLink, descriptionExcerpt } from "./description-blocks.ts";
test("description summary has a fixed 120 character limit without splitting emoji", () => {
  assert.equal(descriptionExcerpt("  one\n\n two  "), "one two");
  assert.equal(descriptionExcerpt("😀".repeat(121)), "😀".repeat(120) + "…");
  assert.equal(descriptionExcerpt("x".repeat(120)), "x".repeat(120));
});
test("description preserves paragraphs, headings, lists, quotes and literal code", () => {
  const blocks = descriptionBlocks("# Summary\r\n\r\nFirst\nsecond\n\n- one\n2. two\n> note\n```ts\nconst x = '<script>';\n```\nEnd");
  assert.deepEqual(blocks.map(b => b.kind), ["heading", "paragraph", "list", "list", "quote", "code", "paragraph"]);
  assert.equal(blocks[1].text, "First\nsecond"); assert.equal(blocks[5].text, "const x = '<script>';" );
});
test("unclosed fences preserve all remaining code and longer fences retain inner fences", () => {
  assert.equal(descriptionBlocks("```\na\nb")[0].text, "a\nb");
  assert.equal(descriptionBlocks("````md\n```\ntext\n```\n````")[0].text, "```\ntext\n```");
});
test("description links allow web URLs and relative links but reject executable schemes and credentials", () => {
  assert.equal(descriptionLink("/group/repo", "https://git.woa.com/a"), "https://git.woa.com/group/repo");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "https://user:secret@example.com"]) assert.equal(descriptionLink(url), null);
});
