import { Text, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { mrTapd, mrCi } from "../shared/additions.ts";
import type { MrRef, MrDetail } from "../shared/detail.ts";
import { errorMessages } from "./errors.ts";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Action, mono, workbenchStyles } from "./workbench-ui.tsx";
const message = (error: string, ci = false) => error === "version_changed" ? "MR 版本已变化或检查版本不一致，请刷新 MR 详情后重试。" : error === "version_unknown" ? "无法确认 MR 源提交，CI 状态未知。" : error === "forbidden" ? ci ? "无权限读取此区块。CI 摘要接口可能要求 Developer 权限，请在原站核对；不会自动扩大权限。" : "无权限读取 TAPD 关联，请在工蜂原站核对。" : errorMessages[error] ?? "无法连接 Paseo，请重试。";
export function MRAdditions({ reference, detail, theme }: { reference: MrRef; detail?: MrDetail; theme: PluginScreenProps["theme"] }) {
  const tapdRpc = useRpc(mrTapd), ciRpc = useRpc(mrCi);
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const tapd = useQuery({ queryKey: [...key,"tapd"], queryFn: () => tapdRpc(reference), retry: false, refetchOnWindowFocus: false });
  const ci = useInfiniteQuery({ queryKey: [...key,"ci",detail?.sourceProjectId,detail?.sourceSha,detail?.targetBranch], enabled: !!detail?.sourceSha,
    initialPageParam: 1, queryFn: async ({pageParam}) => { const result = await ciRpc({ ...reference, sourceProjectId: detail!.sourceProjectId, sourceSha: detail!.sourceSha!, targetBranch: detail!.targetBranch, page: pageParam }); if (!result.ok) throw new Error(result.error); return result; },
    getNextPageParam: last => last.nextPage ?? undefined, retry: false, refetchOnWindowFocus: false,
  });
  const checks = [...new Map((ci.data?.pages.flatMap(page => page.items) ?? []).map(item => [item.id,item])).values()];
  const last = ci.data?.pages.at(-1);
  const incomplete = ci.hasNextPage || (last && (last.incomplete || checks.length < last.total)) || (ci.data && new Set(ci.data.pages.map(page=>page.total)).size > 1);
  const styles = workbenchStyles(theme), c = theme.colors;
  return <View style={{ gap: 16 }}>
    <View style={[styles.panel, { borderLeftWidth: 3, borderLeftColor: c.accent }]}>
      <View style={styles.panelHeader}>
        <Icon name="ClipboardList" size={18} color={c.accent} />
        <Text style={{ color: c.accent, fontSize: 12, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 3, backgroundColor: c.surface0, borderRadius: 4 }}>TAPD</Text>
        <Text style={[styles.text, { fontWeight: "700", fontSize: 15, flex: 1 }]}>关联需求</Text>
        <Action theme={theme} quiet label={tapd.isFetching ? "加载中…" : "刷新关联"} icon="RefreshCw" disabled={tapd.isFetching} onPress={() => { void tapd.refetch(); }} />
      </View>
      {tapd.isError || tapd.data && !tapd.data.ok ? <Text style={[styles.text, { padding: 12 }]}>{tapd.data && !tapd.data.ok ? message(tapd.data.error) : "无法读取关联，请重试。"}</Text> : null}
      {tapd.data?.ok && !tapd.data.items.length ? <Text style={[styles.muted, { padding: 16 }]}>此 MR 暂未关联 TAPD 工作项。</Text> : null}
      {tapd.data?.ok && tapd.data.incomplete ? <Text style={[styles.text, { padding: 12 }]}>关联数量过多，显示已截断，请在原站查看完整记录。</Text> : null}
      {tapd.data?.ok && tapd.data.items.map(item => <View key={`${item.workspaceId}:${item.kind}:${item.id}`} style={{ padding: 14, gap: 8, borderTopWidth: 1, borderColor: c.border }}>
        <Text selectable style={{ color: c.foreground, fontSize: 16, lineHeight: 23, fontWeight: "600" }}>{item.title}</Text>
        <View style={styles.toolbar}>
          <Text style={[styles.muted, { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: c.surface2, borderRadius: 4 }]}>{item.kind}</Text>
          <Text style={[styles.text, { fontWeight: "600" }]}>{item.status || "状态未知"}</Text><View style={{ flex: 1 }} />
          {item.url ? <ExternalLink href={item.url} accessibilityLabel={`在 TAPD 打开 ${item.title}`}><Text style={{ color: c.accent, fontSize: 13, fontWeight: "600", paddingVertical: 8 }}>在 TAPD 查看 ↗</Text></ExternalLink> : <Text style={styles.muted}>原站链接不可用</Text>}
        </View>
      </View>)}
    </View>
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Icon name="ListChecks" size={18} color={c.foregroundMuted} />
        <Text style={[styles.text, { fontWeight: "600", flex: 1 }]}>CI 检查</Text>
        <Action theme={theme} quiet label={ci.isFetching ? "加载中…" : "刷新检查"} icon="RefreshCw" disabled={!detail?.sourceSha || ci.isFetching} onPress={() => { void ci.refetch(); }} />
      </View>
      <View style={{ padding: 12, gap: 8 }}>
        {detail?.sourceSha ? <Text selectable style={[styles.muted, { fontFamily: mono }]}>源项目 {detail.sourceProjectId} · {detail.sourceSha.slice(0, 12)}</Text> : <Text style={styles.text}>源提交尚未确认，检查状态未知。</Text>}
        {ci.isError ? <Text style={styles.text}>{message(ci.error.message, true)} 已加载结果仅对应上方提交，其他详情保留。</Text> : null}
        {last ? <Text style={styles.text}>{checks.length ? `工蜂汇总：${last.state} · 已加载 ${checks.length} / ${last.total} 项` : "没有检查结果，验证状态未知；不表示通过。"}</Text> : null}
        {incomplete ? <Text style={styles.text}>检查尚未完整加载或分页期间发生变化，请继续加载或刷新；当前页不代表完整验证结果。</Text> : null}
        {checks.map(item => <View key={item.id} style={{ borderTopWidth: 1, borderColor: c.border, paddingVertical: 10, gap: 4 }}>
          <View style={styles.toolbar}><Text style={[styles.text, { fontWeight: "600", flex: 1 }]}>{item.context}</Text><Text style={styles.text}>{item.state}</Text></View>
          {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
          {item.url ? <ExternalLink href={item.url} accessibilityLabel={`打开 ${item.context} 检查来源`}><Text style={{ ...styles.muted, textDecorationLine: "underline", paddingVertical: 6 }}>查看检查来源 ↗</Text></ExternalLink> : <Text style={styles.muted}>检查来源链接不可用。</Text>}
        </View>)}
        {ci.hasNextPage ? <Action theme={theme} label="继续加载检查" disabled={ci.isFetching} onPress={() => { void ci.fetchNextPage(); }} /> : null}
        <Text style={styles.muted}>仅展示提交检查摘要，完整流水线和日志请查看原站。</Text>
      </View>
    </View>
  </View>;
}
