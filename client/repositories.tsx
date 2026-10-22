import { useSiteUrl } from "./site.ts";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { addManagedRepository, listManagedRepositories, bindRepository, listRepositoryBindings, searchRepositories, unbindRepository } from "../shared/repositories.ts";
import { CloneRepository } from "./clone.tsx";
import { Action, workbenchStyles } from "./workbench-ui.tsx";

export function RepositoryManagement(props: PluginScreenProps & { onBack?(): void }) {
  const { theme, layout, params, onBack } = props;
  const siteUrl = useSiteUrl();
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const list = useRpc(listManagedRepositories), bindingsRpc = useRpc(listRepositoryBindings);
  const [adding, setAdding] = useState(false), [repositoryId, setRepositoryId] = useState<number>();
  useEffect(() => { setAdding(false); setRepositoryId(undefined); }, [siteUrl]);
  const repositories = useQuery({ queryKey: ["managed-repositories", siteUrl], queryFn: () => list({ siteUrl }), retry: false });
  const bindings = useQuery({ queryKey: ["repository-bindings", "management", siteUrl], queryFn: () => bindingsRpc({ siteUrl }), retry: false });
  const data = bindings.data?.ok ? bindings.data : undefined;
  return <View testID="gongfeng-repositories" style={styles.page}>
    <View style={{ padding: layout.compact ? 12 : 20, gap: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={styles.toolbar}>{onBack ? <Action theme={theme} label="返回工作台" icon="ArrowLeft" onPress={onBack} /> : null}<View style={{ flex: 1 }} /><Action theme={theme} primary label="添加仓库" icon="Plus" onPress={() => setAdding(true)} /></View>
      <Text accessibilityRole="header" style={styles.title}>仓库管理</Text>
      <Text style={styles.muted}>先添加工蜂仓库，再关联本地 Paseo 项目。每个项目最多关联一个仓库。</Text>
      {params.projectId ? <Text style={styles.muted}>选择仓库后，可关联当前 Paseo 项目。</Text> : null}
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 12 }}>
      <View style={styles.toolbar}><Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>已添加仓库 · {repositories.data?.ok ? repositories.data.items.length : "—"}</Text>
        <Action theme={theme} quiet label="刷新列表" icon="RefreshCw" disabled={repositories.isFetching || bindings.isFetching} onPress={() => { void repositories.refetch(); void cache.invalidateQueries({ queryKey: ["repository-bindings"] }); }} /></View>
      {repositories.isPending ? <Text style={styles.muted}>正在读取已添加仓库…</Text> : null}
      {repositories.isError || repositories.data && !repositories.data.ok ? <Text accessibilityLiveRegion="polite" style={styles.text}>无法读取已添加仓库，请刷新重试。</Text> : null}
      {bindings.isError || bindings.data && !bindings.data.ok ? <Text accessibilityLiveRegion="polite" style={styles.text}>项目关联暂时无法核验，请刷新列表；已添加仓库保留。</Text> : null}
      <View style={styles.panel}>
        {repositories.data?.ok && repositories.data.items.map(repo => {
          const associated = data?.bindings.filter(b => b.repository.id === repo.id) ?? [];
          return <View key={repo.id} style={{ padding: 12, gap: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: layout.compact ? "column" : "row", alignItems: layout.compact ? "stretch" : "center" }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text selectable style={[styles.text, { fontWeight: "600", fontSize: 16 }]}>{repo.path}</Text>
              <Text style={styles.muted}>{data ? associated.length ? associated.map(b => `${data.projects.find(p => p.id === b.projectId)?.name ?? b.projectId}${b.status === "valid" ? "" : "（需核验）"}`).join(" · ") : "尚未关联项目" : "正在核验项目关联"}</Text>
            </View><Action theme={theme} label="关联项目" icon="Link" onPress={() => setRepositoryId(repo.id)} />
          </View>;
        })}
        {repositories.data?.ok && repositories.data.items.length === 0 ? <View style={{ padding: 24, gap: 6 }}><Text style={styles.text}>还没有添加仓库</Text><Text style={styles.muted}>点击右上角“添加仓库”，搜索并选择你需要管理的工蜂仓库。</Text></View> : null}
      </View>
    </ScrollView>
    <Modal title="添加仓库" open={adding} onOpenChange={setAdding}><Modal.Content>{adding ? <AddRepository theme={theme} onAdded={() => setAdding(false)} /> : null}</Modal.Content></Modal>
    {repositoryId !== undefined ? <AssociateRepository {...props} key={repositoryId} repositoryId={repositoryId} repositoryPath={repositories.data?.ok ? repositories.data.items.find(r => r.id === repositoryId)?.path ?? "工蜂仓库" : "工蜂仓库"} onClose={() => setRepositoryId(undefined)} /> : null}
  </View>;
}

function AddRepository({ theme, onAdded }: { theme: PluginScreenProps["theme"]; onAdded(): void }) {
  const siteUrl = useSiteUrl();
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const search = useRpc(searchRepositories), add = useRpc(addManagedRepository);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [draft]);
  const results = useQuery({ queryKey: ["repositories-search", siteUrl, query, page], queryFn: () => search({ siteUrl, query, page }), enabled: dropdownOpen && query.length > 0, retry: false });
  const save = useMutation({ mutationFn: () => add({ siteUrl, repositoryId: Number(selected) }), retry: false,
    onSuccess(result) { if (result.ok) { void cache.invalidateQueries({ queryKey: ["managed-repositories"] }); onAdded(); } else setNotice(errorText(result.error)); },
    onError() { setNotice("无法确认添加结果，请关闭弹窗刷新列表后再试。"); },
  });
  const current = query === draft.trim() && !results.isFetching;
  const choices = current && results.data?.ok ? results.data.items : [];
  return <View style={{ gap: 12 }}>
    <Text style={styles.muted}>搜索有权限访问的仓库，选择后加入本工作台；不会创建远程仓库或克隆代码。</Text>
    <View style={styles.panel}>
      <Pressable accessibilityRole="combobox" accessibilityLabel="选择仓库" accessibilityState={{ expanded: dropdownOpen, disabled: save.isPending }} disabled={save.isPending}
        onPress={() => setDropdownOpen(value => !value)} style={({ pressed }) => ({ minHeight: 44, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface0 })}>
        <Icon name="GitBranch" size={16} color={theme.colors.foregroundMuted} />
        <Text numberOfLines={2} style={[styles.text, { flex: 1 }]}>{choices.find(r => String(r.id) === selected)?.path ?? "搜索并选择仓库"}</Text>
        <Icon name={dropdownOpen ? "ChevronUp" : "ChevronDown"} size={16} color={theme.colors.foregroundMuted} />
      </Pressable>
      {dropdownOpen ? <View style={{ borderTopWidth: 1, borderColor: theme.colors.border }}>
        <View style={{ padding: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}><TextInput autoFocus accessibilityLabel="搜索下拉列表中的仓库" placeholder="搜索仓库名称或路径…" placeholderTextColor={theme.colors.foregroundMuted}
          value={draft} editable={!save.isPending} onChangeText={value => { setDraft(value); setSelected(""); setNotice(""); }}
          style={{ ...styles.text, minHeight: 40, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingHorizontal: 10, backgroundColor: theme.colors.surface1 }} /></View>
        <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
          {!draft.trim() ? <Text style={[styles.muted, { padding: 14 }]}>输入关键词查找工蜂仓库。</Text> : !current ? <Text style={[styles.muted, { padding: 14 }]}>正在搜索…</Text> : null}
          {current && results.data?.ok && choices.length === 0 ? <Text style={[styles.muted, { padding: 14 }]}>没有匹配的仓库，请尝试其他名称。</Text> : null}
          {choices.map(repo => <Pressable key={repo.id} accessibilityRole="button" accessibilityLabel={`选择 ${repo.path}`} accessibilityState={{ selected: selected === String(repo.id) }}
            onPress={() => { setSelected(String(repo.id)); setDropdownOpen(false); }} style={({ pressed }) => ({ padding: 12, gap: 3, backgroundColor: pressed || selected === String(repo.id) ? theme.colors.surface2 : theme.colors.surface0, borderBottomWidth: 1, borderColor: theme.colors.border })}>
            <Text style={[styles.text, { fontWeight: "600" }]}>{repo.name}</Text><Text style={styles.muted}>{repo.path}</Text>
          </Pressable>)}
        </ScrollView>
        {results.isError || results.data && !results.data.ok ? <View style={{ padding: 12, gap: 8 }}><Text style={styles.text}>{results.data && !results.data.ok ? errorText(results.data.error) : "搜索失败，请重试。"}</Text><Action theme={theme} label="重试搜索" disabled={results.isFetching} onPress={() => { void results.refetch(); }} /></View> : null}
        {query && (page > 1 || results.data?.ok && results.data.nextPage) ? <View style={[styles.toolbar, { padding: 8 }]}><Action theme={theme} label="上一页" disabled={page === 1 || !current || save.isPending} onPress={() => { setPage(p => p - 1); setSelected(""); }} /><Text style={styles.muted}>第 {page} 页</Text><Action theme={theme} label="下一页" disabled={!current || !results.data?.ok || !results.data.nextPage || save.isPending} onPress={() => { if (results.data?.ok && results.data.nextPage) { setPage(results.data.nextPage); setSelected(""); } }} /></View> : null}
      </View> : null}
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    <Action theme={theme} primary label={save.isPending ? "添加中…" : "添加到仓库列表"} disabled={save.isPending || !current || !choices.some(r => String(r.id) === selected)} onPress={() => save.mutate()} />
  </View>;
}

function AssociateRepository({ theme, params, repositoryId, repositoryPath, onClose }: PluginScreenProps & { repositoryId: number; repositoryPath: string; onClose(): void }) {
  const siteUrl = useSiteUrl();
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const list = useRpc(listRepositoryBindings), bind = useRpc(bindRepository), unbind = useRpc(unbindRepository);
  const [projectId, setProjectId] = useState(params.projectId || ""), [notice, setNotice] = useState(""), [replaceId, setReplaceId] = useState<number>(), [cloning, setCloning] = useState(false);
  const relations = useQuery({ queryKey: ["repository-bindings", siteUrl, repositoryId], queryFn: () => list({ siteUrl, repositoryId }), retry: false });
  const refresh = () => { void cache.invalidateQueries({ queryKey: ["repository-bindings"] }); void cache.invalidateQueries({ queryKey: ["managed-repositories"] }); };
  const save = useMutation({ mutationFn: (replacement?: number) => bind({ siteUrl, repositoryId, projectId, ...(replacement ? { replaceRepositoryId: replacement } : {}) }),
    onSuccess(result) { if (result.ok) { setNotice("关联已保存"); setReplaceId(undefined); refresh(); } else if (result.error === "conflict" && result.existing) { setReplaceId(result.existing.repository.id); setNotice(`该项目已关联 ${result.existing.repository.path}。确认后才能更换。`); } else setNotice(errorText(result.error)); },
    onError() { setNotice("无法确认保存结果，请刷新关联后再试。"); },
  });
  const remove = useMutation({ mutationFn: (id: string) => unbind({ siteUrl, projectId: id, repositoryId }), onSuccess(result) { setNotice(result.ok ? "已解除关联，仓库列表、本地代码和历史资源保留。" : errorText(result.error)); refresh(); }, onError() { setNotice("解除关联失败，请刷新后重试。"); } });
  const busy = save.isPending || remove.isPending;
  const data = relations.data?.ok ? relations.data : undefined;
  return <Modal title="关联 Paseo 项目" open onOpenChange={open => { if (!open && !busy) onClose(); }}><Modal.Content>
    <Text selectable style={[styles.text, { fontWeight: "600" }]}>{repositoryPath}</Text>
    <SettingsCard><SettingsSelect label="Paseo 项目" value={projectId} disabled={busy || !data} options={[{ value: "", label: "请选择项目" }, ...(data?.projects ?? []).map(p => ({ value: p.id, label: `${p.matches ? "匹配候选 · " : ""}${p.name} · ${p.rootPath}` }))]} onValueChange={value => { setProjectId(value); setReplaceId(undefined); setNotice(""); }} /></SettingsCard>
    <Action theme={theme} primary label={save.isPending ? "保存中…" : "保存关联"} disabled={!projectId || busy || !data?.projects.some(p => p.id === projectId)} onPress={() => save.mutate(undefined)} />
    {replaceId ? <Action theme={theme} label="确认更换现有关联" disabled={busy} onPress={() => save.mutate(replaceId)} /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    <View style={styles.toolbar}><Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>已关联项目</Text><Action theme={theme} label="刷新关联" disabled={relations.isFetching || busy} onPress={refresh} /></View>
    {relations.isPending ? <Text style={styles.muted}>正在核验项目…</Text> : relations.isError || relations.data && !relations.data.ok ? <Text style={styles.text}>{relations.data && !relations.data.ok ? errorText(relations.data.error) : "关联读取失败，请刷新。"}</Text> : null}
    {data && !data.bindings.length ? <Text style={styles.muted}>尚未关联项目。</Text> : null}
    {data?.bindings.map(binding => <View key={binding.projectId} style={[styles.panel, { padding: 12, gap: 8 }]}>
      <Text style={styles.text}>{data.projects.find(p => p.id === binding.projectId)?.name ?? binding.projectId}</Text>
      <Text selectable style={styles.muted}>{data.projects.find(p => p.id === binding.projectId)?.rootPath ?? binding.projectId}</Text>
      <Text style={styles.muted}>{binding.status === "valid" ? "已核验" : binding.status === "project_missing" ? "项目已失效" : binding.status === "remote_changed" ? "本地 remote 不匹配" : `需核验：${errorText(binding.error ?? "service_error")}`}</Text>
      <Action theme={theme} label="解除关联" disabled={busy} onPress={() => remove.mutate(binding.projectId)} />
    </View>)}
    <Action theme={theme} label={cloning ? "收起克隆选项" : "没有本地项目？克隆并创建"} onPress={() => setCloning(value => !value)} />
    <View style={{ display: cloning ? "flex" : "none" }}><CloneRepository repositoryId={repositoryId} theme={theme} /></View>
  </Modal.Content></Modal>;
}
function errorText(error: string) { return ({ unconfigured: "请先配置工蜂连接", unauthorized: "凭据已失效", forbidden: "无访问权限", not_found: "仓库不存在或不可访问", rate_limited: "请求受限，请稍后重试", network_error: "网络错误", service_error: "工蜂服务暂不可用", invalid_response: "工蜂返回格式异常", storage_error: "本地关联存储不可用", host_error: "无法读取宿主项目", project_missing: "项目已失效，请重新选择", conflict: "项目已有其他关联", stale_binding: "关联已变更，请刷新后重试", account_changed: "工蜂站点或账号已变更，请刷新" } as Record<string,string>)[error] || "操作失败，请重试"; }
