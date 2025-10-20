import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

type ToastType = "success" | "error" | "info";
type ToastMsg = { type?: ToastType; text: string; durationMs?: number };

const BG = "#0F1115";
const TEXT = "#F3F4F6";

const ToastCtx = createContext<{ show: (m: ToastMsg) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setMsg(null)
    );
  }, [opacity]);

  const show = useCallback((m: ToastMsg) => {
    setMsg(m);
    Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setTimeout(hide, m.durationMs ?? 2000);
    });
  }, [hide, opacity]);

  const value = useMemo(() => ({ show }), [show]);

  const colorByType = (t?: ToastType) =>
    t === "success" ? "#10b981" : t === "error" ? "#ef4444" : "#22d3ee";

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { opacity, top: Platform.OS === "web" ? 16 : 48 }]}
        >
          <View style={[styles.toast, { borderColor: colorByType(msg.type) }]}>
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9999 },
  toast: {
    maxWidth: 700,
    marginHorizontal: 12,
    backgroundColor: BG,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  text: { color: TEXT, fontWeight: "800" },
});
