import assert from "node:assert/strict";
import { test } from "node:test";
import { selectReviewer, reviewRuleText, reviewerDropdown, type ReviewerDraft } from "./reviewers-draft.ts";

const alice = { id: 1, name: "Alice", username: "alice" };
const bob = { id: 2, name: "Bob", username: "bob" };

test("普通与必要多选可连续添加、取消；移动角色保留一个人及原始名单", () => {
  const original: ReviewerDraft[] = [{ ...alice, necessary: false, unknown: false }];
  const added = selectReviewer(original, bob, true);
  assert.deepEqual(added.map(p => [p.id, p.necessary]), [[1, false], [2, true]]);
  const moved = selectReviewer(added, alice, true);
  assert.deepEqual(moved.map(p => [p.id, p.necessary]), [[1, true], [2, true]]);
  const removed = selectReviewer(moved, alice, true);
  assert.deepEqual(removed.map(p => p.id), [2]);
  assert.deepEqual(original, [{ ...alice, necessary: false, unknown: false }]);
});

test("满100人仍可移除或移动角色，但不能添加；未知角色不能被默认为普通角色", () => {
  const people = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: "Fixture", username: `user${i}`, necessary: false, unknown: false }));
  assert.equal(selectReviewer(people, { ...bob, id: 101 }, true), people);
  assert.equal(selectReviewer(people, people[0], true).filter(p => p.necessary).length, 1);
  assert.equal(selectReviewer(people, people[0], false).length, 99);
  const unknown = [{ ...alice, necessary: false, unknown: true }];
  assert.equal(selectReviewer(unknown, alice, true), unknown);
});

test("评审规则明确区分缺失、无需、全部与至少指定人数", () => {
  assert.equal(reviewRuleText(null), "规则待核对");
  assert.equal(reviewRuleText(undefined), "规则待核对");
  assert.equal(reviewRuleText(0), "无需同意");
  assert.equal(reviewRuleText(-1), "全部同意");
  assert.equal(reviewRuleText(2), "至少 2 人同意");
});

test("悬浮候选靠近底部向上打开，窄屏不会越过容器，也不改变表单高度", () => {
  assert.deepEqual(reviewerDropdown(40, 36, 600), { top: 80, maxHeight: 280 });
  const above = reviewerDropdown(350, 36, 440);
  assert(above.bottom !== undefined && above.bottom >= 440 - 350 && above.bottom + above.maxHeight <= 440);
  const small = reviewerDropdown(120, 36, 200);
  assert(small.bottom !== undefined && small.bottom + small.maxHeight <= 200);
});
