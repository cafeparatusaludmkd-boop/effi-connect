# Paso 4 · Aprobar y crear los webhooks

Objetivo: que Effi (y Shopify, si aplica) avisen a tu Effi Connect en segundos cuando algo cambia. Sin webhooks todo igual funciona: el sync por cron corre cada minuto. Los webhooks lo vuelven casi inmediato.

## Lo que hay que saber antes (verificado)
- **Effi no tiene API para crear webhooks.** Se crean en su interfaz: Integraciones → Webhooks → Acciones → Crear, **uno por evento**, todos con la misma URL. Por eso Claude conduce el navegador por ti, pero tú aprietas "Guardar".
- Al guardar, Effi muestra el **secreto una sola vez**. Con él Effi Connect valida la firma `X-Effi-Signature` (HMAC-SHA256). Es opcional, pero recomendado.
- **Si guardas el secreto de algún evento, esa cuenta empieza a exigir firma en TODOS sus avisos.** Por eso hay que guardar el de cada evento que registres.
- Effi reintenta 12 veces (unos 3 días) y luego marca el webhook **Inactivo**. El sync por cron es el respaldo; revisa de vez en cuando que sigan Activos.
- Un aviso de webhook nunca se toma como dato: Effi Connect vuelve a consultar el registro en la API.

## Instrucciones para Claude

### A. Plan y aprobación (obligatorio)
1. Lee `perfiles/perfiles.json` y la lista de cuentas del Paso 2. Calcula, **por cuenta**, cuántos webhooks hay que crear (eventos del perfil).
2. Muéstrame la tabla: cuenta → URL → eventos. La URL es:
   `https://<project-ref>.supabase.co/functions/v1/effi-webhook?cuenta=<SLUG>`
3. Pregunta: **"¿Apruebas que cree estos N webhooks?"**. No avances sin un "sí" explícito. Si dice que no a alguno, quítalo del plan.

### B. Webhooks de Effi (conducidos por el navegador)
Para cada cuenta, entra en la sesión de Effi de esa empresa (yo inicio sesión; tú nunca escribes ni ves mi contraseña):
1. Integraciones → Webhooks → Acciones → Crear.
2. Nombre: `effi-connect <evento>`; evento: el de la lista; plataforma destino: **Otra**; URL: la de la tabla; **sin cabeceras adicionales**.
3. Deja el formulario listo y **detente antes de Guardar**: guardo yo. Tras guardar, **copio el secreto yo mismo** (no lo leas ni lo repitas).
4. Dame este SQL con la cuenta y el evento ya puestos para que lo corra en Supabase → SQL Editor, pegando el secreto yo:
   `select public.effi_set_webhook_secreto('<SLUG>', '<evento>', 'PEGA_AQUI_EL_SECRETO');`
5. Repite con el siguiente evento. Si ya no hay navegador disponible, dame una lista numerada de clics con los valores listos para copiar.

### C. Webhooks de Shopify (solo si vendo en Shopify y tengo un receptor propio)
- Effi Connect **todavía no trae receptor de Shopify**. Si mi tienda está conectada a Effi con su integración nativa, **no hace falta**: Effi recibe los pedidos y Effi Connect se entera por los webhooks de Effi.
- Si tengo mi propio receptor (por ejemplo un webhook de n8n), primero muestra el plan sin crear nada:
  `node scripts/crear-webhooks-shopify.mjs --endpoint https://mi-receptor.example.com/shopify`
- Con mi aprobación, créalos agregando `--aplicar`. Requiere `SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN` y `SHOPIFY_API_VERSION` en mi `.env` (la versión estable vigente: verifícala en la documentación de Shopify, no de memoria).

### D. Verificación
1. Pídeme generar un cambio real o de prueba en Effi (una orden o un cambio de estado de guía).
2. Corre `node scripts/verificar-webhooks.mjs --perfil <perfil> --cuenta <SLUG>` (usa mi `.env` local).
3. Informa qué eventos llegaron, cuáles faltan y si hay avisos sin firma o con error. Los eventos que no han ocurrido todavía no son un fallo.

## Hecho cuando
Cada evento aprobado existe y está Activo en Effi, y el verificador muestra al menos los avisos de guía llegando a `effi_webhook_events`.
