-- Freno para los disparos del webhook: un aviso no autenticado no puede multiplicar trabajo contra la API de Effi.
-- effi_webhook_reservar(clave, segundos) devuelve true solo si nadie reservó esa clave en los últimos `segundos`
-- (atómico: dos avisos simultáneos no pasan los dos). Claves: 'sync' (global) y 'vigilar:<CUENTA>'.
create table public.effi_webhook_cooldown (
  clave text primary key,
  ultimo timestamptz not null
);
alter table public.effi_webhook_cooldown enable row level security; -- sin políticas: solo el servidor

create function public.effi_webhook_reservar(p_clave text, p_segundos int) returns boolean
language sql security definer set search_path = '' as $$
  with r as (
    insert into public.effi_webhook_cooldown (clave, ultimo) values (p_clave, now())
    on conflict (clave) do update set ultimo = excluded.ultimo
      where public.effi_webhook_cooldown.ultimo < now() - make_interval(secs => p_segundos)
    returning 1
  )
  select exists (select 1 from r)
$$;
revoke all on function public.effi_webhook_reservar(text, int) from public, anon, authenticated;
