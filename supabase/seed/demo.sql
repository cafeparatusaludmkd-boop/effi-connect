-- Datos de demostración de Effi Connect: 3 tiendas (CO, EC, GT) con 60 días de guías, estados, novedades y wallet.
-- Todo es ficticio y se puede borrar con:  delete from public.effi_accounts where slug like 'DEMO\_%';
-- (las tablas de datos cuelgan de la cuenta). Ejecutar en el editor SQL o con psql. Es idempotente.

select setseed(0.2724);

insert into public.app_sociedades (nombre, tipo, orden)
select 'Principal', 'tiendas', 1
where not exists (select 1 from public.app_sociedades where nombre = 'Principal');

insert into public.effi_accounts (slug, nombre, tipo, pais, divisa, activa, empresa_id, tz_offset_min, sociedad)
values
  ('DEMO_TIENDA_CO', 'Tienda Demo Colombia', 'tienda', 'CO', 'COP', true, 9001, -300, 'Principal'),
  ('DEMO_TIENDA_EC', 'Tienda Demo Ecuador', 'tienda', 'EC', 'USD', true, 9002, -300, 'Principal'),
  ('DEMO_TIENDA_GT', 'Tienda Demo Guatemala', 'tienda', 'GT', 'GTQ', true, 9003, -360, 'Principal')
on conflict (slug) do nothing;

-- Parámetros por país: volumen, rango de precio, fletes, transportadoras y ciudades.
drop table if exists demo_pais, demo_guia;
create temp table demo_pais as
select * from (values
  ('DEMO_TIENDA_CO', 9001, 1800, 59900::numeric, 149900::numeric, 12000::numeric, 18500::numeric, 0,
   array['INTER RAPIDISIMO','SERVIENTREGA','COORDINADORA','ENVIA'], array[0.40,0.24,0.22,0.14], array[0.18,0.30,0.16,0.34],
   array['Bogotá','Medellín','Cali','Barranquilla','Bucaramanga','Cartagena','Pereira','Cúcuta','Villavicencio','Ibagué'],
   array['Cundinamarca','Antioquia','Valle del Cauca','Atlántico','Santander','Bolívar','Risaralda','Norte de Santander','Meta','Tolima'], 'Colombia'),
  ('DEMO_TIENDA_EC', 9002, 520, 19.90, 49.90, 3.20, 5.36, 2,
   array['GINTRACOM','SERVIENTREGA','LAARCOURIER'], array[0.5,0.3,0.2], array[0.22,0.27,0.31],
   array['Guayaquil','Quito','Cuenca','Santo Domingo','Machala','Manta','Ambato','Portoviejo'],
   array['Guayas','Pichincha','Azuay','Santo Domingo','El Oro','Manabí','Tungurahua','Manabí'], 'Ecuador'),
  ('DEMO_TIENDA_GT', 9003, 380, 149, 399, 25, 29.13, 0,
   array['FORZA','CARGO EXPRESO'], array[0.65,0.35], array[0.20,0.28],
   array['Ciudad de Guatemala','Mixco','Villa Nueva','Quetzaltenango','Escuintla','Cobán','Petapa'],
   array['Guatemala','Guatemala','Guatemala','Quetzaltenango','Escuintla','Alta Verapaz','Guatemala'], 'Guatemala')
) as t(cuenta, empresa, n, precio_min, precio_max, flete, flete_dev, dec, transp, peso_t, dev_t, ciudades, provincias, pais_nombre);

-- fecha_entrega y entregada_en son columnas calculadas a partir de fecha_estado_final.
-- Guías: más volumen en los días recientes; el estado depende de la edad y de la transportadora.
create temp table demo_guia as
with base as (
  select p.*, i,
         floor(power(random(), 1.3) * 60)::int as edad,
         random() as r_t, random() as r_c, random() as r_e, random() as r_v, random() as r_cod, random() as r_h
  from demo_pais p, generate_series(1, (select max(n) from demo_pais)) i
  where i <= p.n
), t as (
  select b.*,
         -- transportadora según su peso
         (select k from generate_subscripts(b.transp, 1) k
          where b.r_t <= (select sum(x) from unnest(b.peso_t[1:k]) x) order by k limit 1) as kt,
         1 + floor(power(b.r_c, 1.6) * array_length(b.ciudades, 1))::int as kc
  from base b
)
select t.cuenta, t.empresa, t.i as id, t.dec, t.flete, t.flete_dev, t.pais_nombre,
       t.transp[t.kt] as transportadora, t.dev_t[t.kt] as p_dev,
       t.ciudades[t.kc] as ciudad, t.provincias[t.kc] as provincia,
       now() - make_interval(days => t.edad, hours => floor(t.r_h * 20)::int) as creada,
       t.edad,
       round((t.precio_min + t.r_v * (t.precio_max - t.precio_min))::numeric, t.dec) as valor,
       t.r_cod < 0.93 as cod,
       case
         when t.edad < 2 then case when t.r_e < 0.55 then 1 else 2 end
         when t.edad < 5 then case when t.r_e < 0.45 then 2 when t.r_e < 0.57 then 3 when t.r_e < 0.65 then 9 when t.r_e < 0.70 then 8 else 4 end
         else case when t.r_e < 0.04 then 3 when t.r_e < 0.07 then 9 when t.r_e < 0.09 then 2
                   when t.r_e < 0.09 + t.dev_t[t.kt] then 5 when t.r_e < 0.995 then 4 else 6 end
       end as est
from t;

insert into public.effi_guias (
  cuenta, empresa, sucursal, id, id_transaccion, guia, fecha_trans, fecha_envio, fecha_entrega_esperada, fecha_estado_final,
  nombre_centro_costos, nombre_destinatario, id_destinatario, telefonos_destinatario, direccion_destinatario,
  nombre_ciudad_destinatario, nombre_provincia_destinatario, nombre_pais_destinatario,
  nombre_transportadora, nombre_transportadora_efficommerce, servicio, contenido, divisa,
  valor_declarado, recaudo, valor_recaudo, valor_flete, est_guia, estado, est_guia_efficommerce, estado_efficommerce,
  vigente, ultimo_cambio_estado, nombre_remitente)
select g.cuenta, g.empresa, 1, g.id, 'GT-' || g.id, (700000000 + g.empresa * 10000 + g.id)::text,
       g.creada, (g.creada + interval '1 day')::date, (g.creada + interval '4 days')::date,
       case when g.est in (4, 5, 6) then g.creada + make_interval(days => 2 + (g.id % 4)::int) end,
       'Tienda principal', 'Cliente ' || g.id, 'CC-' || (10000 + g.id), '3000000000',
       case when g.est = 9 or g.id % 9 = 0 then 'Recoge en oficina ' || g.transportadora else 'Calle ' || (g.id % 120) || ' # ' || (g.id % 60) || '-' || (g.id % 90) end,
       g.ciudad, g.provincia, g.pais_nombre, g.transportadora, g.transportadora, 'Mensajería', 'Producto demo', d.divisa,
       g.valor, g.cod, case when g.cod then g.valor else 0 end, g.flete, g.est,
       e.nombre, g.est, e.nombre, true,
       least(now(), g.creada + make_interval(days => 1 + least(g.edad, 1 + (g.id % 5)::int), hours => (g.id % 7)::int)),
       'Tienda Demo'
from demo_guia g
join public.effi_accounts d on d.slug = g.cuenta
join (values (1, 'Generada'), (2, 'En transito'), (3, 'Novedad'), (4, 'Entregada a destino'), (5, 'Devolución a origen'),
             (6, 'Indemnización'), (8, 'En reparto'), (9, 'Disponible para retiro en oficina')) e(id, nombre) on e.id = g.est
on conflict do nothing;

-- Unas cuantas guías cambian de estado en la última hora para que la vista En vivo tenga movimiento.
update public.effi_guias set ultimo_cambio_estado = now() - make_interval(mins => (id % 55)::int)
where cuenta like 'DEMO\_%' and est_guia_efficommerce in (2, 4, 8, 9) and id % 23 = 0;

-- Historial de estados (alimenta el feed y los tiempos).
insert into public.effi_guia_estados (cuenta, empresa, sucursal, id_guia, fecha_hist_est, guia_inicial_adicional, est_guia_new,
  guia, estado_new, est_guia_new_efficommerce, estado_new_efficommerce, transportadora_efficommerce, nombre_transportadora_efficommerce)
select g.cuenta, g.empresa, 1, g.id, s.fecha, true, s.est, g.guia, s.nombre, s.est, s.nombre, null, g.nombre_transportadora
from public.effi_guias g
cross join lateral (values
  (1, 'Generada', g.fecha_trans),
  (2, 'En transito', g.fecha_trans + interval '1 day'),
  (g.est_guia_efficommerce, g.estado_efficommerce, g.ultimo_cambio_estado)
) s(est, nombre, fecha)
where g.cuenta like 'DEMO\_%' and s.fecha <= now() and (s.est <> g.est_guia_efficommerce or s.fecha = g.ultimo_cambio_estado)
on conflict do nothing;

-- Novedades: todas las guías en novedad y parte de las que terminaron entregadas o devueltas.
insert into public.effi_novedades (cuenta, empresa, id, guia_novedad, guia_inicial_adicional, est_novedad, estado_novedad, t_novedad,
  tipo_novedad, nombre_transportadora_efficommerce, id_novedad, nombre_novedad, aclaracion, cant_gestion, fecha_trans,
  fecha_ultima_gestion, fecha_solucion, sucursal_guia, id_guia, guia, nombre_ciudad_destinatario, nombre_provincia_destinatario,
  valor_recaudo, est_guia, estado, vigente)
select g.cuenta, g.empresa, g.id, g.guia, true,
       case when g.est_guia_efficommerce = 3 then 1 else 2 end,
       case when g.est_guia_efficommerce = 3 then 'Abierta' when g.est_guia_efficommerce = 4 then 'Solucionada' else 'Cerrado' end,
       2, 'Novedad de entrega', g.nombre_transportadora, 1 + g.id % 5,
       (array['Dirección errada', 'No contesta', 'Cliente ausente', 'Rechazado por el cliente', 'Zona de difícil acceso'])[1 + g.id % 5],
       'Novedad de demostración', g.id % 3, g.fecha_trans + interval '2 days',
       (g.fecha_trans + interval '2 days')::timestamp,
       case when g.est_guia_efficommerce <> 3 then (g.fecha_trans + interval '3 days')::timestamp end,
       1, g.id, g.guia, g.nombre_ciudad_destinatario, g.nombre_provincia_destinatario, g.valor_recaudo,
       g.est_guia_efficommerce, g.estado_efficommerce, true
from public.effi_guias g
where g.cuenta like 'DEMO\_%'
  and (g.est_guia_efficommerce = 3 or (g.est_guia_efficommerce in (4, 5) and g.id % 7 = 0))
on conflict do nothing;

-- Wallet: recaudo (1), compra de mercancía (13), flete (7), flete de devolución (9), 4xmil (15) y retiros (17).
-- Como en la operación real, casi todo se liquida: solo quedan sin recaudo algunas entregas de los últimos
-- 10 días y un par de casos viejos para reclamar (salen en "Inconsistencias pendientes de pago" y "Guías sin liquidar").
insert into public.effi_wallet (cuenta, id, fecha_trans, fecha_origen, t_movimiento, tipo_movimiento, detalle, valor, divisa,
  guia_inicial, empresa_guia, sucursal_guia, id_guia, nombre_transportadora_efficommerce, vigente)
select g.cuenta, g.id * 10 + m.k, m.fecha, m.fecha, m.t, m.nombre, 'Movimiento de demostración', m.valor, a.divisa,
       g.guia, g.empresa, 1, g.id, g.nombre_transportadora, true
from public.effi_guias g
join public.effi_accounts a on a.slug = g.cuenta
cross join lateral (
  select k, t, nombre, valor, least(now(), coalesce(g.fecha_estado_final, g.fecha_trans) + interval '2 days') as fecha
  from (values
    (1, 1, 'Recaudo de venta',
       case when g.est_guia_efficommerce = 4 and g.recaudo
             and not (g.id % 17 = 0 and (g.fecha_estado_final > now() - interval '10 days' or g.id % 340 = 0))
         then g.valor_recaudo end),
    (2, 13, 'Compra de mercancía',
       case when g.est_guia_efficommerce = 4 then -round(g.valor_declarado * 0.34, case when a.divisa = 'USD' then 2 else 0 end) end),
    (3, 7, 'Flete crédito con recaudo',
       case when g.est_guia_efficommerce = 4 then -g.valor_flete end),
    (4, 9, 'Flete crédito devolución',
       case when g.est_guia_efficommerce = 5 then -round(g.valor_flete * 1.4, case when a.divisa = 'USD' then 2 else 0 end) end)
  ) v(k, t, nombre, valor)
) m
where g.cuenta like 'DEMO\_%' and m.valor is not null
on conflict do nothing;

insert into public.effi_wallet (cuenta, id, fecha_trans, fecha_origen, t_movimiento, tipo_movimiento, detalle, valor, divisa, vigente)
select a.slug, 900000 + s * 10 + k, now() - make_interval(days => 4 + s * 7), now() - make_interval(days => 4 + s * 7),
       case k when 1 then 17 else 15 end, case k when 1 then 'Retiro de dinero' else '4xmil' end, 'Movimiento de demostración',
       case k when 1 then -round(sum_rec.total * 0.18) else -round(sum_rec.total * 0.0007) end, a.divisa, true
from public.effi_accounts a
cross join generate_series(0, 6) s
cross join generate_series(1, 2) k
cross join lateral (select coalesce(sum(valor), 0) as total from public.effi_wallet w where w.cuenta = a.slug and w.t_movimiento = 1) sum_rec
where a.slug like 'DEMO\_%'
on conflict do nothing;

-- Marca las guías con recaudo y recalcula los resúmenes que lee el panel.
select public.effi_reparar_recaudo();
select public.effi_refrescar_resumenes();

drop table if exists demo_pais, demo_guia;
