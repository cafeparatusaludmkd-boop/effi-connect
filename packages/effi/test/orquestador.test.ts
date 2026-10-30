import { describe, expect, it } from 'vitest';
import { ARRANQUE_MS, ATRASO_MAX_MS, DIA_MS, EffiClient, INCREMENTALES, SOLAPE_MS, corridaCuenta, type AlmacenSync, type CargaHistorica } from '../src/index.ts';

const AHORA = Date.parse('2026-10-27T12:00:00Z');

function almacenEnMemoria(cursores: Record<string, number> = {}, cargas: CargaHistorica[] = []) {
  const estados: Record<string, { cursorUtc?: number; filas?: number; error: string | null }> = {};
  const cambiosCarga: Record<number, object[]> = {};
  const ingeridas: string[] = [];
  const almacen: AlmacenSync = {
    cursores: async () => cursores,
    guardarEstado: async (_a, recurso, e) => void (estados[recurso] = e),
    cargasPendientes: async () => cargas,
    actualizarCarga: async (id, c) => void (cambiosCarga[id] ??= []).push(c),
    ingerir: async (_a, recurso) => (ingeridas.push(recurso), 3),
  };
  return { almacen, estados, cambiosCarga, ingeridas };
}

// Effi falso: responde según el path; registra los parámetros de cada petición.
function api(responder: (path: string, q: URLSearchParams) => { status: number; body: string } = () => ok(3), maxPeticiones = Infinity) {
  let t = AHORA;
  const pedidos: { path: string; q: URLSearchParams }[] = [];
  const fetch = (async (url: string) => {
    const u = new URL(url);
    const path = u.pathname.replace('/api/', '');
    pedidos.push({ path, q: u.searchParams });
    const r = responder(path, u.searchParams);
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof globalThis.fetch;
  return { cliente: new EffiClient({ apiKey: 'k', fetch, now: () => t, sleep: async (ms) => void (t += ms), maxPeticiones }), pedidos };
}
const ok = (total: number) => ({ status: 200, body: `{"ok":true,"data":[],"paginacion":{"total":${total},"total_paginas":1}}` });
const cuenta = { accountId: 'acc-1', tzOffsetMin: -300 };

describe('corridaCuenta · incremental', () => {
  it('primera corrida: últimas 2 horas de cada recurso y avanza el cursor', async () => {
    const m = almacenEnMemoria();
    const { cliente, pedidos } = api();
    const r = await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    expect(Object.keys(r.incremental)).toEqual(INCREMENTALES);
    expect(m.estados.guias).toEqual({ cursorUtc: AHORA, filas: 3, error: null });
    // 12:00 UTC − 2 h = 10:00 UTC = 05:00 en Colombia
    expect(pedidos.find((p) => p.path === 'guia_transporte')!.q.get('desde')).toBe('2026-10-27 05:00:00');
    expect(AHORA - ARRANQUE_MS).toBe(Date.parse('2026-10-27T10:00:00Z'));
  });

  it('con cursor: parte del cursor menos el solape', async () => {
    const cursor = AHORA - 3600_000;
    const m = almacenEnMemoria({ wallet: cursor });
    const { cliente, pedidos } = api();
    await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    const desde = pedidos.find((p) => p.path === 'movimiento_dinero_effi')!.q.get('fecha_desde');
    expect(desde).toBe('2026-10-27 05:50:00'); // 11:00 − 10 min, en hora de Colombia
    expect(SOLAPE_MS).toBe(600_000);
  });

  it('un cursor muy atrasado se recorta a 30 días', async () => {
    const m = almacenEnMemoria({ ordenes: AHORA - 90 * DIA_MS });
    const { cliente, pedidos } = api();
    await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    const primero = pedidos.find((p) => p.path === 'orden_v')!.q.get('desde');
    expect(primero).toBe('2026-09-27 07:00:00');
    expect(ATRASO_MAX_MS).toBe(30 * DIA_MS);
  });

  it('un recurso con error no frena a los demás y no avanza su cursor', async () => {
    const m = almacenEnMemoria();
    const { cliente } = api((path) => (path === 'movimiento_dinero_effi' ? { status: 400, body: '{"ok":false,"mensaje":"Sin permiso"}' } : ok(1)));
    const r = await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    expect(String(r.incremental.wallet)).toMatch(/Sin permiso/);
    expect(m.estados.wallet!.cursorUtc).toBeUndefined();
    expect(m.estados.guias!.cursorUtc).toBe(AHORA);
  });

  it('al agotar el presupuesto corta sin marcar error', async () => {
    const m = almacenEnMemoria();
    const { cliente } = api(undefined, 2);
    const r = await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    expect(r.tiempoAgotado).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.peticiones).toBe(2);
  });
});

describe('corridaCuenta · cargas históricas', () => {
  it('recorre la carga por tramos y la marca lista', async () => {
    const desde = AHORA - 5 * DIA_MS;
    const m = almacenEnMemoria(
      Object.fromEntries(INCREMENTALES.map((r) => [r, AHORA])),
      [{ id: 7, recurso: 'guias', avanceUtc: desde, hastaUtc: AHORA, filas: 0 }],
    );
    const { cliente } = api();
    const r = await corridaCuenta(cliente, cuenta, m.almacen, AHORA);
    // guias avanza de a 2 días: 5 días = 3 tramos
    expect(m.cambiosCarga[7]).toHaveLength(3);
    expect(m.cambiosCarga[7]!.at(-1)).toMatchObject({ avanceUtc: AHORA, listo: true });
    expect(r.cargas).toEqual([{ id: 7, recurso: 'guias', listo: true, filas: 9 }]);
  });

  it('marca error en cargas con un recurso desconocido', async () => {
    const m = almacenEnMemoria({}, [{ id: 8, recurso: 'otra', avanceUtc: 0, hastaUtc: 1, filas: 0 }]);
    await corridaCuenta(api().cliente, cuenta, m.almacen, AHORA);
    expect(m.cambiosCarga[8]).toEqual([{ error: 'recurso desconocido', fallida: true }]);
  });
});
