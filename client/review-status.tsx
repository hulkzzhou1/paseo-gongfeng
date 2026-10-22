import { useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import type { RpcOutput } from "@getpaseo/plugin";
import type { mrReview, MrRef } from "../shared/detail.ts";
import { reviewerReference } from "../shared/reviewers.ts";
import { ReviewerAvatar } from "./reviewer-avatar.tsx";
import { EditReviewers } from "./reviewers.tsx";
import { SubmitReview } from "./submit-review.tsx";
import { Action, WorkbenchCard, workbenchStyles, type Theme } from "./workbench-ui.tsx";

type Review = Extract<RpcOutput<typeof mrReview>, { ok: true }>;
type Reviewer = Review["reviewers"][number];

function verdict(state: string, personal = false) {
  switch (state) {
    case "approved": return { label: personal ? "已同意" : "评审通过", icon: "Check", tone: "statusSuccess" } as const;
    case "approving": return { label: "评审中", icon: "Clock", tone: "statusWarning" } as const;
    case "change_required": return { label: "请求修改", icon: "RotateCcw", tone: "statusDanger" } as const;
    case "change_denied":
    case "denied": return { label: "已拒绝", icon: "X", tone: "statusDanger" } as const;
    case "commented": return { label: "已评论", icon: "MessageSquare", tone: "foregroundMuted" } as const;
    case "closed": return { label: "评审已关闭", icon: "Minus", tone: "foregroundMuted" } as const;
    case "empty": return { label: "尚未发起评审", icon: "Minus", tone: "foregroundMuted" } as const;
    case "unknown": return { label: "状态待核对", icon: "Info", tone: "foregroundMuted" } as const;
    default: return { label: `未知状态（${state}）`, icon: "Info", tone: "foregroundMuted" } as const;
  }
}

function ApprovalRule({ theme, rule, reviewers, necessary, peopleKnown = true }: {
  theme: Theme; rule: number | null; reviewers: Reviewer[]; necessary?: boolean; peopleKnown?: boolean;
}) {
  const styles = workbenchStyles(theme), c = theme.colors;
  const group = necessary ? "必要评审人" : "评审人";
  const approved = reviewers.filter(r => r.state === "approved").length;
  const required = rule === -1 ? reviewers.length : rule;
  const met = peopleKnown && reviewers.length > 0 && required !== null && required > 0 && approved >= required;
  const known = rule !== null && (rule === 0 || peopleKnown);
  const label = rule === null ? `${group}规则待核对`
    : rule === 0 ? `无需${group}同意`
    : rule === -1 ? `需全部${group}同意`
    : rule === 1 ? necessary ? "至少 1 位必要评审人同意" : "单评审人同意即可通过"
    : `至少 ${rule} 位${group}同意`;
  const color = met ? c.statusSuccess : known && rule !== 0 ? c.statusWarning : c.foregroundMuted;
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
    <View style={{ paddingTop: 2 }}><Icon name={!known ? "Info" : rule === 0 ? "Minus" : met ? "Check" : "Clock"} size={15} color={color} /></View>
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
      <Text style={styles.text}>{label}</Text>
      {rule !== null && rule !== 0 ? <Text style={styles.muted}>{peopleKnown ? `（${approved} / ${required} 已同意）` : "（必要评审人信息待核对）"}</Text> : null}
    </View>
  </View>;
}

export function ReviewStatus({ theme, reference, review, loading, error, url, sourceSha, mrState }: {
  theme: Theme; reference: MrRef; review?: Review; loading: boolean; error: string | null; url?: string | null; sourceSha?: string | null; mrState?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false), [editNotice, setEditNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const editReference = reviewerReference.safeParse(reference);
  const styles = workbenchStyles(theme), c = theme.colors;
  const reviewers = [...new Map((review?.reviewers ?? []).map(r => [r.id, r])).values()];
  const state = review ? verdict(review.state) : undefined;
  const self = reviewers.find(p => p.id === reference.accountId);
  const submitHint = !sourceSha ? "源提交尚未核对，请先刷新详情。" : !["opened", "reopened"].includes(mrState ?? "") ? "当前 MR 未开放，不能在此提交评审意见。" : "";
  return <WorkbenchCard theme={theme} title="代码评审" icon="Users" testID="gongfeng-review-status" right={state ? <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name={state.icon} size={15} color={c[state.tone]} />
        <Text style={{ ...styles.text, fontWeight: "600", color: c[state.tone] }}>{state.label}</Text>
      </View> : null}>
    <View style={{ padding: 12, gap: 12 }}>
      {editNotice ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{editNotice}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: c.statusDanger }}>{error}{review ? " 以下为上次读取结果。" : ""}</Text> : null}
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{review ? "正在更新评审状态…" : "正在加载评审状态…"}</Text> : null}
      {review ? <>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <Text style={[styles.text, { fontWeight: "600" }]}>评审人</Text>
          <View testID="reviewer-avatars" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
            {reviewers.slice(0, 6).map(person => {
              const status = verdict(person.state, true);
              return <View key={person.id} accessibilityLabel={`${person.name} @${person.username} · ${person.type === "necessary" ? "必要评审人 · " : ""}${status.label}`} style={{ marginVertical: 3 }}>
                <ReviewerAvatar person={person} theme={theme} size={30} />
                {person.type === "necessary" ? <View style={{ position: "absolute", top: -4, right: -4, padding: 1, backgroundColor: c.surface0, borderRadius: 7 }}><Icon name="Star" size={11} color={c.statusWarning} /></View> : null}
                <View style={{ position: "absolute", bottom: -3, right: -3, padding: 1, backgroundColor: c.surface0, borderRadius: 7 }}><Icon name={status.icon} size={11} color={c[status.tone]} /></View>
              </View>;
            })}
            {reviewers.length > 6 ? <Text style={styles.muted}>+{reviewers.length - 6}</Text> : null}
          </View>
          {reviewers.length ? <Action theme={theme} dense quiet pill iconOnly label={expanded ? "收起评审人" : "展开评审人"} icon={expanded ? "ChevronUp" : "ChevronDown"} onPress={() => setExpanded(value => !value)} /> : <Text style={styles.muted}>暂无评审人</Text>}
        </View>
        {expanded ? <View style={{ borderTopWidth: 1, borderColor: c.border }}>
          {reviewers.map(person => {
            const status = verdict(person.state, true);
            return <View key={person.id} style={{ paddingVertical: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <ReviewerAvatar person={person} theme={theme} size={28} />
              <View style={{ flex: 1, minWidth: 120 }}><Text style={[styles.text, { fontWeight: "600" }]}>{person.name || person.username}</Text><Text style={styles.muted}>@{person.username}</Text></View>
              {person.type === "necessary" ? <Text style={{ ...styles.muted, color: c.foreground, backgroundColor: c.surface2, paddingHorizontal: 5, borderRadius: 3 }}>必要评审人</Text> : null}
              <Icon name={status.icon} size={14} color={c[status.tone]} /><Text style={{ ...styles.text, color: c[status.tone] }}>{status.label}</Text>
            </View>;
          })}
        </View> : null}
        <View style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: 12, gap: 9 }}>
          <ApprovalRule theme={theme} rule={review.approverRule ?? null} reviewers={reviewers} />
          <ApprovalRule theme={theme} necessary rule={review.necessaryApproverRule ?? null} reviewers={reviewers.filter(r => r.type === "necessary")} peopleKnown={reviewers.every(r => typeof r.type === "string" && ["invite", "suggestion", "necessary"].includes(r.type))} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="Info" size={15} color={c.foregroundMuted} />
            {url ? <ExternalLink href={url} accessibilityLabel="在工蜂核对讨论解决情况"><Text style={styles.muted}>讨论解决情况 · 在工蜂核对</Text></ExternalLink> : <Text style={styles.muted}>讨论解决情况待核对</Text>}
          </View>
        </View>
        <View style={[styles.toolbar, { borderTopWidth: 1, borderColor: c.border, paddingTop: 10 }]}>
          <Action theme={theme} dense label="编辑评审人" icon="Pencil" disabled={loading || !!error || !review.revision || !editReference.success} onPress={() => { setEditNotice(""); setEditing(true); }} />
          {self ? <>
            <Text style={[styles.muted, { flex: 1, minWidth: 100 }]}>{submitHint || (self.state === "approved" ? "你已同意，可再次发表评审意见。" : "提交当前账号的评审意见。")}</Text>
            <Action theme={theme} dense primary label={self.state === "approved" ? "已同意" : "同意"} icon="Check" disabled={loading || !!error || !!submitHint || !review.revision || !editReference.success} onPress={() => { setEditNotice(""); setSubmitting(true); }} />
          </> : null}
        </View>
      </> : null}
    </View>
    {editing && review && editReference.success ? <EditReviewers theme={theme} reference={editReference.data} review={review} onClose={() => setEditing(false)} onSaved={() => setEditNotice("评审人已更新。") } /> : null}
    {submitting && review && sourceSha && editReference.success ? <SubmitReview theme={theme} reference={editReference.data} review={review} sourceSha={sourceSha} onClose={() => setSubmitting(false)} onSubmitted={() => setEditNotice("评审意见已提交。") } /> : null}
  </WorkbenchCard>;
}
