// src/theme.ts
import { Platform } from "react-native";

export const COLORS = {
  // Paleta B — Modern Tech
  primary: "#7C3AED",         // morado (acciones/links)
  accent:  "#22D3EE",         // cian (resaltes)
  bg:      "#0F1115",         // fondo (más liviano y respirado)
  card:    "#171923",         // tarjeta
  border:  "#2B3140",         // bordes
  text:    "#F3F4F6",         // texto principal
  sub:     "#A4ADBD",         // subtítulo
  muted:   "rgba(243,244,246,0.7)",

  success: "#16A34A",
  warning: "#F59E0B",
  danger:  "#DC2626",
  info:    "#3B82F6",

  // Tints translúcidos para badges/chips
  tints: {
    success: "rgba(22,163,74,0.15)",
    warning: "rgba(245,158,11,0.18)",
    danger:  "rgba(220,38,38,0.18)",
    info:    "rgba(59,130,246,0.18)",
    primary: "rgba(124,58,237,0.20)",
    neutral: "rgba(164,173,189,0.16)",
  },
};

export const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
};

export const SHADOW = Platform.select({
  ios:   { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 3 },
  web:   { boxShadow: "0 8px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05)" } as any,
});
