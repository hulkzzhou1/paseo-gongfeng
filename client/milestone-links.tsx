import { accessLost, invalidateResources } from "./query-policy.ts";
import { useDraft } from "./draft-guard.tsx";
import { useQueryPolicy } from "./query.tsx";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { milestoneItems, searchMilestoneItems, saveMilestoneLinks, type MilestoneItem, type MilestoneReference } from "../shared/milestones.ts";
import type { IssueRef } from "../shared/issues.ts";
import type { MrRef } from "../shared/detail.ts";
import { Action, StateBadge, WorkbenchCard, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { errorMessages } from "./errors.ts";

type Props = { theme: Theme; reference: MilestoneReference; onOpenIssue(ref: IssueRef): void; onOpenMr(ref: MrRef): void };
const keyFor = (ref: MilestoneReference) => ["milestone", ref.siteUrl, ref.accountId, ref.projectId, ref.milestoneId];
export function MilestoneLinks(props: Props) {
  const { reference, theme } = props, styles = workbenchStyles(theme), rpc = useRpc(milestoneItems);
  const [editing, setEditing] = useState(false);
  const issues = useInfiniteQuery({ ...useQueryPolicy("detail"), queryKey: [...keyFor(reference), "items", "issue"], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await rpc({ ...reference, kind: "issue", page: pageParam }); if (!r.ok) throw Error(r.error); return r; }, getNextPageParam: p => p.nextPage ?? undefined, retry: false, refetchOnWindowFocus: false });
  const mrs = useInfiniteQuery({ ...useQueryPolicy("detail"), queryKey: [...keyFor(reference), "items", "mr"], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await rpc({ ...reference, kind: "mr", page: pageParam }); if (!r.ok) throw Error(r.error); return r; }, getNextPageParam: p => p.nextPage ?? undefined, retry: false, refetchOnWindowFocus: false });
  const issueItems = issues.isError&&accessLost(issues.error)?[]:[...new Map((issues.data?.pages.flatMap(p => p.items) ?? []).map(i => [i.id, i])).values()];
  const mrItems = mrs.isError&&accessLost(mrs.error)?[]:[...new Map((mrs.data?.pages.flatMap(p => p.items) ?? []).map(i => [i.id, i])).values()];
  useEffect(()=>{if(accessLost(issues.error)||accessLost(mrs.error))setEditing(false);},[issues.error,mrs.error]);
  return <View style={{ gap: 16 }}>
    <WorkbenchCard theme={theme} title="进度" icon="ChartNoAxesCombined" right={<Action theme={theme} quiet label="编辑关联" icon="Link" onPress={() => setEditing(true)} />}>
      <View style={{ padding: 12, gap: 6 }}>
        <Text style={styles.text}>Issue 已关闭 {issueItems.filter(i => i.state === "closed").length} / {issues.hasNextPage || issues.isError || issues.isPending ? "已加载 " : "总数 "}{issueItems.length}</Text>
        <Text style={styles.text}>MR 已合入 {mrItems.filter(i => i.state === "merged").length} / {mrs.hasNextPage || mrs.isError || mrs.isPending ? "已加载 " : "总数 "}{mrItems.length} · 已关闭未合入 {mrItems.filter(i => i.state === "closed").length}</Text>
        <Text style={styles.muted}>Issue 与 MR 分开统计。{issues.hasNextPage || mrs.hasNextPage || issues.isError || mrs.isError || issues.isPending || mrs.isPending ? "关联数据尚未完整，请继续加载或刷新。" : "当前关联项已加载至末页。"}</Text>
      </View>
    </WorkbenchCard>
    {([["issue", "关联议题", issueItems, issues], ["mr", "关联合并请求", mrItems, mrs]] as const).map(([kind, title, items, query]) => <WorkbenchCard key={kind} theme={theme} title={`${title} · ${items.length}${query.hasNextPage ? "+" : ""}`} icon={kind === "issue" ? "CircleDot" : "GitPullRequest"}>
      <View style={{ padding: 12, gap: 10 }}>
        {query.isPending ? <Text style={styles.muted}>正在加载…</Text> : null}
        {query.isError ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: theme.colors.statusDanger }}>{errorMessages[query.error.message] ?? "加载失败，请刷新详情。"}</Text> : null}
        {items.map(item => <ItemRow key={item.id} {...props} item={item} />)}
        {!items.length && !query.isPending && !query.isError ? <Text style={styles.muted}>当前已加载范围没有关联项。</Text> : null}
        {query.hasNextPage ? <Action theme={theme} label="加载更多关联项" disabled={query.isFetching} onPress={() => { void query.fetchNextPage(); }} /> : null}
      </View>
    </WorkbenchCard>)}
    {editing ? <EditLinks {...props} linked={[...issueItems, ...mrItems]} onClose={() => setEditing(false)} /> : null}
  </View>;
}
function ItemRow({ theme, reference, item, onOpenMr, onOpenIssue, right }: Props & { item: MilestoneItem; right?: React.ReactNode }) {
  const styles = workbenchStyles(theme);
  return <View style={{ gap: 5, paddingVertical: 7, borderBottomWidth: 1, borderColor: theme.colors.border }}>
    <View style={styles.toolbar}><Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>{item.kind === "mr" ? "!" : "#"}{item.iid} {item.title}</Text>{right}</View>
    <View style={styles.toolbar}>{item.kind === "mr" ? <StateBadge theme={theme} state={item.state} /> : <Text style={styles.muted}>{item.state === "closed" ? "已关闭" : item.state === "opened" ? "开放" : item.state}</Text>}
      {item.kind === "mr" ? <Action theme={theme} quiet label="查看 MR" onPress={() => onOpenMr({ siteUrl: reference.siteUrl, accountId: reference.accountId, projectId: reference.projectId, mrId: item.id })} /> : <Action theme={theme} quiet label="查看议题" onPress={() => onOpenIssue({ siteUrl: reference.siteUrl, accountId: reference.accountId, projectId: reference.projectId, issueId: item.id })} />}
      {item.kind === "issue" ? <ExternalLink href={item.url}><Text style={{ ...styles.muted, textDecorationLine: "underline", padding: 5 }}>在工蜂查看 ↗</Text></ExternalLink> : null}
    </View>
  </View>;
}

type Draft = { item: MilestoneItem; action: "add" | "remove" };
function EditLinks(props: Props & { linked: MilestoneItem[]; onClose(): void }) {
  const { reference, theme, linked } = props, styles = workbenchStyles(theme), cache = useQueryClient(), searchRpc = useRpc(searchMilestoneItems), saveRpc = useRpc(saveMilestoneLinks);
  const [kind, setKind] = useState<"issue" | "mr">("issue"), [text, setText] = useState(""), [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft[]>([]), [confirm, setConfirm] = useState(false), [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 300); return () => clearTimeout(timer); }, [text]);
  const candidates = useInfiniteQuery({ ...useQueryPolicy("options"), queryKey: [...keyFor(reference), "candidates", kind, query], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const r = await searchRpc({ ...reference, kind, query, page: pageParam }); if (!r.ok) throw Error(r.error); return r; }, getNextPageParam: p => p.nextPage ?? undefined,
    enabled: !!query, retry: false, refetchOnWindowFocus: false });
  const migration = draft.filter(d => d.action === "add" && d.item.milestone && d.item.milestone.id !== reference.milestoneId);
  const toggle = (item: MilestoneItem, action: "add" | "remove") => { setConfirm(false); setNotice(""); setDraft(rows => rows.some(d => d.item.kind === item.kind && d.item.id === item.id) ? rows.filter(d => d.item.kind !== item.kind || d.item.id !== item.id) : [...rows, { item, action }]); };
  const mutation = useMutation({ mutationFn: () => saveRpc({ ...reference, confirmMigration: confirm, changes: draft.map(d => ({ kind: d.item.kind, id: d.item.id, originalMilestoneId: d.item.milestone?.id ?? null, action: d.action })) }), retry: false,
    onSuccess(result) {
      if (result.ok && result.complete) { void cache.invalidateQueries({ queryKey: keyFor(reference) }); void invalidateResources(cache,reference,["mr","board","issue","issues","milestones"]); props.onClose(); return; }
      setUncertain(true);
      if (result.ok) { void cache.invalidateQueries({ queryKey: keyFor(reference) }); void invalidateResources(cache,reference,["mr","board","issue","issues","milestones"]); setNotice(`已确认 ${result.results.filter(r => r.ok).length} 项，其余未完成。请关闭弹窗并刷新，核对实际关联后重新编辑。`); }
      else setNotice(`${errorMessages[result.error] ?? "关联保存未完成。"} 请关闭弹窗并刷新后重新编辑。`);
    },
    onError() { setUncertain(true); setNotice("保存结果不确定，请关闭弹窗并刷新核对，避免重复提交。"); },
  });
  const requestClose=useDraft(draft.length>0,mutation.isPending);
  const disabled = mutation.isPending || uncertain;
  const choices = query === text.trim() ? [...new Map((candidates.data?.pages.flatMap(p => p.items) ?? []).map(i => [i.id, i])).values()] : [];
  return <Modal title="编辑里程碑关联" open onOpenChange={open => { if (!open && !mutation.isPending) requestClose(props.onClose); }}><Modal.Content>
    <View style={{ gap: 12 }}>
      <Text style={styles.muted}>仅选择当前仓库的已有事项。添加、移除形成草稿，保存后才回写工蜂。</Text>
      <View style={styles.toolbar}><Action theme={theme} pill label="议题" selected={kind === "issue"} onPress={() => setKind("issue")} /><Action theme={theme} pill label="合并请求" selected={kind === "mr"} onPress={() => setKind("mr")} /></View>
      <Text style={[styles.text, { fontWeight: "600" }]}>已关联（已加载）</Text>
      <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
        {linked.filter(i => i.kind === kind).map(item => <ItemRow key={item.id} {...props} item={item} right={<Action theme={theme} quiet label={draft.some(d => d.item.kind === kind && d.item.id === item.id) ? "撤销移除" : "移除"} disabled={disabled} onPress={() => toggle(item, "remove")} />} />)}
        {!linked.some(i => i.kind === kind) ? <Text style={styles.muted}>当前已加载范围无关联项，可用下方搜索查找。</Text> : null}
      </ScrollView>
      <TextInput accessibilityLabel="搜索可关联事项" placeholder="搜索标题或输入 #编号 / !编号…" placeholderTextColor={theme.colors.foregroundMuted} value={text} onChangeText={setText} editable={!disabled} style={{ ...styles.text, minHeight: 38, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 9 }} />
      {query ? <View style={[styles.panel, { padding: 8, gap: 8 }]}>
        <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
          {candidates.isFetching ? <Text style={styles.muted}>正在搜索…</Text> : null}
          {candidates.isError ? <Text style={styles.text}>{errorMessages[candidates.error.message] ?? "候选加载失败。"}</Text> : null}
          {choices.map(item => <View key={item.id} style={{ paddingVertical: 8, gap: 5, borderBottomWidth: 1, borderColor: theme.colors.border }}>
            <View style={styles.toolbar}><Text style={[styles.text, { flex: 1 }]}>{item.kind === "mr" ? "!" : "#"}{item.iid} {item.title}</Text><Action theme={theme} quiet label={draft.some(d => d.item.kind === kind && d.item.id === item.id) ? "撤销选择" : item.milestone?.id === reference.milestoneId ? "移除关联" : "添加关联"} disabled={disabled} onPress={() => toggle(item, item.milestone?.id === reference.milestoneId ? "remove" : "add")} /></View>
            <Text style={styles.muted}>{item.state} · {item.milestone ? `当前里程碑：${item.milestone.title}` : "尚未关联里程碑"}</Text>
          </View>)}
          {!choices.length && !candidates.isFetching && !candidates.isError ? <Text style={styles.muted}>未找到匹配项。</Text> : null}
        </ScrollView>
        {candidates.hasNextPage ? <Action theme={theme} label="更多候选" disabled={candidates.isFetching || disabled} onPress={() => { void candidates.fetchNextPage(); }} /> : null}
      </View> : null}
      {draft.length ? <WorkbenchCard theme={theme} title={`待保存 · ${draft.length} 项`} icon="ListChecks"><View style={{ padding: 10, gap: 6 }}>
        {draft.map(d => <Text key={`${d.item.kind}:${d.item.id}`} style={styles.text}>{d.action === "remove" ? "移除" : d.item.milestone ? "迁移" : "添加"} {d.item.kind === "mr" ? "!" : "#"}{d.item.iid} {d.item.title}{d.action === "add" && d.item.milestone ? `（原：${d.item.milestone.title}）` : ""}</Text>)}
      </View></WorkbenchCard> : null}
      {migration.length ? <View style={{ gap: 8 }}><Text style={{ ...styles.text, color: theme.colors.statusWarning }}>以上 {migration.length} 项将离开原里程碑，改为关联当前里程碑。</Text><Action theme={theme} selected={confirm} label={confirm ? "✓ 已确认替换原关联" : "确认替换以上原关联"} disabled={disabled} onPress={() => setConfirm(v => !v)} /></View> : null}
      {draft.length > 50 ? <Text style={styles.text}>每次最多保存 50 项，请分批操作。</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: theme.colors.statusDanger }}>{notice}</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={mutation.isPending} onPress={()=>requestClose(props.onClose)} /><Action theme={theme} primary label={mutation.isPending ? "保存中…" : "保存关联"} disabled={disabled || !draft.length || draft.length > 50 || !!migration.length && !confirm} onPress={() => mutation.mutate()} /></View>
    </View>
  </Modal.Content></Modal>;
}
