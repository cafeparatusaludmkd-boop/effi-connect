import { describe, expect, it } from 'vitest';
import {
  devolucionPorTransportadora,
  efectividad,
  esEntregaEnOficina,
  guiasEstancadas,
  normalizarTransportadora,
  promedioPorGuia,
  recaudo,
  type Guia,
} from '../src/index.ts';

const g = (numero: string, estado: Guia['estado'], extra: Partial<Guia> = {}): Guia => ({
  numero,
  estado,
  recaudo: true,
  valorRecaudo: 100_000,
  transportadora: 'Servientrega',
  ...extra,
});

describe('efectividad', () => {
  it('entregadas / (entregadas + devueltas), ignora abiertas e indemnización', () => {
    const guias = [g('1', 'ENTREGADO'), g('2', 'ENTREGADO'), g('3', 'ENTREGADO'), g('4', 'DEVOLUCION'), g('5', 'EN_TRANSITO'), g('6', 'INDEMNIZACION')];
    expect(efectividad(guias)).toBe(0.75);
  });
  it('sin guías cerradas es null', () => {
    expect(efectividad([g('1', 'NOVEDAD')])).toBeNull();
  });
});

describe('devolucionPorTransportadora', () => {
  it('devueltas / total por transportadora, sin contar excluidas', () => {
    const guias = [
      g('1', 'DEVOLUCION', { transportadora: 'INTERRAPIDISIMO' }),
      g('2', 'ENTREGADO', { transportadora: 'Inter Rapidísimo' }),
      g('3', 'EN_TRANSITO', { transportadora: 'interrapidisimo' }),
      g('4', 'EXCLUIDA', { transportadora: 'interrapidisimo' }),
      g('5', 'ENTREGADO', { transportadora: 'Coordinadora' }),
    ];
    const r = devolucionPorTransportadora(guias);
    expect(r.get('INTER RAPIDÍSIMO')).toBeCloseTo(1 / 3);
    expect(r.get('COORDINADORA')).toBe(0);
  });
});

describe('recaudo y promedio', () => {
  const guias = [
    g('1', 'ENTREGADO', { valorRecaudo: 100_000 }),
    g('2', 'DEVOLUCION', { valorRecaudo: 50_000 }),
    g('3', 'EN_TRANSITO', { valorRecaudo: 150_000 }),
    g('4', 'ENTREGADO', { recaudo: false, valorRecaudo: 0 }),
    g('5', 'EXCLUIDA', { valorRecaudo: 999_999 }),
  ];
  it('promedio por guía solo sobre contraentrega vigentes', () => {
    expect(promedioPorGuia(guias)).toBe(100_000);
  });
  it('potencial = todas COD; efectivo = COD entregadas', () => {
    expect(recaudo(guias)).toEqual({ potencial: 300_000, efectivo: 100_000 });
  });
});

describe('guiasEstancadas', () => {
  const ahora = new Date('2026-10-27T12:00:00Z');
  const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000);
  it('abiertas sin cambio en más de N días', () => {
    const guias = [
      g('1', 'EN_TRANSITO', { ultimoCambioEstado: hace(6) }),
      g('2', 'EN_TRANSITO', { ultimoCambioEstado: hace(2) }),
      g('3', 'ENTREGADO', { ultimoCambioEstado: hace(30) }),
      g('4', 'NOVEDAD', { ultimoCambioEstado: hace(10) }),
    ];
    expect(guiasEstancadas(guias, ahora).map((x) => x.numero)).toEqual(['1', '4']);
    expect(guiasEstancadas(guias, ahora, 8).map((x) => x.numero)).toEqual(['4']);
  });
});

describe('utilidades de texto', () => {
  it('detecta entrega en oficina', () => {
    expect(esEntregaEnOficina('Recoge en oficina Interrapidisimo')).toBe(true);
    expect(esEntregaEnOficina('PUNTO DE ENTREGA centro')).toBe(true);
    expect(esEntregaEnOficina('Calle 10 # 20-30')).toBe(false);
  });
  it('normaliza nombres de transportadora', () => {
    expect(normalizarTransportadora('ENVIA')).toBe('ENVÍA COLVANES');
    expect(normalizarTransportadora(' servientrega ')).toBe('SERVIENTREGA');
    expect(normalizarTransportadora(null)).toBe('SIN TRANSPORTADORA');
  });
});
