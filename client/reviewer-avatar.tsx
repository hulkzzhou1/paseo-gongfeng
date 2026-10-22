import { useState } from "react";
import { Image, Text, View } from "react-native";
import type { Theme } from "./workbench-ui.tsx";

export function ReviewerAvatar({ person, theme, size = 28 }: {
  person: { name: string; username: string; avatarUrl?: string | null }; theme: Theme; size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = person.avatarUrl;
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}>
    {uri && failedUrl !== uri ? <Image accessible={false} source={{ uri }} onError={() => setFailedUrl(uri)} style={{ width: size, height: size }} />
      : <Text style={{ color: theme.colors.foreground, fontSize: Math.round(size * .44), fontWeight: "600" }}>{Array.from(person.name || person.username)[0]?.toUpperCase() || "?"}</Text>}
  </View>;
}
