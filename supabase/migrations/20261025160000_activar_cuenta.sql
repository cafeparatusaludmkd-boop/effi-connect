-- Activar una cuenta de Effi ya conectada: cuando su API key está en el Vault (conexión probada) se activa, se encola la
-- carga de su historial igual que en las demás cuentas y entra a la vigilancia de órdenes (modo 'vigilar') para que En vivo
-- muestre sus órdenes y remisiones. Se llama a mano (service_role / SQL editor): select public.effi_activar_cuenta('MI_SLUG');
create function public.effi_activar_cuenta(p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.effi_accounts where slug = p_slug) then
    raise exception 'Cuenta desconocida: %', p_slug;
  end if;
  update public.effi_accounts set activa = true where slug = p_slug;

  -- Historial: guías y wallet desde enero de 2025 (el saldo en vivo suma toda la wallet), novedades de 90 días y
  -- cambios de estado de 60.
  insert into public.effi_sync_jobs (cuenta, recurso, desde_utc, hasta_utc, avance_utc)
  select p_slug, r.recurso, r.desde, now(), r.desde
  from (values
    ('guias', '2025-01-01'::timestamptz),
    ('wallet', '2025-01-01'::timestamptz),
    ('novedades_2', now() - interval '90 days'),
    ('novedades_1', now() - interval '30 days'),
    ('hist', now() - interval '60 days')
  ) as r(recurso, desde)
  where not exists (select 1 from public.effi_sync_jobs j where j.cuenta = p_slug and j.recurso = r.recurso and j.estado = 'pendiente');

  insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, cortes)
  values (p_slug, 'vigilar', 1, 1, '{}')
  on conflict (cuenta) do nothing;
end $$;
revoke all on function public.effi_activar_cuenta(text) from public, anon, authenticated;
grant execute on function public.effi_activar_cuenta(text) to service_role;
