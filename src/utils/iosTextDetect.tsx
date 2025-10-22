import React from "react";
import { Text } from "react-native";

if (__DEV__) {
  const orig = React.createElement;
  // @ts-ignore
  React.createElement = (type: any, props: any, ...children: any[]) => {
    if (type !== Text) {
      for (const ch of children) {
        if (typeof ch === "string" || typeof ch === "number") {
          const name =
            typeof type === "string"
              ? type
              : type?.displayName || type?.name || "Anonymous";
          // 🔴 Log muy visible para que lo veas en la consola
          console.error(
            `[iOS Text ERROR] Texto suelto en <${name}>:`,
            JSON.stringify(String(ch)).slice(0, 120)
          );
        }
      }
    }
    return orig(type, props, ...children);
  };
}
