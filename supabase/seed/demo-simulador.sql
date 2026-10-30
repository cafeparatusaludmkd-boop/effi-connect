-- Simulador de operación para la demo: cada minuto mueve guías de las tiendas DEMO_* como lo haría Effi
-- (avanza estados, crea guías nuevas y acredita recaudos), para ver En vivo y la red neuronal palpitando.
-- SOLO para proyectos de prueba. Requiere haber cargado supabase/seed/demo.sql.
-- Apagarlo:   select cron.unschedule('demo-simulador');
-- Quitarlo:   drop function public.demo_simular();

create or replace function public.demo_simular() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  nuevo int;
  nombre text;
  movidas int := 0;
  k int;
  nid bigint;
  divisa_dec int;
begin
  -- 1) Avanzan de estado entre 4 y 9 guías abiertas.
  for r in
    select g.* from public.effi_guias g
    where g.cuenta like 'DEMO\_%' and g.est_guia_efficommerce in (1, 2, 3, 8, 9)
    order by random() limit 4 + floor(random() * 6)::int
  loop
    nuevo := case r.est_guia_efficommerce
      when 1 then 2
      when 2 then (array[8, 8, 8, 3, 9])[1 + floor(random() * 5)::int]
      when 8 then case when random() < 0.82 then 4 else 5 end
      when 3 then case when random() < 0.6 then 4 else 5 end
      when 9 then case when random() < 0.75 then 4 else 5 end
    end;
    nombre := case nuevo when 2 then 'En transito' when 3 then 'Novedad' when 4 then 'Entregada a destino'
      when 5 then 'Devolución a origen' when 8 then 'En reparto' when 9 then 'Disponible para retiro en oficina' end;

    update public.effi_guias
       set est_guia_efficommerce = nuevo, estado_efficommerce = nombre, est_guia = nuevo, estado = nombre,
           ultimo_cambio_estado = now(), actualizado_en = now(),
           fecha_estado_final = case when nuevo in (4, 5) then now() else fecha_estado_final end
     where cuenta = r.cuenta and empresa = r.empresa and sucursal = r.sucursal and id = r.id;

    insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new,
      guia, estado_new, est_guia_new_efficommerce, estado_new_efficommerce, nombre_transportadora_efficommerce)
    values (r.cuenta, r.empresa, r.sucursal, r.id, now(), true, nuevo, r.guia, nombre, nuevo, nombre, r.nombre_transportadora)
    on conflict do nothing;

    divisa_dec := case when r.divisa = 'USD' then 2 else 0 end;
    if nuevo = 4 then
      insert into public.effi_wallet (cuenta, id, fecha_trans, fecha_origen, t_movimiento, tipo_movimiento, detalle, valor, divisa,
        guia_inicial, empresa_guia, sucursal_guia, id_guia, nombre_transportadora_efficommerce, vigente)
      select r.cuenta, r.id * 10 + m.k, now(), now(), m.t, m.nombre, 'Movimiento de demostración', m.valor, r.divisa,
             r.guia, r.empresa, r.sucursal, r.id, r.nombre_transportadora, true
      from (values
        (1, 1, 'Recaudo de venta', case when r.recaudo then r.valor_recaudo end),
        (2, 13, 'Compra de mercancía', -round(r.valor_declarado * 0.34, divisa_dec)),
        (3, 7, 'Flete crédito con recaudo', -r.valor_flete)
      ) m(k, t, nombre, valor)
      where m.valor is not null
      on conflict do nothing;
    elsif nuevo = 5 then
      insert into public.effi_wallet (cuenta, id, fecha_trans, fecha_origen, t_movimiento, tipo_movimiento, detalle, valor, divisa,
        guia_inicial, empresa_guia, sucursal_guia, id_guia, nombre_transportadora_efficommerce, vigente)
      values (r.cuenta, r.id * 10 + 4, now(), now(), 9, 'Flete crédito devolución', 'Movimiento de demostración',
              -round(r.valor_flete * 1.4, divisa_dec), r.divisa, r.guia, r.empresa, r.sucursal, r.id, r.nombre_transportadora, true)
      on conflict do nothing;
    end if;
    movidas := movidas + 1;
  end loop;

  -- 2) Entre 1 y 3 ventas nuevas: copian una guía existente de la misma tienda con id nuevo y estado Generada.
  for k in 1 .. 1 + floor(random() * 3)::int loop
    select g.* into r from public.effi_guias g where g.cuenta like 'DEMO\_%' order by random() limit 1;
    select max(id) + 1 into nid from public.effi_guias where cuenta = r.cuenta;
    insert into public.effi_guias (cuenta, empresa, sucursal, id, id_transaccion, guia, fecha_trans, fecha_envio, fecha_entrega_esperada,
      nombre_centro_costos, nombre_destinatario, id_destinatario, telefonos_destinatario, direccion_destinatario,
      nombre_ciudad_destinatario, nombre_provincia_destinatario, nombre_pais_destinatario, nombre_transportadora,
      nombre_transportadora_efficommerce, servicio, contenido, divisa, valor_declarado, recaudo, valor_recaudo, valor_flete,
      est_guia, estado, est_guia_efficommerce, estado_efficommerce, vigente, ultimo_cambio_estado, nombre_remitente)
    values (r.cuenta, r.empresa, 1, nid, 'GT-' || nid, (800000000000 + r.empresa * 1000000 + nid)::text, now(), current_date + 1, current_date + 4,
      r.nombre_centro_costos, 'Cliente ' || nid, 'CC-' || (10000 + nid), '3000000000', r.direccion_destinatario,
      r.nombre_ciudad_destinatario, r.nombre_provincia_destinatario, r.nombre_pais_destinatario, r.nombre_transportadora,
      r.nombre_transportadora_efficommerce, r.servicio, r.contenido, r.divisa, r.valor_declarado, r.recaudo, r.valor_recaudo, r.valor_flete,
      1, 'Generada', 1, 'Generada', true, now(), r.nombre_remitente);
    insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new,
      guia, estado_new, est_guia_new_efficommerce, estado_new_efficommerce, nombre_transportadora_efficommerce)
    values (r.cuenta, r.empresa, 1, nid, now(), true, 1, (800000000000 + r.empresa * 1000000 + nid)::text, 'Generada', 1, 'Generada',
      r.nombre_transportadora)
    on conflict do nothing;
    movidas := movidas + 1;
  end loop;

  perform public.effi_reparar_recaudo();
  return movidas;
end $$;

revoke all on function public.demo_simular() from public, anon, authenticated;

-- Cada minuto (los resúmenes de Datos los recalcula el trabajo effi-resumenes cada 10 minutos).
select cron.schedule('demo-simulador', '* * * * *', $c$ select public.demo_simular(); $c$);
