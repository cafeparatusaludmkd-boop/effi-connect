import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE = fileURLToPath(new URL('..', import.meta.url));
const MIGRACIONES = join(SUPABASE, 'migrations');

// Lo mínimo de Supabase que las migraciones dan por existente. PGlite no trae pg_cron ni pg_net: se simulan con stubs.
const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

-- Como hace Supabase: lo que se cree en public queda accesible a los tres roles de la API.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, coalesce(new_description, '')) returning id into v;
  return v;
end $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language plpgsql as $$
begin
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description), updated_at = now() where id = secret_id;
end $$;

create schema extensions;
create function extensions.gen_random_bytes(n integer) returns bytea language plpgsql as $$
declare s text := '';
begin
  while length(s) < n * 2 loop s := s || md5(random()::text || clock_timestamp()::text); end loop;
  return decode(substr(s, 1, n * 2), 'hex');
end $$;

create schema cron;
create table cron.job (
  jobid bigserial primary key, schedule text not null, command text not null, nodename text default 'localhost',
  nodeport int default 5432, database text default 'postgres', username text default 'postgres',
  active boolean not null default true, jobname text unique
);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid into v;
  return v;
end $$;
create function cron.schedule(schedule text, command text) returns bigint language sql as $$
  insert into cron.job (schedule, command) values (schedule, command) returning jobid
$$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
begin delete from cron.job where jobname = job_name; return found; end $$;
create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null,
  username text default null, active boolean default null) returns void language sql as $$
  update cron.job set schedule = coalesce(alter_job.schedule, cron.job.schedule), command = coalesce(alter_job.command, cron.job.command),
    active = coalesce(alter_job.active, cron.job.active) where jobid = job_id
$$;

create schema net;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;
create function net.http_get(url text, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;
`;

const archivos = readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort();

function leer(f: string): string {
  let sql = readFileSync(join(MIGRACIONES, f), 'utf8');
  // PGlite no trae pg_cron ni pg_net: sus schemas ya existen como stubs, así que se quitan los "create extension" en memoria
  // (los archivos no se tocan).
  sql = sql.replace(/create\s+extension\s+(if\s+not\s+exists\s+)?"?(pg_cron|pg_net)"?[^;]*;/gi, '');
  return sql;
}

let db: PGlite;

async function como<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

describe('migraciones de Supabase', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    for (const f of archivos) {
      try {
        await db.exec(leer(f));
      } catch (e) {
        throw new Error(`Falló la migración ${f}: ${(e as Error).message}`);
      }
    }
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it('hay migraciones y se aplican todas en orden sobre una base vacía', async () => {
    expect(archivos.length).toBeGreaterThan(70);
    const r = await db.query<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'public'");
    expect(r.rows[0].n).toBeGreaterThan(20);
  });

  it('no deja tablas, vistas ni funciones con "dropi" en el nombre', async () => {
    const r = await db.query<{ nombre: string }>(`
      select c.relname as nombre from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname ilike '%dropi%'
      union all
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname ilike '%dropi%'`);
    expect(r.rows).toEqual([]);
  });

  it('ninguna función pública menciona Dropi en su cuerpo', async () => {
    const r = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc ilike '%dropi%'`);
    expect(r.rows).toEqual([]);
  });

  it('todas las tablas de public tienen RLS habilitado', async () => {
    const r = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1",
    );
    expect(r.rows).toEqual([]);
  });

  // La lista de nombres a vigilar (clientes, IDs de Effi, proyectos) NO va en el repo público: se lee de
  // supabase/test/.prohibidos.txt (ignorado por git), una palabra o regex por línea. Sin ese archivo solo se vigila Dropi.
  it('ni migraciones, funciones ni generador mencionan clientes reales ni proyectos concretos', () => {
    const archivoLocal = join(SUPABASE, 'test', '.prohibidos.txt');
    const locales = existsSync(archivoLocal)
      ? readFileSync(archivoLocal, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      : [];
    const prohibido = new RegExp(['dropi', ...locales].join('|'), 'i');
    const archivosTexto: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === 'test') continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) recorrer(p);
        else archivosTexto.push(p);
      }
    };
    recorrer(SUPABASE);
    const hallazgos: string[] = [];
    for (const p of archivosTexto) {
      const t = readFileSync(p, 'utf8');
      const nombre = p.slice(SUPABASE.length);
      if (prohibido.test(nombre)) hallazgos.push(`nombre: ${nombre}`);
      t.split('\n').forEach((l, i) => {
        if (prohibido.test(l)) hallazgos.push(`${nombre}:${i + 1}: ${l.trim().slice(0, 100)}`);
      });
    }
    expect(hallazgos).toEqual([]);
  });

  it('el SQL no deja cuentas ni sociedades de ejemplo sembradas', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int as n from public.effi_accounts');
    expect(r.rows[0].n).toBe(0);
  });

  describe('permisos por cuenta (SECURITY DEFINER)', () => {
    const dueno = '00000000-0000-0000-0000-000000000001';
    const sinAcceso = '00000000-0000-0000-0000-000000000002';
    const conAcceso = '00000000-0000-0000-0000-000000000003';

    beforeAll(async () => {
      // El primer usuario queda como dueño por el trigger app_nuevo_usuario.
      await db.query("insert into auth.users (id, email) values ($1, 'dueno@example.com'), ($2, 'sin@example.com'), ($3, 'con@example.com')", [
        dueno,
        sinAcceso,
        conAcceso,
      ]);
      await db.exec(`
        insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, empresa_id) values
          ('T_UNO', 'Tienda de prueba', 'tienda', 'GT', 'GTQ', 1),
          ('P_UNO', 'Proveeduría de prueba', 'proveeduria', 'GT', 'GTQ', 2);
        update public.app_usuarios set rol = 'empleado', activo = true where user_id = '${conAcceso}';
        insert into public.app_permisos (user_id, cuenta, modulos) values
          ('${conAcceso}', 'T_UNO', array['automatizacion']),
          ('${conAcceso}', 'P_UNO', array['resumen']);
      `);
    });

    it('una tienda nueva entra a la vigilancia del agente (auto_config) y la creación sigue apagada', async () => {
      const r = await db.query<{ modo: string; creacion_habilitada: boolean }>(
        "select modo, creacion_habilitada from public.auto_config where cuenta = 'T_UNO'",
      );
      expect(r.rows).toEqual([{ modo: 'vigilar', creacion_habilitada: false }]);
      const h = await db.query<{ ok: boolean }>("select public.auto_creacion_habilitada('T_UNO') as ok");
      expect(h.rows[0].ok).toBe(false);
    });

    it('auto_lista: sin acceso a la cuenta no devuelve la config', async () => {
      const q = () => db.query<{ modo: string | null; n: number }>(
        "select public.auto_lista('T_UNO', 3) -> 'config' ->> 'modo' as modo, jsonb_array_length(public.auto_lista('T_UNO', 3) -> 'ordenes') as n",
      );
      const sin = await como(sinAcceso, q);
      expect(sin.rows[0].modo).toBeNull();
      const anon = await como(null, q);
      expect(anon.rows[0].modo).toBeNull();
      const con = await como(conAcceso, q);
      expect(con.rows[0].modo).toBe('vigilar');
      const owner = await como(dueno, q);
      expect(owner.rows[0].modo).toBe('vigilar');
    });

    it('auto_lista: el acceso a otra cuenta no abre la config de esta', async () => {
      // conAcceso solo tiene el módulo "resumen" en P_UNO: no debe ver nada de automatización allí.
      const r = await como(conAcceso, () => db.query<{ modo: string | null }>(
        "select public.auto_lista('P_UNO', 3) -> 'config' ->> 'modo' as modo",
      ));
      expect(r.rows[0].modo).toBeNull();
    });

    it('prov_datos: sin acceso no devuelve el avance de carga de la proveeduría', async () => {
      const q = () => db.query<{ carga: string }>("select (public.prov_datos('P_UNO', '2026-01-01', '2026-01-31') -> 'carga')::text as carga");
      const sin = await como(sinAcceso, q);
      expect(sin.rows[0].carga).toBe('null');
      const owner = await como(dueno, q);
      expect(owner.rows[0].carga).toContain('avance');
    });

    it('la creación de remisiones exige creación habilitada en la cuenta (no un slug fijo)', async () => {
      await expect(
        como(dueno, () => db.query("select public.auto_cambiar_modo('T_UNO', 'automatico')")),
      ).rejects.toThrow(/no está habilitado/);
      await db.exec("update public.auto_config set creacion_habilitada = true where cuenta = 'T_UNO'");
      await como(dueno, () => db.query("select public.auto_cambiar_modo('T_UNO', 'automatico')"));
      const r = await db.query<{ modo: string }>("select modo from public.auto_config where cuenta = 'T_UNO'");
      expect(r.rows[0].modo).toBe('automatico');
    });
  });

  describe('permisos por módulo', () => {
    const dueno = '00000000-0000-0000-0000-000000000001';
    const soloNovedades = '00000000-0000-0000-0000-000000000011';
    const conResumen = '00000000-0000-0000-0000-000000000012';
    const socio = '00000000-0000-0000-0000-000000000013';
    // "Hoy" en la zona de la tienda (tz_offset_min por defecto: −300), no en UTC: después de las 7 p. m. en Colombia
    // la fecha UTC ya es mañana y el filtro por día no encontraría la guía.
    const hoy = new Date(Date.now() - 300 * 60_000).toISOString().slice(0, 10);
    const mes = hoy.slice(0, 8) + '01';

    beforeAll(async () => {
      await db.query(
        "insert into auth.users (id, email) values ($1, 'nov@example.com'), ($2, 'res@example.com'), ($3, 'socio@example.com')",
        [soloNovedades, conResumen, socio],
      );
      await db.exec(`
        insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, empresa_id) values ('T_MOD', 'Tienda módulos', 'tienda', 'GT', 'GTQ', 3);
        update public.app_usuarios set rol = 'empleado', activo = true where user_id in ('${soloNovedades}', '${conResumen}');
        update public.app_usuarios set rol = 'socio', sociedades = array['Principal'] where user_id = '${socio}';
        insert into public.app_permisos (user_id, cuenta, modulos) values
          ('${soloNovedades}', 'T_MOD', array['novedades']),
          ('${conResumen}', 'T_MOD', array['resumen']);
        insert into public.effi_guias (cuenta, empresa, sucursal, id, guia, fecha_trans, est_guia_efficommerce, valor_declarado)
          values ('T_MOD', 3, 1, 1, 'G1', now(), 2, 100);
        insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop) values ('T_MOD', '${hoy}', 'ads1', 5000);
        insert into public.app_gastos_mensuales (cuenta, mes, tipo, concepto, monto) values ('T_MOD', '${mes}', 'apps', 'herramienta', 700);
      `);
    });

    const despachados = (u: string) =>
      como(u, async () => {
        const r = await db.query<{ n: number }>(`select (public.kpi_despacho('T_MOD', '${hoy}', '${hoy}') -> 'despachado' ->> 'n')::int as n`);
        return r.rows[0].n;
      });
    const utilidad = (u: string) =>
      como(u, async () => {
        const r = await db.query<{ pub: string | null; apps: string }>(
          `select public.kpi_utilidad('T_MOD', '${hoy}', '${hoy}') -> 'publicidad' ->> 'cop' as pub,
                  public.kpi_utilidad('T_MOD', '${hoy}', '${hoy}') -> 'gastos' -> 'apps' ->> 'total' as apps`,
        );
        return r.rows[0];
      });
    const filasPublicidad = (u: string) =>
      como(u, async () => {
        const r = await db.query<{ a: number; b: number }>(
          "select (select count(*) from public.app_publicidad_diaria)::int as a, (select count(*) from public.app_gastos_mensuales)::int as b",
        );
        return r.rows[0];
      });

    it('empleado con solo "novedades": no obtiene kpi_despacho, kpi_utilidad ni publicidad de la cuenta', async () => {
      expect(await despachados(soloNovedades)).toBe(0);
      const u = await utilidad(soloNovedades);
      expect(Number(u.pub ?? 0)).toBe(0);
      expect(Number(u.apps)).toBe(0);
      expect(await filasPublicidad(soloNovedades)).toEqual({ a: 0, b: 0 });
    });

    it('empleado con "resumen" sí ve esos datos', async () => {
      expect(await despachados(conResumen)).toBe(1);
      const u = await utilidad(conResumen);
      expect(Number(u.pub)).toBe(5000);
      expect(Number(u.apps)).toBe(700);
      // Las tablas de publicidad son solo de dueño y socios, aunque el empleado tenga "resumen"; los gastos sí los ve.
      expect(await filasPublicidad(conResumen)).toEqual({ a: 0, b: 1 });
    });

    it('dueño y socio siguen viendo todo', async () => {
      for (const u of [dueno, socio]) {
        expect(await despachados(u)).toBe(1);
        expect(Number((await utilidad(u)).pub)).toBe(5000);
        expect(await filasPublicidad(u)).toEqual({ a: 1, b: 1 });
      }
    });

    it('app_cuentas_visibles_en es la unión de los módulos y no la puede ejecutar anon', async () => {
      const r = await como(conResumen, () => db.query<{ v: string[] }>("select public.app_cuentas_visibles_en(array['resumen', 'novedades']) as v"));
      expect(r.rows[0].v).toEqual(['T_MOD']);
      const n = await como(soloNovedades, () => db.query<{ v: string[] }>("select public.app_cuentas_visibles_en(array['resumen', 'dinero']) as v"));
      expect(n.rows[0].v).toEqual([]);
      const g = await db.query<{ ok: boolean }>("select has_function_privilege('anon', 'public.app_cuentas_visibles_en(text[])', 'execute') as ok");
      expect(g.rows[0].ok).toBe(false);
    });

    it('En vivo: con solo "guias" la operación sale pero los campos de dinero salen en 0/false; con "dinero" o "resumen" salen llenos', async () => {
      const soloGuias = '00000000-0000-0000-0000-000000000014';
      const conDinero = '00000000-0000-0000-0000-000000000015';
      await db.query("insert into auth.users (id, email) values ($1, 'guias@example.com'), ($2, 'dinero@example.com')", [soloGuias, conDinero]);
      await db.exec(`
        update public.app_usuarios set rol = 'empleado', activo = true where user_id in ('${soloGuias}', '${conDinero}');
        insert into public.app_permisos (user_id, cuenta, modulos) values
          ('${soloGuias}', 'T_MOD', array['guias']), ('${conDinero}', 'T_MOD', array['guias', 'dinero']);
        insert into public.effi_wallet (cuenta, id, t_movimiento, valor, vigente, fecha_trans) values ('T_MOD', 1, 1, 300, true, now());
        insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new, est_guia_new_efficommerce)
          values ('T_MOD', 3, 1, 1, now(), false, 2, 2);
        update public.effi_guias set valor_recaudo = 100, fecha_recaudo = now() where cuenta = 'T_MOD' and id = 1;
      `);
      const leer = (u: string) =>
        como(u, async () => {
          const r = await db.query<{ recaudo: string; pagos: string; eventos: number; valor: string; pagada: boolean; ops: number }>(
            `with v as (select public.envivo_vivo(array['T_MOD'], 60) as j)
             select (j -> 'pulso' -> 'cuentas' -> 0 ->> 'recaudo_hoy') as recaudo, (j -> 'pulso' -> 'cuentas' -> 0 ->> 'pagos_hoy') as pagos,
                    jsonb_array_length(j -> 'eventos') as eventos, (j -> 'eventos' -> 0 ->> 'valor_recaudo') as valor,
                    (j -> 'eventos' -> 0 ->> 'pagada')::boolean as pagada,
                    (select count(*) from jsonb_each(j -> 'pulso' -> 'cuentas' -> 0 -> 'hoy'))::int as ops
             from v`,
          );
          return r.rows[0];
        });
      const sin = await leer(soloGuias);
      expect(sin.eventos).toBe(1);
      expect(Number(sin.recaudo)).toBe(0);
      expect(Number(sin.pagos)).toBe(0);
      expect(Number(sin.valor)).toBe(0);
      expect(sin.pagada).toBe(false);
      for (const u of [conDinero, conResumen, dueno, socio]) {
        const con = await leer(u);
        if (u === conResumen) {
          // "resumen" no incluye "guias": no ve En vivo, pero si lo viera el dinero saldría lleno (ver app_cuentas_visibles_en).
          expect(con.eventos).toBe(0);
          continue;
        }
        expect(Number(con.recaudo)).toBe(300);
        expect(Number(con.pagos)).toBe(1);
        expect(Number(con.valor)).toBe(100);
        expect(con.pagada).toBe(true);
      }
    });

    it('ninguna función ni política pública usa app_cuentas_visibles() sin módulo', async () => {
      const f = await db.query<{ proname: string }>(
        "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~ 'app_cuentas_visibles[(][)]'",
      );
      expect(f.rows).toEqual([]);
      const p = await db.query<{ policyname: string }>(
        "select policyname from pg_policies where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'app_cuentas_visibles[(][)]'",
      );
      expect(p.rows).toEqual([]);
    });
  });

  describe('effi_ingest (lo que guarda el sync de Effi)', () => {
    const resp = (data: unknown[]) => JSON.stringify({ ok: true, data, paginacion: { total: data.length, total_paginas: 1 } });
    const ingest = async (recurso: string, data: unknown[]) =>
      (await db.query<{ n: number }>('select public.effi_ingest($1, $2, $3::jsonb) as n', ['TIENDA_ING', recurso, resp(data)])).rows[0]!.n;

    beforeAll(async () => {
      await db.exec(`insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, tz_offset_min) values ('TIENDA_ING', 'Ingesta', 'tienda', 'CO', 'COP', -300)`);
    });

    it('guarda guías, quita campos vacíos y toma la empresa de la primera guía', async () => {
      const g = { id: 1, empresa: 555, sucursal: 1, guia: '9001', recaudo: 1, valor_recaudo: '89900.00', fecha_trans: '2026-10-20 15:00:00', fecha_estado_final: '' };
      expect(await ingest('guias', [g])).toBe(1);
      expect(await ingest('guias', [g])).toBe(1); // upsert: actualiza, no duplica
      const r = await db.query<{ n: number; empresa: string; utc: string }>(
        `select (select count(*)::int from public.effi_guias where cuenta = 'TIENDA_ING') n,
                (select empresa_id::text from public.effi_accounts where slug = 'TIENDA_ING') empresa,
                (select to_char(fecha_trans at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.effi_guias where cuenta = 'TIENDA_ING') utc`);
      expect(r.rows[0]).toEqual({ n: 1, empresa: '555', utc: '2026-10-20 15:00' });
    });

    it('guarda el historial (id → id_guia, empresa de la cuenta), no lo duplica y actualiza el último cambio', async () => {
      const h = { id: 1, sucursal: 1, fecha_hist_est: '2026-10-22 08:30:00', guia_inicial_adicional: 1, est_guia_new: 4, estado_new: 'Entregada', guia: '9001' };
      expect(await ingest('hist', [h])).toBe(1);
      expect(await ingest('hist', [h])).toBe(0);
      const r = await db.query<{ u: string }>(`select to_char(ultimo_cambio_estado at time zone 'UTC', 'YYYY-MM-DD HH24:MI') u from public.effi_guias where cuenta = 'TIENDA_ING'`);
      expect(r.rows[0]!.u).toBe('2026-10-22 08:30');
    });

    it('guarda wallet y novedades, y rechaza recursos o cuentas desconocidas', async () => {
      expect(await ingest('wallet', [{ id: 77, t_movimiento: 1, tipo_movimiento: 'Recaudo de venta', valor: '89900.00', guia_inicial: '9001', fecha_trans: '2026-10-23 10:00:00' }])).toBe(1);
      expect(await ingest('novedades_2', [{ id: 5, empresa: 555, guia: '9001', estado_novedad: 'Abierta' }])).toBe(1);
      await expect(ingest('otra_cosa', [{ id: 1 }])).rejects.toThrow(/Recurso desconocido/);
      await expect(db.query(`select public.effi_ingest('NO_EXISTE', 'guias', '{"data":[]}')`)).rejects.toThrow(/Cuenta desconocida/);
    });

    it('un usuario con sesión no puede llamarla', async () => {
      await expect(como(null, () => db.query(`select public.effi_ingest('TIENDA_ING', 'guias', '{"data":[]}')`))).rejects.toThrow(/permission denied/);
    });

    it('deja programados el sync cada minuto y el refresco de resúmenes activo', async () => {
      const r = await db.query<{ jobname: string; active: boolean }>(`select jobname, active from cron.job where jobname in ('effi-sync', 'effi-resumenes') order by 1`);
      expect(r.rows).toEqual([{ jobname: 'effi-resumenes', active: true }, { jobname: 'effi-sync', active: true }]);
      const ag = await db.query<{ jobname: string }>(`select jobname from cron.job where jobname in ('auto-vigilancia', 'auto-convertir') order by 1`);
      expect(ag.rows.map((x) => x.jobname)).toEqual(['auto-convertir', 'auto-vigilancia']);
    });
  });

  describe('script conectar-cuenta-effi.sql', () => {
    const script = readFileSync(join(SUPABASE, 'scripts', 'conectar-cuenta-effi.sql'), 'utf8');

    it('sin API key no hace nada y avisa', async () => {
      await expect(db.exec(script)).rejects.toThrow(/Pega tu API key/);
    });

    it('con la key crea la cuenta, guarda la key en Vault, encola la historia y apaga la demo', async () => {
      await db.exec(`insert into public.effi_accounts (slug, nombre, tipo, pais, divisa) values ('DEMO_X_CO', 'demo', 'tienda', 'CO', 'COP')`);
      const sql = script
        .replace("'PEGA_AQUI_TU_API_KEY';", "'clave-de-prueba-0123456789-abcdef';")
        .replace("'TIENDA_CO';", "'TIENDA_SCRIPT_GT';")
        .replace("v_pais         text    := 'CO';", "v_pais         text    := 'GT';");
      await db.exec(sql);
      const r = await db.query<Record<string, unknown>>(`
        select (select divisa from public.effi_accounts where slug = 'TIENDA_SCRIPT_GT') divisa,
               (select tz_offset_min from public.effi_accounts where slug = 'TIENDA_SCRIPT_GT') tz,
               (select count(*)::int from vault.decrypted_secrets where name = 'effi_api_key_TIENDA_SCRIPT_GT' and decrypted_secret = 'clave-de-prueba-0123456789-abcdef') key,
               (select string_agg(recurso, ',' order by id) from public.effi_sync_jobs where cuenta = 'TIENDA_SCRIPT_GT') jobs,
               (select activa from public.effi_accounts where slug = 'DEMO_X_CO') demo_activa`);
      expect(r.rows[0]).toEqual({ divisa: 'GTQ', tz: -360, key: 1, jobs: 'guias,hist,wallet,novedades_1,novedades_2', demo_activa: false });
      // Correrlo otra vez (p. ej. al renovar la key) no duplica la carga histórica.
      await db.exec(sql);
      const j = await db.query<{ n: number }>(`select count(*)::int n from public.effi_sync_jobs where cuenta = 'TIENDA_SCRIPT_GT'`);
      expect(j.rows[0]!.n).toBe(5);
    });
  });

  describe('effi_renombrar_cuenta', () => {
    it('mueve guías, historial, sync y la API key al nombre nuevo y borra el viejo', async () => {
      await db.exec(`
        insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, empresa_id) values ('REN_EFFI', 'Ren', 'tienda', 'CO', 'COP', 7);
        insert into public.effi_guias (cuenta, empresa, sucursal, id, guia) values ('REN_EFFI', 7, 1, 1, 'R1');
        insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new) values ('REN_EFFI', 7, 1, 1, now(), true, 2);
        insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc) values ('REN_EFFI', 'guias', now() - interval '1 day', now(), now() - interval '1 day');
        select public.effi_set_api_key('REN_EFFI', 'clave-de-prueba-renombrar-123456');
      `);
      await db.exec(`select public.effi_renombrar_cuenta('REN_EFFI', 'REN_CO')`);
      const r = await db.query<Record<string, unknown>>(`
        select (select count(*)::int from public.effi_accounts where slug = 'REN_EFFI') viejo,
               (select empresa_id::int from public.effi_accounts where slug = 'REN_CO') empresa,
               (select count(*)::int from public.effi_guias where cuenta = 'REN_CO') guias,
               (select count(*)::int from public.effi_guia_estados where cuenta = 'REN_CO') estados,
               (select count(*)::int from public.effi_sync_jobs where cuenta = 'REN_CO') jobs,
               (select count(*)::int from vault.decrypted_secrets where name = 'effi_api_key_REN_CO' and decrypted_secret = 'clave-de-prueba-renombrar-123456') key,
               (select bloqueado_hasta = '-infinity' from public.effi_sync_lock) candado_libre`);
      expect(r.rows[0]).toEqual({ viejo: 0, empresa: 7, guias: 1, estados: 1, jobs: 1, key: 1, candado_libre: true });
    });

    it('rechaza nombres inválidos o ya usados', async () => {
      await expect(db.exec(`select public.effi_renombrar_cuenta('REN_CO', 'minusculas')`)).rejects.toThrow(/MAYÚSCULAS/);
      await expect(db.exec(`select public.effi_renombrar_cuenta('NO_EXISTE_CO', 'OTRA_CO')`)).rejects.toThrow(/desconocida/);
    });

    it('el script de conexión exige que el nombre termine en el país', async () => {
      const script = readFileSync(join(SUPABASE, 'scripts', 'conectar-cuenta-effi.sql'), 'utf8')
        .replace("'PEGA_AQUI_TU_API_KEY';", "'clave-de-prueba-0123456789-abcdef';")
        .replace("'TIENDA_CO';", "'MI_MARCA_EFFI';");
      await expect(db.exec(script)).rejects.toThrow(/debe terminar en _CO/);
    });

    it('un usuario con sesión no puede renombrar cuentas', async () => {
      await expect(como(null, () => db.query(`select public.effi_renombrar_cuenta('REN_CO', 'REN2_CO')`))).rejects.toThrow(/permission denied/);
    });
  });

  describe('tiempo real (envivo_senales)', () => {
    it('una ingesta de varias filas deja una sola señal por cuenta', async () => {
      await db.exec(`insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, empresa_id) values ('RT_CO', 'RT', 'tienda', 'CO', 'COP', 9)`);
      await db.exec(`insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new)
        values ('RT_CO', 9, 1, 1, now(), true, 2), ('RT_CO', 9, 1, 2, now(), true, 4)`);
      const r = await db.query<{ n: number }>(`select count(*)::int n from public.envivo_senales where cuenta = 'RT_CO'`);
      expect(r.rows[0]!.n).toBe(1);
    });

    it('las órdenes del agente también marcan la cuenta', async () => {
      await db.exec(`delete from public.envivo_senales where cuenta = 'RT_CO'`);
      await db.exec(`insert into public.auto_ordenes (cuenta, sucursal, id, fecha_orden) values ('RT_CO', 1, 77, now())`);
      const r = await db.query<{ n: number }>(`select count(*)::int n from public.envivo_senales where cuenta = 'RT_CO'`);
      expect(r.rows[0]!.n).toBe(1);
    });

    it('un usuario sin acceso a la cuenta no ve su señal', async () => {
      const r = await como('00000000-0000-0000-0000-0000000000ee', () => db.query(`select * from public.envivo_senales where cuenta = 'RT_CO'`));
      expect(r.rows).toEqual([]);
    });

    it('las funciones del webhook solo las usa el servidor', async () => {
      for (const f of [`effi_sync_token_valor()`, `effi_webhook_secreto('RT_CO', 'guia_transporte.tracking')`,
        `effi_set_webhook_secreto('RT_CO', 'guia_transporte.tracking', 'x')`]) {
        await expect(como(null, () => db.query(`select public.${f}`))).rejects.toThrow(/permission denied/);
      }
    });

    it('guarda y lee el secreto de un webhook', async () => {
      await db.exec(`select public.effi_set_webhook_secreto('RT_CO', 'guia_transporte.tracking', 'secreto-de-prueba-64')`);
      const r = await db.query<{ s: string }>(`select public.effi_webhook_secreto('RT_CO', 'guia_transporte.tracking') s`);
      expect(r.rows[0]!.s).toBe('secreto-de-prueba-64');
      await expect(db.exec(`select public.effi_set_webhook_secreto('RT_CO', 'evento raro', 'x')`)).rejects.toThrow(/Evento inválido/);
    });

    it('con un secreto guardado, la cuenta exige firma en todos sus avisos', async () => {
      const r = await db.query<{ rt: boolean; otra: boolean }>(
        `select public.effi_webhook_requiere_firma('RT_CO') rt, public.effi_webhook_requiere_firma('RT_OTRA_CO') otra`);
      expect(r.rows[0]).toEqual({ rt: true, otra: false });
      await expect(como(null, () => db.query(`select public.effi_webhook_requiere_firma('RT_CO')`))).rejects.toThrow(/permission denied/);
    });

    it('el freno del webhook deja pasar un disparo por clave cada N segundos', async () => {
      const reservar = async (c: string) => (await db.query<{ ok: boolean }>(`select public.effi_webhook_reservar($1, 5) ok`, [c])).rows[0]!.ok;
      expect(await reservar('sync')).toBe(true);
      expect(await reservar('sync')).toBe(false);
      expect(await reservar('vigilar:RT_CO')).toBe(true);
      await db.exec(`update public.effi_webhook_cooldown set ultimo = now() - interval '6 seconds' where clave = 'sync'`);
      expect(await reservar('sync')).toBe(true);
      await expect(como(null, () => db.query(`select public.effi_webhook_reservar('sync', 5)`))).rejects.toThrow(/permission denied/);
    });

    it('la vigilancia de órdenes corre cada minuto', async () => {
      const r = await db.query<{ schedule: string }>(`select schedule from cron.job where jobname = 'auto-vigilancia'`);
      expect(r.rows[0]!.schedule).toBe('* * * * *');
    });
  });
});
