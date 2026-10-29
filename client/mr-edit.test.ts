import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, props, siteUrl, accountId, button, input, press, fill, until } from "../scripts/client-test-host.ts";
import { createElement } from "react";
import type { MrDetail } from "../shared/detail.ts";

const { MRDetail } = await import("./detail.tsx");
const reference = { siteUrl, accountId, projectId: 10, mrId: 100 };
const original: MrDetail = { projectId: 10, id: 100, iid: 5, title: "Old title", description: "Original", descriptionTruncated: false, state: "opened",
  sourceProjectId: 42, targetProjectId: 10, sourceBranch: "feature", targetBranch: "main", sourceSha: null, targetSha: null, baseSha: null,
  stateRevision: "a".repeat(64), editRevision: "b".repeat(64), updatedAt: null, url: `${siteUrl}/Team/Repo/merge_requests/5` };
const page = () => createElement(MRDetail, { ...props, params: { siteUrl, accountId: "7", projectId: "10", mrId: "100" }, onBack() {} });
function reads(name: string, detail: MrDetail) {
  if (name === "mr.detail") return { ok: true, detail, fetchedAt: "2026-10-29T00:00:00Z" };
  if (name === "mr.review") return { ok: false, error: "not_found" };
  if (name === "mr.tapd") return { ok: true, items: [], incomplete: false };
  throw Error(`Unexpected RPC: ${name}`);
}

test("编辑入口保存标题只发送修改字段并更新详情，取消时保护描述草稿", async t => {
  let current = original, writes = 0;
  const screen = await mount(page(), async (name, data) => {
    if (name !== "mr.edit") return reads(name, current);
    writes++;
    assert.deepEqual(data, { ...reference, revision: original.editRevision, title: "New title" });
    current = { ...current, title: "New title", editRevision: "c".repeat(64) };
    return { ok: true, current };
  });
  t.after(() => screen.close());
  await until(() => button("编辑标题与描述"));
  await press("编辑标题与描述");
  assert.equal(button("保存 MR").disabled, true);
  await fill("MR 标题", "   "); assert.equal(button("保存 MR").disabled, true);
  await fill("MR 标题", " New title ");
  await press("保存 MR");
  await until(() => assert.equal(screen.container.querySelector('[role="dialog"]'), null));
  assert.equal(writes, 1); assert.match(screen.container.textContent ?? "", /New title  !5/);
  await press("编辑标题与描述");
  await fill("MR 描述", "## Draft");
  await press("取消编辑"); await press("继续编辑");
  assert.equal(input("MR 描述").value, "## Draft");
  await press("取消编辑"); await press("放弃改动并离开");
  assert.equal(screen.container.querySelector('[role="dialog"]'), null);
  assert.equal(writes, 1);
});

test("刷新不覆盖编辑快照，冲突保留草稿并阻止直接重发", async t => {
  let current = original, writes = 0;
  const screen = await mount(page(), async (name, data) => {
    if (name !== "mr.edit") return reads(name, current);
    writes++;
    assert.deepEqual(data, { ...reference, revision: original.editRevision, description: "Local draft" });
    return { ok: false, error: "stale_mr_edit", current };
  });
  t.after(() => screen.close());
  await until(() => button("编辑标题与描述")); await press("编辑标题与描述");
  await fill("MR 描述", "Local draft");
  current = { ...original, description: "Remote draft", editRevision: "c".repeat(64) };
  await until(() => button("刷新")); await press("刷新"); await until(() => button("刷新"));
  assert.equal(input("MR 描述").value, "Local draft");
  await press("保存 MR");
  await until(() => assert.match(screen.container.textContent ?? "", /远端标题或描述已变化/));
  assert.equal(input("MR 描述").value, "Local draft");
  assert.equal(button("保存 MR").disabled, true); assert.equal(writes, 1);
});

for (const transportFailure of [false, true]) test(`清空描述保留标题，提交期间禁用关闭，${transportFailure ? "传输失败" : "结果未知"}保留草稿`, async t => {
  let complete!: () => void, writes = 0;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const screen = await mount(page(), async (name, data) => {
    if (name !== "mr.edit") return reads(name, original);
    writes++;
    assert.deepEqual(data, { ...reference, revision: original.editRevision, description: "" });
    await pending;
    if (transportFailure) throw Error("Transport unavailable");
    return { ok: false, error: "outcome_unknown", attempted: true };
  });
  t.after(() => screen.close());
  await until(() => button("编辑标题与描述")); await press("编辑标题与描述");
  await fill("MR 描述", ""); await press("保存 MR");
  await until(() => assert.equal(button("保存中…").disabled, true)); assert.equal(button("取消编辑").disabled, true);
  complete();
  await until(() => assert.match(screen.container.textContent ?? "", /保存结果不确定/));
  assert.equal(input("MR 描述").value, ""); assert.equal(input("MR 标题").value, original.title);
  assert.equal(button("保存 MR").disabled, true); assert.equal(writes, 1);
});

test("截断描述只读，仍可保存标题", async t => {
  let current = { ...original, descriptionTruncated: true }, writes = 0;
  const screen = await mount(page(), async (name, data) => {
    if (name !== "mr.edit") return reads(name, current);
    writes++; assert.deepEqual(data, { ...reference, revision: original.editRevision, title: "New" });
    current = { ...current, title: "New" }; return { ok: true, current };
  });
  t.after(() => screen.close());
  await until(() => button("编辑标题与描述")); await press("编辑标题与描述");
  assert.equal(input("MR 描述").disabled, true);
  await fill("MR 标题", "New"); await press("保存 MR");
  await until(() => assert.equal(screen.container.querySelector('[role="dialog"]'), null));
  assert.equal(writes, 1);
});
