-- Toda tienda nueva entra a la vigilancia del Agente (modo 'vigilar': solo trae órdenes y remisiones de Effi, no simula ni
-- crea nada), así En vivo muestra sus órdenes y remisiones reales. Se crea su fila en auto_config al registrar la cuenta;
-- crear/simular se habilita después por cuenta (auto_config.modo y creacion_habilitada).
create function public.auto_config_nueva_tienda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, cortes)
  values (new.slug, 'vigilar', 1, 1, '{}')
  on conflict (cuenta) do nothing;
  return new;
end $$;
create trigger effi_accounts_auto_config after insert on public.effi_accounts
  for each row when (new.tipo = 'tienda') execute function public.auto_config_nueva_tienda();
insert into public.auto_config (cuenta, modo, centro_normal, centro_recuperado, cortes)
select slug, 'vigilar', 1, 1, '{}' from public.effi_accounts where tipo = 'tienda'
on conflict (cuenta) do nothing;
