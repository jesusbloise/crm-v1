// src/ui/Confirm.tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const CARD = "#171923";
const BORDER = "#2B3140";
const TEXT = "#F3F4F6";
const SUBTLE = "#A4ADBD";
const DANGER = "#EF4444";

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function Confirm({
  visible,
  title = "Confirmar",
  message = "¿Seguro?",
  confirmText = "Sí, continuar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
}: Props) {
  // 🔸 Sin Modal: si no está visible, no renderiza nada
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.msg}>{message}</Text>
        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.ghost]} onPress={onCancel}>
            <Text style={styles.btnText}>{cancelText}</Text>
          </Pressable>
          <View style={{ width: 8 }} />
          <Pressable style={[styles.btn, styles.danger]} onPress={onConfirm}>
            <Text style={styles.btnText}>{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export { Confirm };
export default Confirm;

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    inset: 0 as any, // RN web soporta 'inset', en nativo equivale a top/left/right/bottom 0
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    // fallback para nativo
    top: 0, left: 0, right: 0, bottom: 0,
  },
  card: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 16,
  },
  title: { color: TEXT, fontWeight: "900", fontSize: 16, marginBottom: 6 },
  msg: { color: SUBTLE },
  row: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  btnText: { color: "#fff", fontWeight: "900" },
  ghost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  danger: { backgroundColor: DANGER, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
});
