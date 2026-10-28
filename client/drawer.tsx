import { useDiscard } from "./draft-guard.tsx";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, View } from "react-native";
import type { Theme } from "./workbench-ui.tsx";

export function Drawer({ width, theme, onDismiss, children, label = "MR 详情" }: { label?: string; width: number; theme: Theme; onDismiss(): void; children(close: () => void, ready: boolean): ReactNode }) {
  const discard=useDiscard();
  const progress = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const reduceMotion = useRef(true), closing = useRef(false);
  const close = useCallback(() => discard(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion.current) { onDismiss(); return; }
    Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) onDismiss(); });
  }), [onDismiss, progress, discard]);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!live || closing.current) return;
      reduceMotion.current = reduced;
      if (reduced) { progress.setValue(1); setReady(true); }
      else Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished && live && !closing.current) setReady(true); });
    }).catch(() => { if (live && !closing.current) { progress.setValue(1); setReady(true); } });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", reduced => {
      reduceMotion.current = reduced;
      if (reduced) { progress.stopAnimation(); progress.setValue(closing.current ? 0 : 1); if (closing.current) onDismiss(); else setReady(true); }
    });
    return () => { live = false; subscription.remove(); progress.stopAnimation(); };
  }, [onDismiss, progress]);
  return <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" }}>
    <Animated.View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }) }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`关闭 ${label}遮罩`} onPress={close} style={{ flex: 1, backgroundColor: theme.colors.surface0 }} />
    </Animated.View>
    <Animated.View accessibilityLabel={`${label}抽屉`} accessibilityViewIsModal style={{ position: "absolute", top: 0, right: 0, bottom: 0, width, borderLeftWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface0, shadowColor: theme.colors.foreground, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: -4, height: 0 }, elevation: 8,
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }}>
      {children(close, ready)}
    </Animated.View>
  </View>;
}
