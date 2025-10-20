export async function openNativeDate(initial?: Date): Promise<Date | null> {
  try {
    // @ts-ignore dynamic
    const DateTimePicker = (await import("@react-native-community/datetimepicker")).default;
    // Si el módulo existe, podrías renderizar un modal propio con este componente.
    // Para mantenerlo simple aquí, devolvemos null y sigues con el input.
    // (Si quieres, luego hacemos un mini-modal que lo envuelva).
    return null;
  } catch {
    return null;
  }
}
