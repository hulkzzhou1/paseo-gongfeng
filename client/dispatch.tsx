import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsAction, SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { WorkbenchCard } from "./workbench-ui.tsx";
import type { RpcOutput } from "@getpaseo/plugin";
import { prepareReview, reviewHistory, startReview, type ReviewOperation } from "../shared/dispatch.ts";
import type { MrRef } from "../shared/detail.ts";
import { errorMessages } from "./errors.ts";
const messages: Record<string, string> = {
  preparation_failed: "无法准备审查上下文，请重试。", version_changed: "读取期间 MR 版本变化，请重新准备。", version_unverified: "无法验证完整版本，可以明确选择仅 diff 审查。",
  project_required: "请选择一个关联项目。", binding_invalid: "关联项目不存在、remote 变化或无法核验，请先管理仓库关联。", profile_incomplete: "预设缺少模型，请在 Paseo 中补全预设。",
  operation_missing: "此操作不存在或不属于当前账号。", operation_conflict: "本次操作的项目、预设和补充要求已固定；如需更改请发起新的 Review。",
  code_fetch_failed: "固定 SHA 或比较基准获取失败，请检查 Git SSH 权限与版本；可重试，或明确选择仅 diff 审查。", code_incomplete: "仓库包含未获取的 LFS 内容或子模块，不能作为完整代码审查。",
  directory_changed: "独立目录或 Git 版本已变化，已停止派发。请检查已有目录或重新准备新的 Review。", workspace_failed: "工作区创建失败，恢复时将先核对已有资源。", workspace_missing: "已有工作区不可用，已停止以避免重复创建。", workspace_changed: "工作区目录或项目归属变化，已停止派发。",
  agent_failed: "Agent 启动失败，已有工作区及可能创建的 Agent 会保留；可恢复核验。", agent_missing: "已有 Agent 不可用。", agent_changed: "已有 Agent 的目录或工作区变化，已停止派发。", agent_outcome_unknown: "Agent 已存在，但初始任务是否启动无法确认。请打开已有 Agent 核查；不会自动重发任务或创建另一个 Agent。",
  host_or_storage_error: "宿主或操作记录不可用，请刷新历史记录后恢复。",
};
const stages: Record<ReviewOperation["stage"], string> = { prepared: "已准备", preparing_code: "准备代码中", code_failed: "代码准备失败", code_ready: "代码已准备", workspace_creating: "创建工作区中", workspace_ready: "工作区已创建", agent_creating: "启动 Agent 中", completed: "已派发" };
type Prepared = Extract<RpcOutput<typeof prepareReview>, { ok: true }>;
type Props = Pick<PluginScreenProps, "theme" | "host" | "navigation"> & { reference: MrRef; onManageRepositories(): void };

export function ReviewDispatch({ theme, host, navigation, reference, onManageRepositories }: Props) {
  const prepareRpc = useRpc(prepareReview), startRpc = useRpc(startReview), historyRpc = useRpc(reviewHistory);
  const [open, setOpen] = useState(false), [prepared, setPrepared] = useState<Prepared>(), [operation, setOperation] = useState<ReviewOperation>();
  const [projectId, setProjectId] = useState(""), [profileId, setProfileId] = useState(""), [requirements, setRequirements] = useState(""), [message, setMessage] = useState("");
  const history = useQuery({ queryKey: ["review-history", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId], queryFn: () => historyRpc(reference), retry: false, refetchOnWindowFocus: false });
  const explain = (code: string) => messages[code] ?? errorMessages[code] ?? "操作失败，请重试。";
  const prepare = useMutation({ mutationFn: (operationId?: string) => prepareRpc({ ...reference, operationId }), retry: false,
    onSuccess(result) { if (!result.ok) { setMessage(explain(result.error)); return; } setPrepared(result); setOperation(result.operation); setProjectId(result.operation.projectId ?? (result.projects.length === 1 ? result.projects[0].id : "")); setProfileId(result.operation.profileId ?? ""); setRequirements(result.operation.requirements ?? ""); setMessage(result.operation.error ? explain(result.operation.error) : ""); void history.refetch(); },
    onError() { setMessage("准备请求未完成，请重试。"); },
  });
  const start = useMutation({ mutationFn: (mode: "full" | "diff") => startRpc({ siteUrl: reference.siteUrl, operationId: operation!.id, projectId: projectId || undefined, profileId, requirements, mode }), retry: false,
    onSuccess(result) { if (result.operation) setOperation(result.operation); setMessage(result.ok ? "Review 已派发，请打开 Agent 查看结果。" : explain(result.error)); void history.refetch(); },
    onError() { setMessage("派发请求结果未知，请刷新历史记录并恢复同一次操作，避免重复创建。"); void history.refetch(); },
  });
  const text = { color: theme.colors.foreground, lineHeight: 22 }, muted = { color: theme.colors.foregroundMuted, lineHeight: 22 };
  const begin = (id?: string) => { setOpen(true); setPrepared(undefined); setOperation(undefined); setMessage(""); prepare.mutate(id); };
  const busy = prepare.isPending || start.isPending;
  const disabled = busy || !operation || !projectId || !profileId || operation.stage === "completed" || operation.error === "agent_outcome_unknown" || !prepared?.projects.some(p => p.id === projectId);
  const resources = (o: ReviewOperation) => <View style={{ gap: 8 }}>
    {o.workspaceId && navigation ? <SettingsAction label="已有工作区" actionLabel="打开工作区" onPress={() => navigation.openWorkspace({ workspaceId: o.workspaceId!, serverId: host.id })} /> : null}
    {o.agentId && navigation ? <SettingsAction label="Review 结果" actionLabel="打开 Agent" onPress={() => navigation.openAgent({ agentId: o.agentId!, serverId: host.id })} /> : null}
    {!navigation && (o.workspaceId || o.agentId) ? <Text selectable style={muted}>{`请在 Paseo 中打开：${o.agentId ?? o.workspaceId}`}</Text> : null}
  </View>;
  return <WorkbenchCard theme={theme} title="Agent Review" icon="Bot" testID="gongfeng-agent-review">
    <View style={{ padding: 12, gap: 12 }}>
    <SettingsCard><SettingsAction label="创建新的 Review Agent" hint="选择关联项目和现有预设，审查独立目录中的固定版本。" actionLabel="准备 Review" disabled={busy} onPress={() => begin()} /></SettingsCard>
    <Text accessibilityRole="header" style={[text, { fontWeight: "600" }]}>历史 Review</Text>
    {history.isFetching ? <Text style={muted}>正在读取历史…</Text> : null}
    {history.isError || history.data && !history.data.ok ? <Text style={text}>{history.data && !history.data.ok ? explain(history.data.error) : "历史记录加载失败，请重试。"}</Text> : null}
    {history.data?.ok ? history.data.operations.slice().reverse().map(o => <SettingsCard key={o.id}>
      <SettingsAction label={`${stages[o.stage]} · ${o.mode === "diff" ? "仅 diff" : o.sourceSha?.slice(0, 12) ?? "版本未知"}`} hint={o.fetchedAt} actionLabel="查看 / 恢复" disabled={busy} onPress={() => begin(o.id)} />{resources(o)}
    </SettingsCard>) : null}
    <Modal title="派发 Review" open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><Modal.Content>
      {prepare.isPending ? <Text style={text}>正在核对 MR 版本、项目关联和现有预设…</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={text}>{message}</Text> : null}
      {operation && prepared ? <>
        <Text selectable style={text}>{`!${operation.iid} ${operation.title}\n源 SHA：${operation.sourceSha ?? "未知"}\n比较基准：${operation.baseSha ?? "未知"}\n目标 SHA：${operation.targetSha ?? "未知"}\n获取时间：${operation.fetchedAt}\n状态：${stages[operation.stage]}`}</Text>
        <Text style={muted}>默认获取固定版本的独立仓库。Git SSH 权限与 Private Token 独立；不会更改原开发目录。Agent 可运行相关本地检查，不自动修复代码或回写工蜂。所选运行模式不等同安全隔离。</Text>
        {operation.limitations.map((note, index) => <Text key={index} style={muted}>{note}</Text>)}
        <SettingsCard>
          <SettingsSelect label="关联项目" value={projectId} options={[{ label: "请选择项目", value: "" }, ...prepared.projects.map(p => ({ label: `${p.name} · ${p.rootPath}`, value: p.id }))]} disabled={busy || !!operation.projectId} onValueChange={setProjectId} />
          <SettingsAction label={prepared.projects.length ? "核对仓库关联" : "没有有效关联项目，请先完成仓库关联"} actionLabel="管理关联" disabled={busy} onPress={onManageRepositories} />
          <SettingsSelect label="现有 Agent 预设" value={profileId} options={[{ label: "请选择预设", value: "" }, ...prepared.profiles.map(p => ({ label: `${p.name} · ${p.provider}/${p.model ?? "未指定模型"} · ${p.modeId ?? "默认模式"} · ${p.thinkingOptionId ?? "默认思考"}`, value: p.id }))]} disabled={busy || !!operation.profileId} onValueChange={setProfileId} />
        </SettingsCard>
        <Text style={text}>补充审查要求</Text><TextInput accessibilityLabel="补充审查要求" multiline maxLength={10000} value={requirements} editable={!busy && !operation.profileId} onChangeText={setRequirements} placeholder="例如：关注错误处理和兼容性" placeholderTextColor={theme.colors.foregroundMuted} style={{ ...text, minHeight: 90, padding: 12, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 8 }} />
        <SettingsCard><SettingsAction label={operation.mode === "diff" ? "恢复本次仅 diff 审查" : "固定版本完整仓库审查"} actionLabel={start.isPending ? "派发中…" : operation.projectId ? "恢复本次操作" : "启动 Review"} disabled={disabled} onPress={() => start.mutate(operation.mode ?? "full")} /></SettingsCard>
        {operation.canDowngrade && operation.mode !== "diff" && !operation.workspaceId ? <SettingsCard><SettingsAction label="仅依据已获取 diff 审查" hint="明确选择降级：新建独立空目录，不验证完整仓库，截断或未知版本会写入任务限制。" actionLabel="选择仅 diff 审查" disabled={disabled} onPress={() => start.mutate("diff")} /></SettingsCard> : null}
        {resources(operation)}
      </> : null}
    </Modal.Content></Modal>
    </View>
  </WorkbenchCard>;
}
