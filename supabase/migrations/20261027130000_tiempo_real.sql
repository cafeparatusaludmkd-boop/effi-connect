-- Tiempo real: de minutos a segundos.
--  1. Vigilancia de órdenes cada minuto (antes cada 2).
--  2. Señal por cuenta para Supabase Realtime: cuando entran estados, guías u órdenes, un trigger marca la cuenta y
--     En vivo recarga al instante (sin esperar su consulta periódica). La señal no lleva datos: solo "esta cuenta cambió".
--  3. Lo que necesita la Edge Function effi-webhook para disparar el sync en el momento del aviso.

select cron.schedule('auto-vigilancia', '* * * * *', $c$
  select public.auto_vigilancia_disparar() where public.effi_functions_url() is not null;
$c$);

-- 2) Señales
create table public.envivo_senales (
  cuenta text primary key references public.effi_accounts(slug) on delete cascade,
  en timestamptz not null default now()
);
alter table public.envivo_senales enable row level security;
create policy ver on public.envivo_senales for select to authenticated using (public.app_puede_ver(cuenta));

create function public.envivo_marcar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.envivo_senales (cuenta, en)
  select distinct cuenta, now() from nuevas
  on conflict (cuenta) do update set en = excluded.en;
  return null;
end $$;
revoke all on function public.envivo_marcar() from public, anon, authenticated;

-- A nivel de sentencia: una ingesta de 100 filas produce una sola señal por cuenta.
create trigger envivo_estados after insert on public.effi_guia_estados
  referencing new table as nuevas for each statement execute function public.envivo_marcar();
create trigger envivo_guias_alta after insert on public.effi_guias
  referencing new table as nuevas for each statement execute function public.envivo_marcar();
create trigger envivo_guias_cambio after update on public.effi_guias
  referencing new table as nuevas for each statement execute function public.envivo_marcar();
create trigger envivo_ordenes_alta after insert on public.auto_ordenes
  referencing new table as nuevas for each statement execute function public.envivo_marcar();
create trigger envivo_ordenes_cambio after update on public.auto_ordenes
  referencing new table as nuevas for each statement execute function public.envivo_marcar();

-- Supabase Realtime transmite los cambios de esta tabla (respetando la política de lectura).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.envivo_senales;
  end if;
end $$;

-- 3) Para effi-webhook (solo el servidor).
-- Token del cron, para que el webhook pueda llamar a effi-sync y auto-vigilancia.
create function public.effi_sync_token_valor() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token'
$$;
revoke all on function public.effi_sync_token_valor() from public, anon, authenticated;

-- Secreto opcional de cada webhook de Effi (Effi genera uno por webhook y lo muestra una sola vez). Si está guardado,
-- effi-webhook exige la firma X-Effi-Signature; si no, el aviso solo dispara una relectura de la API (no se confía
-- en su contenido), así que un aviso falso no puede meter datos.
create function public.effi_set_webhook_secreto(p_cuenta text, p_evento text, p_secreto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_nombre text := 'effi_webhook_' || p_cuenta || '_' || p_evento;
begin
  if not exists (select 1 from public.effi_accounts where slug = p_cuenta) then raise exception 'Cuenta desconocida: %', p_cuenta; end if;
  if p_evento !~ '^[a-z_]+\.[a-z_]+$' then raise exception 'Evento inválido: %', p_evento; end if;
  select id into v_id from vault.secrets where name = v_nombre;
  if v_id is null then perform vault.create_secret(p_secreto, v_nombre, 'Secreto del webhook de Effi');
  else perform vault.update_secret(v_id, p_secreto); end if;
end $$;
revoke all on function public.effi_set_webhook_secreto(text, text, text) from public, anon, authenticated;

create function public.effi_webhook_secreto(p_cuenta text, p_evento text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'effi_webhook_' || p_cuenta || '_' || p_evento
$$;
revoke all on function public.effi_webhook_secreto(text, text) from public, anon, authenticated;
