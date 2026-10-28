import { useDiscard, useDraft } from "./draft-guard.tsx";
import { queryPolicy, accessLost, readResult } from "./query-policy.ts";
import { ConnectionSettings } from "./connection.tsx";
import { WorkbenchTable } from "./table.tsx";
import { useQueryPolicy } from "./query.tsx";
import { useConnection } from "./site.ts";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { addManagedRepository, listManagedRepositories, bindRepository, listRepositoryBindings, searchRepositories, unbindRepository } from "../shared/repositories.ts";
import { CloneRepository } from "./clone.tsx";
import { Action, InitialLoading, WorkbenchHeader, WorkbenchNavigation, workbenchStyles } from "./workbench-ui.tsx";

export function RepositoryManagement(props: PluginScreenProps & { onBack?(): void; onIssues?():void; onMilestones?():void }) {
  const { theme, layout, params, onBack } = props;
  const connection=useConnection(),siteUrl=connection?.siteUrl,accountId=connection?.account.id;
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const list = useRpc(listManagedRepositories), bindingsRpc = useRpc(listRepositoryBindings);
  const discard=useDiscard(),[settings,setSettings]=useState(false),[width,setWidth]=useState(0);
  const [adding, setAdding] = useState(false), [repositoryId, setRepositoryId] = useState<number>();
  useEffect(() => { setAdding(false); setRepositoryId(undefined); }, [siteUrl]);
  const repositories = useQuery({ ...useQueryPolicy("options"), queryKey: ["managed-repositories", siteUrl,accountId], queryFn: () => readResult(list({ siteUrl })), retry: false });
  const bindings = useQuery({ ...useQueryPolicy("options"), queryKey: ["repository-bindings",siteUrl,accountId,"management"], queryFn: () => readResult(bindingsRpc({ siteUrl })), retry: false });
  const data = !bindings.isError&&bindings.data?.ok ? bindings.data : undefined;
  const compact=layout.compact||width<650;
  const rows=!(repositories.isError&&accessLost(repositories.error))&&repositories.data?.ok?repositories.data.items:[];
  return <View testID="gongfeng-repositories" onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={styles.page}>
    <WorkbenchHeader theme={theme} compact={compact} busy={repositories.isFetching||bindings.isFetching} updatedAt={repositories.dataUpdatedAt} error={repositories.isError||bindings.isError} onSettings={()=>setSettings(true)} onRefresh={()=>{void repositories.refetch();void bindings.refetch();}}><Action theme={theme} dense={!compact} label="添加仓库" icon="Plus" disabled={!accountId} onPress={()=>setAdding(true)}/></WorkbenchHeader>
    <WorkbenchNavigation theme={theme} compact={compact} selected="repositories" siteUrl={siteUrl} onMergeRequests={()=>onBack?.()} onIssues={props.onIssues} onMilestones={()=>props.onMilestones?.()} onRepositories={()=>{}}/>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 12 }}>
      <View style={styles.toolbar}><Text style={[styles.text,{fontWeight:"600"}]}>已添加仓库 · {rows.length}</Text><Text style={styles.muted}>添加仓库后关联本地项目；每个项目最多关联一个仓库。</Text></View>
      {repositories.isPending ? <Text style={styles.muted}>正在读取已添加仓库…</Text> : null}
      {repositories.isError || repositories.data && !repositories.data.ok ? <Text accessibilityLiveRegion="polite" style={styles.text}>无法读取已添加仓库，请刷新重试。</Text> : null}
      {bindings.isError || bindings.data && !bindings.data.ok ? <Text accessibilityLiveRegion="polite" style={styles.text}>项目关联暂时无法核验，请刷新列表；已添加仓库保留。</Text> : null}
      <WorkbenchTable theme={theme} compact={compact} rows={rows} rowKey={r=>String(r.id)} label={r=>`关联项目 ${r.path}`} onOpen={r=>setRepositoryId(r.id)} columns={[
        {key:"path",title:"已添加仓库",render:r=><Text numberOfLines={2} style={[styles.text,{fontWeight:"600"}]}>{r.path}</Text>},
        {key:"projects",title:"Paseo 项目",width:260,render:r=><Text numberOfLines={2} style={styles.muted}>{!data?"关联待核验":data.bindings.filter(b=>b.repository.id===r.id).map(b=>`${data.projects.find(p=>p.id===b.projectId)?.name??b.projectId}${b.status==="valid"?"":"（需核验）"}`).join(" · ")||"尚未关联"}</Text>},
        {key:"action",title:"操作",width:90,render:r=><Text style={{...styles.text,color:theme.colors.accent}}>关联项目</Text>}
      ]} empty={repositories.isPending?"正在读取仓库…":"还没有添加仓库，点击右上角添加。"}/>
    </ScrollView>
    {repositories.isPending&&repositories.isFetching?<InitialLoading theme={theme} label="正在读取已添加仓库"/>:null}
    <Modal title="添加仓库" open={adding} onOpenChange={open=>{if(open)setAdding(true);else discard(()=>setAdding(false));}}><Modal.Content>{adding ? <AddRepository theme={theme} onAdded={() => setAdding(false)} /> : null}</Modal.Content></Modal>
    <Modal title="工蜂配置" open={settings} onOpenChange={open=>{if(open)setSettings(true);else discard(()=>setSettings(false));}}><Modal.Content>{settings?<ConnectionSettings {...props}/>:null}</Modal.Content></Modal>
    {repositoryId !== undefined ? <AssociateRepository {...props} key={repositoryId} repositoryId={repositoryId} repositoryPath={repositories.data?.ok ? repositories.data.items.find(r => r.id === repositoryId)?.path ?? "工蜂仓库" : "工蜂仓库"} onClose={() => setRepositoryId(undefined)} /> : null}
  </View>;
}

function AddRepository({ theme, onAdded }: { theme: PluginScreenProps["theme"]; onAdded(): void }) {
  const connection=useConnection(),siteUrl=connection?.siteUrl,accountId=connection?.account.id;
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const search = useRpc(searchRepositories), add = useRpc(addManagedRepository);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [draft]);
  const results = useQuery({ ...useQueryPolicy("options"), queryKey: ["repositories-search", siteUrl,accountId,query,page], queryFn: () => readResult(search({ siteUrl, query, page })), enabled: dropdownOpen && query.length > 0, retry: false });
  const save = useMutation({ mutationFn: () => add({ siteUrl, repositoryId: Number(selected) }), retry: false,
    onSuccess(result) { if (result.ok) { void cache.invalidateQueries({ queryKey: ["managed-repositories"] }); onAdded(); } else setNotice(errorText(result.error)); },
    onError() { setNotice("无法确认添加结果，请关闭弹窗刷新列表后再试。"); },
  });
  useDraft(selected.length>0,save.isPending);
  const current = query === draft.trim() && !results.isFetching;
  const choices = current && !(results.isError&&accessLost(results.error)) && results.data?.ok ? results.data.items : [];
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
    <View style={styles.toolbar}><Action theme={theme} primary label={save.isPending ? "添加中…" : "添加到仓库列表"} disabled={save.isPending || !current || !choices.some(r => String(r.id) === selected)} onPress={() => save.mutate()} /></View>
  </View>;
}

function AssociateRepository({ theme, params, repositoryId, repositoryPath, onClose }: PluginScreenProps & { repositoryId: number; repositoryPath: string; onClose(): void }) {
  const connection=useConnection(),siteUrl=connection?.siteUrl,accountId=connection?.account.id;
  const styles = workbenchStyles(theme), cache = useQueryClient();
  const list = useRpc(listRepositoryBindings), bind = useRpc(bindRepository), unbind = useRpc(unbindRepository);
  const [projectId, setProjectId] = useState(params.projectId || ""), [notice, setNotice] = useState(""), [replaceId, setReplaceId] = useState<number>(), [cloning, setCloning] = useState(false);
  const relations = useQuery({ ...useQueryPolicy("options"), queryKey: ["repository-bindings", siteUrl,accountId,repositoryId], queryFn: () => readResult(list({ siteUrl, repositoryId })), retry: false });
  const refresh = () => { void cache.invalidateQueries({ queryKey: ["repository-bindings"] }); void cache.invalidateQueries({ queryKey: ["managed-repositories"] }); };
  const save = useMutation({ mutationFn: (replacement?: number) => bind({ siteUrl, repositoryId, projectId, ...(replacement ? { replaceRepositoryId: replacement } : {}) }),
    onSuccess(result) { if (result.ok) { setNotice("关联已保存"); setReplaceId(undefined); refresh(); } else if (result.error === "conflict" && result.existing) { setReplaceId(result.existing.repository.id); setNotice(`该项目已关联 ${result.existing.repository.path}。确认后才能更换。`); } else setNotice(errorText(result.error)); },
    onError() { setNotice("无法确认保存结果，请刷新关联后再试。"); },
  });
  const remove = useMutation({ mutationFn: (id: string) => unbind({ siteUrl, projectId: id, repositoryId }), onSuccess(result) { setNotice(result.ok ? "已解除关联，仓库列表、本地代码和历史资源保留。" : errorText(result.error)); refresh(); }, onError() { setNotice("解除关联失败，请刷新后重试。"); } });
  const busy = save.isPending || remove.isPending;
  const data = !relations.isError&&relations.data?.ok ? relations.data : undefined;
  const requestClose=useDraft(!!projectId&&!data?.bindings.some(b=>b.projectId===projectId),busy);
  return <Modal title="关联 Paseo 项目" open onOpenChange={open => { if (!open && !busy) requestClose(onClose); }}><Modal.Content>
    <Text selectable style={[styles.text, { fontWeight: "600" }]}>{repositoryPath}</Text>
    <SettingsCard><SettingsSelect label="Paseo 项目" value={projectId} disabled={busy || !data} options={[{ value: "", label: "请选择项目" }, ...(data?.projects ?? []).map(p => ({ value: p.id, label: `${p.matches ? "匹配候选 · " : ""}${p.name} · ${p.rootPath}` }))]} onValueChange={value => { setProjectId(value); setReplaceId(undefined); setNotice(""); }} /></SettingsCard>
    <View style={styles.toolbar}><Action theme={theme} primary label={save.isPending ? "保存中…" : "保存关联"} disabled={!projectId || busy || !data?.projects.some(p => p.id === projectId)} onPress={() => save.mutate(undefined)} /></View>
    {replaceId ? <View style={styles.toolbar}><Action theme={theme} label="确认更换现有关联" disabled={busy} onPress={() => save.mutate(replaceId)} /></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    <View style={styles.toolbar}><Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>已关联项目</Text><Action theme={theme} label="刷新关联" disabled={relations.isFetching || busy} onPress={refresh} /></View>
    {relations.isPending ? <Text style={styles.muted}>正在核验项目…</Text> : relations.isError || relations.data && !relations.data.ok ? <Text style={styles.text}>{relations.data && !relations.data.ok ? errorText(relations.data.error) : "关联读取失败，请刷新。"}</Text> : null}
    {data && !data.bindings.length ? <Text style={styles.muted}>尚未关联项目。</Text> : null}
    {data?.bindings.map(binding => <View key={binding.projectId} style={[styles.panel, { padding: 12, gap: 8 }]}>
      <Text style={styles.text}>{data.projects.find(p => p.id === binding.projectId)?.name ?? binding.projectId}</Text>
      <Text selectable style={styles.muted}>{data.projects.find(p => p.id === binding.projectId)?.rootPath ?? binding.projectId}</Text>
      <Text style={styles.muted}>{binding.status === "valid" ? "已核验" : binding.status === "project_missing" ? "项目已失效" : binding.status === "remote_changed" ? "本地 remote 不匹配" : `需核验：${errorText(binding.error ?? "service_error")}`}</Text>
      <View style={styles.toolbar}><Action theme={theme} label="解除关联" disabled={busy} onPress={() => remove.mutate(binding.projectId)} /></View>
    </View>)}
    <View style={styles.toolbar}><Action theme={theme} label={cloning ? "收起克隆选项" : "没有本地项目？克隆并创建"} onPress={() => cloning ? requestClose(() => setCloning(false)) : setCloning(true)} /></View>
    {cloning?<CloneRepository repositoryId={repositoryId} theme={theme}/>:null}
  </Modal.Content></Modal>;
}
function errorText(error: string) { return ({ unconfigured: "请先配置工蜂连接", unauthorized: "凭据已失效", forbidden: "无访问权限", not_found: "仓库不存在或不可访问", rate_limited: "请求受限，请稍后重试", network_error: "网络错误", service_error: "工蜂服务暂不可用", invalid_response: "工蜂返回格式异常", storage_error: "本地关联存储不可用", host_error: "无法读取宿主项目", project_missing: "项目已失效，请重新选择", conflict: "项目已有其他关联", stale_binding: "关联已变更，请刷新后重试", account_changed: "工蜂站点或账号已变更，请刷新" } as Record<string,string>)[error] || "操作失败，请重试"; }
