-- Cargas por archivo mientras no hay API: Meta (CSV por Business Manager). Los archivos se leen en el navegador;
-- aquí solo llega lo necesario (sin nombre, teléfono, correo ni dirección del cliente).

create table public.app_cargas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('meta_bm')),
  cuenta text references public.effi_accounts (slug),
  archivo text not null,
  filas integer not null default 0,
  resumen jsonb,
  usuario uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
comment on table public.app_cargas is 'Bitácora de archivos cargados en la Torre (Meta).';

create table public.app_publicidad_campanas (
  cuenta text not null references public.effi_accounts (slug),
  fecha date not null,
  cuenta_ads text not null,
  campana text not null,
  monto_cop numeric not null,
  carga_id bigint references public.app_cargas (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, fecha, cuenta_ads, campana)
);
comment on table public.app_publicidad_campanas is 'Gasto de Meta por día y campaña (CSV por BM). Alimenta app_publicidad_diaria.';

do $$
declare t text;
begin
  foreach t in array array['app_publicidad_campanas', 'app_cargas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles())::text[]) or (select public.app_es_owner()))', t || '_leer', t);
  end loop;
end $$;

-- Carga de un bloque de filas ya normalizadas en el navegador. Se llama por partes (p_carga = id de la primera).
create function public.app_cargar(p_tipo text, p_cuenta text, p_archivo text, p_filas jsonb, p_carga bigint default null, p_resumen jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_carga bigint := p_carga;
  v_n integer := jsonb_array_length(p_filas);
  v_omitidas integer := 0;
begin
  if not public.app_es_owner() then
    raise exception 'Solo el dueño puede cargar archivos';
  end if;
  if v_carga is null then
    insert into public.app_cargas (tipo, cuenta, archivo, resumen) values (p_tipo, p_cuenta, p_archivo, p_resumen) returning id into v_carga;
  end if;

  if p_tipo = 'meta_bm' then
    -- El país del CSV (país de entrega del anuncio) decide la tienda. Lo que no tenga tienda se omite y se informa.
    drop table if exists pg_temp._meta;
    create temp table _meta on commit drop as
    select a.slug as cuenta, r.fecha, r.cuenta_ads, r.campana, sum(r.monto_cop) as monto_cop
    from jsonb_to_recordset(p_filas) as r(pais text, fecha date, cuenta_ads text, campana text, monto_cop numeric)
    join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda'
    group by 1, 2, 3, 4;
    v_omitidas := v_n - (select count(*) from jsonb_to_recordset(p_filas) as r(pais text) join public.effi_accounts a on a.pais = r.pais and a.tipo = 'tienda');

    insert into public.app_publicidad_campanas as c (cuenta, fecha, cuenta_ads, campana, monto_cop, carga_id)
    select cuenta, fecha, cuenta_ads, campana, monto_cop, v_carga from pg_temp._meta
    on conflict (cuenta, fecha, cuenta_ads, campana) do update set monto_cop = excluded.monto_cop, carga_id = excluded.carga_id, actualizado_en = now();

    -- El total diario por cuenta publicitaria se rehace con todas sus campañas.
    delete from public.app_publicidad_diaria d
    using (select distinct cuenta, fecha, cuenta_ads from pg_temp._meta) t
    where d.cuenta = t.cuenta and d.fecha = t.fecha and d.cuenta_ads = t.cuenta_ads;
    insert into public.app_publicidad_diaria (cuenta, fecha, cuenta_ads, monto_cop)
    select c.cuenta, c.fecha, c.cuenta_ads, sum(c.monto_cop)
    from public.app_publicidad_campanas c
    join (select distinct cuenta, fecha, cuenta_ads from pg_temp._meta) t using (cuenta, fecha, cuenta_ads)
    group by 1, 2, 3;
  else
    raise exception 'Tipo de carga desconocido: %', p_tipo;
  end if;

  update public.app_cargas set filas = filas + v_n - v_omitidas where id = v_carga;
  return jsonb_build_object('carga', v_carga, 'filas', v_n - v_omitidas, 'omitidas', v_omitidas);
end $$;
revoke all on function public.app_cargar(text, text, text, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.app_cargar(text, text, text, jsonb, bigint, jsonb) to authenticated;

-- Qué hay cargado por tienda y fuente (pantalla 📤 Cargar archivos).
create function public.app_estado_cargas()
returns table (cuenta text, fuente text, filas bigint, desde date, hasta date)
language sql stable security definer set search_path = '' as $$
  select * from (
    select cuenta, 'Meta · por campaña' as fuente, count(*), min(fecha), max(fecha) from public.app_publicidad_campanas group by 1
    union all select cuenta, 'Meta · por día y cuenta', count(*), min(fecha), max(fecha) from public.app_publicidad_diaria group by 1
  ) x
  where public.app_es_owner()
  order by 1, 2;
$$;
revoke all on function public.app_estado_cargas() from public, anon;
grant execute on function public.app_estado_cargas() to authenticated;
