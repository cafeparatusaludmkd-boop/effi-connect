-- Renombrar una cuenta (su slug) sin perder datos. El panel deduce país, bandera y moneda del final del slug
-- (TIENDA_CO → Colombia), así que una cuenta mal nombrada se corrige con:
--   select public.effi_renombrar_cuenta('NOMBRE_VIEJO', 'NOMBRE_CO');
-- Mueve todas las tablas que cuelgan de la cuenta y su API key en Vault. Solo el servidor o el SQL Editor.

create or replace function public.effi_renombrar_cuenta(p_viejo text, p_nuevo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  v_secret uuid;
begin
  if p_nuevo !~ '^[A-Z0-9_]{3,32}$' then
    raise exception 'El nombre nuevo solo puede tener MAYÚSCULAS, números y _ (ej. MI_TIENDA_CO).';
  end if;
  if not exists (select 1 from public.effi_accounts where slug = p_viejo) then
    raise exception 'Cuenta desconocida: %', p_viejo;
  end if;
  if exists (select 1 from public.effi_accounts where slug = p_nuevo) then
    raise exception 'Ya existe una cuenta %', p_nuevo;
  end if;
  -- Que el sync no escriba a mitad del cambio.
  -- effi_sync_try_lock devuelve null (no false) cuando el candado está tomado.
  if coalesce(public.effi_sync_try_lock(300), false) is false then
    raise exception 'El sync está corriendo en este momento: intenta de nuevo en un minuto.';
  end if;

  insert into public.effi_accounts select (jsonb_populate_record(a, jsonb_build_object('slug', p_nuevo))).*
  from public.effi_accounts a where a.slug = p_viejo;

  for t in
    select c.conrelid::regclass as tabla, a.attname as columna
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.effi_accounts'::regclass
  loop
    -- Los triggers de alta crean filas por defecto para la cuenta nueva: se descartan y se mueven las de la vieja.
    execute format('delete from %s where %I = $1', t.tabla, t.columna) using p_nuevo;
    execute format('update %s set %I = $1 where %I = $2', t.tabla, t.columna, t.columna) using p_nuevo, p_viejo;
  end loop;

  select id into v_secret from vault.secrets where name = 'effi_api_key_' || p_viejo;
  if v_secret is not null then
    perform vault.update_secret(v_secret, null, 'effi_api_key_' || p_nuevo);
  end if;

  delete from public.effi_accounts where slug = p_viejo;
  perform public.effi_sync_unlock();
end $$;
revoke all on function public.effi_renombrar_cuenta(text, text) from public, anon, authenticated;
