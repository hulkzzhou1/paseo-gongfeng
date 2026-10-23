import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import type { z } from "zod";
import { milestoneCursor, milestoneDetail, milestonesPage, type Milestone, type MilestoneReference } from "../shared/milestones.ts";
import { connectionStatus } from "../shared/connection.ts";
import { listManagedRepositories } from "../shared/repositories.ts";
import type { MrRef } from "../shared/detail.ts";
import { Action, WorkbenchCard, WorkbenchNavigation, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { ConnectionSettings } from "./connection.tsx";
import { RepositoryPicker } from "./repository-picker.tsx";
import { MilestoneForm, MilestoneActions } from "./milestone-form.tsx";
import { MilestoneLinks } from "./milestone-links.tsx";
import { Drawer } from "./drawer.tsx";
import { MRDetail } from "./detail.tsx";
import { RichText } from "./description.tsx";
import { descriptionExcerpt } from "./description-blocks.ts";
import { containDrawerFocus } from "./web.ts";
import { errorMessages } from "./errors.ts";

type Props = PluginScreenProps & { onMergeRequests(): void; onManageRepositories(): void };
export function Milestones(props: Props) {
  const status = useRpc(connectionStatus);
  const connection = useQuery({ queryKey: ["connection"], queryFn: () => status({}), retry: false });
  const connected = connection.data?.status === "connected" ? connection.data : undefined;
  const siteUrl = connection.data && "siteUrl" in connection.data ? connection.data.siteUrl : undefined;
  return <MilestoneBoard {...props} key={`${siteUrl}:${connected?.account.id}`} siteUrl={siteUrl} accountId={connected?.account.id} />;
}
function MilestoneBoard(props: Props & { siteUrl?: string; accountId?: number }) {
  const { theme, layout, siteUrl, accountId } = props, styles = workbenchStyles(theme), cache = useQueryClient();
  const [state, setState] = useState<"active" | "closed" | "all">("active"), [search, setSearch] = useState(""), [repositoryId, setRepositoryId] = useState<number>();
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
  const managed = useQuery({ queryKey: ["managed-repositories", siteUrl, accountId], queryFn: () => managedRpc({ siteUrl }), enabled: !!accountId, retry: false });
  const repositories = managed.data?.ok ? managed.data.items : [];
  const key = ["milestones", siteUrl, accountId, state, repositoryId, managed.dataUpdatedAt];
  const pages = useInfiniteQuery({ queryKey: key, initialPageParam: undefined as z.infer<typeof milestoneCursor>[] | undefined,
    queryFn: async ({ pageParam }) => { const r = await pageRpc({ siteUrl, accountId: accountId!, state, repositoryId, cursors: pageParam }); if (!r.ok) throw Error(r.error); return r; },
    getNextPageParam: page => page.next.length ? page.next : undefined, enabled: !!accountId && managed.data?.ok === true, retry: false, refetchOnWindowFocus: false });
  const items = [...new Map((pages.data?.pages.flatMap(p => p.items) ?? []).map(m => [`${m.projectId}:${m.id}`, m])).values()];
  const keyword = search.trim().toLocaleLowerCase();
  const visible = items.filter(m => !keyword || `${m.title}\n${m.description}`.toLocaleLowerCase().includes(keyword)).sort((a, b) => (a.dueDate?.slice(0, 10) ?? "9999").localeCompare(b.dueDate?.slice(0, 10) ?? "9999") || a.projectId - b.projectId || a.id - b.id);
  const failures = [...new Map((pages.data?.pages.flatMap(p => p.failures) ?? []).map(f => [f.projectId, f])).values()];
  const compact = layout.compact || width < 650, drawerWidth = compact ? width : Math.min(width * 0.75, 1040);
  const refresh = () => { void cache.resetQueries({ queryKey: ["milestones", siteUrl, accountId] }); void managed.refetch(); };
  return <View testID="gongfeng-milestones" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.page}>
    <View style={styles.page} pointerEvents={selected ? "none" : "auto"} accessibilityElementsHidden={!!selected} importantForAccessibility={selected ? "no-hide-descendants" : "auto"}>
      <View style={{ zIndex: 2, backgroundColor: theme.colors.surface0 }}>
        <View style={[styles.toolbar, { paddingHorizontal: compact ? 12 : 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border }]}>
          <Text accessibilityRole="header" style={[styles.title, { flex: 1, fontSize: 20 }]}>工蜂</Text>
          <Text style={styles.muted}>{pages.dataUpdatedAt ? `更新于 ${new Date(pages.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "里程碑"}</Text>
          <Action theme={theme} dense={!compact} label="新建里程碑" icon="Plus" disabled={!accountId || !repositories.length} onPress={() => setForm(null)} />
          <Action theme={theme} iconOnly dense={!compact} label="工蜂设置" icon="Settings" onPress={() => setSettings(true)} />
          <Action theme={theme} iconOnly dense={!compact} label="刷新里程碑" icon="RefreshCw" disabled={pages.isFetching || managed.isFetching} onPress={refresh} />
        </View>
        <WorkbenchNavigation theme={theme} compact={compact} selected="milestones" siteUrl={siteUrl} onMergeRequests={props.onMergeRequests} onMilestones={() => {}} onRepositories={props.onManageRepositories} />
        <View style={[styles.toolbar, { padding: compact ? 12 : 16 }]}>
          {([["active", "活动中"], ["closed", "已关闭"], ["all", "全部"]] as const).map(([value, label]) => <Action key={value} theme={theme} dense={!compact} pill label={label} selected={state === value} onPress={() => setState(value)} />)}
          <RepositoryPicker theme={theme} items={repositories} value={repositoryId} onChange={setRepositoryId} allowAll />
          <TextInput accessibilityLabel="搜索里程碑" placeholder="搜索已加载的标题、描述…" placeholderTextColor={theme.colors.foregroundMuted} value={search} onChangeText={setSearch} style={{ ...styles.text, flex: 1, minWidth: compact ? 200 : 180, minHeight: compact ? 40 : 30, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }} />
        </View>
      </View>
      <View style={{ flex: 1, position: "relative" }} aria-busy={pages.isFetching}>
        <ScrollView contentContainerStyle={{ padding: compact ? 12 : 16, gap: 12 }}>
          {!accountId ? <Text style={styles.muted}>请先在工蜂设置中连接账号。</Text> : null}
          {managed.isError || managed.data && !managed.data.ok ? <Text style={styles.text}>无法读取已添加仓库，请刷新重试。</Text> : null}
          {accountId && managed.data?.ok && !repositories.length ? <Text style={styles.muted}>先在仓库管理中添加仓库，即可查看里程碑。</Text> : null}
          {pages.isError ? <Text accessibilityLiveRegion="polite" style={styles.text}>{errorMessages[pages.error.message] ?? "里程碑加载失败，请刷新重试。"}</Text> : null}
          <Text style={styles.muted}>已加载 {items.length} 项 · {repositoryId ? "所选仓库" : `${repositories.length} 个已添加仓库`}{pages.hasNextPage || failures.length ? " · 数据尚未完整" : ""} · 搜索和排序覆盖已加载数据</Text>
          {failures.map(f => <Text key={f.projectId} accessibilityLiveRegion="polite" style={styles.text}>{repositories.find(r => r.id === f.projectId)?.path ?? `仓库 ${f.projectId}`}：{errorMessages[f.error] ?? "加载失败"}，刷新可重试。</Text>)}
          <View style={styles.panel}>
            {visible.map(m => <Pressable key={`${m.projectId}:${m.id}`} accessibilityRole="button" accessibilityLabel={`查看里程碑 ${m.repositoryPath} ${m.title}`} onPress={() => setSelected({ siteUrl, accountId: accountId!, projectId: m.projectId, milestoneId: m.id })} style={({ pressed }) => ({ padding: 12, gap: 5, borderBottomWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface0 })}>
              <View style={styles.toolbar}><Text numberOfLines={2} style={[styles.text, { fontWeight: "600", flex: 1 }]}>{m.title}</Text><MilestoneState theme={theme} milestone={m} /></View>
              <View style={styles.toolbar}><Text style={styles.muted}>{m.repositoryPath} · #{m.iid}</Text><MilestoneDate theme={theme} milestone={m} /></View>
              {m.description ? <Text numberOfLines={1} style={styles.muted}>{descriptionExcerpt(m.description)}</Text> : null}
            </Pressable>)}
            {!visible.length && !pages.isPending ? <Text style={[styles.muted, { padding: 24 }]}>{pages.hasNextPage ? "已加载范围没有匹配项，可继续加载。" : "暂无符合条件的里程碑。"}</Text> : null}
          </View>
          {pages.hasNextPage ? <Action theme={theme} label={pages.isFetchingNextPage ? "加载中…" : "加载更多里程碑"} disabled={pages.isFetching} onPress={() => { void pages.fetchNextPage(); }} /> : null}
        </ScrollView>
        {pages.isFetching && !pages.isFetchingNextPage || managed.isFetching ? <View pointerEvents="none" testID="gongfeng-milestone-loading" style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface0, opacity: 0.9 }}><ActivityIndicator size="small" color={theme.colors.accent} /><Text style={styles.muted}>正在加载里程碑…</Text></View> : null}
      </View>
    </View>
    {selected ? <Drawer label={mr ? "MR 详情" : "里程碑详情"} theme={theme} width={drawerWidth} onDismiss={close}>{(dismiss, ready) => mr ? <MRDetail {...props} layout={{ ...layout, compact: drawerWidth < 650 }} params={{ siteUrl: mr.siteUrl ?? "", projectId: String(mr.projectId), mrId: String(mr.mrId), accountId: String(accountId) }} drawer focusReady={ready} onBack={() => setMr(undefined)} onOpenMilestone={ref => { setSelected(ref); setMr(undefined); }} />
      : <MilestoneDetails {...props} key={`${selected.siteUrl}:${selected.accountId}:${selected.projectId}:${selected.milestoneId}`} reference={selected} ready={ready} onClose={dismiss} onOpenMr={setMr} onEdit={setForm} />}</Drawer> : null}
    {form !== undefined && accountId ? <MilestoneForm key={form ? `${form.projectId}:${form.id}:${form.revision}` : "new"} theme={theme} siteUrl={siteUrl} accountId={accountId} repositories={repositories} initial={form} initialRepositoryId={repositoryId} onClose={() => setForm(undefined)} onSaved={refresh} /> : null}
    <Modal title="工蜂配置" open={settings} onOpenChange={setSettings}><Modal.Content>{settings ? <ConnectionSettings {...props} /> : null}</Modal.Content></Modal>
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
  const rpc = useRpc(milestoneDetail), detail = useQuery({ queryKey: detailKey, queryFn: () => rpc(reference), retry: false, refetchOnWindowFocus: false });
  const last = useRef<Milestone | undefined>(undefined);
  if (detail.data?.ok) last.current = detail.data.milestone;
  const m = detail.data?.ok ? detail.data.milestone : last.current;
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
      {m ? <MilestoneLinks key={`${reference.projectId}:${reference.milestoneId}`} reference={reference} theme={theme} onOpenMr={props.onOpenMr} /> : null}
      {m ? <WorkbenchCard theme={theme} title="描述" icon="FileText"><View style={{ padding: 12 }}><RichText source={m.description} theme={theme} emptyText="暂无描述。" />{m.descriptionTruncated ? <Text style={styles.muted}>描述较长，当前仅显示部分内容。</Text> : null}</View></WorkbenchCard> : null}
    </ScrollView>
  </View>;
}
