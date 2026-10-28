import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { richBlocks, richInline, type RichToken } from "./rich-text.ts";
import { Action, mono, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { widenDescriptionDialog } from "./web.ts";

function InlineImage({ src, alt, maxWidth, theme }: { src: string; alt: string; maxWidth: number; theme: Theme }) {
  const [failed, setFailed] = useState(false), [size, setSize] = useState({ width: 160, height: 20 });
  const scale = Math.min(1, maxWidth / size.width, 240 / size.height);
  if (failed) return <Text style={{ color: theme.colors.foregroundMuted }}>[{alt}]</Text>;
  return <Image source={{ uri: src }} accessibilityLabel={alt} resizeMode="contain" style={{ width: size.width * scale, height: size.height * scale }}
    onError={() => setFailed(true)} onLoad={event => {
      const next = event.nativeEvent.source;
      if (next && Number.isFinite(next.width) && Number.isFinite(next.height) && next.width > 0 && next.height > 0) setSize(old => old.width === next.width && old.height === next.height ? old : { width: next.width, height: next.height });
    }} />;
}

export function RichText({ source, url, theme, emptyText = "无内容。" }: { source: string; url?: string | null; theme: Theme; emptyText?: string }) {
  const blocks = useMemo(() => richBlocks(source), [source]);
  const [limit, setLimit] = useState(100), [linkError, setLinkError] = useState(false), [width, setWidth] = useState(260);
  const styles = workbenchStyles(theme), c = theme.colors;
  const open = (href: string) => { void Linking.openURL(href).catch(() => setLinkError(true)); };
  const render = (tokens: RichToken[], linked = false): React.ReactNode[] => tokens.map((token, index) => {
    switch (token.kind) {
      case "text": return token.text;
      case "code": return <Text key={index} style={{ fontFamily: mono, fontSize: 12, backgroundColor: c.surface2 }}>{token.text}</Text>;
      case "strong": return <Text key={index} style={{ fontWeight: "700" }}>{render(token.children, linked)}</Text>;
      case "emphasis": return <Text key={index} style={{ fontStyle: "italic" }}>{render(token.children, linked)}</Text>;
      case "link": return <Text key={index} accessibilityRole="link" style={{ color: c.accent, textDecorationLine: "underline" }} onPress={() => open(token.href)}>{render(token.children, true)}</Text>;
      case "image": {
        const image = <InlineImage key={token.src} {...token} maxWidth={Math.max(1, width - 16)} theme={theme} />;
        return linked ? image : <Text key={index} accessibilityRole="link" accessibilityLabel={`查看图片：${token.alt}`} onPress={() => open(token.src)}>{image}</Text>;
      }
    }
  });
  return <View testID="gongfeng-rich-text" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: 10, minWidth: 0 }}>
    {blocks.slice(0, limit).map((block, index) => block.kind === "table" ? <View key={index} style={{ gap: 6 }}>
      <ScrollView horizontal accessibilityLabel="描述表格，可横向滚动" style={{ maxWidth: "100%" }}>
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, overflow: "hidden" }}>
          {[block.headers, ...block.rows.slice(0, limit)].map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: "row", backgroundColor: rowIndex === 0 ? c.surface2 : rowIndex % 2 ? c.surface0 : c.surface1 }}>
            {block.headers.map((_, column) => <Text key={column} selectable accessibilityRole={rowIndex === 0 ? "header" : undefined} style={{ color: c.foreground, width: Math.max(160, Math.min(280, width / block.headers.length)), padding: 10, fontSize: 13, lineHeight: 22, textAlign: block.alignments[column], fontWeight: rowIndex === 0 ? "600" : "400", borderTopWidth: rowIndex ? 1 : 0, borderLeftWidth: column ? 1 : 0, borderColor: c.border }}>{render(richInline(row[column] ?? "", url))}</Text>)}
          </View>)}
        </View>
      </ScrollView>
      {block.rows.length > limit ? <Action theme={theme} label="继续显示表格行" onPress={() => setLimit(value => value + 100)} /> : null}
    </View> : block.kind === "rule" ? <View key={index} style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} /> : block.kind === "code" ? <View key={index} style={[styles.panel, { backgroundColor: c.surface1 }]}>
      {block.marker ? <Text style={[styles.muted, { paddingHorizontal: 10, paddingTop: 6 }]}>{block.marker}</Text> : null}
      <ScrollView horizontal><Text selectable style={{ color: c.foreground, fontFamily: mono, fontSize: 12, lineHeight: 20, padding: 10 }}>{block.text || " "}</Text></ScrollView>
    </View> : <View key={index} style={{ flexDirection: "row", gap: 8, ...(block.kind === "quote" ? { borderLeftWidth: 3, borderColor: c.border, paddingLeft: 10 } : {}) }}>
      {block.kind === "list" ? <Text accessibilityRole={block.checked === undefined ? undefined : "checkbox"} accessibilityState={block.checked === undefined ? undefined : { checked: block.checked, disabled: true }} accessibilityLabel={block.checked === undefined ? undefined : block.checked ? "已完成" : "未完成"} style={styles.text}>{block.checked === undefined ? block.marker : block.checked ? "☑" : "☐"}</Text> : null}
      <Text selectable accessibilityRole={block.kind === "heading" ? "header" : undefined} style={{ color: c.foreground, flex: 1, minWidth: 0, fontSize: block.kind === "heading" ? block.level === 1 ? 20 : block.level === 2 ? 17 : 15 : 13, lineHeight: 22, fontWeight: block.kind === "heading" ? "600" : "400" }}>{render(richInline(block.text, url))}</Text>
    </View>)}
    {!blocks.length ? <Text style={styles.muted}>{emptyText}</Text> : null}
    {blocks.length > limit ? <Action theme={theme} label="继续显示内容" onPress={() => setLimit(value => value + 100)} /> : null}
    {linkError ? <Text accessibilityLiveRegion="polite" style={styles.text}>无法打开链接，请在工蜂原站查看。</Text> : null}
  </View>;
}

export function Description({ source, url, theme }: { source: string; url: string | null; theme: Theme }) {
  const root = useRef<View>(null);
  useLayoutEffect(() => widenDescriptionDialog(root.current), []);
  const styles = workbenchStyles(theme);
  return <View ref={root} style={{ gap: 14 }}>
    <RichText source={source} url={url} theme={theme} emptyText="无描述。" />
    {url ? <ExternalLink href={url} accessibilityLabel="在工蜂查看完整描述"><Text style={[styles.text, { textDecorationLine: "underline", paddingVertical: 8 }]}>在工蜂查看完整描述 ↗</Text></ExternalLink> : null}
  </View>;
}
