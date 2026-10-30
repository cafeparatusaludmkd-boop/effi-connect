import { EffiClient, PAGINA_MAX } from './cliente.ts';
import { aHoraEmpresa, partirRango } from './fechas.ts';
import { RECURSOS, type NombreRecurso } from './recursos.ts';

/** Destino de cada respuesta cruda (en producción: rpc `effi_ingest` de Postgres). Devuelve filas guardadas. */
export type Ingesta = (recurso: NombreRecurso, raw: string) => Promise<number>;

export interface CuentaSync {
  /** Minutos respecto a UTC de la zona de la empresa (p. ej. -300 para Colombia). */
  tzOffsetMin: number;
}

/**
 * Trae y guarda todo lo del rango [a, b] (ms UTC) de un recurso.
 * Recursos no paginables: si la ventana trae más de 100 filas se parte en sub-ventanas (extremos inclusivos, separados 1 s).
 */
export async function sincronizarRango(
  api: EffiClient,
  cuenta: CuentaSync,
  nombre: NombreRecurso,
  a: number,
  b: number,
  ingesta: Ingesta,
  avisos: string[] = [],
): Promise<number> {
  let total = 0;
  for (const [x, y] of partirRango(a, b)) total += await ventana(api, cuenta, nombre, x, y, ingesta, avisos);
  return total;
}

async function ventana(api: EffiClient, cuenta: CuentaSync, nombre: NombreRecurso, a: number, b: number, ingesta: Ingesta, avisos: string[]): Promise<number> {
  const rec = RECURSOS[nombre];
  const params = {
    ...('extra' in rec ? rec.extra : {}),
    [rec.desde]: aHoraEmpresa(a, cuenta.tzOffsetMin),
    [rec.hasta]: aHoraEmpresa(b, cuenta.tzOffsetMin),
    por_pagina: PAGINA_MAX,
  };
  const primera = await api.get(rec.path, { ...params, pagina: 1 });
  if (primera.total <= PAGINA_MAX) return primera.total ? ingesta(nombre, primera.raw) : 0;

  if (rec.paginable) {
    let n = await ingesta(nombre, primera.raw);
    for (let p = 2; p <= primera.paginas; p++) n += await ingesta(nombre, (await api.get(rec.path, { ...params, pagina: p })).raw);
    return n;
  }

  if (b - a <= 60_000) {
    avisos.push(`${nombre}: ${primera.total} filas en 1 minuto (${aHoraEmpresa(a, cuenta.tzOffsetMin)}); se guardaron ${PAGINA_MAX}`);
    return ingesta(nombre, primera.raw);
  }
  const partes = Math.min(10, Math.ceil(primera.total / 80));
  const paso = Math.ceil((b - a) / partes / 1000) * 1000;
  let n = 0;
  for (let t = a; t <= b; t += paso) n += await ventana(api, cuenta, nombre, t, Math.min(t + paso - 1000, b), ingesta, avisos);
  return n;
}
