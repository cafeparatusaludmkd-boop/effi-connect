-- Cuentas Effi conectadas (las API keys NO van aquí; viven en el .env / secretos del servidor)
create table public.effi_accounts (
  slug        text primary key,                       -- TIENDA_CO, PROV_GT1, ...
  nombre      text not null,
  tipo        text not null check (tipo in ('tienda','proveeduria')),
  pais        text not null,                          -- ISO-2
  divisa      text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Las cuentas se registran después de instalar (no hay semillas), p. ej.:
--   insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, empresa_id) values ('TIENDA_CO', 'Mi tienda CO', 'tienda', 'CO', 'COP', <id de empresa en Effi>);

-- URL base de las Edge Functions de ESTE proyecto (https://<ref>.supabase.co/functions/v1/). Los crons y las funciones
-- que llaman a las Edge Functions la leen del Vault, así el SQL no lleva ningún proyecto fijo. Se guarda una vez:
--   select vault.create_secret('https://<ref>.supabase.co', 'effi_functions_url');
create function public.effi_functions_url() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'effi_functions_url';
  return case when v is null then null else rtrim(v, '/') || '/functions/v1/' end;
end $$;
revoke all on function public.effi_functions_url() from public, anon, authenticated;
grant execute on function public.effi_functions_url() to service_role;

-- Bandeja de entrada de webhooks de Effi: se guarda el aviso crudo (no confiable) y luego
-- un proceso vuelve a consultar el registro en la API de Effi con la API key de la cuenta.
create table public.effi_webhook_events (
  id            bigint generated always as identity primary key,
  cuenta        text not null references public.effi_accounts(slug),
  delivery_id   text not null,                        -- X-Effi-Delivery (idempotencia)
  evento        text,                                 -- X-Effi-Event
  firma         text,                                 -- X-Effi-Signature (sha256=...), guardada para auditoría
  payload       jsonb not null,
  recibido_en   timestamptz not null default now(),
  procesado_en  timestamptz,
  error         text,
  unique (cuenta, delivery_id)
);

create index effi_webhook_events_pendientes on public.effi_webhook_events (recibido_en) where procesado_en is null;
create index effi_webhook_events_cuenta_evento on public.effi_webhook_events (cuenta, evento, recibido_en desc);

-- Solo el servidor (service_role) lee y escribe; sin políticas = nadie más.
alter table public.effi_accounts enable row level security;
alter table public.effi_webhook_events enable row level security;
