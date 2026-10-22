import { useEffect, useRef, useState } from "react";
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

export function Action({ theme, label, icon, onPress, disabled, primary, selected, autoFocus, quiet }: {
  theme: Theme; label: string; icon?: string; onPress(): void; disabled?: boolean; primary?: boolean; selected?: boolean; autoFocus?: boolean; quiet?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<View>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const c = theme.colors;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, ...(selected === undefined ? {} : { selected }) }}
    disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: primary ? 44 : 36, paddingHorizontal: 10, paddingVertical: 7, borderRadius: selected === undefined ? 6 : 0, borderWidth: 1,
      borderBottomWidth: selected === undefined ? 1 : 2,
      borderColor: focused ? c.accent : quiet || selected !== undefined ? "transparent" : c.border,
      borderBottomColor: focused || selected ? c.accent : quiet || selected !== undefined ? "transparent" : c.border,
      backgroundColor: primary ? c.accent : pressed ? c.surface2 : c.surface0,
      opacity: disabled ? 0.5 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 })}>
    {icon ? <Icon name={icon} size={15} color={primary ? c.accentForeground : c.foregroundMuted} /> : null}
    <Text style={{ color: primary ? c.accentForeground : selected === false || quiet ? c.foregroundMuted : c.foreground, fontSize: 13, fontWeight: selected || primary ? "700" : "400" }}>{label}</Text>
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
