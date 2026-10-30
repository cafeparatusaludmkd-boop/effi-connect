-- ════════════════════════════════════════════════════════════════════════════
--  Conectar una cuenta de Effi a Effi Connect
--  Dónde: Supabase → tu proyecto → SQL Editor → New query → pega todo esto.
--  Llena SOLO los valores de la sección "TUS DATOS" y dale Run.
--  La API key queda cifrada en Vault: no se guarda en ninguna tabla.
-- ════════════════════════════════════════════════════════════════════════════
--
--  ¿De dónde saco la API key?
--    En Effi: Administración → Usuarios → (un usuario de SOLO CONSULTA) → Ver más detalles → API key.
--    Vence a los 360 días. Para cambiarla, corre este mismo script con la key nueva.
--
--  ¿Y el ID EFFI?
--    Es el número de la empresa que Effi muestra junto a su nombre. Si no lo pones, Effi Connect lo toma
--    de las primeras guías que lleguen (el historial de estados espera a tenerlo).

do $$
declare
  -- ─────────────── TUS DATOS ───────────────
  v_api_key      text    := 'PEGA_AQUI_TU_API_KEY';
  v_slug         text    := 'TIENDA_CO';           -- nombre corto: MAYÚSCULAS, números y _ ; DEBE terminar en _ + país (TIENDA_CO, MI_MARCA_GT)
  v_nombre       text    := 'Mi tienda Colombia';  -- como quieres verla en el panel
  v_tipo         text    := 'tienda';              -- 'tienda' o 'proveeduria'
  v_pais         text    := 'CO';                  -- CO, EC, GT, CR, DO
  v_empresa_id   bigint  := null;                  -- ID EFFI (opcional)
  v_dias         int     := 60;                    -- cuántos días de historia traer
  v_quitar_demo  boolean := true;                  -- apaga las tiendas y el simulador de demostración
  -- ─────────────────────────────────────────
  v_divisa text;
  v_tz int;
begin
  if v_api_key = 'PEGA_AQUI_TU_API_KEY' or length(v_api_key) < 20 then
    raise exception 'Pega tu API key de Effi en v_api_key antes de correr el script.';
  end if;
  if v_slug !~ '^[A-Z0-9_]{3,32}$' then
    raise exception 'v_slug solo puede tener MAYÚSCULAS, números y _ (ej. TIENDA_CO).';
  end if;
  -- El panel deduce país, bandera y moneda del final del nombre corto (TIENDA_CO → Colombia).
  if right(v_slug, 3) <> '_' || upper(v_pais) then
    raise exception 'v_slug debe terminar en _% (ej. %_%). Si ya creaste la cuenta con otro nombre: select public.effi_renombrar_cuenta(''VIEJO'', ''NUEVO_%'');',
      upper(v_pais), split_part(v_slug, '_', 1), upper(v_pais), upper(v_pais);
  end if;
  if v_tipo not in ('tienda', 'proveeduria') then
    raise exception 'v_tipo debe ser tienda o proveeduria.';
  end if;

  -- Moneda y zona horaria del país (la API filtra fechas en la hora de la empresa).
  select d, z into v_divisa, v_tz from (values
    ('CO', 'COP', -300), ('EC', 'USD', -300), ('GT', 'GTQ', -360), ('CR', 'CRC', -360), ('DO', 'DOP', -240), ('HN', 'HNL', -360)
  ) p(pais, d, z) where p.pais = upper(v_pais);
  if v_divisa is null then
    raise exception 'País % no reconocido. Usa CO, EC, GT, CR, DO o HN.', v_pais;
  end if;

  insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, empresa_id, tz_offset_min)
  values (v_slug, v_nombre, v_tipo, upper(v_pais), v_divisa, true, v_empresa_id, v_tz)
  on conflict (slug) do update
    set nombre = excluded.nombre, tipo = excluded.tipo, pais = excluded.pais, divisa = excluded.divisa, activa = true,
        empresa_id = coalesce(excluded.empresa_id, public.effi_accounts.empresa_id), tz_offset_min = excluded.tz_offset_min;

  perform public.effi_set_api_key(v_slug, v_api_key);

  -- Carga histórica: se recorre sola, por tramos, en cada corrida del sync (respeta el límite de Effi).
  -- Primero las guías (traen el ID de la empresa), luego el resto.
  delete from public.effi_sync_jobs where cuenta = v_slug and estado = 'pendiente';
  insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
  select v_slug, r, now() - make_interval(days => v_dias), now(), now() - make_interval(days => v_dias)
  from unnest(array['guias', 'hist', 'wallet', 'novedades_1', 'novedades_2']) with ordinality as t(r, orden)
  order by orden;

  if v_quitar_demo then
    update public.effi_accounts set activa = false where slug like 'DEMO\_%';
    update public.auto_config set modo = 'apagado' where cuenta like 'DEMO\_%';
    if exists (select 1 from cron.job where jobname = 'demo-simulador') then
      perform cron.unschedule('demo-simulador');
    end if;
  end if;

  raise notice 'Cuenta % conectada. El sync corre cada minuto; la historia de % días llega en las próximas horas.', v_slug, v_dias;
end $$;

-- Cómo va (vuelve a correr solo esta parte cuando quieras):
select a.slug, a.nombre, a.activa, a.empresa_id,
       (select count(*) from public.effi_guias g where g.cuenta = a.slug) as guias,
       (select max(fecha_trans) from public.effi_guias g where g.cuenta = a.slug) as ultima_guia,
       (select string_agg(j.recurso || ': ' || j.estado || coalesce(' (' || left(j.error, 60) || ')', ''), ' · ' order by j.id)
          from public.effi_sync_jobs j where j.cuenta = a.slug and j.creado_en > now() - interval '7 days') as carga_historica,
       (select string_agg(s.recurso || coalesce(': ' || left(s.ultimo_error, 60), ' ok'), ' · ')
          from public.effi_sync_state s where s.cuenta = a.slug) as sync
from public.effi_accounts a
where a.activa
order by a.slug;
