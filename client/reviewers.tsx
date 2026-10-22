import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { RpcOutput } from "@getpaseo/plugin";
import type { z } from "zod";
import { mrReview } from "../shared/detail.ts";
import { reviewerReference, saveReviewers, searchReviewers } from "../shared/reviewers.ts";
import { errorMessages } from "./errors.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";

type Review = Extract<RpcOutput<typeof mrReview>, { ok: true }>;
type Person = { id: number; name: string; username: string; necessary: boolean; unknown: boolean };
const draftFrom = (review: Review): Person[] => review.reviewers.map(p => ({ id: p.id, name: p.name, username: p.username, necessary: p.type === "necessary", unknown: typeof p.type !== "string" || !["invite", "suggestion", "necessary"].includes(p.type) }));
const roles = [{ value: "normal", label: "普通评审人" }, { value: "necessary", label: "必要评审人" }];

export function EditReviewers({ theme, reference, review, onClose, onSaved }: {
  theme: Theme; reference: z.infer<typeof reviewerReference>; review: Review; onClose(): void; onSaved(): void;
}) {
  const styles = workbenchStyles(theme), c = theme.colors, cache = useQueryClient();
  const searchRpc = useRpc(searchReviewers), saveRpc = useRpc(saveReviewers);
  const [baseline, setBaseline] = useState(review), [people, setPeople] = useState(() => draftFrom(review));
  const [dropdown, setDropdown] = useState(false), [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [role, setRole] = useState("normal");
  const [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [draft]);
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const search = useQuery({ queryKey: [...key, "reviewer-candidates", query, page], queryFn: () => searchRpc({ ...reference, query, page }), enabled: dropdown && query.length > 0, retry: false });
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
  const changed = people.length !== baseline.reviewers.length || people.some(p => !baseline.reviewers.some(old => old.id === p.id && (old.type === "necessary") === p.necessary));
  const current = draft.trim() === query && !search.isFetching;
  const choices = current && search.data?.ok ? search.data.items.filter(p => !people.some(existing => existing.id === p.id)) : [];
  return <Modal title="编辑评审人" open onOpenChange={open => { if (!open && !busy) onClose(); }}><Modal.Content>
    <View testID="gongfeng-edit-reviewers" style={{ gap: 12 }}>
      <Text style={styles.muted}>修改先保留在此名单，点击保存后回写工蜂。调整类型可能重置评审意见，具体限制以工蜂规则为准。</Text>
      <SettingsSelect label="新添加人员的类型" value={role} disabled={busy} options={roles} onValueChange={setRole} />
      <View style={styles.panel}>
        <Pressable accessibilityRole="combobox" accessibilityLabel="搜索并添加评审人" aria-expanded={dropdown} disabled={busy || people.length >= 100} onPress={() => setDropdown(value => !value)}
          style={{ minHeight: 44, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="UserPlus" size={16} color={c.foregroundMuted} /><Text style={[styles.text, { flex: 1 }]}>搜索并添加评审人</Text><Icon name={dropdown ? "ChevronUp" : "ChevronDown"} size={16} color={c.foregroundMuted} />
        </Pressable>
        {dropdown ? <View style={{ borderTopWidth: 1, borderColor: c.border }}>
          <TextInput autoFocus accessibilityLabel="搜索项目评审候选人" value={draft} editable={!busy} onChangeText={setDraft} placeholder="搜索项目成员姓名或英文账号…" placeholderTextColor={c.foregroundMuted} style={{ ...styles.text, margin: 10, padding: 10, minHeight: 40, borderWidth: 1, borderColor: c.border, borderRadius: 6 }} />
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
            {!draft.trim() ? <Text style={[styles.muted, { padding: 12 }]}>搜索当前项目有权限的成员，包含继承成员。</Text> : !current ? <Text style={[styles.muted, { padding: 12 }]}>正在搜索…</Text> : null}
            {current && search.data?.ok && !choices.length ? <Text style={[styles.muted, { padding: 12 }]}>本页没有可添加人员，可更换关键词或继续翻页。</Text> : null}
            {choices.map(person => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`添加评审人 ${person.username}`} disabled={busy || people.length >= 100} onPress={() => { setPeople(items => [...items, { ...person, necessary: role === "necessary", unknown: false }]); setDropdown(false); setDraft(""); setNotice(""); }} style={{ padding: 12, borderTopWidth: 1, borderColor: c.border }}>
              <Text style={[styles.text, { fontWeight: "600" }]}>{person.name}</Text><Text style={styles.muted}>@{person.username}</Text>
            </Pressable>)}
          </ScrollView>
          {search.isError || search.data && !search.data.ok ? <Text style={[styles.text, { padding: 12 }]}>{search.data && !search.data.ok ? errorMessages[search.data.error] ?? "无法搜索成员，请更换关键词重试。" : "无法搜索成员，请更换关键词重试。"}</Text> : null}
          {query && (page > 1 || search.data?.ok && search.data.nextPage) ? <View style={[styles.toolbar, { padding: 8 }]}>
            <Action theme={theme} label="上一页人员" disabled={page === 1 || !current || busy} onPress={() => setPage(p => p - 1)} />
            <Text style={styles.muted}>第 {page} 页</Text><Action theme={theme} label="下一页人员" disabled={!current || !search.data?.ok || !search.data.nextPage || busy} onPress={() => { if (search.data?.ok && search.data.nextPage) setPage(search.data.nextPage); }} />
          </View> : null}
        </View> : null}
      </View>
      <Text style={[styles.text, { fontWeight: "600" }]}>待保存名单 · {people.length} 人</Text>
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
        {people.map(person => <View key={person.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flex: 1, minWidth: 110 }}><Text style={[styles.text, { fontWeight: "600" }]}>{person.name || person.username}</Text><Text style={styles.muted}>@{person.username}</Text></View>
          <View style={{ minWidth: 150, flexShrink: 1 }}><SettingsSelect label="评审人类型" value={person.unknown ? "unknown" : person.necessary ? "necessary" : "normal"} options={person.unknown ? [...roles, { value: "unknown", label: "类型待核对" }] : roles} disabled={busy || person.unknown} onValueChange={value => setPeople(items => items.map(p => p.id === person.id ? { ...p, necessary: value === "necessary" } : p))} /></View>
          <Action theme={theme} label={`移除 @${person.username}`} disabled={busy} onPress={() => setPeople(items => items.filter(p => p.id !== person.id))} />
        </View>)}
        {!people.length ? <Text style={[styles.muted, { paddingVertical: 12 }]}>名单为空，保存将移除全部现有评审人。</Text> : null}
      </ScrollView>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
      {people.length > 100 ? <Text style={styles.text}>当前名单超过 100 人，请在工蜂管理。</Text> : null}
      <View style={[styles.toolbar, { justifyContent: "flex-end" }]}><Action theme={theme} label="取消" disabled={busy} onPress={onClose} /><Action theme={theme} primary label={busy ? "正在保存…" : "保存评审人"} disabled={busy || uncertain || !changed || !baseline.revision || people.length > 100} onPress={() => mutation.mutate()} /></View>
    </View>
  </Modal.Content></Modal>;
}
