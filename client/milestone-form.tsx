import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { milestoneFields, saveMilestone, deleteMilestone, type Milestone, type MilestoneReference } from "../shared/milestones.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { RepositoryPicker } from "./repository-picker.tsx";
import { errorMessages } from "./errors.ts";

export function MilestoneForm({ theme, siteUrl, accountId, repositories, initial, initialRepositoryId, onClose, onSaved }: {
  theme: Theme; siteUrl?: string; accountId: number; repositories: { id: number; path: string }[]; initial: Milestone | null; initialRepositoryId?: number; onClose(): void; onSaved(): void;
}) {
  const styles = workbenchStyles(theme), cache = useQueryClient(), rpc = useRpc(saveMilestone);
  const [repositoryId, setRepositoryId] = useState(initial?.projectId ?? initialRepositoryId ?? (repositories.length === 1 ? repositories[0].id : undefined));
  const [title, setTitle] = useState(initial?.title ?? ""), [description, setDescription] = useState(initial?.description ?? ""), [date, setDate] = useState(initial?.dueDate?.slice(0, 10) ?? "");
  const [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  const fields = milestoneFields.safeParse({ title, description, dueDate: date.trim() || null });
  const mutation = useMutation({ mutationFn: () => rpc({ siteUrl, accountId, projectId: repositoryId!, ...(initial ? { milestoneId: initial.id, revision: initial.revision } : {}), ...fields.data! }), retry: false,
    onSuccess(result) { if (result.ok) { void cache.invalidateQueries({ queryKey: ["milestone"] }); void cache.invalidateQueries({ queryKey: ["mr"] }); onSaved(); onClose(); } else { setUncertain(result.error === "outcome_unknown"); setNotice(errorMessages[result.error] ?? "工蜂未完成保存，请刷新后核对。"); } },
    onError() { setUncertain(true); setNotice("无法确认保存结果，请关闭并刷新核对，避免重复创建。"); },
  });
  const inputStyle = { ...styles.text, minHeight: 38, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 9, backgroundColor: theme.colors.surface1 };
  return <Modal title={initial ? "编辑里程碑" : "新建里程碑"} open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}><Modal.Content>
    <View style={{ gap: 12 }}>
      <Text style={styles.text}>仓库</Text>
      {initial ? <Text style={styles.muted}>{initial.repositoryPath}</Text> : <RepositoryPicker theme={theme} items={repositories} value={repositoryId} onChange={setRepositoryId} />}
      <Text style={styles.text}>标题</Text><TextInput autoFocus accessibilityLabel="里程碑标题" value={title} maxLength={255} onChangeText={setTitle} editable={!mutation.isPending} style={inputStyle} />
      <Text style={styles.text}>描述</Text><TextInput accessibilityLabel="里程碑描述" value={description} multiline maxLength={100000} onChangeText={setDescription} editable={!mutation.isPending} style={{ ...inputStyle, minHeight: 120, textAlignVertical: "top" }} />
      <Text style={styles.text}>截止日期（可选）</Text><TextInput accessibilityLabel="里程碑截止日期" placeholder="YYYY-MM-DD，留空表示无截止日期" placeholderTextColor={theme.colors.foregroundMuted} value={date} onChangeText={setDate} editable={!mutation.isPending} style={inputStyle} />
      {!fields.success && title.trim() ? <Text style={{ ...styles.text, color: theme.colors.statusDanger }}>请检查标题长度及截止日期格式。</Text> : null}
      {initial?.descriptionTruncated ? <Text style={{ ...styles.text, color: theme.colors.statusWarning }}>描述超出当前编辑范围，请在工蜂编辑，避免覆盖未加载内容。</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: theme.colors.statusDanger }}>{notice}</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={mutation.isPending} onPress={onClose} /><Action theme={theme} primary label={mutation.isPending ? "保存中…" : "保存里程碑"} disabled={!fields.success || !repositoryId || mutation.isPending || uncertain || initial?.descriptionTruncated} onPress={() => { setNotice(""); mutation.mutate(); }} /></View>
    </View>
  </Modal.Content></Modal>;
}

export function MilestoneActions({ theme, reference, milestone, onEdit, onDeleted, refreshId, disabled = false }: { disabled?: boolean; refreshId: number; theme: Theme; reference: MilestoneReference; milestone: Milestone; onEdit(): void; onDeleted(): void }) {
  const styles = workbenchStyles(theme), cache = useQueryClient(), save = useRpc(saveMilestone), remove = useRpc(deleteMilestone);
  const [deleting, setDeleting] = useState(false), [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  // Background readbacks must not erase failures or unlock an uncertain write.
  useEffect(() => { setNotice(""); setUncertain(false); setDeleting(false); }, [refreshId]);
  const mutation = useMutation({ mutationFn: (kind: "state" | "delete") => kind === "delete" ? remove({ ...reference, title: milestone.title, revision: milestone.revision }) : save({ ...reference, title: milestone.title, revision: milestone.revision, stateEvent: milestone.state === "closed" ? "active" : "close" }), retry: false,
    onSuccess(result, kind) { void cache.invalidateQueries({ queryKey: ["milestone"] }); void cache.invalidateQueries({ queryKey: ["milestones"] }); void cache.invalidateQueries({ queryKey: ["mr"] }); if (result.ok) { setDeleting(false); setNotice(""); if (kind === "delete") onDeleted(); } else { setNotice(errorMessages[result.error] ?? "操作未完成，请刷新后核对。"); setUncertain(result.error === "outcome_unknown"); } },
    onError() { setNotice("结果不确定，请刷新详情核对后再操作。"); setUncertain(true); },
  });
  return <View style={{ gap: 8 }}>
    <View style={styles.toolbar}><Action theme={theme} quiet label="编辑" icon="Pencil" disabled={disabled || mutation.isPending || uncertain} onPress={onEdit} />
      <Action theme={theme} quiet label={milestone.state === "closed" ? "重新开启" : "关闭里程碑"} icon={milestone.state === "closed" ? "RotateCcw" : "Check"} disabled={disabled || mutation.isPending || uncertain || !["active", "closed"].includes(milestone.state)} onPress={() => mutation.mutate("state")} />
      <Action theme={theme} quiet label="删除里程碑" icon="Trash2" disabled={disabled || mutation.isPending || uncertain} onPress={() => { setNotice(""); setDeleting(true); }} /></View>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: theme.colors.statusDanger }}>{notice}</Text> : null}
    <Modal title="删除里程碑" open={deleting} onOpenChange={open => { if (!mutation.isPending) setDeleting(open); }}><Modal.Content>
      <Text style={styles.text}>确认删除 {milestone.repositoryPath} 中的“{milestone.title}”？</Text><Text style={styles.muted}>此操作不可撤销。关联的议题和 MR 会保留。</Text>
      {notice ? <Text style={{ ...styles.text, color: theme.colors.statusDanger }}>{notice}</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={mutation.isPending} onPress={() => setDeleting(false)} /><Action theme={theme} primary label={mutation.isPending ? "删除中…" : "确认删除"} disabled={disabled || mutation.isPending || uncertain} onPress={() => mutation.mutate("delete")} /></View>
    </Modal.Content></Modal>
  </View>;
}
