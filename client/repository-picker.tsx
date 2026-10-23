import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { containDrawerFocus } from "./web.ts";
export function RepositoryPicker({ theme, items, value, onChange, allowAll = false }: { theme: Theme; items: { id: number; path: string }[]; value?: number; onChange(id?: number): void; allowAll?: boolean }) {
  const styles = workbenchStyles(theme), [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const root = useRef<View>(null), trigger = useRef<View>(null);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useEffect(() => open ? containDrawerFocus(root.current, close) : undefined, [open, close]);
  return <View style={{ position: "relative", width: 220, maxWidth: "100%", zIndex: open ? 20 : 1 }}>
    <Pressable ref={trigger} accessibilityRole="combobox" accessibilityLabel="里程碑仓库" accessibilityState={{ expanded: open }} onPress={() => { setSearch(""); setOpen(v => !v); }} style={{ minHeight: 36, borderWidth: 1, borderColor: open ? theme.colors.accent : theme.colors.border, borderRadius: 6, padding: 8 }}><Text numberOfLines={1} style={styles.text}>{items.find(r => r.id === value)?.path ?? (allowAll ? "全部已添加仓库 ▾" : "选择仓库 ▾")}</Text></Pressable>
    {open ? <View ref={root} style={[styles.panel, { position: "absolute", top: 42, left: 0, width: "100%", zIndex: 30, padding: 6, shadowColor: theme.colors.foreground, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10 }]}>
      <TextInput autoFocus accessibilityLabel="搜索里程碑仓库选项" placeholder="搜索仓库…" placeholderTextColor={theme.colors.foregroundMuted} value={search} onChangeText={setSearch} style={{ ...styles.text, padding: 8, minHeight: 36, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4 }} />
      <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
        {allowAll ? <Action theme={theme} quiet label="全部已添加仓库" onPress={() => { onChange(undefined); close(); }} /> : null}
        {items.filter(r => r.path.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(r => <Action key={r.id} theme={theme} quiet label={r.path} onPress={() => { onChange(r.id); close(); }} />)}
      </ScrollView>
    </View> : null}
  </View>;
}
