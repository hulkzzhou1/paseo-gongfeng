import { useSiteUrl } from "./site.ts";
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { cloneRepository, listCloneOperations } from "../shared/clone.ts";

export function CloneRepository({ repositoryId, theme }: { repositoryId?: number; theme: PluginScreenProps["theme"] }) {
  const siteUrl = useSiteUrl();
  const clone = useRpc(cloneRepository); const list = useRpc(listCloneOperations); const cache = useQueryClient();
  const [targetPath, setTargetPath] = useState(""); const [notice, setNotice] = useState("");
  const create = useMutation({ mutationFn: clone, onSuccess: result => {
    setNotice(result.ok ? `克隆、项目登记与关联已完成：${result.operation.projectId}` : cloneErrorText(result.error));
    void cache.invalidateQueries({ queryKey: ["managed-repositories"] }); void cache.invalidateQueries({ queryKey: ["repository-bindings"] }); void cache.invalidateQueries({ queryKey: ["repository-clones", siteUrl] });
  }, onError: () => { setNotice("暂时无法确认结果，请刷新克隆记录；已创建的资源会保留。不要换目录重复提交。"); void cache.invalidateQueries({ queryKey: ["repository-clones", siteUrl] }); } });
  const history = useQuery({ queryKey: ["repository-clones", siteUrl], queryFn: () => list({ siteUrl }), retry: false, refetchInterval: create.isPending ? 1000 : false });
  return <SettingsSection title="克隆并创建 Paseo 项目" info="使用本机已有 SSH 权限。目标父目录必须存在，目标目录必须尚不存在；克隆不使用 OpenAPI Token，不自动下载 LFS 对象或子模块。">
    <SettingsCard>
      <SettingsInput label="本机目标绝对路径" initialValue="" placeholder="/path/to/workspaces/repository" onChangeText={setTargetPath} />
      <SettingsAction label={repositoryId ? `克隆选中仓库 #${repositoryId}` : "请先在上方选择工蜂仓库"} hint={targetPath || "填写将要创建的目录"} actionLabel={create.isPending ? "处理中…" : "克隆并关联"} disabled={!repositoryId || !targetPath.trim() || create.isPending} onPress={() => { if (repositoryId) create.mutate({ siteUrl, repositoryId, targetPath }); }} />
      <SettingsAction label="克隆进度与恢复记录" actionLabel="刷新" disabled={history.isFetching} onPress={() => void history.refetch()} />
      {history.isPending ? <SettingsRow label="正在读取克隆记录…" /> : history.isError || (history.data && !history.data.ok) ? <SettingsRow label="无法读取克隆记录，请刷新后重试" /> : null}
      {history.data?.ok && history.data.operations.filter(operation => repositoryId === undefined || operation.repositoryId === repositoryId).map(operation => <View key={operation.id}>
        <SettingsRow label={`仓库 #${operation.repositoryId} · ${stageText[operation.stage]}`} hint={`${operation.targetPath}${operation.projectId ? `\nPaseo 项目：${operation.projectId}` : ""}${operation.error ? `\n${cloneErrorText(operation.error)}` : ""}`} />
        {operation.stage === "cloned" || operation.stage === "registered" ? <SettingsAction label="继续登记或关联，保留现有代码" actionLabel="恢复" disabled={create.isPending} onPress={() => create.mutate({ siteUrl, repositoryId: operation.repositoryId, targetPath: operation.targetPath })} /> : null}
        {operation.stage === "reserved" || operation.stage === "cloning" ? <SettingsRow label="若克隆已中断，请保留此目录并选择新的目标位置。" /> : null}
      </View>)}
    </SettingsCard>
    {notice ? <View accessibilityLiveRegion="polite"><Text style={{ color: theme.colors.foreground }}>{notice}</Text></View> : null}
  </SettingsSection>;
}
const stageText = { reserved: "已记录目标", cloning: "克隆中或已中断", cloned: "克隆完成，待登记", registered: "项目已登记，待关联", completed: "已完成" };
function cloneErrorText(error: string): string {
  if (error.startsWith("binding_")) return `项目已登记，关联尚未完成：${cloneErrorText(error.slice(8))}。修复后可恢复。`;
  return ({ invalid_path: "请填写父目录已存在的绝对路径", target_exists: "目标已存在，请使用已有项目关联，或选择新目录", target_conflict: "该路径已有其他仓库的克隆记录，请选择新目录", target_changed: "目标目录或 remote 已变化，请人工核验，不会覆盖现有文件", repository_changed: "仓库路径已变化，请核验原克隆目录", clone_failed: "克隆失败或中断，请检查本机 SSH 权限与网络；已创建目录保留，请选择新目标", clone_incomplete: "上次克隆未完成，原目录保留，请选择新目标", registration_failed: "clone 已完成，项目登记失败，请检查当前 daemon 和 Paseo CLI 后恢复", registration_unverified: "无法确认登记结果，请刷新宿主项目后恢复", project_missing: "已登记项目已失效或发生变化，请人工核验", host_error: "当前 daemon 项目列表不可用", storage_error: "本地进度或关联存储不可用", conflict: "项目已关联其他仓库，请在已有项目入口确认关系", unconfigured: "请先配置工蜂连接", unauthorized: "工蜂凭据失效", forbidden: "工蜂仓库无访问权限", not_found: "仓库不存在或不可访问", network_error: "工蜂网络暂不可用", service_error: "工蜂服务暂不可用", rate_limited: "工蜂请求受限，请稍后重试", account_changed: "工蜂站点或账号已变化，请刷新", invalid_response: "工蜂返回的仓库信息无效" } as Record<string, string>)[error] || "未完成，请刷新记录并核验已有资源";
}
