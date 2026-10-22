import assert from "node:assert/strict";
import { test } from "node:test";
import { richBlocks, richInline } from "./rich-text.ts";

const base = "https://code.example.com/team/repo/merge_requests/1";

test("讨论的 Markdown 与机器人 HTML 徽章、链接混排，不展示包装标签", () => {
  const blocks = richBlocks('### 检查结果\n<div><img src="https://img.shields.io/badge/status-passed-green" />&nbsp;&nbsp;<a href="https://example.com/result?a=1&amp;b=2"><img src="/badge.svg" alt="查看结果" /></a></div>\n\n#### 建议\n使用 `value`，**先检查**。\n\n---');
  assert.deepEqual(blocks.map(b => b.kind), ["heading", "paragraph", "heading", "paragraph", "rule"]);
  const badges = richInline(blocks[1].text, base);
  assert.equal(badges[0].kind, "image");
  const link = badges.find(t => t.kind === "link"); assert(link?.kind === "link");
  assert.equal(link.href, "https://example.com/result?a=1&b=2"); assert.equal(link.children[0].kind, "image");
  const formatted = richInline(blocks[3].text, base);
  assert(formatted.some(t => t.kind === "code")); assert(formatted.some(t => t.kind === "strong"));
});

test("可执行 HTML、事件属性、危险链接不进入可操作内容，实体先解码再校验", () => {
  const blocks = richBlocks('<script>alert(1)</script><div>保留正文</div><iframe src="https://example.com">隐藏</iframe>');
  assert.equal(blocks.map(b => b.text).join(''), "保留正文");
  const tokens = richInline('<a href="javascript&#58;alert(1)" onclick="bad()">安全文字</a><img src="data:image/svg+xml,bad" onerror="bad()" alt="附件"/><a href="https://user:secret@example.com">文字</a>', base);
  assert(tokens.every(t => t.kind !== "link" && t.kind !== "image"));
  assert(richInline('<a>文字</a><img alt="附件" />', base).every(t => t.kind !== "link" && t.kind !== "image"));
  assert(tokens.some(t => t.kind === "text" && t.text.includes("安全文字")));
  const good = richInline('<img src="https://example.com/badge.png" onerror="bad()" />', base)[0];
  assert(good.kind === "image"); assert.deepEqual(Object.keys(good).sort(), ["alt", "kind", "src"]);
});

test("代码围栏、行内代码及 HTML pre 中的标签保持字面内容，不当作图片加载", () => {
  const code = '<img src="https://example.com/a.png" />';
  assert.equal(richBlocks('```html\n'+code+'\n```')[0].text, code);
  assert.deepEqual(richInline('`'+code+'`', base), [{ kind: "code", text: code }]);
  const pre = richBlocks('<pre><code>const x = &lt;div&gt;;\n  keep spaces</code></pre>');
  assert.deepEqual(pre, [{ kind: "code", text: 'const x = <div>;\n  keep spaces' }]);
});

test("相对链接、HTML 格式和 Markdown 图片链接可读；未知标签不原样输出", () => {
  const tokens = richInline('<strong>A &amp; B</strong> <em>note</em> [![badge](/badge.svg)](/result) <span>text</span>', base);
  assert(tokens.some(t => t.kind === "strong")); assert(tokens.some(t => t.kind === "emphasis"));
  const link = tokens.find(t => t.kind === "link"); assert(link?.kind === "link");
  assert.equal(link.href, "https://code.example.com/result"); assert.equal(link.children[0].kind, "image");
  assert(!tokens.some(t => t.kind === "text" && t.text.includes("<span>")));
});

test("未闭合的大段 Markdown 和 HTML 不阻塞正文解析", () => {
  const start = performance.now();
  for (const source of ["[".repeat(100000), "<a>".repeat(33000), "<strong>".repeat(12000), "`".repeat(100000), "<".repeat(100000)]) {
    assert(Array.isArray(richInline(source, base)));
  }
  assert(performance.now() - start < 1500, "malformed inline input must not stall rendering");
});
