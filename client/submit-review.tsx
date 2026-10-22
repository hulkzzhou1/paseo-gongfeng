import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import type { RpcOutput } from "@getpaseo/plugin";
import type { z } from "zod";
import { mrReview } from "../shared/detail.ts";
import { reviewerReference, reviewEvent, submitReview } from "../shared/reviewers.ts";
import { errorMessages } from "./errors.ts";
import { Action, mono, workbenchStyles, type Theme } from "./workbench-ui.tsx";

type Review = Extract<RpcOutput<typeof mrReview>, { ok: true }>;
const options = [
  { value: "approve", label: "同意", tone: "statusSuccess" },
  { value: "require_change", label: "需要修改", tone: "statusWarning" },
  { value: "deny", label: "明确拒绝", tone: "statusDanger" },
  { value: "comment", label: "评论", tone: "foreground" },
] as const;

export function SubmitReview({ theme, reference, review, sourceSha, onClose, onSubmitted }: {
  theme: Theme; reference: z.infer<typeof reviewerReference>; review: Review; sourceSha: string; onClose(): void; onSubmitted(): void;
}) {
  const styles = workbenchStyles(theme), c = theme.colors, cache = useQueryClient(), rpc = useRpc(submitReview);
  const [event, setEvent] = useState<z.infer<typeof reviewEvent>>("approve"), [summary, setSummary] = useState("");
  // Keep the user's reviewed version fixed while this modal is open.
  const [target] = useState(() => ({ revision: review.revision, sourceSha, username: review.reviewers.find(p => p.id === reference.accountId)?.username }));
  const [focused, setFocused] = useState<string>(), [message, setMessage] = useState(""), [blocked, setBlocked] = useState(false);
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const mutation = useMutation({ mutationFn: () => rpc({ ...reference, revision: target.revision!, sourceSha: target.sourceSha, event, summary }), retry: false,
    onSuccess(result) {
      if (result.current?.ok) cache.setQueryData([...key, "review"], result.current);
      if (result.ok) { void cache.invalidateQueries({ queryKey: key }); onSubmitted(); onClose(); return; }
      setBlocked(true);
      if (result.attempted) void cache.invalidateQueries({ queryKey: key });
      setMessage(result.error === "version_changed" || result.error === "stale_review" ? "MR 版本或评审状态已变化，本次未提交。请关闭弹窗并刷新详情后重新核对。"
        : result.error === "review_outcome_unknown" ? "无法确认本次意见是否完整提交，请关闭弹窗并刷新详情、在工蜂核对原始记录；不会自动重发。"
        : result.error === "forbidden" ? "工蜂未允许提交此意见，请检查当前账号、评审人资格及项目规则。"
        : errorMessages[result.error] ?? "意见未能提交，请关闭弹窗并刷新详情核对。");
    },
    onError() { setBlocked(true); setMessage("提交结果未知，请关闭弹窗并刷新详情、在工蜂核对原始记录；不会自动重发。"); void cache.invalidateQueries({ queryKey: key }); },
  });
  const busy = mutation.isPending;
  return <Modal title="发表评审意见" open onOpenChange={open => { if (!open && !busy) onClose(); }}><Modal.Content>
    <View testID="gongfeng-submit-review" style={{ gap: 14 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="评审意见类型" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={event === option.value} accessibilityState={{ checked: event === option.value, disabled: busy || blocked }}
          disabled={busy || blocked} onPress={() => setEvent(option.value)} onFocus={() => setFocused(option.value)} onBlur={() => setFocused(undefined)}
          style={{ minHeight: 36, paddingHorizontal: 5, borderRadius: 4, borderWidth: 1, borderColor: focused === option.value ? c.accent : "transparent", flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Icon name={event === option.value ? "CircleDot" : "Circle"} size={17} color={event === option.value ? c[option.tone] : c.foregroundMuted} /><Text style={styles.text}>{option.label}</Text>
        </Pressable>)}
      </View>
      <TextInput accessibilityLabel="评审附言（选填）" value={summary} onChangeText={setSummary} multiline maxLength={10000} editable={!busy && !blocked} placeholder="附言（选填）" placeholderTextColor={c.foregroundMuted}
        style={{ ...styles.text, minHeight: 120, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 6, backgroundColor: c.surface0 }} />
      <Text selectable style={styles.muted}>以 @{target.username} 提交 · <Text style={{ fontFamily: mono }}>源提交 {target.sourceSha.slice(0, 12)}</Text></Text>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={busy} onPress={onClose} /><Action theme={theme} primary label={busy ? "正在提交…" : "确认"} disabled={busy || blocked || !target.revision} onPress={() => mutation.mutate()} /></View>
    </View>
  </Modal.Content></Modal>;
}
