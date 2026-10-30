-- Trabajos programados del Agente que en el proyecto original se crearon a mano tras desplegar las funciones.
-- Sin ellos no se leen las órdenes de venta de Effi (En vivo y la pantalla Agente se quedan en cero).
--  · auto-vigilancia: cada 2 minutos trae órdenes y remisiones de los últimos 3 días de las cuentas que no
--    estén en modo "apagado". Solo lee: no crea nada en Effi.
--  · auto-convertir: cada minuto; solo actúa en cuentas en modo "simular" o "automatico" (por defecto es "vigilar").
-- Si el proyecto aún no guardó effi_functions_url en Vault, no hacen nada.

select cron.schedule('auto-vigilancia', '*/2 * * * *', $c$
  select public.auto_vigilancia_disparar() where public.effi_functions_url() is not null;
$c$);

select cron.schedule('auto-convertir', '* * * * *', $c$
  select public.auto_convertir_tick() where public.effi_functions_url() is not null;
$c$);
