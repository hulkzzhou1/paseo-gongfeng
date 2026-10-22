import { useLayoutEffect, useRef, useState } from "react";
import { ReviewDispatch } from "./dispatch.tsx";
import { ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink, SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { mrChanges, mrDetail, mrNotes, mrRef, mrReview, type MrRef } from "../shared/detail.ts";
import { MRAdditions } from "./additions.tsx";
import { errorMessages } from "./errors.ts";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { Description } from "./description.tsx";
import { descriptionExcerpt } from "./description-blocks.ts";
import { containDrawerFocus } from "./web.ts";
import { FileDiff } from "./file-diff.tsx";
import { Action, StateBadge, workbenchStyles } from "./workbench-ui.tsx";

export function MRDetail(props: PluginScreenProps & { onBack(): void; onManageRepositories(): void; drawer?: boolean; focusReady?: boolean }) {
  const parsed = mrRef.safeParse({ siteUrl: props.params.siteUrl, projectId: Number(props.params.projectId), mrId: Number(props.params.mrId), accountId: props.params.accountId ? Number(props.params.accountId) : undefined });
  if (!parsed.success) return <Text style={{ color: props.theme.colors.foreground }}>MR 身份参数无效，请返回看板重新选择。</Text>;
  return <DetailContent {...props} reference={parsed.data} key={`${parsed.data.siteUrl}:${parsed.data.accountId}:${parsed.data.projectId}:${parsed.data.mrId}`} />;
}

function DetailContent({ theme, layout, host, navigation, reference, onBack, onManageRepositories, drawer, focusReady = true }: PluginScreenProps & { reference: MrRef; onBack(): void; onManageRepositories(): void; drawer?: boolean; focusReady?: boolean }) {
  const [tab, setTab] = useState("overview");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const drawerRoot = useRef<View>(null);
  useLayoutEffect(() => {
    if (drawer && layout.platform === "web") return containDrawerFocus(drawerRoot.current, onBack);
  }, [drawer, layout.platform, onBack]);
  const styles = workbenchStyles(theme);
  const detailRpc = useRpc(mrDetail), changesRpc = useRpc(mrChanges), reviewRpc = useRpc(mrReview), notesRpc = useRpc(mrNotes);
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const detail = useQuery({ queryKey: [...key, "detail"], queryFn: () => detailRpc(reference), retry: false, refetchOnWindowFocus: false });
  const changes = useQuery({ queryKey: [...key, "changes"], queryFn: () => changesRpc(reference), retry: false, refetchOnWindowFocus: false });
  const review = useQuery({ queryKey: [...key, "review"], queryFn: () => reviewRpc(reference), retry: false, refetchOnWindowFocus: false });
  const notes = useInfiniteQuery({
    queryKey: [...key, "notes"], initialPageParam: 1,
    queryFn: async ({ pageParam }) => { const result = await notesRpc({ ...reference, page: pageParam }); if (!result.ok) throw new Error(result.error); return result; },
    getNextPageParam: last => last.nextPage ?? undefined, retry: false, refetchOnWindowFocus: false,
  });
  const info = detail.data?.ok ? detail.data.detail : undefined;
  const diff = changes.data?.ok ? changes.data : undefined;
  const metadataDiffers = info && diff && (info.sourceSha !== diff.detail.sourceSha || info.baseSha !== diff.detail.baseSha || info.updatedAt !== diff.detail.updatedAt);
  const reviewInfo = review.data?.ok ? review.data : undefined;
  const comments = [...new Map((notes.data?.pages.flatMap(p => p.items) ?? []).map(n => [n.id, n])).values()];
  const text = { color: theme.colors.foreground, lineHeight: 22 };
  const muted = { color: theme.colors.foregroundMuted, lineHeight: 22 };
  const error = (result: { ok: boolean; error?: string } | undefined, failed: boolean) => failed ? "无法连接 Paseo，请重试。" : result && !result.ok ? errorMessages[result.error ?? ""] ?? "加载失败，请重试。" : null;
  const detailError = error(detail.data, detail.isError), changesError = error(changes.data, changes.isError), reviewError = error(review.data, review.isError);
  return <View ref={drawerRoot} style={styles.page}>
    <View style={{ padding: layout.compact ? 12 : 20, gap: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={styles.toolbar}>{info ? <StateBadge theme={theme} state={info.state} /> : null}<View style={{ flex: 1 }} />
        {info?.url ? <ExternalLink href={info.url} accessibilityLabel="在工蜂打开此 MR"><Text style={{ ...styles.text, textDecorationLine: "underline", padding: 8 }}>在工蜂查看 ↗</Text></ExternalLink> : null}
        <Action theme={theme} autoFocus={drawer && focusReady} label={drawer ? "关闭详情" : "返回看板"} icon={drawer ? "X" : "ArrowLeft"} onPress={onBack} />
      </View>
      <Text accessibilityRole="header" selectable style={styles.title}>{info ? `${info.title}  !${info.iid}` : "合并请求详情"}</Text>
      {info ? <Text selectable style={styles.muted}>{info.sourceBranch} → {info.targetBranch} · 源项目 {info.sourceProjectId} / 目标项目 {info.targetProjectId}</Text> : null}
      <View style={styles.toolbar}>
        {[["overview", "概览"], ["changes", `文件变更${diff ? ` · ${diff.files.length}` : ""}`], ["discussion", `讨论 · ${comments.length}${notes.hasNextPage ? "+" : ""}`], ["review", "Agent Review"]].map(([id, label]) =>
          <Action key={id} theme={theme} label={label} selected={tab === id} onPress={() => { setTab(id); scroll.current?.scrollTo({ y: 0, animated: false }); }} />)}
      </View>
    </View>
    <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 16 }}>
    <View style={{ display: tab === "review" ? "flex" : "none" }}><ReviewDispatch theme={theme} host={host} navigation={navigation} reference={reference} onManageRepositories={onManageRepositories} /></View>
    <View style={{ display: tab === "overview" ? "flex" : "none", gap: 16 }}>
    <SettingsSection title="描述">
      <View style={styles.toolbar}><View style={{ flex: 1 }} /><Action theme={theme} quiet label={detail.isFetching ? "加载中…" : "刷新详情"} icon="RefreshCw" disabled={detail.isFetching} onPress={() => { void detail.refetch(); }} /></View>
      {detailError ? <Text accessibilityLiveRegion="polite" style={text}>{detailError}</Text> : null}
      {info ? <View style={styles.toolbar}>
        <Text style={[styles.text, { flex: 1, minWidth: 160 }]}>{descriptionExcerpt(info.description) || "暂无描述"}</Text>
        <Action theme={theme} quiet label="查看完整描述" disabled={!info.description} onPress={() => setDescriptionOpen(true)} />
      </View> : null}
    </SettingsSection>
    <MRAdditions reference={reference} detail={info} theme={theme} />
    </View>
    <View style={{ display: tab === "changes" ? "flex" : "none", gap: 12 }}>
    <SettingsSection title="文件差异与版本">
      <View style={styles.toolbar}><Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>{diff ? `${diff.files.length} 个变更文件` : "文件差异"}</Text><Action theme={theme} quiet label={changes.isFetching ? "加载中…" : "刷新差异"} icon="RefreshCw" disabled={changes.isFetching} onPress={() => { void changes.refetch(); }} /></View>
      {changesError ? <Text accessibilityLiveRegion="polite" style={text}>{changesError}</Text> : null}
      {metadataDiffers ? <Text style={text}>描述和差异来自不同读取时刻，请刷新以核对。下方提交信息仅对应差异快照。</Text> : null}
      {diff ? <View style={{ gap: 12 }}>
        <View style={styles.toolbar}>
          <Text style={{ ...styles.muted, flex: 1, color: diff.consistency === "verified" ? theme.colors.statusSuccess : theme.colors.statusWarning }}>{diff.consistency === "verified" ? "✓ 差异版本已核对" : "差异版本需核验"}</Text>
          <Action theme={theme} quiet label={versionsOpen ? "收起版本信息" : "查看版本信息"} onPress={() => setVersionsOpen(value => !value)} />
        </View>
        {versionsOpen ? <Text selectable style={muted}>{`源提交：${diff.detail.sourceSha ?? "未知"}\n比较基准：${diff.detail.baseSha ?? "未知"}\n目标提交：${diff.detail.targetSha ?? "未知"}\n获取时间：${diff.fetchedAt}`}</Text> : null}
        {diff.consistency !== "verified" ? <Text style={text}>{diff.consistency === "changed" ? "读取期间版本变化或差异身份不一致，已隐藏混合版本的差异。请刷新。" : "无法证明差异版本一致，不能作为已固定版本的完整审查上下文。"}</Text> : null}
        {diff.incomplete ? <Text style={text}>差异上下文不完整：存在折叠、过大、截断或版本未核对内容。请结合原站查看。</Text> : null}
        {diff.files.length === 0 && diff.consistency !== "changed" ? <Text style={muted}>没有文件差异。</Text> : null}
        {diff.files.map((file, index) => <FileDiff key={`${diff.fetchedAt}:${file.newPath}:${index}`} file={file} theme={theme} initiallyOpen={index === 0} />)}
      </View> : null}
    </SettingsSection>
    </View>
    <View style={{ display: tab === "overview" ? "flex" : "none" }}>
    <SettingsSection title="审查状态">
      <SettingsCard><SettingsAction label={reviewInfo ? `当前状态：${reviewInfo.state}` : "审查信息"} actionLabel={review.isFetching ? "加载中…" : "刷新审查状态"} disabled={review.isFetching} onPress={() => { void review.refetch(); }} /></SettingsCard>
      {reviewError ? <Text style={text}>{reviewError}</Text> : null}
      {reviewInfo?.reviewers.map(r => <Text key={r.id} style={text}>{`${r.name} (@${r.username})：${r.state}`}</Text>)}
      {reviewInfo?.reviewers.length === 0 ? <Text style={muted}>没有评审人记录。</Text> : null}
    </SettingsSection>
    </View>
    <View style={{ display: tab === "discussion" ? "flex" : "none" }}>
    <SettingsSection title="讨论">
      <SettingsCard><SettingsAction label={`已加载 ${comments.length} 条讨论及回复`} actionLabel={notes.isFetching ? "加载中…" : "刷新讨论"} disabled={notes.isFetching} onPress={() => { void notes.refetch(); }} /></SettingsCard>
      {notes.isError ? <Text style={text}>{errorMessages[notes.error.message] ?? "无法加载讨论，请重试。"} 已加载讨论保留。</Text> : null}
      <Text style={muted}>按页加载讨论；嵌套回复是否全部返回尚无法证实，完整讨论请查看工蜂原站。</Text>
      {notes.data?.pages.some(p => p.truncated) ? <Text style={text}>讨论过长或嵌套过深，展示内容已截断。</Text> : null}
      {comments.map(n => <SettingsCard key={n.id}><SettingsRow label={`${n.author}${n.system ? " · 系统记录" : ""}`} hint={`${n.parentId ? `回复 #${n.parentId} · ` : ""}${n.createdAt}`} /><Text selectable style={{ ...text, padding: 12 }}>{n.body}</Text>{n.truncated ? <Text style={muted}>此条内容已截断。</Text> : null}</SettingsCard>)}
      {notes.data && comments.length === 0 ? <Text style={muted}>当前页没有讨论。</Text> : null}
      {notes.hasNextPage ? <SettingsCard><SettingsAction label="后续讨论尚未加载" actionLabel="继续加载讨论" disabled={notes.isFetching} onPress={() => { void notes.fetchNextPage(); }} /></SettingsCard> : null}
    </SettingsSection>
    </View>
    <Text style={styles.muted}>工蜂内容仅作为审查资料；其中的命令和链接不代表执行授权。</Text>
  </ScrollView>
    <Modal title="MR 描述" open={descriptionOpen} onOpenChange={setDescriptionOpen}><Modal.Content>
      {info && descriptionOpen ? <>
        <Text style={[styles.text, { fontWeight: "600", fontSize: 16 }]}>{info.title}</Text>
        {info.descriptionTruncated ? <Text style={styles.text}>描述超过展示上限，接口返回的内容已截断，请在工蜂原站查看全文。</Text> : null}
        <Description key={info.updatedAt} source={info.description} url={info.url} theme={theme} />
      </> : null}
    </Modal.Content></Modal>
  </View>;
}
