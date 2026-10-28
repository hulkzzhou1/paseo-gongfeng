import { useDraft } from "./draft-guard.tsx";
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { changeMrState } from "../shared/mr-state.ts";
import type { MrDetail, MrRef } from "../shared/detail.ts";
import { errorMessages } from "./errors.ts";
import { Action, StateBadge, WorkbenchCard, workbenchStyles, type Theme } from "./workbench-ui.tsx";

export function MRStateActions({ theme, reference, detail }: { theme: Theme; reference: MrRef; detail: MrDetail }) {
  const styles = workbenchStyles(theme), cache = useQueryClient(), rpc = useRpc(changeMrState);
  const [target, setTarget] = useState<{ detail: MrDetail; event: "close" | "reopen" }>();
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const event = ["opened", "reopened"].includes(detail.state) ? "close" : detail.state === "closed" ? "reopen" : undefined;
  const label = (value: "close" | "reopen") => value === "close" ? "关闭 MR" : "重新打开 MR";
  const key = ["mr", reference.siteUrl, reference.accountId, reference.projectId, reference.mrId];
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: key });
    void cache.invalidateQueries({ queryKey: ["board", reference.siteUrl, reference.accountId] });
    void cache.invalidateQueries({ queryKey: ["milestone", reference.siteUrl, reference.accountId] });
  };
  const mutation = useMutation({ retry: false,
    mutationFn: () => rpc({ ...reference, accountId: reference.accountId!, revision: target!.detail.stateRevision, event: target!.event }),
    onSuccess(result) {
      if (result.current) cache.setQueryData([...key, "detail"], { ok: true, detail: result.current, fetchedAt: new Date().toISOString() });
      if (result.ok) { setTarget(undefined); refresh(); return; }
      setBlocked(true);
      setMessage(result.error === "stale_mr_state" || result.error === "mr_state_unavailable" ? "MR 内容或状态已变化，本次未提交。请关闭弹窗并刷新后重新核对。"
        : result.error === "forbidden" ? "工蜂未允许更改此 MR 状态，请检查当前账号和项目权限。"
        : result.error === "outcome_unknown" ? "操作结果未知，请关闭弹窗并刷新、在工蜂核对实际状态；不会自动重发。"
        : errorMessages[result.error] ?? "未能更改 MR 状态，请刷新后核对。");
      if (result.attempted) refresh();
    },
    onError() { setBlocked(true); setMessage("操作结果未知，请关闭弹窗并刷新、在工蜂核对实际状态；不会自动重发。"); refresh(); },
  });
  const busy = mutation.isPending;
  useDraft(false,mutation.isPending);
  if (!reference.accountId || !event && !target) return null;
  return <>
    <WorkbenchCard theme={theme} title="MR 状态" icon="GitBranch" testID="gongfeng-mr-state-card"><View style={[styles.toolbar, { padding: 12 }]}>
      <StateBadge theme={theme} state={detail.state} /><View style={{ flex: 1 }} />
      {event ? <Action theme={theme} label={label(event)} disabled={busy} onPress={() => { setMessage(""); setBlocked(false); setTarget({ detail, event }); }} /> : null}
    </View></WorkbenchCard>
    <Modal title={target ? label(target.event) : "更改 MR 状态"} open={!!target} onOpenChange={open => { if (!open && !busy) setTarget(undefined); }}><Modal.Content>
      {target ? <View testID="gongfeng-mr-state-confirmation" style={{ gap: 12 }}>
        <Text style={[styles.text, { fontWeight: "600" }]}>{target.detail.title} · !{target.detail.iid}</Text>
        <Text style={styles.text}>{target.event === "close" ? "确认关闭此合并请求？" : "确认重新打开此合并请求？重新打开可能按最新 OWNERS 重置评审规则。"}</Text>
        {message ? <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text> : null}
        <View style={[styles.toolbar, { justifyContent: "flex-end" }]}>
          <Action theme={theme} autoFocus label="取消" disabled={busy} onPress={() => setTarget(undefined)} />
          <Action theme={theme} primary label={busy ? "正在提交…" : `确认${label(target.event)}`} disabled={busy || blocked} onPress={() => mutation.mutate()} />
        </View>
      </View> : null}
    </Modal.Content></Modal>
  </>;
}
