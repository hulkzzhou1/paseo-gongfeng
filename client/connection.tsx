import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsCard, SettingsInput,
  type SettingsInputHandle,
} from "@getpaseo/plugin/client/ui";
import { connectionStatus, saveConnection, tokenSchema } from "../shared/connection.ts";
import { siteUrlSchema } from "../shared/site.ts";

import { Icon } from "@getpaseo/plugin/client/react-native";
import { Action, workbenchStyles } from "./workbench-ui.tsx";

const messages = {
  unauthorized: "该站点尚未保存 Token，或 Token 无效／已过期，请输入对应 Token 后重试。",
  forbidden: "当前账号或 Token 没有访问权限，请检查工蜂授权。",
  network_error: "无法连接工蜂，请检查站点地址和 daemon 的网络后重试。",
  service_error: "工蜂服务暂时不可用或限制了请求，请稍后重试。",
  invalid_response: "工蜂返回了无法识别的账号信息，请稍后重试。",
  storage_error: "无法安全读取或保存凭据，请检查服务器存储权限。",
};
const connectionKey = ["connection"] as const;

export function ConnectionSettings({ theme, layout }: PluginSurfaceProps) {
  const statusRpc = useRpc(connectionStatus);
  const saveRpc = useRpc(saveConnection);
  const client = useQueryClient();
  const input = useRef<SettingsInputHandle>(null);
  const [hasInput, setHasInput] = useState(false);
  const [siteDraft, setSiteDraft] = useState<string>();
  const [notice, setNotice] = useState("");
  const status = useQuery({
    queryKey: connectionKey,
    queryFn: () => statusRpc({}),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const save = useMutation({
    // The token stays out of mutation variables and the query cache.
    mutationFn: async () => {
      const token = input.current?.getText().trim() ?? "";
      input.current?.replaceText("");
      setHasInput(false);
      setNotice("");
      await client.cancelQueries({ queryKey: connectionKey });
      return saveRpc({ siteUrl: siteUrlSchema.parse(siteValue), ...(token ? { token } : {}) });
    },
    gcTime: 0,
    retry: false,
    async onSuccess(result) {
      if (result.ok) {
        await client.cancelQueries();
        client.setQueryData(connectionKey, { status: "connected", account: result.account, siteUrl: result.siteUrl });
        await client.resetQueries({ predicate: (query) => query.queryKey[0] !== "connection" });
        setSiteDraft(undefined);
        setNotice("已验证并保存。工作台已切换至该工蜂站点及账号。");
      } else {
        setNotice(`${messages[result.error]} 原有配置未更改。`);
      }
    },
    onError() {
      setNotice("未能确认保存结果，请重新检查连接后再试。");
    },
  });
  const state = status.data;
  const savedSite = state && "siteUrl" in state ? state.siteUrl : undefined;
  const siteValue = siteDraft ?? savedSite ?? "";
  const statusLabel = status.isFetching ? "正在检查连接…" : status.isError ? "无法读取连接状态"
    : state?.status === "connected" ? "已连接" : state?.status === "error" ? "连接需要处理" : "尚未配置";
  const statusHint = status.isError ? "请检查与 Paseo daemon 的连接后重试。"
    : state?.status === "error" ? messages[state.error]
    : state?.status === "connected" ? `${state.account.name} · @${state.account.username}`
    : "输入 Private Token，连接你的工蜂账号。";

  const styles = workbenchStyles(theme);
  return <View testID="gongfeng-connection" style={{ gap: 20, width: "100%", maxWidth: 720, alignSelf: "center" }}>
    <View style={[styles.panel, { padding: 16, gap: 12 }]}>
      <View style={styles.toolbar}>
        <Icon name="GitBranch" size={20} color={theme.colors.foreground} />
        <View style={{ flex: 1 }}><Text style={[styles.text, { fontWeight: "600", fontSize: 15 }]}>工蜂连接</Text><Text style={styles.muted}>{savedSite ?? "尚未选择站点"}</Text></View>
        <Text accessibilityLiveRegion="polite" style={{ ...styles.text, color: state?.status === "connected" && !status.isError ? theme.colors.statusSuccess : theme.colors.foregroundMuted }}>{statusLabel}</Text>
      </View>
      <Text style={styles.text}>{statusHint}</Text>
      <View style={styles.toolbar}><Text style={[styles.muted, { flex: 1 }]}>连接由当前 Paseo 服务端发起</Text>
        <Action theme={theme} label="重新检查连接" icon="RefreshCw" disabled={status.isFetching || save.isPending} onPress={() => { setNotice(""); void status.refetch(); }} />
      </View>
    </View>
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[styles.text, { fontWeight: "600", fontSize: 15 }]}>{state?.status === "connected" ? "更新访问凭据" : "连接你的账号"}</Text>
      <Text style={styles.muted}>填写工蜂站点根地址。新站点需要对应的 Token；已保存站点可留空复用其凭据，验证成功后才切换。</Text>
      <SettingsCard><SettingsInput key={savedSite ?? "new-site"} label="工蜂站点地址" initialValue={siteValue} disabled={save.isPending} placeholder="https://code.example.com" hint="仅支持 HTTPS 根地址，无需填写 /api/v3 或仓库路径。" onChangeText={setSiteDraft} />
      <SettingsInput ref={input} label="Private Token" secureTextEntry disabled={save.isPending}
        placeholder="新站点请输入对应 Token" hint="按站点仅在服务端保存，不回显。提交后清空输入框。"
        onChangeText={text => setHasInput(text.trim().length > 0)} /></SettingsCard>
      <View style={{ alignItems: layout.compact ? "stretch" : "flex-end" }}><Action theme={theme} primary label={save.isPending ? "正在验证…" : "验证并保存"}
        disabled={!siteUrlSchema.safeParse(siteValue).success || (!hasInput && siteValue === savedSite) || save.isPending || status.isFetching} onPress={() => {
          if (hasInput && !tokenSchema.safeParse(input.current?.getText()).success) { setNotice("请输入有效 Token，不要包含换行或空格。"); return; }
          save.mutate();
        }} /></View>
    </View>
    {notice ? <View style={[styles.panel, { padding: 12 }]}><Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text></View> : null}
    <View style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12, gap: 6 }}>
      <Text style={[styles.text, { fontWeight: "600" }]}>账号与访问范围</Text>
      <Text style={styles.muted}>此 daemon 的授权客户端共用当前站点的工蜂身份。站点切换保留各自的凭据、关联和审查历史。</Text>
      <Text style={styles.muted}>仓库克隆使用服务端 Git SSH 身份，与 Private Token 独立。</Text>
    </View>
  </View>;
}
