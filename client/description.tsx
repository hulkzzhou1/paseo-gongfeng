import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { descriptionBlocks, descriptionLink } from "./description-blocks.ts";
import { Action, mono, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { widenDescriptionDialog } from "./web.ts";

export function Description({ source, url, theme }: { source: string; url: string | null; theme: Theme }) {
  const root = useRef<View>(null);
  useLayoutEffect(() => widenDescriptionDialog(root.current), []);
  const blocks = useMemo(() => descriptionBlocks(source), [source]);
  const [limit, setLimit] = useState(100), [linkError, setLinkError] = useState(false);
  const styles = workbenchStyles(theme), c = theme.colors;
  const inline = (text: string) => text.split(/(`[^`\n]{1,500}`|\*\*[^*\n]{1,500}\*\*|!?\[[^\]\n]{0,500}\]\([^)\s]{1,2000}\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <Text key={index} style={{ fontFamily: mono, backgroundColor: c.surface2 }}>{part.slice(1, -1)}</Text>;
    if (part.startsWith("**") && part.endsWith("**")) return <Text key={index} style={{ fontWeight: "600" }}>{part.slice(2, -2)}</Text>;
    const link = /^(!?)\[([^\]]*)\]\(([^)]+)\)$/.exec(part), href = link ? descriptionLink(link[3], url) : null;
    return link && href ? <Text key={index} accessibilityRole="link" style={{ color: c.accent, textDecorationLine: "underline" }} onPress={() => { void Linking.openURL(href).catch(() => setLinkError(true)); }}>{link[1] ? "图片：" : ""}{link[2] || href}</Text> : part;
  });
  return <View ref={root} style={{ gap: 14 }}>
    {blocks.slice(0, limit).map((block, index) => block.kind === "code" ? <View key={index} style={[styles.panel, { backgroundColor: c.surface1 }]}>
      {block.marker ? <Text style={[styles.muted, { paddingHorizontal: 12, paddingTop: 8 }]}>{block.marker}</Text> : null}
      <ScrollView horizontal><Text selectable style={{ color: c.foreground, fontFamily: mono, fontSize: 12, lineHeight: 20, padding: 12 }}>{block.text || " "}</Text></ScrollView>
    </View> : <View key={index} style={{ flexDirection: "row", gap: 8, ...(block.kind === "quote" ? { borderLeftWidth: 3, borderColor: c.border, paddingLeft: 12 } : {}) }}>
      {block.kind === "list" ? <Text style={styles.text}>{block.marker}</Text> : null}
      <Text selectable accessibilityRole={block.kind === "heading" ? "header" : undefined} style={{ color: c.foreground, flex: 1, minWidth: 0, fontSize: block.kind === "heading" ? block.level === 1 ? 20 : 16 : 14, lineHeight: 24, fontWeight: block.kind === "heading" ? "600" : "400" }}>{inline(block.text)}</Text>
    </View>)}
    {!blocks.length ? <Text style={styles.muted}>无描述。</Text> : null}
    {blocks.length > limit ? <Action theme={theme} label="继续显示描述" onPress={() => setLimit(value => value + 100)} /> : null}
    {linkError ? <Text accessibilityLiveRegion="polite" style={styles.text}>无法打开链接，请在工蜂原站查看。</Text> : null}
    {url ? <ExternalLink href={url} accessibilityLabel="在工蜂查看完整描述"><Text style={[styles.text, { textDecorationLine: "underline", paddingVertical: 8 }]}>在工蜂查看完整描述 ↗</Text></ExternalLink> : null}
  </View>;
}
