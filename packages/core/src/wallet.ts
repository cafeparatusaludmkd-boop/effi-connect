import { normalizar } from './texto.ts';

// Líneas del PyG a partir de los movimientos del wallet (docs/reglas-negocio.md §4).
export type LineaWallet =
  | 'INGRESO'
  | 'COSTO_MERCANCIA'
  | 'FLETE_CON_RECAUDO'
  | 'FLETE_DEVOLUCION'
  | 'FLETE_SIN_RECAUDO'
  | 'FULFILLMENT'
  | 'OTROS'
  | 'REVERSION'
  | 'CAJA'
  | 'SIN_CLASIFICAR';

// El orden importa: "comisión por retiro" es OTROS (no CAJA) y "Débito revertido" es REVERSION.
const REGLAS: [RegExp, LineaWallet][] = [
  [/revertid/, 'REVERSION'],
  [/recaudo de venta/, 'INGRESO'],
  [/garantia|indemniza/, 'INGRESO'],
  [/compra de mercancia/, 'COSTO_MERCANCIA'],
  [/flete.*devoluci/, 'FLETE_DEVOLUCION'],
  [/flete sin recaudo/, 'FLETE_SIN_RECAUDO'],
  [/flete.*recaudo/, 'FLETE_CON_RECAUDO'],
  [/fulfillment/, 'FULFILLMENT'],
  [/4\s*x\s*mil|comision por retiro|cruce de factura/, 'OTROS'],
  [/retiro|transferencia|recarga/, 'CAJA'],
];

export function clasificarMovimiento(tipoMovimiento: string | null | undefined): LineaWallet {
  const t = normalizar(tipoMovimiento);
  return REGLAS.find(([re]) => re.test(t))?.[1] ?? 'SIN_CLASIFICAR';
}

export const entraEnPyG = (linea: LineaWallet) => linea !== 'CAJA';

export interface Movimiento {
  tipo: string;
  /** En la moneda de la cuenta, con signo (créditos +, débitos −). La API ya no viene en centavos. */
  valor: number;
  guia?: string | null;
  fecha: Date;
}

export interface PyG {
  lineas: Record<LineaWallet, number>;
  /** Suma de todas las líneas que entran al PyG. */
  utilidad: number;
  /** Retiros, transferencias y recargas: caja, fuera del PyG. */
  caja: number;
}

export function pyg(movimientos: readonly Movimiento[]): PyG {
  const lineas = Object.fromEntries(
    (['INGRESO', 'COSTO_MERCANCIA', 'FLETE_CON_RECAUDO', 'FLETE_DEVOLUCION', 'FLETE_SIN_RECAUDO', 'FULFILLMENT', 'OTROS', 'REVERSION', 'CAJA', 'SIN_CLASIFICAR'] as const).map(
      (l) => [l, 0],
    ),
  ) as Record<LineaWallet, number>;
  for (const m of movimientos) lineas[clasificarMovimiento(m.tipo)] += m.valor;
  const utilidad = (Object.keys(lineas) as LineaWallet[]).filter(entraEnPyG).reduce((s, l) => s + lineas[l], 0);
  return { lineas, utilidad, caja: lineas.CAJA };
}

/** Guías con "Recaudo de venta" acreditado (para la regla "el wallet manda"). */
export function guiasConRecaudo(movimientos: readonly Movimiento[]): Set<string> {
  return new Set(movimientos.filter((m) => /recaudo de venta/.test(normalizar(m.tipo)) && m.guia).map((m) => m.guia!));
}

/** Guías ENTREGADO sin "Recaudo de venta" acreditado: hay que reclamarlas. */
export function guiasSinLiquidar(entregadas: readonly string[], conRecaudo: ReadonlySet<string>): string[] {
  return entregadas.filter((g) => !conRecaudo.has(g));
}

/** Días entre el estado ENTREGADO y el movimiento "Recaudo de venta". */
export const diasEntregaAPago = (fechaEntregado: Date, fechaRecaudo: Date) =>
  (fechaRecaudo.getTime() - fechaEntregado.getTime()) / 86_400_000;
