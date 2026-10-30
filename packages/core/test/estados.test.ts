import { describe, expect, it } from 'vitest';
import { esAbierto, esCerrado, estadoEfectivo, unificarEstado } from '../src/index.ts';

describe('unificarEstado', () => {
  it.each([
    ['Entregada a destino', 'ENTREGADO'],
    ['En transito', 'EN_TRANSITO'],
    ['En Tránsito', 'EN_TRANSITO'],
    ['En reparto', 'EN_TRANSITO'],
    ['Recolectado', 'EN_TRANSITO'],
    ['Devolución a origen', 'DEVOLUCION'],
    ['Novedad', 'NOVEDAD'],
    ['Generada', 'PENDIENTE'],
    ['Pendiente', 'PENDIENTE'],
    ['Disponible para retiro en oficina', 'EN_OFICINA'],
    ['Indemnización', 'INDEMNIZACION'],
    ['Cancelada', 'EXCLUIDA'],
    ['Rechazada', 'EXCLUIDA'],
    ['Cancelada por transportadora', 'EXCLUIDA'],
  ])('%s → %s', (texto, esperado) => {
    expect(unificarEstado(texto)).toBe(esperado);
  });

  it('devuelve null con texto vacío o desconocido', () => {
    expect(unificarEstado('')).toBeNull();
    expect(unificarEstado(null)).toBeNull();
    expect(unificarEstado('Estado nuevo de Effi')).toBeNull();
  });
});

describe('estadoEfectivo (el wallet manda)', () => {
  it('con recaudo acreditado la guía es ENTREGADO aunque diga otra cosa', () => {
    expect(estadoEfectivo('EN_TRANSITO', true)).toBe('ENTREGADO');
    expect(estadoEfectivo('DEVOLUCION', true)).toBe('ENTREGADO');
  });
  it('sin recaudo conserva el estado nominal', () => {
    expect(estadoEfectivo('NOVEDAD', false)).toBe('NOVEDAD');
  });
});

describe('abiertas y cerradas', () => {
  it('clasifica según las reglas', () => {
    expect(esCerrado('ENTREGADO')).toBe(true);
    expect(esCerrado('DEVOLUCION')).toBe(true);
    expect(esCerrado('INDEMNIZACION')).toBe(false);
    expect(esAbierto('EN_OFICINA')).toBe(true);
    expect(esAbierto('EXCLUIDA')).toBe(false);
    expect(esAbierto(null)).toBe(false);
  });
});
