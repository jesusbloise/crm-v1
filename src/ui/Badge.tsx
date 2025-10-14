// src/ui/Badge.tsx
import { COLORS, RADIUS } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Kind = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export function Badge({ label, kind = "neutral" }: { label: string; kind?: Kind }) {
  const map = {
    neutral: { bg: COLORS.tints.neutral, fg: COLORS.text, bd: "transparent" },
    primary: { bg: COLORS.tints.primary, fg: COLORS.text, bd: COLORS.primary },
    success: { bg: COLORS.tints.success, fg: COLORS.text, bd: COLORS.success },
    warning: { bg: COLORS.tints.warning, fg: COLORS.text, bd: COLORS.warning },
    danger:  { bg: COLORS.tints.danger,  fg: COLORS.text, bd: COLORS.danger  },
    info:    { bg: COLORS.tints.info,    fg: COLORS.text, bd: COLORS.info    },
  }[kind];

  return (
    <View style={[styles.badge, { backgroundColor: map.bg, borderColor: map.bd }]}>
      <Text style={[styles.text, { color: map.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  text: { fontSize: 12, fontWeight: "800" },
});
