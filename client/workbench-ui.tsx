import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type Theme = PluginSurfaceProps["theme"];
export const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
export function workbenchStyles(theme: Theme) {
  const c = theme.colors;
  return StyleSheet.create({
    page: { flex: 1, minWidth: 0, backgroundColor: c.surface0 },
    toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    title: { color: c.foreground, fontSize: 22, fontWeight: "700", lineHeight: 30 },
    text: { color: c.foreground, fontSize: 13, lineHeight: 20 },
    muted: { color: c.foregroundMuted, fontSize: 12, lineHeight: 18 },
    panel: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: "hidden", backgroundColor: c.surface0 },
    panelHeader: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface1, borderBottomWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  });
}

export function WorkbenchCard({ theme, title, icon, tag, right, testID, children }: {
  theme: Theme; title: string; icon: string; tag?: string; right?: ReactNode; testID?: string; children: ReactNode;
}) {
  const styles = workbenchStyles(theme), c = theme.colors;
  return <View testID={testID} style={[styles.panel, { borderLeftWidth: 1, borderLeftColor: c.border }]}>
    <View style={styles.panelHeader}>
      <Icon name={icon} size={15} color={c.foregroundMuted} />
      {tag ? <Text style={{ color: c.accent, fontSize: 12, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 3, backgroundColor: c.surface0, borderRadius: 4 }}>{tag}</Text> : null}
      <Text accessibilityRole="header" style={[styles.text, { fontWeight: "600", fontSize: 13, flex: 1 }]}>{title}</Text>
      {right}
    </View>
    {children}
  </View>;
}

export function Action({ theme, label, icon, onPress, disabled, primary, selected, autoFocus, quiet, iconOnly, pill, dense }: {
  theme: Theme; label: string; icon?: string; onPress(): void; disabled?: boolean; primary?: boolean; selected?: boolean; autoFocus?: boolean; quiet?: boolean; iconOnly?: boolean; pill?: boolean; dense?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<View>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 650;
  const filled = primary || pill && selected;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} aria-selected={selected} accessibilityState={{ disabled: !!disabled, ...(selected === undefined ? {} : { selected }) }}
    disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: dense ? 28 : compact ? 40 : 30, minWidth: iconOnly ? dense ? 28 : compact ? 40 : 30 : undefined, paddingHorizontal: 8, paddingVertical: dense ? 4 : compact ? 8 : 5, borderRadius: pill ? dense ? 14 : 18 : selected === undefined ? 6 : 0, borderWidth: 1,
      borderBottomWidth: pill || selected === undefined ? 1 : 2,
      borderColor: focused || filled ? c.accent : pill ? c.border : quiet || selected !== undefined ? "transparent" : c.border,
      borderBottomColor: focused || selected ? c.accent : pill ? c.border : quiet || selected !== undefined ? "transparent" : c.border,
      backgroundColor: filled ? c.accent : pressed ? c.surface2 : c.surface0,
      opacity: disabled ? 0.5 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 })}>
    {icon ? <Icon name={icon} size={dense ? 14 : 15} color={filled ? c.accentForeground : c.foregroundMuted} /> : null}
    {!iconOnly ? <Text style={{ color: filled ? c.accentForeground : selected === false || quiet ? c.foregroundMuted : c.foreground, fontSize: dense || !compact ? 12 : 13, fontWeight: selected || primary ? "600" : "400" }}>{label}</Text> : null}
  </Pressable>;
}

export function StateBadge({ theme, state }: { theme: Theme; state: string }) {
  const labels: Record<string, string> = { opened: "开放", reopened: "重新打开", merged: "已合入", closed: "已关闭" };
  const color = state === "opened" || state === "reopened" ? theme.colors.statusSuccess : theme.colors.foregroundMuted;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
    <Icon name={state === "merged" ? "GitMerge" : "GitPullRequest"} size={15} color={color} />
    <Text style={{ color, fontSize: 12 }}>{labels[state] ?? state}</Text>
  </View>;
}

export function WorkbenchNavigation({ theme, compact, selected, onMergeRequests, onMilestones, onRepositories, onIssues, siteUrl }: {
  theme: Theme; compact: boolean; selected: "mrs" | "milestones" | "issues" | "repositories"; onIssues?(): void; onMergeRequests(): void; onMilestones(): void; onRepositories(): void; siteUrl?: string;
}) {
  const styles = workbenchStyles(theme);
  return <View testID="gongfeng-board-navigation" style={{ ...styles.toolbar, paddingHorizontal: compact ? 12 : 16, paddingVertical: compact ? 6 : 7, borderBottomWidth: 1, borderColor: theme.colors.border }}>
    <Action theme={theme} dense={!compact} label="合并请求" icon="GitPullRequest" selected={selected === "mrs"} onPress={onMergeRequests} />
    {onIssues ? <Action theme={theme} dense={!compact} label="议题" icon="CircleDot" selected={selected === "issues"} onPress={onIssues} /> : null}
    <Action theme={theme} dense={!compact} label="里程碑" icon="Flag" selected={selected === "milestones"} onPress={onMilestones} />
    <Action theme={theme} dense={!compact} label="仓库管理" icon="GitBranch" selected={selected === "repositories"} onPress={onRepositories} />
    {!compact ? <Text numberOfLines={1} style={[styles.muted, { flex: 1, textAlign: "right" }]}>{siteUrl ?? "请先配置工蜂站点"}</Text> : null}
  </View>;
}

export function WorkbenchHeader({theme,compact,onSettings,onRefresh,busy,updatedAt,error,children}:{theme:Theme;compact:boolean;onSettings():void;onRefresh():void;busy?:boolean;updatedAt?:number;error?:boolean;children?:ReactNode}) {
 const styles=workbenchStyles(theme);
 return <View style={[styles.toolbar,{paddingHorizontal:compact?12:16,paddingVertical:8,borderBottomWidth:1,borderColor:theme.colors.border}]}>
  <Text accessibilityRole="header" style={[styles.text,{fontWeight:'700',fontSize:17,flex:1}]}>工蜂</Text>
  <Text accessibilityLiveRegion="polite" style={styles.muted}>{error?'更新未完成 · ':busy?'正在更新 · ':''}{updatedAt?`更新于 ${new Date(updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'尚未更新'}</Text>
  {children}<Action theme={theme} dense={!compact} iconOnly label="工蜂设置" icon="Settings" onPress={onSettings}/><Action theme={theme} dense={!compact} iconOnly label="刷新工作台" icon="RefreshCw" disabled={busy} onPress={onRefresh}/>
 </View>;
}
export function RefreshNotice({theme,pages,busy,updatedAt}:{theme:Theme;pages:number;busy?:boolean;updatedAt?:number}) {
 const styles=workbenchStyles(theme);
 return <View style={styles.toolbar}>{pages>1?<Text style={styles.muted}>已加载多页，自动刷新已暂停；手动刷新将返回第一页。</Text>:null}{busy&&updatedAt?<Text accessibilityLiveRegion="polite" style={styles.muted}>正在更新，已加载内容保留…</Text>:null}</View>;
}

export function InitialLoading({theme,label}:{theme:Theme;label:string}) {
 return <View pointerEvents="none" style={{position:'absolute',inset:0,alignItems:'center',justifyContent:'center',backgroundColor:theme.colors.surface0}}><ActivityIndicator accessibilityLabel={label} color={theme.colors.accent}/></View>;
}
