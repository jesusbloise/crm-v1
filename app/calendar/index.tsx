// app/calendar/index.tsx
import { Redirect } from "expo-router";

export default function CalendarIndex() {
  // Al entrar a /calendar redirige automáticamente a /calendar/ics
  return <Redirect href="/calendar/google" />;
}
