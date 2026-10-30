# Paso 5 · Opcionales (solo lo que dije que quería)

Pregunta cuáles activar y haz **solo esos**. Todos usan secretos que yo escribo en mi terminal, no en el chat.

## Agente (convierte órdenes en guías y vigila novedades)
- Se enciende por cuenta en la tabla `auto_config` (campo `modo`). Antes de cambiar nada, lee la migración del agente en `supabase/migrations`, explícame qué valores admite `modo` y propón el más conservador.
- El cron ya corre `auto-vigilancia` y `auto-convertir` cada minuto; solo actúan si `effi_functions_url` está en Vault y el modo no es `apagado`.

## Informe diario por correo (Gmail)
- Necesita una contraseña de aplicación de Gmail. El script `scripts/push-gmail.mjs` la guarda en Vault. Dime que lo ejecute yo en mi terminal; tú no la ves.

## Gasto en Meta Ads
- Necesita un token de acceso de Meta. `scripts/push-meta.mjs` lo guarda en Vault. Lo ejecuto yo; tú no lo ves.

## Pedidos desde otros canales
- WhatsApp, Beemo y otros canales de mensajería todavía no tienen adaptador implementado en Effi Connect (`packages/adapters` solo trae las interfaces). Dímelo claramente si pregunto por ellos y no inventes configuraciones.
