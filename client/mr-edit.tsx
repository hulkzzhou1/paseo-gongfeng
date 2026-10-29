import { useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import type { MrDetail, MrRef } from "../shared/detail.ts";
import { editMr } from "../shared/mr-edit.ts";
import { useDraft } from "./draft-guard.tsx";
import { invalidateResources } from "./query-policy.ts";
import { errorMessages } from "./errors.ts";
import { widenDescriptionDialog } from "./web.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";

export function MREdit({ theme, reference, detail }: { theme: Theme; reference: MrRef; detail: MrDetail }) {
  const [initial, setInitial] = useState<MrDetail>();
  return <>
    <Action theme={theme} label="编辑标题与描述" disabled={!reference.accountId} onPress={() => setInitial(detail)} />
    {initial ? <MREditForm theme={theme} reference={reference} initial={initial} onClose={() => setInitial(undefined)} /> : null}
  </>;
}

function MREditForm({ theme, reference, initial, onClose }: { theme: Theme; reference: MrRef; initial: MrDetail; onClose(): void }) {
  const styles = workbenchStyles(theme), cache = useQueryClient(), rpc = useRpc(editMr), root = useRef<View>(null);
  useLayoutEffect(() => widenDescriptionDialog(root.current), []);
  const [title, setTitle] = useState(initial.title), [description, setDescription] = useState(initial.description);
  const [message, setMessage] = useState(""), [blocked, setBlocked] = useState(false);
  const input = { ...reference, accountId: reference.accountId!, revision: initial.editRevision,
    ...(title.trim() !== initial.title ? { title: title.trim() } : {}),
    ...(description !== initial.description ? { description } : {}) };
  const refresh = () => { void invalidateResources(cache, reference, ["mr", "board", "milestone", "milestones"]); };
  const mutation = useMutation({ retry: false, mutationFn: () => rpc(input),
    onSuccess(result) {
      if (result.current) cache.setQueryData(["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId, "detail"], { ok: true, detail: result.current, fetchedAt: new Date().toISOString() });
      if (result.ok) { refresh(); onClose(); return; }
      if (["account_changed", "unauthorized", "unconfigured"].includes(result.error)) { void cache.invalidateQueries({ queryKey: ["connection"] }); onClose(); return; }
      setBlocked(["stale_mr_edit", "mr_description_truncated", "outcome_unknown"].includes(result.error));
      setMessage(result.error === "stale_mr_edit" ? "远端标题或描述已变化，草稿已保留。本次未写入，请复制草稿并刷新核对后重新编辑。"
        : result.error === "mr_description_truncated" ? "远端描述超出编辑范围，请在工蜂原站编辑描述。"
        : result.error === "outcome_unknown" ? "保存结果不确定，草稿已保留。请复制草稿并关闭、刷新核对远端内容，不要直接重发。"
        : errorMessages[result.error] ?? "无法保存 MR，请检查工蜂权限。");
      if (result.attempted) refresh();
    },
    onError() { setBlocked(true); setMessage("保存结果不确定，草稿已保留。请复制草稿并关闭、刷新核对远端内容，不要直接重发。"); refresh(); },
  });
  const busy = mutation.isPending, requestClose = useDraft(title !== initial.title || description !== initial.description, busy);
  const inputStyle = { ...styles.text, minHeight: 38, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 9, backgroundColor: theme.colors.surface1 };
  return <Modal title="编辑 MR" open onOpenChange={open => { if (!open && !busy) requestClose(onClose); }}><Modal.Content>
    <View ref={root} style={{ gap: 12 }}>
      <Text style={styles.text}>标题</Text>
      <TextInput autoFocus accessibilityLabel="MR 标题" value={title} maxLength={255} onChangeText={setTitle} editable={!busy} style={inputStyle} />
      <Text style={styles.text}>描述（Markdown）</Text>
      <TextInput accessibilityLabel="MR 描述" value={description} multiline maxLength={100000} onChangeText={setDescription} editable={!busy && !initial.descriptionTruncated} style={{ ...inputStyle, height: 280, textAlignVertical: "top" }} />
      {initial.descriptionTruncated ? <Text style={styles.muted}>描述未完整加载，请在工蜂原站编辑；这里仍可修改标题。</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: theme.colors.statusDanger }}>{message}</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}>
        <Action theme={theme} label="取消编辑" disabled={busy} onPress={() => requestClose(onClose)} />
        <Action theme={theme} primary label={busy ? "保存中…" : "保存 MR"} disabled={busy || blocked || !editMr.input.safeParse(input).success} onPress={() => mutation.mutate()} />
      </View>
    </View>
  </Modal.Content></Modal>;
}
