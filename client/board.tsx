import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink, SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { z } from "zod";
import { boardPage, boardState, type boardRelation } from "../shared/board.ts";
import { listRepositoryBindings } from "../shared/repositories.ts";
import { connectionStatus } from "../shared/connection.ts";

import { errorMessages } from "./errors.ts";
import type { MrRef } from "../shared/detail.ts";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { Drawer } from "./drawer.tsx";
import { MRDetail } from "./detail.tsx";
import { ConnectionSettings } from "./connection.tsx";
import { Action, StateBadge, workbenchStyles } from "./workbench-ui.tsx";

export function Board(props: PluginScreenProps & { onManageRepositories(): void }) {
  const { theme, layout, onManageRepositories } = props;
  const [selectedMr, setSelectedMr] = useState<MrRef>();
  const [width, setWidth] = useState(0);
  const fullDrawer = layout.compact || width < 900;
  const onOpenMr = (reference: MrRef) => setSelectedMr(reference);
  const closeDrawer = useCallback(() => setSelectedMr(undefined), []);
  const styles = workbenchStyles(theme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [relation, setRelation] = useState<z.infer<typeof boardRelation>>("authored");
  const statusRpc = useRpc(connectionStatus);
  const bindingsRpc = useRpc(listRepositoryBindings);
  const [selection, setSelection] = useState<{ accountId?: number; repositoryId?: number }>({});
  const [state, setState] = useState<z.infer<typeof boardState>>("opened");
  const connection = useQuery({ queryKey: ["connection"], queryFn: () => statusRpc({}), retry: false });
  const siteUrl = connection.data && "siteUrl" in connection.data ? connection.data.siteUrl : undefined;
  const accountId = connection.data?.status === "connected" ? connection.data.account.id : undefined;
  useEffect(() => { setSelection({ accountId }); setSelectedMr(undefined); }, [accountId, siteUrl]);
  const bindings = useQuery({ queryKey: ["repository-bindings", "board", siteUrl, accountId], queryFn: () => bindingsRpc({ siteUrl }), enabled: !!accountId, retry: false });
  const repositories = [...new Map((bindings.data?.ok ? bindings.data.bindings : []).map(binding => [binding.repository.id, binding.repository])).values()];
  const selectedId = selection.accountId === accountId ? selection.repositoryId : undefined;
  const removed = selectedId !== undefined && bindings.data?.ok && !repositories.some(repository => repository.id === selectedId);
  const repositoryId = removed ? undefined : selectedId;
  const refreshBindings = useCallback(() => { void bindings.refetch(); }, [bindings.refetch]);
  const checkAccount = useCallback(() => { void connection.refetch(); }, [connection.refetch]);
  return <View testID="gongfeng-workbench" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.page}>
    <View style={styles.page} pointerEvents={selectedMr ? "none" : "auto"} accessibilityElementsHidden={!!selectedMr} importantForAccessibility={selectedMr ? "no-hide-descendants" : "auto"}>
    <View style={{ padding: layout.compact ? 12 : 20, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1, minWidth: 120 }}><Text accessibilityRole="header" style={styles.title}>合并请求</Text><Text style={styles.muted}>{siteUrl ?? "请先配置工蜂站点"}</Text></View>
        <Action theme={theme} label="仓库管理" icon="GitBranch" onPress={onManageRepositories} />
        <Action theme={theme} quiet label="工蜂设置" icon="Settings" onPress={() => setSettingsOpen(true)} />
      </View>
      <View style={styles.toolbar}>
        <Action theme={theme} label="我创建" selected={relation === "authored"} onPress={() => setRelation("authored")} />
        <Action theme={theme} label="我参与评审" selected={relation === "reviewing"} onPress={() => setRelation("reviewing")} />
        <View style={{ flex: 1 }} />
        {([['opened', '开放'], ['merged', '已合入'], ['closed', '已关闭'], ['all', '全部']] as const).map(([value, label]) =>
          <Action key={value} theme={theme} label={label} selected={state === value} onPress={() => setState(value)} />)}
      </View>
      <View style={{ flexDirection: layout.compact ? "column" : "row", alignItems: layout.compact ? "stretch" : "center", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><SettingsCard><SettingsSelect label="仓库范围" value={repositoryId === undefined ? "all" : String(repositoryId)}
          onValueChange={value => setSelection({ accountId, repositoryId: value === "all" ? undefined : Number(value) })}
          options={[{ value: "all", label: "全部仓库（含未关联）" }, ...repositories.map(repository => ({ value: String(repository.id), label: repository.path }))]} /></SettingsCard></View>
        <Action theme={theme} quiet label="刷新关联" icon="RefreshCw" disabled={bindings.isFetching || !accountId} onPress={refreshBindings} />
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 12 }}>
      {removed ? <Text accessibilityLiveRegion="polite" style={styles.text}>该仓库已无关联项目，已切回全局视图。</Text> : null}
      {bindings.isError || (bindings.data && !bindings.data.ok) ? <Text accessibilityLiveRegion="polite" style={styles.text}>关联仓库加载失败，请刷新关联。全局发现仍可使用。</Text>
        : bindings.data?.ok && !repositories.length ? <Text style={styles.muted}>暂无关联仓库；全局视图仍显示有权限查看的 MR。</Text> : null}
      {(!accountId && connection.isFetching) || (repositoryId !== undefined && bindings.isFetching) ? <Text style={styles.muted}>{connection.isFetching ? "正在检查账号…" : "正在更新关联仓库…"}</Text>
        : accountId ? <Bucket key={`${siteUrl}:${accountId}:${relation}:${state}:${repositoryId ?? "all"}:${bindings.dataUpdatedAt}`} theme={theme} siteUrl={siteUrl} relation={relation} state={state} accountId={accountId} repositoryId={repositoryId} bindingsVersion={bindings.dataUpdatedAt} onBindingsChanged={refreshBindings} onAccountChanged={checkAccount} selectedMr={selectedMr} onOpenMr={onOpenMr} />
        : <View style={{ gap: 12 }}><Text accessibilityLiveRegion="polite" style={styles.text}>{connection.isError ? "无法读取连接状态，请重新检查账号。" : errorMessages[connection.data?.status === "error" ? connection.data.error : "unconfigured"]}</Text><Action theme={theme} label="重新检查账号" disabled={connection.isFetching} onPress={checkAccount} /></View>}
    </ScrollView>
    </View>
    {selectedMr && selectedMr.siteUrl === siteUrl ? <Drawer theme={theme} width={fullDrawer ? width : Math.min(width * 0.7, 1000)} onDismiss={closeDrawer}>{(close, ready) =>
      <MRDetail {...props} layout={{ ...layout, compact: fullDrawer || width * 0.7 < 650 }} params={{ projectId: String(selectedMr.projectId), mrId: String(selectedMr.mrId), accountId: String(selectedMr.accountId), ...(selectedMr.siteUrl ? { siteUrl: selectedMr.siteUrl } : {}) }}
        drawer focusReady={ready} onBack={close} onManageRepositories={onManageRepositories} />
    }</Drawer> : null}
    <Modal title="工蜂配置" open={settingsOpen} onOpenChange={setSettingsOpen}><Modal.Content>
      {settingsOpen ? <ConnectionSettings {...props} /> : null}
    </Modal.Content></Modal>
  </View>;
}

function Bucket({ theme, siteUrl, relation, state, accountId, repositoryId, bindingsVersion, onBindingsChanged, onAccountChanged, selectedMr, onOpenMr }: Pick<PluginSurfaceProps, "theme"> & {
  siteUrl?: string; relation: z.infer<typeof boardRelation>; state: z.infer<typeof boardState>; accountId: number; repositoryId?: number; bindingsVersion: number; onBindingsChanged(): void; onAccountChanged(): void; selectedMr?: MrRef; onOpenMr(ref: MrRef): void;
}) {
  const [focusedMr, setFocusedMr] = useState<string>();
  const rpc = useRpc(boardPage);
  const cache = useQueryClient();
  const queryKey = ["board", siteUrl, accountId, relation, state, repositoryId, bindingsVersion];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const result = await rpc({ siteUrl, relation, state, page: pageParam, accountId, repositoryId });
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
      <Text style={[styles.text, { fontWeight: "600", flex: 1 }]}>{relation === "authored" ? "我创建" : "我参与评审"} · 已加载 {items.length} 项</Text>
      <Action theme={theme} quiet label={query.isFetching ? "加载中…" : "刷新 MR"} icon="RefreshCw" disabled={query.isFetching} onPress={() => { void cache.resetQueries({ queryKey, exact: true }); }} />
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
      {items.length === 0 ? <View style={{ padding: 24 }}><Text style={styles.muted}>{query.isPending ? "正在加载合并请求…" : query.isError ? "暂时无法显示合并请求。" : query.hasNextPage ? "已加载页暂无符合条件的 MR，可继续加载。" : "暂无符合条件的 MR。"}</Text></View> : null}
    </View>
    {query.hasNextPage ? <View style={styles.toolbar}><Text style={[styles.muted, { flex: 1 }]}>已扫描 {scanned} 条记录，后续页尚未加载</Text><Action theme={theme} label={query.isFetchingNextPage ? "加载中…" : "继续加载"} disabled={query.isFetching} onPress={() => { void query.fetchNextPage(); }} /></View>
      : query.data ? <Text style={styles.muted}>已到查询末页。刷新可获取最新记录。</Text> : null}
    {repositoryId !== undefined ? <Text style={styles.muted}>仓库筛选逐页扫描全局结果；当前页为空不代表后续页没有匹配 MR。</Text> : null}
    {state === "opened" ? <Text style={styles.muted}>开放视图包含重新打开及未知状态。</Text> : null}
  </View>;
}
