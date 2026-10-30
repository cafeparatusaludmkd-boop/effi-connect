#!/usr/bin/env node
// Genera el SQL para conectar una cuenta de Effi a Effi Connect, SIN la API key.
// La key se pega a mano en el SQL Editor de Supabase (nunca pasa por el chat ni por git).
//
// Uso: node scripts/generar-sql-cuenta.mjs --pais CO --perfil marca-propia --slug TIENDA_CO --nombre "Mi tienda Colombia" [--dias 60]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TRABAJO, argumentos, leerJson, CUENTA_RE } from './lib.mjs';

const a = argumentos();
const paises = leerJson('perfiles/paises.json');
const perfiles = leerJson('perfiles/perfiles.json');

const pais = String(a.pais ?? '').toUpperCase();
const perfil = perfiles[a.perfil];
const slug = String(a.slug ?? '').toUpperCase();
const nombre = String(a.nombre ?? '').replace(/'/g, "''");
const dias = Number(a.dias ?? 60);

const falla = (m) => { console.error(`Error: ${m}`); process.exit(1); };
if (!paises[pais]) falla(`--pais debe ser uno de ${Object.keys(paises).join(', ')}`);
if (!perfil) falla(`--perfil debe ser uno de ${Object.keys(perfiles).join(', ')}`);
if (!CUENTA_RE.test(slug)) falla('--slug solo admite MAYÚSCULAS, números y _ (3 a 32 caracteres)');
if (!slug.endsWith(`_${pais}`)) falla(`--slug debe terminar en _${pais} (ej. TIENDA_${pais})`);
if (!nombre) falla('--nombre es obligatorio');
if (!Number.isInteger(dias) || dias < 1 || dias > 365) falla('--dias debe ser un entero entre 1 y 365');

const sql = `-- Generado por Effi Connect. Pega esto en Supabase > SQL Editor > New query.
-- Reemplaza SOLO PEGA_AQUI_TU_API_KEY. Perfil: ${perfil.etiqueta}. País: ${paises[pais].nombre}.
do $$
declare
  v_api_key text := 'PEGA_AQUI_TU_API_KEY';
  v_slug text := '${slug}';
  v_nombre text := '${nombre}';
  v_tipo text := '${perfil.tipoCuentaEffi}';
  v_pais text := '${pais}';
  v_divisa text := '${paises[pais].divisa}';
  v_tz int := ${paises[pais].tzOffsetMin};
  v_dias int := ${dias};
begin
  if v_api_key = 'PEGA_AQUI_TU_API_KEY' or length(v_api_key) < 20 then
    raise exception 'Pega tu API key de Effi en v_api_key antes de correr el script.';
  end if;

  insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, tz_offset_min)
  values (v_slug, v_nombre, v_tipo, v_pais, v_divisa, true, v_tz)
  on conflict (slug) do update
    set nombre = excluded.nombre, tipo = excluded.tipo, pais = excluded.pais, divisa = excluded.divisa,
        activa = true, tz_offset_min = excluded.tz_offset_min;

  perform public.effi_set_api_key(v_slug, v_api_key);

  delete from public.effi_sync_jobs where cuenta = v_slug and estado = 'pendiente';
  insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
  select v_slug, r, now() - make_interval(days => v_dias), now(), now() - make_interval(days => v_dias)
  from unnest(array['guias', 'hist', 'wallet', 'novedades_1', 'novedades_2']) with ordinality as t(r, orden)
  order by orden;

  raise notice 'Cuenta % conectada. El sync corre cada minuto.', v_slug;
end $$;
`;

const dir = join(TRABAJO, 'salida');
mkdirSync(dir, { recursive: true });
const archivo = join(dir, `conectar-${slug}.sql`);
writeFileSync(archivo, sql);
console.log(`SQL escrito en ${archivo}`);
console.log('Ábrelo, pega tu API key donde dice PEGA_AQUI_TU_API_KEY y córrelo en el SQL Editor de Supabase.');
