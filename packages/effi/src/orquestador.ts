// Una corrida del sync para una cuenta: (1) incremental de cada recurso desde su cursor, con
// solape, y (2) con el tiempo que sobre, avanza las cargas históricas pendientes.
// No sabe nada de Supabase: el almacén se inyecta (en producción, PostgREST; en tests, memoria).

import { EffiClient, PresupuestoAgotado } from './cliente.ts';
import { DIA_MS } from './fechas.ts';
import { RECURSOS, type NombreRecurso } from './recursos.ts';
import { sincronizarRango, type CuentaSync } from './sync.ts';

export const INCREMENTALES: NombreRecurso[] = ['hist', 'wallet', 'guias', 'novedades_1', 'novedades_2', 'ordenes'];
export const SOLAPE_MS = 10 * 60_000;
/** Primera corrida de una cuenta: solo las últimas 2 horas (la historia la traen las cargas históricas). */
export const ARRANQUE_MS = 2 * 3600_000;
/** Si el cursor está más atrasado que esto, se recorta: lo viejo se recupera con una carga histórica. */
export const ATRASO_MAX_MS = 30 * DIA_MS;

export interface CargaHistorica {
  id: number;
  recurso: string;
  hastaUtc: number;
  avanceUtc: number;
  filas: number;
}

export interface AlmacenSync {
  cursores(accountId: string): Promise<Partial<Record<string, number>>>;
  guardarEstado(
    accountId: string,
    recurso: string,
    estado: { cursorUtc?: number; filas?: number; error: string | null },
  ): Promise<void>;
  cargasPendientes(accountId: string): Promise<CargaHistorica[]>;
  actualizarCarga(
    id: number,
    cambio: { avanceUtc?: number; filas?: number; listo?: boolean; error?: string | null; /** No se puede completar: no se reintenta. */ fallida?: boolean },
  ): Promise<void>;
  ingerir(accountId: string, recurso: NombreRecurso, raw: string): Promise<number>;
}

export interface CuentaParaSync extends CuentaSync {
  accountId: string;
}

export interface ResumenCuenta {
  incremental: Partial<Record<NombreRecurso, number | string>>;
  cargas: { id: number; recurso: string; listo: boolean; filas: number }[];
  avisos: string[];
  tiempoAgotado?: boolean;
  error?: string;
  peticiones: number;
}

const esRecurso = (r: string): r is NombreRecurso => r in RECURSOS;

export async function corridaCuenta(api: EffiClient, cuenta: CuentaParaSync, almacen: AlmacenSync, ahora = Date.now()): Promise<ResumenCuenta> {
  const r: ResumenCuenta = { incremental: {}, cargas: [], avisos: [], peticiones: 0 };
  const ingesta = (recurso: NombreRecurso, raw: string) => almacen.ingerir(cuenta.accountId, recurso, raw);
  try {
    // 1. Incremental
    const cursores = await almacen.cursores(cuenta.accountId);
    for (const nombre of INCREMENTALES) {
      const cursor = cursores[nombre];
      const desde = Math.max(cursor != null ? cursor - SOLAPE_MS : ahora - ARRANQUE_MS, ahora - ATRASO_MAX_MS);
      try {
        const n = await sincronizarRango(api, cuenta, nombre, desde, ahora, ingesta, r.avisos);
        await almacen.guardarEstado(cuenta.accountId, nombre, { cursorUtc: ahora, filas: n, error: null });
        r.incremental[nombre] = n;
      } catch (e) {
        if (e instanceof PresupuestoAgotado) throw e;
        // Un recurso que falla no frena a los demás; el cursor no avanza y se reintenta en la próxima corrida.
        await almacen.guardarEstado(cuenta.accountId, nombre, { error: String(e).slice(0, 500) });
        r.incremental[nombre] = `error: ${e}`;
      }
    }

    // 2. Cargas históricas
    for (const carga of await almacen.cargasPendientes(cuenta.accountId)) {
      if (!esRecurso(carga.recurso)) {
        await almacen.actualizarCarga(carga.id, { error: 'recurso desconocido', fallida: true });
        continue;
      }
      const tramo = RECURSOS[carga.recurso].tramoHistoricoMs;
      let { avanceUtc, filas } = carga;
      try {
        while (avanceUtc < carga.hastaUtc) {
          const fin = Math.min(avanceUtc + tramo, carga.hastaUtc);
          filas += await sincronizarRango(api, cuenta, carga.recurso, avanceUtc, fin, ingesta, r.avisos);
          avanceUtc = fin;
          await almacen.actualizarCarga(carga.id, { avanceUtc, filas, error: null, listo: avanceUtc >= carga.hastaUtc });
        }
        r.cargas.push({ id: carga.id, recurso: carga.recurso, listo: true, filas });
      } catch (e) {
        r.cargas.push({ id: carga.id, recurso: carga.recurso, listo: false, filas });
        if (e instanceof PresupuestoAgotado) throw e;
        await almacen.actualizarCarga(carga.id, { error: String(e).slice(0, 500) });
      }
    }
  } catch (e) {
    if (e instanceof PresupuestoAgotado) r.tiempoAgotado = true;
    else r.error = String(e);
  }
  r.peticiones = api.peticiones;
  return r;
}
