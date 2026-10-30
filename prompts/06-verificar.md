# Paso 6 · Verificación de punta a punta

Marca cada punto con evidencia (salida de comando o lo que ves en pantalla), no con suposiciones.

1. **Base**: `select jobname, schedule from cron.job order by 1;` muestra los trabajos de sync, vigilancia y novedades.
2. **Cuentas**: cada cuenta activa; `effi_sync_state` sin `ultimo_error`; guías cargándose.
3. **Panel**: la URL de Vercel responde 200 y entro como dueño; veo los datos de cada país.
4. **Webhooks**: `node scripts/verificar-webhooks.mjs --perfil <perfil> --cuenta <SLUG>` sin eventos críticos faltantes tras una acción real en Effi.
5. **Seguridad**: `.env` está ignorado por git (`git check-ignore .env`), no hay claves en `git log -p`, y la service role key solo existe en mi computador y en las funciones de Supabase.
6. **Recordatorios**: la API key de Effi vence a los 360 días; los webhooks inactivos no se recuperan solos; mantén el sync por cron.

Entrégame un resumen corto: qué quedó listo, qué quedó pendiente y el siguiente paso más pequeño.
