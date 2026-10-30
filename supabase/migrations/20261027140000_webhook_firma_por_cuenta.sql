-- La firma se exige por cuenta, no por evento: si la cuenta guardó al menos un secreto de webhook, todo aviso de esa
-- cuenta debe venir con un evento que tenga secreto y con firma válida. Así un aviso con un nombre de evento inventado
-- no puede saltarse la verificación.
create function public.effi_webhook_requiere_firma(p_cuenta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.secrets where name like 'effi\_webhook\_' || p_cuenta || '\_%')
$$;
revoke all on function public.effi_webhook_requiere_firma(text) from public, anon, authenticated;
