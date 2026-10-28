import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, props, repository, siteUrl, accountId, button, input, press, fill, until } from "../scripts/client-test-host.ts";
import { createElement } from "react";
import { errorMessages } from "./errors.ts";

const { RepositoryManagement } = await import("./repositories.tsx");
const { Milestones } = await import("./milestones.tsx");
const { Issues } = await import("./issues.tsx");
const { IssueDetail } = await import("./issue-detail.tsx");
const milestone = { id: 100, iid: 1, projectId: repository.id, repositoryPath: repository.path, title: "Release", state: "active", description: "", descriptionTruncated: false, dueDate: null, updatedAt: null, revision: "a".repeat(64) };
const mr = { kind: "mr", id: 200, iid: 2, projectId: repository.id, title: "Fix", state: "opened", milestone: { id: milestone.id, title: milestone.title }, url: `${siteUrl}/Team/Repo/merge_requests/2` };
const issue = { id: 300, iid: 3, projectId: repository.id, repositoryPath: repository.path, title: "Issue", description: "", descriptionTruncated: false, state: "opened", confidential: false, author: null, assignees: [], labels: [], milestone: null, priority: null, priorityLabel: "", resolveState: null, updatedAt: null, createdAt: null, linkedIssues: 0, revision: "b".repeat(64), url: `${siteUrl}/Team/Repo/issues/3` };

test("收起克隆选项先确认草稿，继续编辑保留目标路径", async t => {
  const screen = await mount(createElement(RepositoryManagement, props), async name => {
    if (name === "repositories.bindings") return { ok: true, bindings: [], projects: [] };
    if (name === "repositories.clones") return { ok: true, operations: [] };
    throw Error(`Unexpected RPC: ${name}`);
  });
  t.after(() => screen.close());
  await until(() => button(`关联项目 ${repository.path}`));
  await press(`关联项目 ${repository.path}`);
  await press("没有本地项目？克隆并创建");
  await fill("本机目标绝对路径", "/tmp/fictional-repository");
  await press("收起克隆选项");
  await until(() => button("继续编辑"));
  await press("继续编辑");
  assert.equal(input("本机目标绝对路径").value, "/tmp/fictional-repository");
  await press("收起克隆选项");
  await press("放弃改动并离开");
  assert.equal(screen.container.querySelector('input[aria-label="本机目标绝对路径"]'), null);
});

for (const kind of ["issues", "milestones"] as const) for (const error of ["network_error", "forbidden"] as const) {
  test(`${kind} 后续分页 ${error} 时${error === "forbidden" ? "隐藏失权仓库的旧数据" : "保留已加载数据"}`, async t => {
    const component = kind === "issues" ? createElement(Issues, { ...props, onMergeRequests() {}, onMilestones() {}, onManageRepositories() {} }) : createElement(Milestones, { ...props, onIssues() {}, onMergeRequests() {}, onManageRepositories() {} });
    const screen = await mount(component, async (name, input) => {
      assert.equal(name, `${kind}.page`);
      return (input as { cursors?: unknown[] }).cursors ? { ok: true, items: [], next: [], repositoryCount: 1, failures: [{ projectId: repository.id, error }] }
        : { ok: true, items: [kind === "issues" ? issue : milestone], next: [{ projectId: repository.id, page: 2 }], repositoryCount: 1, failures: [] };
    });
    t.after(() => screen.close());
    const label = kind === "issues" ? `查看议题 ${repository.path} #3` : `查看里程碑 ${repository.path} Release`;
    await until(() => button(label));
    await press(kind === "issues" ? "加载更多议题" : "加载更多里程碑");
    await until(() => assert.ok(screen.container.textContent?.includes(errorMessages[error])));
    assert.equal([...screen.container.querySelectorAll("button")].some(node => node.getAttribute("aria-label") === label), error !== "forbidden");
  });
}

test("议题状态结果未知后，后台读取和失败刷新不解锁，明确刷新成功后可再次确认", async t => {
  let failRead = false;
  let currentIssue = issue;
  const screen = await mount(createElement(IssueDetail, { ...props, reference: { siteUrl, accountId, projectId: repository.id, issueId: issue.id }, ready: true, onClose() {}, onMilestones() {} }), async name => {
    if (name === "issues.detail") return failRead ? { ok: false, error: "network_error" } : { ok: true, issue: currentIssue };
    if (name === "issues.notes") return { ok: true, items: [], nextPage: null };
    if (name === "issues.save") { currentIssue = { ...issue, revision: "c".repeat(64) }; return { ok: false, error: "outcome_unknown" }; }
    throw Error(`Unexpected RPC: ${name}`);
  });
  t.after(() => screen.close());
  await until(() => button("关闭议题"));
  await press("关闭议题");
  await press("确认");
  await until(() => assert.equal(button("确认").disabled, true));
  await until(() => assert.equal(button("刷新详情").disabled, false));
  await press("取消");
  await press("关闭议题");
  assert.equal(button("确认").disabled, true);
  failRead = true;
  await press("刷新详情");
  await until(() => assert.equal(button("刷新详情").disabled, false));
  assert.equal(button("确认").disabled, true);
  failRead = false;
  await press("刷新详情");
  await until(() => assert.equal(button("刷新详情").disabled, false));
  await press("关闭议题");
  assert.equal(button("确认").disabled, false);
});

test("从里程碑关联草稿打开 MR 前确认，取消离开保留待移除项", async t => {
  const screen = await mount(createElement(Milestones, { ...props, onIssues() {}, onMergeRequests() {}, onManageRepositories() {} }), async (name, input) => {
    if (name === "milestones.page") return { ok: true, items: [milestone], next: [], repositoryCount: 1, failures: [] };
    if (name === "milestones.detail") return { ok: true, milestone };
    if (name === "milestones.items") return { ok: true, items: (input as { kind: string }).kind === "mr" ? [mr] : [], nextPage: null };
    if (name.startsWith("mr.")) return { ok: false, error: "network_error" };
    throw Error(`Unexpected RPC: ${name}`);
  });
  t.after(() => screen.close());
  await until(() => button(`查看里程碑 ${repository.path} Release`));
  await press(`查看里程碑 ${repository.path} Release`);
  await until(() => button("编辑关联"));
  await press("编辑关联");
  const editor = screen.container.querySelector('[role="dialog"][aria-label="编辑里程碑关联"]'); assert(editor);
  await press("合并请求", editor);
  await until(() => button("移除", editor));
  await press("移除", editor);
  await press("查看 MR", editor);
  await until(() => button("继续编辑"));
  await press("继续编辑");
  assert.match(screen.container.textContent ?? "", /待保存 · 1 项/);
  await press("查看 MR", editor);
  await press("放弃改动并离开");
  assert.equal(screen.container.querySelector('[role="dialog"][aria-label="编辑里程碑关联"]'), null);
});
