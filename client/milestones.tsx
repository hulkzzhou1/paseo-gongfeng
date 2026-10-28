import { useConnection } from "./site.ts";
import { useDiscard } from "./draft-guard.tsx";
import { useViewState, useListScroll } from "./query.tsx";
import { WorkbenchTable } from "./table.tsx";
import { repositoryVersion, refreshFirstPage, accessLost, readResult } from "./query-policy.ts";
import { useQueryPolicy } from "./query.tsx";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import type { z } from "zod";
import { milestoneCursor, milestoneDetail, milestonesPage, type Milestone, type MilestoneReference } from "../shared/milestones.ts";
import { listManagedRepositories } from "../shared/repositories.ts";
import type { IssueRef } from "../shared/issues.ts";
import type { MrRef } from "../shared/detail.ts";
import { Action, InitialLoading, WorkbenchCard, WorkbenchHeader, RefreshNotice, WorkbenchNavigation, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { ConnectionSettings } from "./connection.tsx";
import { RepositoryPicker } from "./repository-picker.tsx";
import { MilestoneForm, MilestoneActions } from "./milestone-form.tsx";
import { MilestoneLinks } from "./milestone-links.tsx";
import { Drawer } from "./drawer.tsx";
import { MRDetail } from "./detail.tsx";
import { RichText } from "./description.tsx";
import { richExcerpt } from "./rich-text.ts";
import { containDrawerFocus } from "./web.ts";
import { errorMessages } from "./errors.ts";

type Props = PluginScreenProps & { onIssues(ref?: IssueRef): void; onMergeRequests(): void; onManageRepositories(): void };
export function Milestones(props: Props) {
  const connected=useConnection(),siteUrl=connected?.siteUrl;
  return <MilestoneBoard {...props} key={`${siteUrl}:${connected?.account.id}`} siteUrl={siteUrl} accountId={connected?.account.id} />;
}
function MilestoneBoard(props: Props & { siteUrl?: string; accountId?: number }) {
  const discard=useDiscard();
  const { theme, layout, siteUrl, accountId } = props, styles = workbenchStyles(theme), cache = useQueryClient();
  const [state, setState] = useViewState<"active" | "closed" | "all">(["view",siteUrl,accountId,"milestones-state"],"active"), [search, setSearch] = useViewState(["view",siteUrl,accountId,"milestones-search"],""), [repositoryId, setRepositoryId] = useViewState<number|undefined>(["view",siteUrl,accountId,"milestones-repository"],undefined);
  const [settings, setSettings] = useState(false), [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<MilestoneReference>();
  useEffect(() => {
    if (accountId && Number(props.params.accountId) === accountId && props.params.siteUrl === siteUrl && Number(props.params.milestoneId) > 0 && Number(props.params.projectId) > 0) setSelected({ siteUrl, accountId, projectId: Number(props.params.projectId), milestoneId: Number(props.params.milestoneId) });
    else setSelected(undefined);
  }, [props.params.accountId, props.params.siteUrl, props.params.milestoneId, props.params.projectId, accountId, siteUrl]);
  const [form, setForm] = useState<Milestone | null | undefined>();
  const [mr, setMr] = useState<MrRef>();
  const close = useCallback(() => { setSelected(undefined); setMr(undefined); }, []);
  const pageRpc = useRpc(milestonesPage), managedRpc = useRpc(listManagedRepositories);
  const managed = useQuery({ ...useQueryPolicy("options"), queryKey: ["managed-repositories", siteUrl, accountId], queryFn: () => readResult(managedRpc({ siteUrl })), enabled: !!accountId, retry: false });
  const repositories = !(managed.isError&&accessLost(managed.error)) && managed.data?.ok ? managed.data.items : [];
  const key = ["milestones", siteUrl, accountId, state, repositoryId, repositoryVersion(repositories)];
  const pages = useInfiniteQuery({ ...useQueryPolicy("list",!selected), queryKey: key, initialPageParam: undefined as z.infer<typeof milestoneCursor>[] | undefined,
    queryFn: async ({ pageParam }) => { const r = await pageRpc({ siteUrl, accountId: accountId!, state, repositoryId, cursors: pageParam }); if (!r.ok) throw Error(r.error); return r; },
    getNextPageParam: page => page.next.length ? page.next : undefined, enabled: !!accountId && managed.data?.ok === true, retry: false, refetchOnWindowFocus: false });
  const failures = [...new Map((pages.data?.pages.flatMap(p => p.failures) ?? []).map(f => [f.projectId, f])).values()];
  const items = pages.isError&&accessLost(pages.error)?[]:[...new Map((pages.data?.pages.flatMap(p => p.items).filter(m=>!failures.some(f=>f.projectId===m.projectId&&accessLost(f.error))) ?? []).map(m => [`${m.projectId}:${m.id}`, m])).values()];
  const keyword = search.trim().toLocaleLowerCase();
  const visible = items.filter(m => !keyword || `${m.title}\n${m.description}`.toLocaleLowerCase().includes(keyword)).sort((a, b) => (a.dueDate?.slice(0, 10) ?? "9999").localeCompare(b.dueDate?.slice(0, 10) ?? "9999") || a.projectId - b.projectId || a.id - b.id);

  const compact = layout.compact || width < 650, drawerWidth = compact ? width : Math.min(width * 0.75, 1040);
  const [listScroll,resetScroll]=useListScroll(["view",siteUrl,accountId,"milestones-scroll",state,repositoryId,search]);
 const refresh=async()=>{
  resetScroll();
  if(managed.isError||!managed.data?.ok){
   const result=await managed.refetch();if(result.isError||!result.data?.ok)return;
   const target=repositoryId!==undefined&&result.data.items.some(r=>r.id===repositoryId)?repositoryId:undefined;
   if(target!==repositoryId)setRepositoryId(target);
   await refreshFirstPage(cache,["milestones",siteUrl,accountId,state,target,repositoryVersion(result.data.items)]);
  }else await refreshFirstPage(cache,key);
 };
  return <View testID="gongfeng-milestones" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.page}>
    <View style={styles.page} pointerEvents={selected ? "none" : "auto"} accessibilityElementsHidden={!!selected} importantForAccessibility={selected ? "no-hide-descendants" : "auto"}>
      <View style={{ zIndex: 2, backgroundColor: theme.colors.surface0 }}>
        <WorkbenchHeader theme={theme} compact={compact} busy={pages.isFetching||managed.isFetching} updatedAt={pages.dataUpdatedAt} error={pages.isError} onSettings={()=>setSettings(true)} onRefresh={refresh}>
          <Action theme={theme} dense={!compact} label="新建里程碑" icon="Plus" disabled={!accountId||!repositories.length} onPress={()=>setForm(null)}/>
        </WorkbenchHeader>
        <WorkbenchNavigation theme={theme} compact={compact} selected="milestones" onIssues={() => props.onIssues()} siteUrl={siteUrl} onMergeRequests={props.onMergeRequests} onMilestones={() => {}} onRepositories={props.onManageRepositories} />
        <View style={[styles.toolbar, { padding: compact ? 12 : 16 }]}>
          {([["active", "活动中"], ["closed", "已关闭"], ["all", "全部"]] as const).map(([value, label]) => <Action key={value} theme={theme} dense={!compact} pill label={label} selected={state === value} onPress={() => setState(value)} />)}
          <RepositoryPicker theme={theme} items={repositories} value={repositoryId} onChange={setRepositoryId} allowAll />
          <TextInput accessibilityLabel="搜索里程碑" placeholder="搜索已加载的标题、描述…" placeholderTextColor={theme.colors.foregroundMuted} value={search} onChangeText={setSearch} style={{ ...styles.text, flex: 1, minWidth: compact ? 200 : 180, minHeight: compact ? 40 : 30, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }} />
        </View>
      </View>
      <View style={{ flex: 1, position: "relative" }} aria-busy={pages.isFetching||managed.isFetching}>
        <ScrollView {...listScroll} contentContainerStyle={{ padding: compact ? 12 : 16, gap: 12 }}>
          {!accountId ? <Text style={styles.muted}>请先在工蜂设置中连接账号。</Text> : null}
          {managed.isError || managed.data && !managed.data.ok ? <Text style={styles.text}>无法读取已添加仓库，请刷新重试。</Text> : null}
          {accountId && managed.data?.ok && !repositories.length ? <Text style={styles.muted}>先在仓库管理中添加仓库，即可查看里程碑。</Text> : null}
          {pages.isError ? <Text accessibilityLiveRegion="polite" style={styles.text}>{errorMessages[pages.error.message] ?? "里程碑加载失败，请刷新重试。"}</Text> : null}
          <Text style={styles.muted}>已加载 {items.length} 项 · {repositoryId ? "所选仓库" : `${repositories.length} 个已添加仓库`}{pages.hasNextPage || failures.length ? " · 数据尚未完整" : ""} · 搜索和排序覆盖已加载数据</Text>
          {failures.map(f => <Text key={f.projectId} accessibilityLiveRegion="polite" style={styles.text}>{repositories.find(r => r.id === f.projectId)?.path ?? `仓库 ${f.projectId}`}：{errorMessages[f.error] ?? "加载失败"}，刷新可重试。</Text>)}
          <RefreshNotice theme={theme} pages={pages.data?.pages.length??0} busy={pages.isFetching||managed.isFetching} updatedAt={pages.dataUpdatedAt}/>
          <WorkbenchTable theme={theme} compact={compact} rows={visible} rowKey={m=>`${m.projectId}:${m.id}`} label={m=>`查看里程碑 ${m.repositoryPath} ${m.title}`} onOpen={m=>setSelected({siteUrl,accountId:accountId!,projectId:m.projectId,milestoneId:m.id})} columns={[
            {key:"title",title:"里程碑",render:m=><View><Text numberOfLines={2} style={[styles.text,{fontWeight:"600"}]}>{m.title} <Text style={styles.muted}>#{m.iid}</Text></Text>{m.description?<Text numberOfLines={1} style={styles.muted}>{richExcerpt(m.description)}</Text>:null}</View>},
            {key:"repository",title:"仓库",width:180,render:m=><Text numberOfLines={1} style={styles.muted}>{m.repositoryPath}</Text>},
            {key:"state",title:"状态",width:80,render:m=><MilestoneState theme={theme} milestone={m}/>},
            {key:"due",title:"截止日期",width:155,render:m=><MilestoneDate theme={theme} milestone={m}/>},
            {key:"updated",title:"最近更新",width:100,render:m=><Text style={styles.muted}>{m.updatedAt?new Date(m.updatedAt).toLocaleDateString():"—"}</Text>}
          ]} empty={pages.isPending?"正在加载里程碑…":pages.hasNextPage?"已加载范围没有匹配项，可继续加载。":"暂无符合条件的里程碑。"}/>
          {pages.hasNextPage ? <Action theme={theme} label={pages.isFetchingNextPage ? "加载中…" : "加载更多里程碑"} disabled={pages.isFetching} onPress={() => { void pages.fetchNextPage(); }} /> : null}
        </ScrollView>
        {pages.isFetching && !pages.data || managed.isPending&&managed.isFetching ? <View pointerEvents="none" testID="gongfeng-milestone-loading" style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface0, opacity: 0.9 }}><ActivityIndicator size="small" color={theme.colors.accent} /><Text style={styles.muted}>正在加载里程碑…</Text></View> : null}
      </View>
    </View>
    {selected ? <Drawer label={mr ? "MR 详情" : "里程碑详情"} theme={theme} width={drawerWidth} onDismiss={close}>{(dismiss, ready) => mr ? <MRDetail {...props} layout={{ ...layout, compact: drawerWidth < 650 }} params={{ siteUrl: mr.siteUrl ?? "", projectId: String(mr.projectId), mrId: String(mr.mrId), accountId: String(accountId) }} drawer focusReady={ready} onBack={() => discard(() => setMr(undefined))} onOpenMilestone={ref => discard(() => { setSelected(ref); setMr(undefined); })} />
      : <MilestoneDetails {...props} key={`${selected.siteUrl}:${selected.accountId}:${selected.projectId}:${selected.milestoneId}`} reference={selected} ready={ready} onClose={dismiss} onOpenMr={ref => discard(() => setMr(ref))} onEdit={setForm} />}</Drawer> : null}
    {form !== undefined && accountId ? <MilestoneForm key={form ? `${form.projectId}:${form.id}:${form.revision}` : "new"} theme={theme} siteUrl={siteUrl} accountId={accountId} repositories={repositories} initial={form} initialRepositoryId={repositoryId} onClose={() => setForm(undefined)} onSaved={()=>{}} /> : null}
    <Modal title="工蜂配置" open={settings} onOpenChange={open=>{if(open)setSettings(true);else discard(()=>setSettings(false));}}><Modal.Content>{settings ? <ConnectionSettings {...props} /> : null}</Modal.Content></Modal>
  </View>;
}
export function MilestoneState({ theme, milestone }: { theme: Theme; milestone: Pick<Milestone, "state"> }) { return <Text style={{ color: milestone.state === "active" ? theme.colors.statusSuccess : theme.colors.foregroundMuted, fontSize: 12 }}>{milestone.state === "active" ? "活动中" : milestone.state === "closed" ? "已关闭" : milestone.state}</Text>; }
export function MilestoneDate({ theme, milestone }: { theme: Theme; milestone: Pick<Milestone, "dueDate" | "state"> }) {
  const overdue = milestone.state === "active" && !!milestone.dueDate && Date.parse(`${milestone.dueDate.slice(0, 10)}T23:59:59`) < Date.now();
  return <Text style={{ color: overdue ? theme.colors.statusWarning : theme.colors.foregroundMuted, fontSize: 12 }}>{milestone.dueDate ? `${overdue ? "已逾期 · " : "截止 "}${milestone.dueDate.slice(0, 10)}` : "无截止日期"}</Text>;
}
function MilestoneDetails(props: Props & { reference: MilestoneReference; ready: boolean; onClose(): void; onOpenMr(ref: MrRef): void; onEdit(m: Milestone): void }) {
  const { reference, theme } = props, styles = workbenchStyles(theme), root = useRef<View>(null);
  useLayoutEffect(() => props.layout.platform === "web" ? containDrawerFocus(root.current, props.onClose) : undefined, [props.layout.platform, props.onClose]);
  const detailKey = ["milestone", reference.siteUrl, reference.accountId, reference.projectId, reference.milestoneId], cache = useQueryClient();
  const refreshing = useIsFetching({ queryKey: detailKey }) > 0;
  const [actionRefresh, setActionRefresh] = useState(0);
  const rpc = useRpc(milestoneDetail), detail = useQuery({ ...useQueryPolicy("detail"), queryKey: detailKey, queryFn: () => readResult(rpc(reference)), retry: false, refetchOnWindowFocus: false });
  const last = useRef<Milestone | undefined>(undefined);
  const lostAccess=detail.isError&&accessLost(detail.error)||detail.data&&!detail.data.ok&&accessLost(detail.data.error);
  if(lostAccess)last.current=undefined;else if(detail.data?.ok)last.current=detail.data.milestone;
  const m=lostAccess?undefined:detail.data?.ok?detail.data.milestone:last.current;
  const readOnly = detail.isFetching || detail.isError || detail.data?.ok !== true;
  return <View ref={root} style={styles.page}>
    <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={styles.toolbar}><Text style={[styles.muted, { flex: 1 }]}>{m?.repositoryPath ?? "里程碑详情"}{m ? ` · #${m.iid}` : ""}</Text>
        <Action theme={theme} label="刷新详情" icon="RefreshCw" disabled={refreshing} onPress={() => { void cache.refetchQueries({ queryKey: detailKey, type: "active" }).then(() => {
          const current = cache.getQueryState<Awaited<ReturnType<typeof rpc>>>(detailKey);
          if (current?.status === "success" && current.data?.ok) setActionRefresh(value => value + 1);
        }); }} /><Action theme={theme} label="关闭详情" icon="X" autoFocus={props.ready} onPress={props.onClose} /></View>
      <Text accessibilityRole="header" style={styles.title}>{m?.title ?? "里程碑"}</Text>
      {m ? <MilestoneActions key={`${reference.projectId}:${reference.milestoneId}`} refreshId={actionRefresh} disabled={readOnly} theme={theme} reference={reference} milestone={m} onEdit={() => props.onEdit(m)} onDeleted={props.onClose} /> : null}
      {m ? <View style={styles.toolbar}><MilestoneState theme={theme} milestone={m} /><MilestoneDate theme={theme} milestone={m} /></View> : null}
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {detail.isPending ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {detail.isError || detail.data && !detail.data.ok ? <Text accessibilityLiveRegion="polite" style={styles.text}>{detail.data && !detail.data.ok ? errorMessages[detail.data.error] : "无法加载里程碑，请重试。"}</Text> : null}
      {m && (detail.isError || detail.data && !detail.data.ok) ? <Text style={styles.muted}>以下为上次读取的详情，管理操作暂不可用，请刷新核对。</Text> : null}
      {m ? <MilestoneLinks key={`${reference.projectId}:${reference.milestoneId}`} reference={reference} theme={theme} onOpenMr={props.onOpenMr} onOpenIssue={props.onIssues} /> : null}
      {m ? <WorkbenchCard theme={theme} title="描述" icon="FileText"><View style={{ padding: 12 }}><RichText source={m.description} theme={theme} emptyText="暂无描述。" />{m.descriptionTruncated ? <Text style={styles.muted}>描述较长，当前仅显示部分内容。</Text> : null}</View></WorkbenchCard> : null}
    </ScrollView>
    {detail.isPending&&detail.isFetching?<InitialLoading theme={theme} label="正在加载里程碑详情"/>:null}
  </View>;
}
