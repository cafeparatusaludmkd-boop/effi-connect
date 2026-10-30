import { describe, expect, it } from 'vitest';
import {
  clasificarMovimiento,
  diasEntregaAPago,
  guiasConRecaudo,
  guiasSinLiquidar,
  pyg,
  recuperacionNovedades,
  esDevueltaPorNovedad,
  semaforoCiudad,
  semaforoDevolucion,
  type Movimiento,
} from '../src/index.ts';

describe('clasificarMovimiento', () => {
  it.each([
    ['Recaudo de venta', 'INGRESO'],
    ['Entrada por garantía', 'INGRESO'],
    ['Indemnización', 'INGRESO'],
    ['Compra de mercancía', 'COSTO_MERCANCIA'],
    ['Flete crédito con recaudo', 'FLETE_CON_RECAUDO'],
    ['Flete crédito devolución', 'FLETE_DEVOLUCION'],
    ['Flete sin recaudo', 'FLETE_SIN_RECAUDO'],
    ['Servicio de Fulfillment', 'FULFILLMENT'],
    ['4xmil', 'OTROS'],
    ['Comisión por retiro', 'OTROS'],
    ['Cruce de factura', 'OTROS'],
    ['Débito revertido', 'REVERSION'],
    ['Crédito revertido', 'REVERSION'],
    ['Retiro de dinero', 'CAJA'],
    ['Transferencia entre wallets', 'CAJA'],
    ['Recarga', 'CAJA'],
    ['Algo nuevo', 'SIN_CLASIFICAR'],
  ])('%s → %s', (tipo, linea) => {
    expect(clasificarMovimiento(tipo)).toBe(linea);
  });
});

describe('pyg', () => {
  const f = new Date('2026-10-01');
  const movs: Movimiento[] = [
    { tipo: 'Recaudo de venta', valor: 100_000, guia: 'A', fecha: f },
    { tipo: 'Compra de mercancía', valor: -40_000, guia: 'A', fecha: f },
    { tipo: 'Flete crédito con recaudo', valor: -12_000, guia: 'A', fecha: f },
    { tipo: 'Flete crédito devolución', valor: -22_686, guia: 'B', fecha: f },
    { tipo: 'Retiro de dinero', valor: -500_000, fecha: f },
  ];
  it('suma por línea y deja la caja fuera de la utilidad', () => {
    const r = pyg(movs);
    expect(r.lineas.INGRESO).toBe(100_000);
    expect(r.lineas.FLETE_DEVOLUCION).toBe(-22_686);
    expect(r.utilidad).toBe(100_000 - 40_000 - 12_000 - 22_686);
    expect(r.caja).toBe(-500_000);
  });
  it('detecta guías sin liquidar', () => {
    const con = guiasConRecaudo(movs);
    expect([...con]).toEqual(['A']);
    expect(guiasSinLiquidar(['A', 'C'], con)).toEqual(['C']);
  });
  it('días de entrega a pago', () => {
    expect(diasEntregaAPago(new Date('2026-10-01'), new Date('2026-10-04'))).toBe(3);
  });
});

describe('novedades', () => {
  it('recuperación por guía única', () => {
    const r = recuperacionNovedades(
      [{ guia: 'A' }, { guia: 'A' }, { guia: 'B' }, { guia: 'C' }, { guia: 'D' }],
      (g) => (g === 'A' || g === 'C' ? 'ENTREGADO' : 'DEVOLUCION'),
    );
    expect(r).toEqual({ guias: 4, recuperadas: 2, porcentaje: 0.5 });
  });
  it('devuelta por novedad', () => {
    expect(esDevueltaPorNovedad('Cerrado')).toBe(true);
    expect(esDevueltaPorNovedad('Devolución')).toBe(true);
    expect(esDevueltaPorNovedad('En gestión')).toBe(false);
  });
});

describe('semáforos', () => {
  it('Colombia: ≤25 verde, ≤32 amarillo, >32 rojo', () => {
    expect(semaforoDevolucion('CO', 0.25)).toBe('verde');
    expect(semaforoDevolucion('CO', 0.3)).toBe('amarillo');
    expect(semaforoDevolucion('co', 0.33)).toBe('rojo');
  });
  it('Guatemala: ≤22 verde, ≤30 amarillo', () => {
    expect(semaforoDevolucion('GT', 0.23)).toBe('amarillo');
    expect(semaforoDevolucion('GT', 0.31)).toBe('rojo');
  });
  it('país sin tabla usa los umbrales de Ecuador', () => {
    expect(semaforoDevolucion('DO', 0.3)).toBe('amarillo');
  });
  it('ciudad', () => {
    expect(semaforoCiudad(0.7)).toBe('verde');
    expect(semaforoCiudad(0.55)).toBe('amarillo');
    expect(semaforoCiudad(0.4)).toBe('rojo');
  });
});
