import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import type { z } from "zod";
import { boardPage, boardState, type boardRelation } from "../shared/board.ts";
import { listRepositoryBindings } from "../shared/repositories.ts";
import { connectionStatus } from "../shared/connection.ts";

import { errorMessages } from "./errors.ts";
import type { MrRef } from "../shared/detail.ts";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { Drawer } from "./drawer.tsx";
import { MRDetail } from "./detail.tsx";
import { ConnectionSettings } from "./connection.tsx";
import { Action, StateBadge, WorkbenchNavigation, workbenchStyles } from "./workbench-ui.tsx";
import { containDrawerFocus } from "./web.ts";

const states = [["opened", "开放"], ["merged", "已合入"], ["closed", "已关闭"], ["all", "全部状态"]] as const;

export function Board(props: PluginScreenProps & { onManageRepositories(): void; onOpenMilestones(params?: Record<string, string>): void }) {
  const { theme, layout, onManageRepositories } = props;
  const [selectedMr, setSelectedMr] = useState<MrRef>();
  const [width, setWidth] = useState(0);
  const fullDrawer = layout.compact || width < 900;
  const onOpenMr = (reference: MrRef) => setSelectedMr(reference);
  const closeDrawer = useCallback(() => setSelectedMr(undefined), []);
  const styles = workbenchStyles(theme);
  const cache = useQueryClient();
  const [filterMenu, setFilterMenu] = useState<"repository" | "state" | null>(null), [repositorySearch, setRepositorySearch] = useState("");
  const [searchDraft, setSearchDraft] = useState(""), [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSearch(searchDraft.trim()), 300); return () => clearTimeout(timer); }, [searchDraft]);
  const [focusedFilter, setFocusedFilter] = useState<"repository" | "state" | null>(null);
  const repositoryTrigger = useRef<View>(null), stateTrigger = useRef<View>(null), filterDropdown = useRef<View>(null);
  const closeFilterMenu = useCallback(() => { setFilterMenu(null); (filterMenu === "repository" ? repositoryTrigger : stateTrigger).current?.focus(); }, [filterMenu]);
  useEffect(() => filterMenu ? containDrawerFocus(filterDropdown.current, closeFilterMenu) : undefined, [filterMenu, closeFilterMenu]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [relation, setRelation] = useState<z.infer<typeof boardRelation>>("all");
  const statusRpc = useRpc(connectionStatus);
  const bindingsRpc = useRpc(listRepositoryBindings);
  const [selection, setSelection] = useState<{ accountId?: number; repositoryId?: number }>({});
  const [state, setState] = useState<z.infer<typeof boardState>>("opened");
  const connection = useQuery({ queryKey: ["connection"], queryFn: () => statusRpc({}), retry: false });
  const siteUrl = connection.data && "siteUrl" in connection.data ? connection.data.siteUrl : undefined;
  const accountId = connection.data?.status === "connected" ? connection.data.account.id : undefined;
  useEffect(() => { setSelection({ accountId }); setSelectedMr(undefined); setFilterMenu(null); setRepositorySearch(""); setSearchDraft(""); setSearch(""); }, [accountId, siteUrl]);
  const bindings = useQuery({ queryKey: ["repository-bindings", "board", siteUrl, accountId], queryFn: () => bindingsRpc({ siteUrl }), enabled: !!accountId, retry: false });
  const repositories = [...new Map((bindings.data?.ok ? bindings.data.bindings : []).map(binding => [binding.repository.id, binding.repository])).values()];
  const selectedId = selection.accountId === accountId ? selection.repositoryId : undefined;
  const removed = selectedId !== undefined && bindings.data?.ok && !repositories.some(repository => repository.id === selectedId);
  const repositoryId = removed ? undefined : selectedId;
  const refreshBindings = useCallback(() => { void bindings.refetch(); }, [bindings.refetch]);
  const checkAccount = useCallback(() => { void connection.refetch(); }, [connection.refetch]);
  const boardKey = ["board", siteUrl, accountId, relation, state, repositoryId, bindings.dataUpdatedAt, search];
  const boardFetching = useIsFetching({ queryKey: boardKey, exact: true }) > 0;
  const boardQuery = cache.getQueryState(boardKey);
  const fetching = connection.isFetching || bindings.isFetching || boardFetching;
  const updateFailed = boardQuery?.status === "error" || bindings.isError || bindings.data && !bindings.data.ok;
  const updatedAt = boardQuery?.dataUpdatedAt;
  const refreshBoard = () => {
    setFilterMenu(null);
    if (!accountId) { checkAccount(); return; }
    // A new bindings version restarts the MR query at page one; failed reads need an explicit reset.
    void bindings.refetch().then(result => {
      if (result.dataUpdatedAt === bindings.dataUpdatedAt) void cache.resetQueries({ queryKey: boardKey, exact: true });
    });
  };
  const repositoryChoices = repositories.filter(repository => repository.path.toLocaleLowerCase().includes(repositorySearch.trim().toLocaleLowerCase()));
  const compact = layout.compact || width < 600;
  return <View testID="gongfeng-workbench" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.page}>
    <View style={[styles.page, { zIndex: 0 }]} pointerEvents={selectedMr ? "none" : "auto"} accessibilityElementsHidden={!!selectedMr} importantForAccessibility={selectedMr ? "no-hide-descendants" : "auto"}>
    <View testID="gongfeng-board-header" style={{ zIndex: 2, backgroundColor: theme.colors.surface0 }}>
      <View testID="gongfeng-board-titlebar" style={{ ...styles.toolbar, paddingHorizontal: compact ? 12 : 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <Text accessibilityRole="header" style={[styles.title, { flex: 1, fontSize: 20, lineHeight: 28 }]}>工蜂</Text>
        <Text accessibilityLiveRegion="polite" style={styles.muted}>{updateFailed ? "更新未完成" : updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "尚未更新"}</Text>
        <Action theme={theme} dense={!compact} iconOnly label="工蜂设置" icon="Settings" onPress={() => { setFilterMenu(null); setSettingsOpen(true); }} />
        <Action theme={theme} dense={!compact} iconOnly label="刷新工作台" icon="RefreshCw" disabled={fetching} onPress={refreshBoard} />
      </View>
      <WorkbenchNavigation theme={theme} compact={compact} selected="mrs" siteUrl={siteUrl} onMergeRequests={() => setFilterMenu(null)} onMilestones={() => props.onOpenMilestones()} onRepositories={onManageRepositories} />
      <View testID="gongfeng-board-filters" style={{ ...styles.toolbar, paddingHorizontal: compact ? 12 : 16, paddingVertical: compact ? 6 : 7, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <View style={styles.toolbar}>
          <Action theme={theme} dense={!compact} pill label="全部" selected={relation === "all"} onPress={() => { setFilterMenu(null); setRelation("all"); }} />
          <Action theme={theme} dense={!compact} pill label="我创建" selected={relation === "authored"} onPress={() => { setFilterMenu(null); setRelation("authored"); }} />
          <Action theme={theme} dense={!compact} pill label="我参与评审" selected={relation === "reviewing"} onPress={() => { setFilterMenu(null); setRelation("reviewing"); }} />
        </View>
        <View style={{ position: "relative", width: 96 }}>
          <Pressable ref={stateTrigger} accessibilityRole="combobox" accessibilityLabel="MR 状态" aria-expanded={filterMenu === "state"} onFocus={() => setFocusedFilter("state")} onBlur={() => setFocusedFilter(null)} onPress={() => setFilterMenu(value => value === "state" ? null : "state")}
            style={{ minHeight: compact ? 36 : 28, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: focusedFilter === "state" || filterMenu === "state" ? theme.colors.accent : theme.colors.border, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.text, { flex: 1, fontSize: compact ? 13 : 12 }]}>{states.find(([value]) => value === state)?.[1]}</Text><Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />
          </Pressable>
          {filterMenu === "state" ? <View ref={filterDropdown} testID="gongfeng-state-filter" onAccessibilityEscape={closeFilterMenu} style={[styles.panel, { position: "absolute", top: compact ? 42 : 34, left: 0, width: 96, padding: 4, zIndex: 10 }]}>
            {states.map(([value, label]) => <Action key={value} theme={theme} dense={!compact} quiet autoFocus={state === value} label={label} selected={state === value} onPress={() => { setState(value); closeFilterMenu(); }} />)}
          </View> : null}
        </View>
        <View style={{ position: "relative", width: compact ? "100%" : 180 }}>
          <Pressable ref={repositoryTrigger} accessibilityRole="combobox" accessibilityLabel="仓库范围" aria-expanded={filterMenu === "repository"} accessibilityState={{ disabled: !accountId }} disabled={!accountId}
            onFocus={() => setFocusedFilter("repository")} onBlur={() => setFocusedFilter(null)}
            onPress={() => { setFilterMenu(value => value === "repository" ? null : "repository"); setRepositorySearch(""); }}
            style={({ pressed }) => ({ minHeight: compact ? 36 : 28, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: focusedFilter === "repository" ? theme.colors.accent : theme.colors.border, backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface0, flexDirection: "row", alignItems: "center", gap: 8 })}>
            <Icon name="GitBranch" size={14} color={theme.colors.foregroundMuted} /><Text numberOfLines={1} style={[styles.text, { flex: 1, fontSize: compact ? 13 : 12 }]}>{repositories.find(r => r.id === repositoryId)?.path ?? "全部仓库"}</Text><Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />
          </Pressable>
          {filterMenu === "repository" ? <View ref={filterDropdown} testID="gongfeng-repository-filter" onAccessibilityEscape={closeFilterMenu} style={[styles.panel, { position: "absolute", top: compact ? 42 : 34, right: 0, width: compact ? "100%" : 300, zIndex: 10, shadowColor: theme.colors.foreground, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }]}>
            <TextInput autoFocus accessibilityLabel="搜索筛选仓库" value={repositorySearch} onChangeText={setRepositorySearch} placeholder="筛选已关联仓库…" placeholderTextColor={theme.colors.foregroundMuted}
              style={{ ...styles.text, margin: 8, paddingHorizontal: 10, minHeight: 38, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1 }} />
            <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
              {[{ id: undefined, path: "全部仓库（含未关联）" }, ...repositoryChoices].map(repository => <Pressable key={repository.id ?? "all"} accessibilityRole="button" accessibilityLabel={`筛选 ${repository.path}`} aria-selected={repository.id === repositoryId}
                onPress={() => { setSelection({ accountId, repositoryId: repository.id }); closeFilterMenu(); }}
                style={({ pressed }) => ({ minHeight: 40, padding: 10, gap: 8, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed || repository.id === repositoryId ? theme.colors.surface2 : theme.colors.surface0 })}>
                <Icon name={repository.id === repositoryId ? "Check" : "Minus"} size={14} color={repository.id === repositoryId ? theme.colors.accent : theme.colors.foregroundMuted} /><Text style={[styles.text, { flex: 1 }]}>{repository.path}</Text>
              </Pressable>)}
              {!repositoryChoices.length ? <Text style={[styles.muted, { padding: 12 }]}>{repositories.length ? "没有匹配的已关联仓库。" : "暂无关联仓库，可前往仓库管理添加关联。"}</Text> : null}
            </ScrollView>
          </View> : null}
        </View>
        <View style={{ flex: compact ? undefined : 1, minWidth: 160, width: compact ? "100%" : undefined, minHeight: compact ? 38 : 30, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="Search" size={14} color={theme.colors.foregroundMuted} />
          <TextInput accessibilityLabel="搜索合并请求" value={searchDraft} maxLength={256} onFocus={() => setFilterMenu(null)} onChangeText={setSearchDraft} onSubmitEditing={() => setSearch(searchDraft.trim())} placeholder="搜索标题、仓库、编号或作者…" placeholderTextColor={theme.colors.foregroundMuted}
            style={{ ...styles.text, flex: 1, minWidth: 0, padding: 0, fontSize: compact ? 13 : 12, minHeight: compact ? 34 : 26 }} />
          {searchDraft ? <Action theme={theme} dense={!compact} iconOnly quiet label="清空搜索" icon="X" onPress={() => { setSearchDraft(""); setSearch(""); }} /> : null}
        </View>
      </View>
    </View>
    <View testID="gongfeng-board-content" aria-busy={fetching} style={{ flex: 1, position: "relative" }}>
    <ScrollView accessibilityElementsHidden={fetching} importantForAccessibility={fetching ? "no-hide-descendants" : "auto"} style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 12 }}>
      {searchDraft.trim() !== search ? <Text accessibilityLiveRegion="polite" style={styles.muted}>正在应用搜索条件…</Text> : null}
      {removed ? <Text accessibilityLiveRegion="polite" style={styles.text}>该仓库已无关联项目，已切回全局视图。</Text> : null}
      {bindings.isError || (bindings.data && !bindings.data.ok) ? <Text accessibilityLiveRegion="polite" style={styles.text}>关联仓库加载失败，请用右上角刷新重试。全局发现仍可使用。</Text>
        : bindings.data?.ok && !repositories.length ? <Text style={styles.muted}>暂无关联仓库；全局视图仍显示有权限查看的 MR。</Text> : null}
      {(!accountId && connection.isFetching) || (repositoryId !== undefined && bindings.isFetching) ? <Text style={styles.muted}>{connection.isFetching ? "正在检查账号…" : "正在更新关联仓库…"}</Text>
        : accountId ? <Bucket key={`${siteUrl}:${accountId}:${relation}:${state}:${repositoryId ?? "all"}:${bindings.dataUpdatedAt}:${search}`} theme={theme} siteUrl={siteUrl} relation={relation} state={state} accountId={accountId} repositoryId={repositoryId} search={search} bindingsVersion={bindings.dataUpdatedAt} onBindingsChanged={refreshBindings} onAccountChanged={checkAccount} selectedMr={selectedMr} onOpenMr={onOpenMr} />
        : <View style={{ gap: 12 }}><Text accessibilityLiveRegion="polite" style={styles.text}>{connection.isError ? "无法读取连接状态，请重新检查账号。" : errorMessages[connection.data?.status === "error" ? connection.data.error : "unconfigured"]}</Text><Action theme={theme} label="重新检查账号" disabled={connection.isFetching} onPress={checkAccount} /></View>}
    </ScrollView>
    {fetching ? <View testID="gongfeng-board-loading" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface0, opacity: 0.94 }}>
      <ActivityIndicator accessibilityLabel="正在加载合并请求" size={28} color={theme.colors.accent} />
    </View> : null}
    </View>
    {filterMenu ? <Pressable accessibilityRole="button" accessibilityLabel="关闭筛选菜单" onPress={closeFilterMenu} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 }} /> : null}
    </View>
    {selectedMr && selectedMr.siteUrl === siteUrl ? <Drawer theme={theme} width={fullDrawer ? width : Math.min(width * 0.7, 1000)} onDismiss={closeDrawer}>{(close, ready) =>
      <MRDetail {...props} layout={{ ...layout, compact: fullDrawer || width * 0.7 < 650 }} params={{ projectId: String(selectedMr.projectId), mrId: String(selectedMr.mrId), accountId: String(selectedMr.accountId), ...(selectedMr.siteUrl ? { siteUrl: selectedMr.siteUrl } : {}) }}
        drawer focusReady={ready} onBack={close} onOpenMilestone={reference => props.onOpenMilestones({ siteUrl: reference.siteUrl ?? "", accountId: String(reference.accountId), projectId: String(reference.projectId), milestoneId: String(reference.milestoneId) })} />
    }</Drawer> : null}
    <Modal title="工蜂配置" open={settingsOpen} onOpenChange={setSettingsOpen}><Modal.Content>
      {settingsOpen ? <ConnectionSettings {...props} /> : null}
    </Modal.Content></Modal>
  </View>;
}

function Bucket({ theme, siteUrl, relation, state, accountId, repositoryId, search, bindingsVersion, onBindingsChanged, onAccountChanged, selectedMr, onOpenMr }: Pick<PluginSurfaceProps, "theme"> & {
  siteUrl?: string; relation: z.infer<typeof boardRelation>; state: z.infer<typeof boardState>; accountId: number; repositoryId?: number; search: string; bindingsVersion: number; onBindingsChanged(): void; onAccountChanged(): void; selectedMr?: MrRef; onOpenMr(ref: MrRef): void;
}) {
  const [focusedMr, setFocusedMr] = useState<string>();
  const rpc = useRpc(boardPage);
  const queryKey = ["board", siteUrl, accountId, relation, state, repositoryId, bindingsVersion, search];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const result = await rpc({ siteUrl, relation, state, page: pageParam, accountId, repositoryId, search });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    getNextPageParam: (last) => last.nextPage ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const message = query.error instanceof Error ? query.error.message : "";
  useEffect(() => { if (message === "account_changed") onAccountChanged(); }, [message, onAccountChanged]);
  useEffect(() => { if (message === "stale_binding") onBindingsChanged(); }, [message, onBindingsChanged]);
  const stale = message === "account_changed" || message === "stale_binding";
  const items = stale ? [] : [...new Map((query.data?.pages.flatMap((page) => page.items) ?? []).map((mr) => [`${mr.projectId}:${mr.id}`, mr])).values()];
  const scanned = query.data?.pages.reduce((sum, page) => sum + page.scanned, 0) ?? 0;
  const styles = workbenchStyles(theme);
  return <View style={{ gap: 10 }}>
    <View style={styles.toolbar}>
      <Text style={[styles.text, { fontWeight: "600", flex: 1 }]}>{relation === "all" ? "全部可见 MR" : relation === "authored" ? "我创建" : "我参与评审"} · {search ? "已找到" : "已加载"} {items.length} 项</Text>
    </View>
    {relation === "reviewing" ? <Text style={styles.muted}>包含已经审查过的 MR。</Text> : null}
    {query.isError ? <Text accessibilityLiveRegion="polite" style={styles.text}>{errorMessages[message] ?? "加载失败，请检查 Paseo 连接后重试。"}{stale ? " 已清除旧查询内容。" : " 已加载内容保留。"}</Text> : null}
    <View style={styles.panel}>
      {items.map(mr => <View key={`${mr.projectId}:${mr.id}`} style={{ borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: "row", alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${mr.projectPath} !${mr.iid} ${mr.title}`} onPress={() => onOpenMr({ siteUrl, projectId: mr.projectId, mrId: mr.id, accountId })}
          onFocus={() => setFocusedMr(`${mr.projectId}:${mr.id}`)} onBlur={() => setFocusedMr(undefined)}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 12, gap: 5, borderLeftWidth: 2, borderLeftColor: focusedMr === `${mr.projectId}:${mr.id}` || selectedMr?.projectId === mr.projectId && selectedMr.mrId === mr.id ? theme.colors.accent : "transparent", backgroundColor: pressed || selectedMr?.projectId === mr.projectId && selectedMr.mrId === mr.id ? theme.colors.surface1 : theme.colors.surface0 })}>
          <Text numberOfLines={2} style={[styles.text, { fontWeight: "600", fontSize: 16, lineHeight: 23 }]}>{mr.title}</Text>
          <View style={styles.toolbar}><StateBadge theme={theme} state={mr.state} /><Text numberOfLines={1} style={[styles.muted, { flexShrink: 1 }]}>{mr.projectPath} · !{mr.iid}</Text><Text style={styles.muted} accessibilityLabel={`MR 所有者：${mr.authorUsername || "未知"}`}>{mr.authorUsername ? `@${mr.authorUsername}` : "所有者未知"}</Text></View>
        </Pressable>
        <ExternalLink href={mr.url} accessibilityLabel={`在工蜂查看 ${mr.title}`}><Text style={{ ...styles.muted, textDecorationLine: "underline", padding: 12 }}>原站 ↗</Text></ExternalLink>
      </View>)}
      {items.length === 0 ? <View style={{ padding: 24 }}><Text style={styles.muted}>{query.isPending ? search ? "正在搜索合并请求…" : "正在加载合并请求…" : query.isError ? "暂时无法显示合并请求。" : query.hasNextPage ? search ? "已搜索的范围暂无匹配项，可继续搜索后续内容。" : "已加载页暂无符合条件的 MR，可继续加载。" : "暂无符合条件的 MR。"}</Text></View> : null}
    </View>
    {query.hasNextPage ? <View style={styles.toolbar}><Text style={[styles.muted, { flex: 1 }]}>{search ? `已搜索 ${scanned} 条记录，后续内容尚未搜索` : `已扫描 ${scanned} 条记录，后续页尚未加载`}</Text><Action theme={theme} label={query.isFetchingNextPage ? "加载中…" : search ? "继续搜索" : "继续加载"} disabled={query.isFetching} onPress={() => { void query.fetchNextPage(); }} /></View>
      : query.data ? <Text style={styles.muted}>{search ? `已搜索本轮全部 ${scanned} 条记录。` : "已到查询末页。"}刷新可获取最新记录。</Text> : null}
    {repositoryId !== undefined && relation !== "all" ? <Text style={styles.muted}>仓库筛选逐页扫描全局结果；当前页为空不代表后续页没有匹配 MR。</Text> : null}
    {state === "opened" ? <Text style={styles.muted}>开放视图包含重新打开及未知状态。</Text> : null}
  </View>;
}
