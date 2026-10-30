import { describe, expect, it } from 'vitest';
import { EffiClient, EffiError, PresupuestoAgotado, aHoraEmpresa, partirRango, sincronizarRango, DIA_MS } from '../src/index.ts';

type Resp = { status: number; body: string; headers?: Record<string, string> };

// Reloj y fetch falsos: el tiempo solo avanza con sleep, así se prueba el espaciado sin esperar.
function entorno(respuestas: Resp[] | ((url: string) => Resp)) {
  let t = 1_000_000;
  const urls: string[] = [];
  const instantes: number[] = [];
  const cola = Array.isArray(respuestas) ? [...respuestas] : null;
  const fetch = (async (url: string) => {
    urls.push(url);
    instantes.push(t);
    const r = cola ? cola.shift()! : (respuestas as (u: string) => Resp)(url);
    return new Response(r.body, { status: r.status, headers: r.headers });
  }) as unknown as typeof globalThis.fetch;
  return {
    urls,
    instantes,
    opciones: { apiKey: 'k_test', fetch, now: () => t, sleep: async (ms: number) => void (t += ms) },
  };
}

const ok = (total: number, paginas = 1, data = '[]') => ({
  status: 200,
  body: `{"ok":true,"data":${data},"paginacion":{"pagina":1,"por_pagina":100,"total":${total},"total_paginas":${paginas}}}`,
});

describe('EffiClient', () => {
  it('lee la paginación y manda la API key', async () => {
    const e = entorno([ok(250, 3)]);
    const p = await new EffiClient(e.opciones).get('guia_transporte', { desde: '2026-10-01' });
    expect(p).toMatchObject({ total: 250, paginas: 3 });
    expect(e.urls[0]).toBe('https://effi.com.co/api/guia_transporte?desde=2026-10-01');
  });

  it('espacia las peticiones al menos 550 ms', async () => {
    const e = entorno(() => ok(0));
    const c = new EffiClient(e.opciones);
    await c.get('a');
    await c.get('b');
    await c.get('c');
    expect(e.instantes[1]! - e.instantes[0]!).toBeGreaterThanOrEqual(550);
    expect(e.instantes[2]! - e.instantes[1]!).toBeGreaterThanOrEqual(550);
  });

  it('respeta Retry-After en 429 y reintenta', async () => {
    const e = entorno([{ status: 429, body: '{}', headers: { 'retry-after': '7' } }, ok(1)]);
    const p = await new EffiClient(e.opciones).get('orden_v');
    expect(p.total).toBe(1);
    expect(e.instantes[1]! - e.instantes[0]!).toBeGreaterThanOrEqual(7000);
  });

  it('falla con el mensaje de Effi si ok no es true', async () => {
    const e = entorno([{ status: 400, body: '{"ok":false,"mensaje":"Parámetro inválido"}' }]);
    await expect(new EffiClient(e.opciones).get('x')).rejects.toThrow(EffiError);
  });

  it('corta al agotar el presupuesto de peticiones', async () => {
    const e = entorno(() => ok(0));
    const c = new EffiClient({ ...e.opciones, maxPeticiones: 1 });
    await c.get('a');
    await expect(c.get('b')).rejects.toBeInstanceOf(PresupuestoAgotado);
  });

  it('exige API key', () => {
    expect(() => new EffiClient({ apiKey: '' })).toThrow();
  });
});

describe('fechas', () => {
  it('convierte a hora de la empresa (Colombia, UTC-5)', () => {
    expect(aHoraEmpresa(Date.parse('2026-10-27T05:30:00Z'), -300)).toBe('2026-10-27 00:30:00');
  });
  it('parte rangos largos en tramos de 30 días', () => {
    const a = Date.parse('2026-01-01T00:00:00Z');
    const tramos = partirRango(a, a + 75 * DIA_MS);
    expect(tramos).toHaveLength(3);
    expect(tramos[2]![1]).toBe(a + 75 * DIA_MS);
  });
});

describe('sincronizarRango', () => {
  const a = Date.parse('2026-10-01T00:00:00Z');
  const cuenta = { tzOffsetMin: -300 };

  it('recurso paginable: ingiere todas las páginas', async () => {
    const e = entorno([ok(250, 3), ok(250, 3), ok(250, 3)]);
    const ingeridas: string[] = [];
    const n = await sincronizarRango(new EffiClient(e.opciones), cuenta, 'wallet', a, a + DIA_MS, async (r) => {
      ingeridas.push(r);
      return 100;
    });
    expect(n).toBe(300);
    expect(ingeridas).toEqual(['wallet', 'wallet', 'wallet']);
    expect(e.urls[2]).toContain('pagina=3');
  });

  it('recurso no paginable: parte la ventana cuando trae más de 100 filas', async () => {
    // La primera consulta (rango completo) dice 160 filas; las sub-ventanas traen 80 cada una.
    let llamada = 0;
    const e = entorno(() => (llamada++ === 0 ? ok(160) : ok(80)));
    let filas = 0;
    await sincronizarRango(new EffiClient(e.opciones), cuenta, 'hist', a, a + DIA_MS, async () => {
      filas += 80;
      return 80;
    });
    // 1 consulta completa + 2 mitades + el último segundo (los extremos son inclusivos).
    expect(e.urls.length).toBe(4);
    expect(filas).toBe(240);
    expect(e.urls.every((u) => u.includes('cambio_estado_desde='))).toBe(true);
  });

  it('ventana vacía no llama a la ingesta', async () => {
    const e = entorno([ok(0)]);
    let llamadas = 0;
    const n = await sincronizarRango(new EffiClient(e.opciones), cuenta, 'guias', a, a + DIA_MS, async () => ++llamadas);
    expect(n).toBe(0);
    expect(llamadas).toBe(0);
  });
});
