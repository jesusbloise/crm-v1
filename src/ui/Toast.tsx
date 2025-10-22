// src/ui/Toast.tsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";

type ToastKind = "success" | "error" | "info";
type ToastItem = {
  id: string;
  message: React.ReactNode; // string | JSX
  kind?: ToastKind;
  duration?: number;        // ms
};

type ToastContextValue = {
  show: (message: React.ReactNode, opts?: { kind?: ToastKind; duration?: number }) => void;
  hideAll: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const BG = "#0b0c10",
  CARD = "#14151a",
  BORDER = "#272a33",
  TEXT = "#e8ecf1",
  SUBTLE = "#a9b0bd";

const KIND_BG: Record<ToastKind, string> = {
  info: "#374151",
  success: "#166534",
  error: "#7f1d1d",
};

const KIND_BORDER: Record<ToastKind, string> = {
  info: "#4b5563",
  success: "#22c55e",
  error: "#ef4444",
};

function SafeTextChild({ children, style }: { children: React.ReactNode; style?: any }) {
  if (typeof children === "string" || typeof children === "number") {
    return <Text style={[{ color: TEXT }, style]}>{String(children)}</Text>;
  }
  return <>{children}</>;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const anim = useRef(new Animated.Value(0)).current; // 0 -> hidden, 1 -> visible
  const timers = useRef<Record<string, NodeJS.Timeout>>({}).current;

  const animatedIn = useCallback(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const animatedOut = useCallback((cb?: () => void) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && cb?.());
  }, [anim]);

  const show = useCallback<ToastContextValue["show"]>((message, opts) => {
    const id = Math.random().toString(36).slice(2);
    const kind: ToastKind = opts?.kind ?? "info";
    const duration = opts?.duration ?? 3000;

    setToasts((prev) => {
      const next = [...prev, { id, message, kind, duration }];
      // si es el primer toast, animar entrada
      if (prev.length === 0) {
        animatedIn();
      }
      return next;
    });

    if (duration > 0) {
      timers[id] = setTimeout(() => {
        setToasts((prev) => {
          const next = prev.filter((t) => t.id !== id);
          if (next.length === 0) animatedOut();
          return next;
        });
        delete timers[id];
      }, duration);
    }
  }, [animatedIn, animatedOut, timers]);

  const hideAll = useCallback(() => {
    // limpiar timers
    Object.values(timers).forEach(clearTimeout);
    for (const k of Object.keys(timers)) delete timers[k];

    animatedOut(() => setToasts([]));
  }, [animatedOut, timers]);

  const value = useMemo(() => ({ show, hideAll }), [show, hideAll]);

  // Transform para entrar desde arriba con fade
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });
  const opacity = anim;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Overlay de toasts */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.stack}>
          {toasts.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                // Cerrar sólo este
                if (timers[t.id]) { clearTimeout(timers[t.id]); delete timers[t.id]; }
                setToasts((prev) => {
                  const next = prev.filter((x) => x.id !== t.id);
                  if (next.length === 0) animatedOut();
                  return next;
                });
              }}
              style={[
                styles.toast,
                { backgroundColor: KIND_BG[t.kind ?? "info"], borderColor: KIND_BORDER[t.kind ?? "info"] },
              ]}
            >
              <SafeTextChild style={styles.toastText}>{t.message}</SafeTextChild>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0, right: 0, top: Platform.OS === "web" ? 8 : 44, // margen para status bar iOS
    alignItems: "center",
    zIndex: 9999,
  },
  stack: {
    gap: 8,
    width: "100%",
    maxWidth: 520,
    paddingHorizontal: 12,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toastText: {
    color: TEXT,
    fontWeight: "700",
  },
});
