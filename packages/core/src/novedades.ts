import type { EstadoUnificado } from './estados.ts';
import { normalizar } from './texto.ts';

export interface Novedad {
  guia: string;
  estadoNovedad?: string | null;
}

/**
 * % recuperación = guías con novedad que terminan ENTREGADO / guías con novedad.
 * Una guía puede tener varias novedades: se cuenta por guía única.
 */
export function recuperacionNovedades(
  novedades: readonly Novedad[],
  estadoFinalDeGuia: (guia: string) => EstadoUnificado | null,
): { guias: number; recuperadas: number; porcentaje: number | null } {
  const guias = new Set(novedades.map((n) => n.guia));
  const recuperadas = [...guias].filter((g) => estadoFinalDeGuia(g) === 'ENTREGADO').length;
  return { guias: guias.size, recuperadas, porcentaje: guias.size ? recuperadas / guias.size : null };
}

/** Novedad que terminó en devolución: estado /cerrado|devoluci|incidencia/. */
export const esDevueltaPorNovedad = (estadoNovedad: string | null | undefined) =>
  /cerrado|devoluci|incidencia/.test(normalizar(estadoNovedad));
