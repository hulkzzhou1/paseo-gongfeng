// Only the external Paseo/React Native host is replaced; plugin components and React stay real.
import { createElement, useCallback, useState, type ReactNode } from "react";
import type { PluginRpcContract } from "@getpaseo/plugin";

export const host = { invoke: async (_name: string, _input: unknown): Promise<unknown> => { throw Error("Unexpected RPC"); } };
export function useRpc(contract: PluginRpcContract) {
  return useCallback(async (input: unknown) => contract.output.parse(await host.invoke(contract.name, contract.input.parse(input))), [contract]);
}
export const useSettings = (definition: { schema: { parse(input: unknown): unknown } }) => ({ status: "ready", values: definition.schema.parse({}), saving: false });

function native(tag: string) {
  return function Native({ children, ...props }: Record<string, any>) {
    return createElement(tag, {
      ref: props.ref, role: props.accessibilityRole, "aria-label": props.accessibilityLabel,
      "aria-disabled": props.accessibilityState?.disabled, "data-testid": props.testID,
      disabled: props.disabled ?? props.editable === false, onClick: props.onPress,
      value: props.value, defaultValue: props.defaultValue, placeholder: props.placeholder,
      onInput: props.onChangeText ? (event: { currentTarget: { value: string } }) => props.onChangeText(event.currentTarget.value) : undefined,
    }, children);
  };
}
export const View = native("div"), Text = native("span"), Pressable = native("button"), TextInput = native("input");
export const ScrollView = View, Image = native("img"), ActivityIndicator = View, Icon = () => null;
export const Platform = { OS: "web" }, StyleSheet = { create: (styles: unknown) => styles };
export const useWindowDimensions = () => ({ width: 1100, height: 800 });
export const AppState = { currentState: "active", addEventListener: () => ({ remove() {} }) };
export const Linking = { openURL: async () => {} };
export const AccessibilityInfo = { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) };
export const Animated = {
  View,
  Value: class { interpolate() { return 0; } setValue() {} stopAnimation() {} },
};
export const Easing = {};
export const Modal = Object.assign(function Modal({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  return open ? createElement("section", { role: "dialog", "aria-label": title }, children) : null;
}, { Content: View });
export const SettingsCard = View, ExternalLink = View;
export function SettingsRow({ label, children }: { label: string; children?: ReactNode }) { return createElement("div", null, label, children); }
export const SettingsSection = SettingsRow;
export function SettingsInput({ label, initialValue, onChangeText }: { label: string; initialValue: string; onChangeText(value: string): void }) {
  const [value, setValue] = useState(initialValue);
  return createElement(TextInput, { accessibilityLabel: label, value, onChangeText: (next: string) => { setValue(next); onChangeText(next); } });
}
export const SettingsSelect = () => null, SettingsSwitch = () => null;
