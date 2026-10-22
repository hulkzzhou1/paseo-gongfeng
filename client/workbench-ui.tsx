import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
  return <View testID={testID} style={[styles.panel, { borderLeftWidth: 3, borderLeftColor: c.accent }]}>
    <View style={styles.panelHeader}>
      <Icon name={icon} size={18} color={c.accent} />
      {tag ? <Text style={{ color: c.accent, fontSize: 12, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 3, backgroundColor: c.surface0, borderRadius: 4 }}>{tag}</Text> : null}
      <Text accessibilityRole="header" style={[styles.text, { fontWeight: "700", fontSize: 15, flex: 1 }]}>{title}</Text>
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
  const filled = primary || pill && selected;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} aria-selected={selected} accessibilityState={{ disabled: !!disabled, ...(selected === undefined ? {} : { selected }) }}
    disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: dense ? 28 : primary ? 44 : 36, minWidth: iconOnly ? dense ? 28 : 36 : undefined, paddingHorizontal: dense ? 8 : 10, paddingVertical: dense ? 4 : 7, borderRadius: pill ? dense ? 14 : 18 : selected === undefined ? 6 : 0, borderWidth: 1,
      borderBottomWidth: pill || selected === undefined ? 1 : 2,
      borderColor: focused || filled ? c.accent : pill ? c.border : quiet || selected !== undefined ? "transparent" : c.border,
      borderBottomColor: focused || selected ? c.accent : pill ? c.border : quiet || selected !== undefined ? "transparent" : c.border,
      backgroundColor: filled ? c.accent : pressed ? c.surface2 : c.surface0,
      opacity: disabled ? 0.5 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 })}>
    {icon ? <Icon name={icon} size={dense ? 14 : 15} color={filled ? c.accentForeground : c.foregroundMuted} /> : null}
    {!iconOnly ? <Text style={{ color: filled ? c.accentForeground : selected === false || quiet ? c.foregroundMuted : c.foreground, fontSize: dense ? 12 : 13, fontWeight: selected || primary ? dense ? "600" : "700" : "400" }}>{label}</Text> : null}
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
