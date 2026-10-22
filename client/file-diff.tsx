import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { ReviewContext } from "../shared/detail.ts";
import { Action, mono, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { parseDiffLines } from "./diff-lines.ts";

export function FileDiff({ file, theme, initiallyOpen }: { file: ReviewContext["files"][number]; theme: Theme; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen), [visible, setVisible] = useState(250), [wrap, setWrap] = useState(false);
  const lines = useMemo(() => parseDiffLines(file.diff), [file.diff]);
  const styles = workbenchStyles(theme), c = theme.colors;
  const incomplete = file.tooLarge || file.collapsed || file.truncated;
  const code = <View style={{ minWidth: "100%" }}>
    {lines.slice(0, visible).map((line, index) => {
      const tint = line.kind === "add" ? c.statusSuccess : line.kind === "remove" ? c.statusDanger : undefined;
      return <View key={index} style={{ flexDirection: "row", minHeight: 21, backgroundColor: line.kind === "hunk" ? c.surface2 : c.surface0 }}>
        {tint ? <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: tint, opacity: 0.10 }} /> : null}
        <Text style={{ color: c.foregroundMuted, width: 45, textAlign: "right", paddingRight: 8, fontSize: 12, lineHeight: 21, fontFamily: mono }}>{line.oldLine ?? ""}</Text>
        <Text style={{ color: c.foregroundMuted, width: 45, textAlign: "right", paddingRight: 8, borderRightWidth: 1, borderColor: c.border, fontSize: 12, lineHeight: 21, fontFamily: mono }}>{line.newLine ?? ""}</Text>
        <Text selectable style={{ color: c.foreground, fontFamily: mono, fontSize: 12, lineHeight: 21, paddingHorizontal: 10, ...(wrap ? { flex: 1, minWidth: 0 } : { flexShrink: 0 }) }}>{line.text || " "}</Text>
      </View>;
    })}
  </View>;
  return <View style={styles.panel}>
    <View style={styles.panelHeader}>
      <Action theme={theme} label={open ? "收起文件" : "展开文件"} icon={open ? "ChevronDown" : "ChevronRight"} onPress={() => setOpen(value => !value)} />
      <View style={{ flex: 1, minWidth: 100 }}><Text selectable style={[styles.text, { fontFamily: mono, fontWeight: "600" }]}>{file.newPath || file.oldPath}</Text>
        {file.renamedFile ? <Text selectable style={styles.muted}>原路径：{file.oldPath}</Text> : null}</View>
      <Text style={styles.muted}>{file.newFile ? "新增" : file.deletedFile ? "删除" : file.renamedFile ? "重命名" : "修改"}</Text>
      <Text style={{ ...styles.muted, color: c.statusSuccess }}>+{lines.filter(l => l.kind === "add").length}</Text>
      <Text style={{ ...styles.muted, color: c.statusDanger }}>−{lines.filter(l => l.kind === "remove").length}</Text>
      {open ? <Action theme={theme} label={wrap ? "横向滚动" : "自动换行"} onPress={() => setWrap(value => !value)} /> : null}
    </View>
    {incomplete ? <Text style={[styles.text, { padding: 10 }]}>此文件差异不完整（过大、折叠或截断），行数仅统计已返回内容。</Text> : null}
    {open ? <>
      {!lines.length ? <Text style={[styles.muted, { padding: 16 }]}>没有可展示的文本差异。</Text> : wrap ? code : <ScrollView horizontal>{code}</ScrollView>}
      {lines.length > visible ? <View style={{ padding: 10, gap: 8 }}><Text style={styles.muted}>已展示 {visible} / {lines.length} 行</Text><Action theme={theme} label="继续显示 250 行" onPress={() => setVisible(count => count + 250)} /></View> : null}
    </> : null}
  </View>;
}
