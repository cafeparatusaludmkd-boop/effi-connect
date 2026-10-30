// Cliente de la API REST de Effi (https://effi.com.co/api). Particularidades (docs/effi-api.md):
// - Autenticación: `Authorization: Bearer <API key>` de un usuario de Effi; vence a los 360 días.
// - 120 peticiones/min por API key: se espacian ≥ 550 ms y se respeta `Retry-After` en 429.
// - Respuesta `{ "ok": true, ..., "paginacion": { total, total_paginas } }`; por_pagina máximo 100.
// - El cuerpo se devuelve crudo (`raw`) para reenviarlo a Postgres sin parsear miles de filas aquí.

export class EffiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'EffiError';
  }
}

/** Se agotó el presupuesto de tiempo o de peticiones de la corrida: no es un error de Effi. */
export class PresupuestoAgotado extends Error {
  constructor() {
    super('Presupuesto de la corrida agotado');
    this.name = 'PresupuestoAgotado';
  }
}

export interface Pagina {
  raw: string;
  total: number;
  paginas: number;
}

export interface OpcionesCliente {
  apiKey: string;
  baseUrl?: string;
  /** Separación mínima entre peticiones de la misma key. */
  minGapMs?: number;
  /** Límite de peticiones de esta instancia (presupuesto por corrida). */
  maxPeticiones?: number;
  /** Instante (ms) a partir del cual no se hacen más peticiones. */
  deadline?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const PAGINA_MAX = 100;

export class EffiClient {
  private ultima = -Infinity;
  peticiones = 0;
  private readonly o: Required<Omit<OpcionesCliente, 'deadline'>> & { deadline: number };

  constructor(opciones: OpcionesCliente) {
    if (!opciones.apiKey) throw new Error('Falta la API key de Effi');
    this.o = {
      baseUrl: 'https://effi.com.co/api',
      minGapMs: 550,
      maxPeticiones: Infinity,
      deadline: Infinity,
      fetch: globalThis.fetch.bind(globalThis),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: Date.now,
      ...opciones,
    };
  }

  async get(path: string, params: Record<string, string | number> = {}): Promise<Pagina> {
    const { fetch, sleep, now } = this.o;
    for (let intento = 0; ; intento++) {
      if (now() > this.o.deadline || this.peticiones >= this.o.maxPeticiones) throw new PresupuestoAgotado();
      const espera = this.ultima + this.o.minGapMs - now();
      if (espera > 0) await sleep(espera);
      this.ultima = now();
      this.peticiones++;

      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      const res = await fetch(`${this.o.baseUrl}/${path}?${qs}`, {
        headers: { Authorization: `Bearer ${this.o.apiKey}`, Accept: 'application/json' },
      });
      const raw = await res.text();

      if (res.status === 429 && intento < 3) {
        await sleep(Math.min(Number(res.headers.get('retry-after') || 5), 20) * 1000);
        continue;
      }
      if (res.status >= 500 && intento < 2) {
        await sleep(2000);
        continue;
      }
      if (!res.ok || !/^\s*\{\s*"ok"\s*:\s*true/.test(raw)) {
        const mensaje = raw.match(/"mensaje"\s*:\s*"([^"]*)"/)?.[1] ?? raw.slice(0, 120);
        throw new EffiError(`${path} HTTP ${res.status}: ${mensaje}`, res.status);
      }
      // Solo se lee la paginación, no las filas.
      const pag = raw.match(/"paginacion"\s*:\s*(\{[^}]*\})/)?.[1];
      const p = pag ? JSON.parse(pag) : { total: 0, total_paginas: 1 };
      return { raw, total: Number(p.total), paginas: Number(p.total_paginas) };
    }
  }

  /** Recorre todas las páginas de un recurso paginable. */
  async *paginas(path: string, params: Record<string, string | number> = {}): AsyncGenerator<Pagina> {
    const primera = await this.get(path, { ...params, por_pagina: PAGINA_MAX, pagina: 1 });
    yield primera;
    for (let p = 2; p <= primera.paginas; p++) yield this.get(path, { ...params, por_pagina: PAGINA_MAX, pagina: p });
  }
}
