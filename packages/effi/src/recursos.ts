import { DIA_MS } from './fechas.ts';

// Recursos que se sincronizan y cómo se piden (docs/effi-api.md).
export interface Recurso {
  path: string;
  desde: string;
  hasta: string;
  /** false → se parte el rango en ventanas de ≤ 100 filas (la paginación de Effi no es fiable ahí). */
  paginable: boolean;
  extra?: Record<string, string>;
  /** Tamaño de tramo al avanzar una carga histórica. */
  tramoHistoricoMs: number;
}

export const RECURSOS = {
  // Cada fila es un cambio de estado: el dato más importante. La página 2+ llega vacía.
  hist: { path: 'hist_est_guia_transporte', desde: 'cambio_estado_desde', hasta: 'cambio_estado_hasta', paginable: false, tramoHistoricoMs: DIA_MS / 2 },
  wallet: { path: 'movimiento_dinero_effi', desde: 'fecha_desde', hasta: 'fecha_hasta', paginable: true, tramoHistoricoMs: DIA_MS },
  // Sin `desde` solo trae las guías desde ayer: siempre se envían ambos extremos.
  guias: { path: 'guia_transporte', desde: 'desde', hasta: 'hasta', paginable: true, tramoHistoricoMs: 2 * DIA_MS },
  // Sin `t_novedad` solo trae el tipo 2 de los últimos 5 días; las páginas se solapan.
  novedades_1: { path: 'novedad_guia_transporte', desde: 'desde', hasta: 'hasta', paginable: false, extra: { t_novedad: '1' }, tramoHistoricoMs: DIA_MS },
  novedades_2: { path: 'novedad_guia_transporte', desde: 'desde', hasta: 'hasta', paginable: false, extra: { t_novedad: '2' }, tramoHistoricoMs: 7 * DIA_MS },
  // Sin parámetros solo devuelve el mes actual.
  ordenes: { path: 'orden_v', desde: 'desde', hasta: 'hasta', paginable: true, tramoHistoricoMs: 7 * DIA_MS },
} as const satisfies Record<string, Recurso>;

export type NombreRecurso = keyof typeof RECURSOS;
