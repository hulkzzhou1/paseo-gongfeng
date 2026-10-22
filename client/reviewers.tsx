import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import type { RpcOutput } from "@getpaseo/plugin";
import type { z } from "zod";
import { mrReview } from "../shared/detail.ts";
import { reviewerReference, saveReviewers, searchReviewers } from "../shared/reviewers.ts";
import { ReviewerAvatar } from "./reviewer-avatar.tsx";
import { selectReviewer, reviewRuleText, reviewerDropdown, type ReviewerDraft } from "./reviewers-draft.ts";
import { sizeReviewerDialog } from "./web.ts";
import { errorMessages } from "./errors.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";

type Review = Extract<RpcOutput<typeof mrReview>, { ok: true }>;
type Person = ReviewerDraft;
const draftFrom = (review: Review): Person[] => review.reviewers.map(p => ({ id: p.id, name: p.name, username: p.username, avatarUrl: p.avatarUrl, necessary: p.type === "necessary", unknown: typeof p.type !== "string" || !["invite", "suggestion", "necessary"].includes(p.type) }));

export function EditReviewers({ theme, reference, review, onClose, onSaved }: {
  theme: Theme; reference: z.infer<typeof reviewerReference>; review: Review; onClose(): void; onSaved(): void;
}) {
  const styles = workbenchStyles(theme), c = theme.colors, cache = useQueryClient();
  const searchRpc = useRpc(searchReviewers), saveRpc = useRpc(saveReviewers);
  const [baseline, setBaseline] = useState(review), [people, setPeople] = useState(() => draftFrom(review));
  const [activeGroup, setActiveGroup] = useState<boolean | null>(null), [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [draft]);
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const search = useQuery({ queryKey: [...key, "reviewer-candidates", query, page], queryFn: () => searchRpc({ ...reference, query, page }), enabled: activeGroup !== null && query.length > 0, retry: false });
  const mutation = useMutation({ mutationFn: () => saveRpc({ ...reference, revision: baseline.revision!, reviewers: people.map(({ id, necessary }) => ({ id, necessary })) }), retry: false,
    onSuccess(result) {
      if (result.current?.ok) { cache.setQueryData([...key, "review"], result.current); setBaseline(result.current); setPeople(draftFrom(result.current)); }
      if (result.ok) { void cache.invalidateQueries({ queryKey: key }); onSaved(); onClose(); return; }
      if (result.attempted) void cache.invalidateQueries({ queryKey: key });
      setUncertain(!!result.attempted && !result.current?.ok);
      setNotice(result.error === "stale_review" ? "评审状态或名单已变化，本次未提交。已载入最新名单，请重新选择。"
        : result.error === "reviewer_limit" ? "当前名单超过 100 人，请在工蜂管理。"
        : `${result.error === "forbidden" ? "工蜂拒绝更改，请检查账号权限及必要评审人限制。" : errorMessages[result.error] ?? "工蜂未完成全部更改。"}${result.current?.ok ? " 已载入工蜂实际名单，请核对后再保存。" : " 保存结果需核对，请关闭弹窗并刷新详情。"}`);
    },
    onError() { setUncertain(true); setNotice("保存结果未知，请关闭弹窗并刷新详情核对实际名单，再决定是否重新编辑。"); void cache.invalidateQueries({ queryKey: key }); },
  });
  const busy = mutation.isPending;
  const [showRules, setShowRules] = useState(false);
  const root = useRef<View>(null), ordinaryTrigger = useRef<View>(null), necessaryTrigger = useRef<View>(null);
  useLayoutEffect(() => sizeReviewerDialog(root.current), []);
  const [placement, setPlacement] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>();
  const openRequest = useRef(0);
  const closeDropdown = () => { openRequest.current++; setActiveGroup(null); };
  const positionDropdown = (necessary: boolean, reset: boolean) => {
    const request = ++openRequest.current;
    const trigger = (necessary ? necessaryTrigger : ordinaryTrigger).current;
    root.current?.measureInWindow((x, y, _width, height) => trigger?.measureInWindow((tx, ty, width, th) => {
      if (request !== openRequest.current) return;
      setPlacement({ left: tx - x, width, ...reviewerDropdown(ty - y, th, height) });
      if (reset) { setDraft(""); setQuery(""); setPage(1); }
      setActiveGroup(necessary);
    }));
  };
  const toggleGroup = (necessary: boolean) => activeGroup === necessary ? closeDropdown() : positionDropdown(necessary, true);
  useEffect(() => { if (activeGroup !== null) positionDropdown(activeGroup, false); }, [activeGroup, people, showRules]);
  const changed = people.length !== baseline.reviewers.length || people.some(p => !baseline.reviewers.some(old => old.id === p.id && (old.type === "necessary") === p.necessary));
  const current = draft.trim() === query && !search.isFetching;
  const choices = !draft.trim() ? [...new Map([...draftFrom(baseline), ...people].map(p => [p.id, p])).values()] : current && search.data?.ok ? search.data.items : [];
  const necessary = activeGroup === true, label = necessary ? "必要评审人" : "普通评审人";
  return <Modal title="编辑评审人" open onOpenChange={open => { if (!open && !busy) onClose(); }}><Modal.Content scrollable={false}>
    <View ref={root} onLayout={() => { if (activeGroup !== null) positionDropdown(activeGroup, false); }} testID="gongfeng-edit-reviewers" style={{ flex: 1, minHeight: 0, gap: 12 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={styles.toolbar}>
          <Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>评审人 · {people.length}</Text>
          <Action theme={theme} dense quiet label="评审规则" icon={showRules ? "ChevronUp" : "ChevronDown"} onPress={() => setShowRules(v => !v)} />
        </View>
        {showRules ? <View style={[styles.panel, { padding: 10, gap: 4, backgroundColor: c.surface1 }]}>
          <Text style={styles.muted}>普通评审：{reviewRuleText(baseline.approverRule)}</Text>
          <Text style={styles.muted}>必要评审：{reviewRuleText(baseline.necessaryApproverRule)}</Text>
          <Text style={styles.muted}>规则由工蜂管理，此处仅调整人员。更换类型可能重置该人员的评审意见。</Text>
        </View> : null}
        <View style={[styles.panel, { padding: 10, gap: 12 }]}>
          {[false, true].map(necessary => {
            const label = necessary ? "必要评审人" : "普通评审人", open = activeGroup === necessary;
            const group = people.filter(person => person.necessary === necessary);
            return <View key={String(necessary)} testID={necessary ? "necessary-reviewers" : "ordinary-reviewers"} style={{ gap: 8, padding: necessary ? 10 : 0, backgroundColor: necessary ? c.surface1 : c.surface0, borderRadius: 6 }}>
              <Text style={[styles.muted, { fontWeight: "600" }]}>{label} · {group.length}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {group.map(person => <View key={person.id} testID="reviewer-chip" style={{ maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 6, paddingVertical: 4, backgroundColor: c.surface0, borderWidth: 1, borderColor: c.border, borderRadius: 5 }}>
                  <ReviewerAvatar person={person} theme={theme} size={22} />
                  <Text numberOfLines={1} style={[styles.text, { flexShrink: 1, fontWeight: "600" }]}>{person.username || person.name}</Text>
                  {person.unknown ? <Text style={styles.muted}>类型待核对</Text> : null}
                  <Action theme={theme} dense quiet iconOnly icon="X" label={`移除 @${person.username}`} disabled={busy} onPress={() => { setPeople(items => items.filter(p => p.id !== person.id)); setNotice(""); }} />
                </View>)}
              </View>
              <Pressable ref={necessary ? necessaryTrigger : ordinaryTrigger} accessibilityRole="combobox" accessibilityLabel={`添加${label}`} aria-expanded={open} disabled={busy} onPress={() => toggleGroup(necessary)}
                style={{ minHeight: 36, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 5, borderWidth: 1, borderColor: open ? c.accent : c.border, backgroundColor: c.surface0 }}>
                <Icon name="UserPlus" size={14} color={c.foregroundMuted} /><Text style={[styles.muted, { flex: 1 }]}>添加{label}</Text><Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={c.foregroundMuted} />
              </Pressable>
            </View>;
          })}
        </View>
        <Text style={styles.muted}>{people.length ? "仅保存后回写工蜂；移到另一组会更换类型，可能重置评审意见。" : "名单为空，保存将移除全部现有评审人。"}</Text>
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
        {people.length > 100 ? <Text style={styles.text}>当前名单超过 100 人，请在工蜂管理。</Text> : null}
      </ScrollView>
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={busy} onPress={onClose} /><Action theme={theme} primary label={busy ? "正在保存…" : "保存评审人"} disabled={busy || uncertain || !changed || !baseline.revision || people.length > 100} onPress={() => mutation.mutate()} /></View>
      {activeGroup !== null && placement ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭评审人候选" onPress={closeDropdown} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 }} />
        <View testID="reviewer-candidates" style={[styles.panel, { position: "absolute", ...placement, zIndex: 2, borderColor: c.accent, shadowColor: c.foreground, shadowOpacity: .14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }]}>
          <TextInput autoFocus accessibilityLabel="搜索项目评审候选人" value={draft} editable={!busy} onChangeText={setDraft} placeholder="搜索姓名或英文账号…" placeholderTextColor={c.foregroundMuted} style={{ ...styles.text, margin: 8, padding: 8, minHeight: 36, borderWidth: 1, borderColor: c.border, borderRadius: 5 }} />
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            {!draft.trim() ? <Text style={[styles.muted, { paddingHorizontal: 10, paddingBottom: 8 }]}>当前名单 · 可取消勾选或移入此组，搜索可添加项目成员。</Text> : !current ? <Text style={[styles.muted, { padding: 10 }]}>正在搜索…</Text> : null}
            {choices.map(person => {
              const selected = people.find(p => p.id === person.id), checked = selected?.necessary === necessary;
              const disabled = busy || !!selected?.unknown || ("unknown" in person && person.unknown === true) || (!selected && people.length >= 100);
              return <Pressable key={person.id} accessibilityRole="checkbox" aria-checked={checked} accessibilityState={{ checked, disabled }} accessibilityLabel={`${person.username} · ${label}`} disabled={disabled}
                onPress={() => { setPeople(items => selectReviewer(items, person, necessary)); setNotice(""); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: checked ? c.surface2 : c.surface0, opacity: disabled ? .5 : 1 }}>
                <Icon name={checked ? "CheckSquare" : "Square"} size={17} color={checked ? c.accent : c.foregroundMuted} />
                <ReviewerAvatar person={person} theme={theme} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.text, { fontWeight: "600" }]}>{person.name || person.username}</Text><Text numberOfLines={1} style={styles.muted}>@{person.username}{selected?.unknown ? " · 类型待核对" : selected && !checked ? ` · 已在${necessary ? "普通" : "必要"}评审人，选择后移入此组` : ""}</Text></View>
              </Pressable>;
            })}
            {current && draft.trim() && search.data?.ok && !choices.length ? <Text style={[styles.muted, { padding: 10 }]}>本页没有匹配成员，可更换关键词或继续翻页。</Text> : null}
          </ScrollView>
          {query && (search.isError || search.data && !search.data.ok) ? <Text accessibilityLiveRegion="polite" style={[styles.text, { padding: 10 }]}>{search.data && !search.data.ok ? errorMessages[search.data.error] ?? "无法搜索成员，请重试。" : "无法搜索成员，请重试。"}</Text> : null}
          {query && (page > 1 || search.data?.ok && search.data.nextPage) ? <View style={[styles.toolbar, { padding: 8 }]}>
            <Action theme={theme} dense label="上一页人员" disabled={page === 1 || !current || busy} onPress={() => setPage(p => p - 1)} />
            <Text style={styles.muted}>第 {page} 页</Text><Action theme={theme} dense label="下一页人员" disabled={!current || !search.data?.ok || !search.data.nextPage || busy} onPress={() => { if (search.data?.ok && search.data.nextPage) setPage(search.data.nextPage); }} />
          </View> : null}
        </View>
      </> : null}
    </View>
  </Modal.Content></Modal>;
}
