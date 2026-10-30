-- Endurecimiento tras la revisión de seguridad de Supabase.

-- 1) Las funciones de trigger no se llaman por /rest/v1/rpc: nadie fuera del servidor necesita EXECUTE.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- 2) Funciones auxiliares que solo tienen sentido con sesión.
revoke execute on function public.app_cuentas_visibles(text) from public, anon;
revoke execute on function public.app_cop_a_local_dia(text, numeric, date) from public, anon;
