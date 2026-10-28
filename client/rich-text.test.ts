import assert from "node:assert/strict";
import { test } from "node:test";
import { richBlocks, richInline, richExcerpt } from "./rich-text.ts";

const base = "https://code.example.com/team/repo/merge_requests/1";

test("描述摘要显示正文而非 Markdown 标记、链接地址和表格分隔行，仍限制120字符", () => {
  assert.equal(richExcerpt('## 发布计划\n\n- [x] **完成** `API` [关联项](https://example.com/private/path)\n\n| 项目 | 状态 |\n| --- | --- |\n| SDK | 待办 |'), "发布计划 完成 API 关联项 项目 状态 SDK 待办");
  assert.equal(richExcerpt("**" + "😀".repeat(121) + "**"), "😀".repeat(120) + "…");
});

test("里程碑表格和任务清单保留结构，单元格继续支持安全的链接与行内代码", () => {
  const blocks = richBlocks('## 计划\n\n| 项目 | 状态 | 关联 |\n| :--- | :---: | ---: |\n| API | **进行中** | [`!12`](https://example.com/mr/12) |\n\n- [x] 接口确认\n- [ ] 联调验证');
  assert.deepEqual(blocks.map(b => b.kind), ["heading", "table", "list", "list"]);
  const table = blocks[1]; assert(table.kind === "table");
  assert.deepEqual(table.headers, ["项目", "状态", "关联"]);
  assert.deepEqual(table.alignments, ["left", "center", "right"]);
  assert.deepEqual(table.rows, [["API", "**进行中**", "[`!12`](https://example.com/mr/12)"]]);
  assert.equal(richInline(table.rows[0][2], base)[0].kind, "link");
  assert.deepEqual(blocks.slice(2).map(b => b.kind === "list" ? [b.text, b.checked] : null), [["接口确认", true], ["联调验证", false]]);
});

test("表格接受可选边界、转义竖线和缺列；普通竖线正文和代码不误判", () => {
  const blocks = richBlocks('A | B\n--- | ---\n`a\\|b` | **ok**\nshort\n\nA | B\n不是分隔行\n\n```md\n| A | B |\n| --- | --- |\n```');
  const table = blocks[0]; assert(table.kind === "table");
  assert.deepEqual(table.rows, [["`a|b`", "**ok**"], ["short"]]);
  assert.equal(blocks[1].kind, "paragraph");
  assert.equal(blocks[2].kind, "code");
  assert.equal(richBlocks("| A | B |\n| --- |\n")[0].kind, "paragraph");
});

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
  assert.deepEqual(richInline("<strong>outer <strong>inner</strong> tail</strong>"), [{ kind: "strong", children: [{ kind: "text", text: "outer " }, { kind: "strong", children: [{ kind: "text", text: "inner" }] }, { kind: "text", text: " tail" }] }]);
});

test("未闭合的大段 Markdown 和 HTML 不阻塞正文解析", () => {
  const start = performance.now();
  for (const source of ["[".repeat(100000), "<a>".repeat(33000), "<strong>".repeat(12000), "`".repeat(100000), "<".repeat(100000)]) {
    assert(Array.isArray(richInline(source, base)));
  }
  assert(performance.now() - start < 1500, "malformed inline input must not stall rendering");
});

test("多段 HTML pre 保留代码边界，行内代码中的 pre 不变成块或图片", () => {
  const body = 'before\n\n<img src="https://example.com/hidden.png">\nafter';
  assert.deepEqual(richBlocks('<pre><code>' + body + '</code></pre>'), [{ kind: "code", text: body }]);
  const inline = '使用 `<pre><img src="https://example.com/code.png"></pre>` 示例';
  assert.deepEqual(richBlocks(inline), [{ kind: "paragraph", text: inline }]);
  assert.deepEqual(richInline(richBlocks(inline)[0].text, base).map(t => t.kind), ["text", "code", "text"]);
  assert.deepEqual(richBlocks('```html\n<pre>\n\n<img src="https://example.com/code.png">\n</pre>\n```'), [{ kind: "code", text: '<pre>\n\n<img src="https://example.com/code.png">\n</pre>', marker: "html" }]);
});

test("正文上限内的未闭合 pre 和错误类型闭合不会反复扫描后缀", () => {
  const start = performance.now();
  for (let i = 0; i < 8; i++) {
    assert.equal(richBlocks("<pre>".repeat(20000))[0].kind, "code");
    assert.deepEqual(richBlocks("<!--".repeat(25000)), []);
    assert.deepEqual(richInline("<strong>".repeat(12499) + "</em>"), []);
  }
  assert(performance.now() - start < 1000, "repeated renders of bounded malformed text must stay responsive");
});
