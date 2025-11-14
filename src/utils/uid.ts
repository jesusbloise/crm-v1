/**
 * Genera un ID único basado en timestamp y random.
 * Compatible con web, iOS y Android (no usa crypto.randomUUID).
 * 
 * Formato: random1(base36) + timestamp(base36) + random2(base36)
 * Ejemplo: "k3j8t1a2q9f2wx8h4m9"
 * 
 * Con doble aleatoriedad para minimizar colisiones.
 */
export function uid(): string {
  const random1 = Math.random().toString(36).slice(2, 11); // 9 chars
  const timestamp = Date.now().toString(36); // ~8 chars
  const random2 = Math.random().toString(36).slice(2, 7); // 5 chars
  return random1 + timestamp + random2;
}
