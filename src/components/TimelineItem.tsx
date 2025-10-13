import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const ORANGE = "#FF6A00";
const CARD = "#151517";
const BORDER = "#2a2a2c";
const TEXT = "#f3f4f6";
const SUB = "rgba(255,255,255,0.7)";

const shadowWeb = Platform.select({
  web: { boxShadow: "0 6px 24px rgba(0,0,0,0.35)" } as any,
  default: {},
});

export function TimelineItem({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.icon}>
        <Text style={{ color: "#fff" }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: CARD,
    borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, padding: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
    ...shadowWeb,
  },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" },
  title: { color: TEXT, fontWeight: "800" },
  sub: { color: SUB, fontSize: 12, marginTop: 2 },
});
