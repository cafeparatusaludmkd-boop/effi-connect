export const DIA_MS = 86_400_000;

/**
 * Instante UTC → "YYYY-MM-DD HH:MM:SS" en la hora de la empresa.
 * Los filtros `desde`/`hasta` de Effi se interpretan en la zona de la empresa; los datos vuelven en UTC.
 */
export const aHoraEmpresa = (ms: number, offsetMin: number) =>
  new Date(Math.floor(ms / 1000) * 1000 + offsetMin * 60_000).toISOString().slice(0, 19).replace('T', ' ');

/** Parte [a, b) en tramos de como máximo `maxMs` (la API acepta rangos de hasta 31 días). */
export function partirRango(a: number, b: number, maxMs = 30 * DIA_MS): [number, number][] {
  const tramos: [number, number][] = [];
  for (let t = a; t < b; t += maxMs) tramos.push([t, Math.min(t + maxMs, b)]);
  return tramos;
}
