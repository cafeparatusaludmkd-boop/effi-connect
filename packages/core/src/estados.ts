import { normalizar } from './texto.ts';

// Estados unificados de guía (docs/reglas-negocio.md §1).
export type EstadoUnificado =
  | 'ENTREGADO'
  | 'EN_TRANSITO'
  | 'DEVOLUCION'
  | 'NOVEDAD'
  | 'PENDIENTE'
  | 'EN_OFICINA'
  | 'INDEMNIZACION'
  | 'EXCLUIDA';

export const ESTADOS_CERRADOS: ReadonlySet<EstadoUnificado> = new Set(['ENTREGADO', 'DEVOLUCION']);
export const ESTADOS_ABIERTOS: ReadonlySet<EstadoUnificado> = new Set(['EN_TRANSITO', 'NOVEDAD', 'PENDIENTE', 'EN_OFICINA']);

// El orden importa: "Cancelada por transportadora" debe caer en EXCLUIDA antes que en otra regla.
const REGLAS: [RegExp, EstadoUnificado][] = [
  [/cancelad|rechazad/, 'EXCLUIDA'],
  [/indemniza/, 'INDEMNIZACION'],
  [/devoluci/, 'DEVOLUCION'],
  [/entregad/, 'ENTREGADO'],
  [/novedad/, 'NOVEDAD'],
  [/disponible para retiro|oficina/, 'EN_OFICINA'],
  [/transito|reparto|recolectad/, 'EN_TRANSITO'],
  [/generad|pendiente/, 'PENDIENTE'],
];

/** Traduce el texto de estado de Effi al estado unificado. `null` si el texto no se reconoce. */
export function unificarEstado(textoEffi: string | null | undefined): EstadoUnificado | null {
  const t = normalizar(textoEffi);
  if (!t) return null;
  return REGLAS.find(([re]) => re.test(t))?.[1] ?? null;
}

/** "El wallet manda": con un "Recaudo de venta" acreditado, la guía cuenta como ENTREGADO. */
export function estadoEfectivo(nominal: EstadoUnificado | null, tieneRecaudoEnWallet: boolean): EstadoUnificado | null {
  return tieneRecaudoEnWallet ? 'ENTREGADO' : nominal;
}

export const esCerrado = (e: EstadoUnificado | null) => e !== null && ESTADOS_CERRADOS.has(e);
export const esAbierto = (e: EstadoUnificado | null) => e !== null && ESTADOS_ABIERTOS.has(e);
