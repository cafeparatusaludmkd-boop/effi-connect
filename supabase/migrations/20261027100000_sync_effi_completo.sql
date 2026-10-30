-- Lo que el sync de Effi necesita y no estaba en las migraciones (en el proyecto original se creó a mano):
--   1. effi_ingest: guarda la respuesta cruda de Effi en su tabla (la llama la Edge Function effi-sync).
--   2. El trabajo programado que dispara effi-sync cada minuto.
--   3. El refresco de los resúmenes que lee la pantalla Datos (estaba pausado).

-- Limpia una fila de Effi: quita los campos "" (romperían el cast a fecha o número) y, en el historial de estados,
-- renombra id → id_guia y completa empresa (la API no la manda en ese recurso).
create or replace function public.effi_limpiar_fila(p_row jsonb, p_recurso text, p_empresa bigint)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    || case when p_recurso = 'hist'
         then jsonb_build_object('id_guia', p_row -> 'id', 'empresa', coalesce(p_row -> 'empresa', to_jsonb(p_empresa)))
         else '{}'::jsonb end
  from jsonb_each(p_row) as e(k, v)
  where v <> '""'::jsonb
$$;
revoke all on function public.effi_limpiar_fila(jsonb, text, bigint) from public, anon, authenticated;

-- Recibe {"ok":true,"data":[...],"paginacion":{...}} y lo guarda. Correrla dos veces con lo mismo no duplica nada.
-- Las fechas de Effi vienen en UTC sin zona: la función fija UTC para todo lo que llama.
create or replace function public.effi_ingest(p_cuenta text, p_recurso text, p_payload jsonb)
returns int language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_empresa bigint;
  v_rows jsonb;
  n int := 0;
begin
  select empresa_id into v_empresa from public.effi_accounts where slug = p_cuenta;
  if not found then raise exception 'Cuenta desconocida: %', p_cuenta; end if;

  -- Si la cuenta no tiene empresa_id, se toma de las guías (que sí la traen) la primera vez que lleguen.
  if v_empresa is null and p_recurso = 'guias' then
    v_empresa := nullif(p_payload -> 'data' -> 0 ->> 'empresa', '')::bigint;
    if v_empresa is not null then
      update public.effi_accounts set empresa_id = v_empresa where slug = p_cuenta and empresa_id is null;
    end if;
  end if;

  select coalesce(jsonb_agg(public.effi_limpiar_fila(r, p_recurso, v_empresa)), '[]'::jsonb)
    into v_rows
    from jsonb_array_elements(coalesce(p_payload -> 'data', '[]'::jsonb)) r;
  if jsonb_array_length(v_rows) = 0 then return 0; end if;

  if p_recurso = 'hist' and v_empresa is null then
    raise exception 'La cuenta % no tiene empresa_id: llénalo en effi_accounts (ID EFFI de la empresa)', p_cuenta;
  end if;

  if p_recurso = 'guias' then
    n := public.effi_upsert_guias(p_cuenta, v_rows);
  elsif p_recurso = 'hist' then
    n := public.effi_upsert_guia_estados(p_cuenta, v_rows);
    -- El último cambio de estado de cada guía sale del historial.
    update public.effi_guias g
       set ultimo_cambio_estado = greatest(g.ultimo_cambio_estado, h.ultimo)
      from (select (r ->> 'empresa')::bigint empresa, (r ->> 'sucursal')::int sucursal, (r ->> 'id_guia')::bigint id,
                   max((r ->> 'fecha_hist_est')::timestamptz) ultimo
              from jsonb_array_elements(v_rows) r group by 1, 2, 3) h
     where g.cuenta = p_cuenta and g.empresa = h.empresa and g.sucursal = h.sucursal and g.id = h.id;
  elsif p_recurso like 'novedades%' then
    n := public.effi_upsert_novedades(p_cuenta, v_rows);
  elsif p_recurso = 'wallet' then
    n := public.effi_upsert_wallet(p_cuenta, v_rows);
  else
    raise exception 'Recurso desconocido: %', p_recurso;
  end if;
  return n;
end $$;
revoke all on function public.effi_ingest(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.effi_ingest(text, text, jsonb) to service_role;

-- 2) effi-sync cada minuto. Si el proyecto aún no tiene la URL de sus funciones en Vault (effi_functions_url), no hace nada.
select cron.schedule('effi-sync', '* * * * *', $c$
  select net.http_post(url := public.effi_functions_url() || 'effi-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 5000)
  where public.effi_functions_url() is not null;
$c$);

-- 3) Los resúmenes de Datos se recalculan cada 10 minutos (en un plan gratuito se puede subir a */30).
select cron.schedule('effi-resumenes', '*/10 * * * *', $c$ select public.effi_refrescar_resumenes(); $c$);
select cron.alter_job(jobid, active := true) from cron.job where jobname = 'effi-resumenes';
