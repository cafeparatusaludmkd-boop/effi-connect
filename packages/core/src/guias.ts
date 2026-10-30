import { esAbierto, type EstadoUnificado } from './estados.ts';
import { normalizar } from './texto.ts';

// Guía ya normalizada (el estado es el efectivo: con la regla del wallet aplicada).
export interface Guia {
  numero: string;
  estado: EstadoUnificado | null;
  transportadora?: string | null;
  /** true si es contraentrega. */
  recaudo: boolean;
  valorRecaudo: number;
  ultimoCambioEstado?: Date | null;
  direccionDestinatario?: string | null;
}

const vigentes = (guias: readonly Guia[]) => guias.filter((g) => g.estado !== 'EXCLUIDA');
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/** Efectividad = entregadas / (entregadas + devueltas). Solo guías cerradas; INDEMNIZACION no entra. */
export function efectividad(guias: readonly Guia[]): number | null {
  const e = guias.filter((g) => g.estado === 'ENTREGADO').length;
  const d = guias.filter((g) => g.estado === 'DEVOLUCION').length;
  return ratio(e, e + d);
}

/** % devolución por transportadora = devueltas / total de guías de esa transportadora. */
export function devolucionPorTransportadora(guias: readonly Guia[]): Map<string, number> {
  const tot = new Map<string, { total: number; dev: number }>();
  for (const g of vigentes(guias)) {
    const t = normalizarTransportadora(g.transportadora);
    const c = tot.get(t) ?? { total: 0, dev: 0 };
    c.total++;
    if (g.estado === 'DEVOLUCION') c.dev++;
    tot.set(t, c);
  }
  return new Map([...tot].map(([t, c]) => [t, c.dev / c.total]));
}

/** Promedio por guía = Σ valor de recaudo / número de guías contraentrega. */
export function promedioPorGuia(guias: readonly Guia[]): number | null {
  const cod = vigentes(guias).filter((g) => g.recaudo);
  return ratio(cod.reduce((s, g) => s + g.valorRecaudo, 0), cod.length);
}

/** Recaudo potencial: todas las guías contraentrega. Efectivo: solo las ENTREGADO. */
export function recaudo(guias: readonly Guia[]): { potencial: number; efectivo: number } {
  const cod = vigentes(guias).filter((g) => g.recaudo);
  return {
    potencial: cod.reduce((s, g) => s + g.valorRecaudo, 0),
    efectivo: cod.filter((g) => g.estado === 'ENTREGADO').reduce((s, g) => s + g.valorRecaudo, 0),
  };
}

/** Guía abierta sin cambio de estado en más de `dias` días (5 por defecto). */
export function guiasEstancadas(guias: readonly Guia[], ahora: Date, dias = 5): Guia[] {
  const limite = ahora.getTime() - dias * 86_400_000;
  return guias.filter((g) => esAbierto(g.estado) && g.ultimoCambioEstado != null && g.ultimoCambioEstado.getTime() < limite);
}

const OFICINA_RE = /oficina|inter\s*rapid|interrapid|recoge|punto de/i;
export const esEntregaEnOficina = (direccion: string | null | undefined) => OFICINA_RE.test(direccion ?? '');

const ALIAS_TRANSPORTADORA: Record<string, string> = {
  interrapidisimo: 'INTER RAPIDÍSIMO',
  'inter rapidisimo': 'INTER RAPIDÍSIMO',
  envia: 'ENVÍA COLVANES',
  'envia colvanes': 'ENVÍA COLVANES',
};

export function normalizarTransportadora(nombre: string | null | undefined): string {
  const n = normalizar(nombre);
  if (!n) return 'SIN TRANSPORTADORA';
  return ALIAS_TRANSPORTADORA[n] ?? (nombre ?? '').trim().toUpperCase();
}
