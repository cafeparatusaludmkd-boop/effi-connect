-- Permisos por módulo: app_cuentas_visibles() sin argumento devuelve las cuentas que el usuario ve en CUALQUIER módulo,
-- así que un empleado con solo "novedades" podía pedir por RPC cifras financieras de esa cuenta. Cada función y política
-- pasa a exigir el módulo (o módulos) de las pantallas que la usan. Dueño y socios siguen viendo todo.
--
-- Mapa función -> módulos (según apps/web: la página y el módulo que exige con exigirModulo):
--   kpi_resumen, kpi_diario, kpi_despacho, kpi_utilidad, kpi_pendientes, kpi_diario_dim, kpi_opciones_dim -> resumen (Datos)
--   kpi_global, kpi_global_meses -> global
--   kpi_transportadoras -> guias (Transportadoras y ciudades) y dinero (Wallet y PyG)
--   kpi_ciudades -> guias
--   envivo_pulso, envivo_vivo, envivo_mapa -> guias (En vivo)
--   prov_datos, prov_costo_pct -> resumen (Datos de una proveeduría)
--   prov_tablero -> proveeduria
--   Políticas app_ajustes_pyg_leer, app_gastos_mensuales_leer, app_publicidad_diaria_leer, app_publicidad_mensual_leer,
--   app_publicidad_campanas_leer, app_cargas_leer -> resumen (se leen a través del PyG/Datos y Publicidad)

-- Unión de las cuentas visibles en cada uno de los módulos dados.
create function public.app_cuentas_visibles_en(p_modulos text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(
    select distinct c from unnest(p_modulos) as m, lateral unnest(public.app_cuentas_visibles(m)) as c
  ), array[]::text[]);
$$;
revoke all on function public.app_cuentas_visibles_en(text[]) from public, anon;
grant execute on function public.app_cuentas_visibles_en(text[]) to authenticated, service_role;

-- Funciones: se toma la definición vigente (pg_get_functiondef) y se cambia SOLO la llamada sin módulo, para no copiar
-- cada versión a mano. Firmas intactas. Falla si alguna función ya no contiene la llamada (el mapa quedó desfasado).
do $$
declare
  m record;
  def text;
  nuevo text;
  llamada text;
begin
  for m in select * from (values
    ('kpi_resumen',        array['resumen']),
    ('kpi_diario',         array['resumen']),
    ('kpi_despacho',       array['resumen']),
    ('kpi_utilidad',       array['resumen']),
    ('kpi_pendientes',     array['resumen']),
    ('kpi_diario_dim',     array['resumen']),
    ('kpi_opciones_dim',   array['resumen']),
    ('kpi_global',         array['global']),
    ('kpi_global_meses',   array['global']),
    ('kpi_transportadoras', array['guias', 'dinero']),
    ('kpi_ciudades',       array['guias']),
    ('envivo_pulso',       array['guias']),
    ('envivo_vivo',        array['guias']),
    ('envivo_mapa',        array['guias']),
    ('prov_datos',         array['resumen']),
    ('prov_costo_pct',     array['resumen']),
    ('prov_tablero',       array['proveeduria'])
  ) as t(fn, mods) loop
    llamada := 'public.app_cuentas_visibles_en(array[' || (select string_agg(quote_literal(x), ', ') from unnest(m.mods) x) || ']::text[])';
    for def in
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = m.fn
    loop
      nuevo := replace(def, 'public.app_cuentas_visibles()', llamada);
      if nuevo = def then
        raise exception 'La función % ya no llama a app_cuentas_visibles()', m.fn;
      end if;
      execute nuevo;
    end loop;
    if not found then raise exception 'No existe la función %', m.fn; end if;
  end loop;
end $$;

-- Políticas de lectura: solo cuentas visibles en el módulo "resumen" (Datos / PyG / Publicidad).
-- Las tablas de publicidad exigen además dueño o socio activo, la misma regla de publicidad_resumen (publicidad_solo_socios).
do $$
declare t text;
  socio constant text := 'exists (select 1 from public.app_usuarios u where u.user_id = (select auth.uid()) and u.activo and u.rol in (''owner'', ''socio''))';
begin
  foreach t in array array['app_ajustes_pyg', 'app_gastos_mensuales'] loop
    execute format('drop policy %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles_en(array[''resumen'']))::text[]))', t || '_leer', t);
  end loop;
  foreach t in array array['app_publicidad_diaria', 'app_publicidad_mensual'] loop
    execute format('drop policy %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (cuenta = any ((select public.app_cuentas_visibles_en(array[''resumen'']))::text[]) and %s)', t || '_leer', t, socio);
  end loop;
  -- app_publicidad_campanas ya permitía al dueño ver todo; el resto, solo socios con el módulo.
  drop policy app_publicidad_campanas_leer on public.app_publicidad_campanas;
  execute format('create policy app_publicidad_campanas_leer on public.app_publicidad_campanas for select to authenticated using ((cuenta = any ((select public.app_cuentas_visibles_en(array[''resumen'']))::text[]) and %s) or (select public.app_es_owner()))', socio);
  -- app_cargas es del dueño (pantalla Cargar archivos).
  drop policy app_cargas_leer on public.app_cargas;
  create policy app_cargas_leer on public.app_cargas for select to authenticated
    using (cuenta = any ((select public.app_cuentas_visibles_en(array['resumen']))::text[]) or (select public.app_es_owner()));
end $$;

-- En vivo mezcla operación (módulo "guias") con cifras de dinero que salen del wallet. Quien solo tiene "guias" ve la
-- operación, pero los campos de dinero salen en 0/false: recaudo_hoy y pagos_hoy (envivo_pulso) y valor_recaudo y pagada
-- de cada evento (envivo_vivo). La forma del JSON no cambia. El dinero se ve con el módulo "dinero" o "resumen" en la cuenta.
do $$
declare
  m record;
  def text;
  nuevo text;
  con_dinero constant text := '(select public.app_cuentas_visibles_en(array[''dinero'', ''resumen'']))::text[]';
begin
  for m in select * from (values
    ('envivo_pulso',
      'coalesce((select total from pago where pago.cuenta = c.slug), 0)',
      'case when c.slug = any (' || con_dinero || ') then coalesce((select total from pago where pago.cuenta = c.slug), 0) else 0 end'),
    ('envivo_pulso',
      'coalesce((select n from pago where pago.cuenta = c.slug), 0)',
      'case when c.slug = any (' || con_dinero || ') then coalesce((select n from pago where pago.cuenta = c.slug), 0) else 0 end'),
    ('envivo_vivo',
      'g.valor_recaudo, e.est_guia_new_efficommerce',
      'case when c.slug = any (' || con_dinero || ') then g.valor_recaudo else 0 end as valor_recaudo, e.est_guia_new_efficommerce'),
    ('envivo_vivo',
      'g.fecha_recaudo is not null as pagada',
      'coalesce(g.fecha_recaudo is not null and c.slug = any (' || con_dinero || '), false) as pagada')
  ) as t(fn, buscar, poner) loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = m.fn;
    nuevo := replace(def, m.buscar, m.poner);
    if nuevo = def then raise exception 'No encontré el fragmento a cambiar en %: %', m.fn, m.buscar; end if;
    execute nuevo;
  end loop;
end $$;
