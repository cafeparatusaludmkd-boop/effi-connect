-- El gasto de Meta (API y CSV del BM) se reparte por país de entrega entre las tiendas marcadas con recibe_meta. Si dos
-- sociedades tienen tienda en el mismo país, se marca solo la que paga la publicidad; sin la marca el gasto se duplicaba.
alter table public.effi_accounts add column if not exists recibe_meta boolean not null default true;

do $$
declare f text;
begin
  foreach f in array array['public.meta_guardar(jsonb, text[], date, date)', 'public.app_cargar(text, text, text, jsonb, bigint, jsonb)'] loop
    execute replace(pg_get_functiondef(f::regprocedure),
      'join public.effi_accounts a on a.pais = r.pais and a.tipo = ''tienda''',
      'join public.effi_accounts a on a.pais = r.pais and a.tipo = ''tienda'' and a.recibe_meta');
  end loop;
end $$;
