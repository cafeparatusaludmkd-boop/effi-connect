# Integración con la API de Effi

Lo que hay que saber para hablar con `https://effi.com.co/api`. El cliente está en `packages/effi`.

## Autenticación
- `Authorization: Bearer <API key>`. La key es de un **usuario** de Effi: Administración → Usuarios → Ver más detalles.
- Recomendado: crear en cada empresa un usuario de **solo consulta** para Effi Connect y usar su key.
- Dura **360 días**; al renovarla, la anterior deja de funcionar de inmediato. El panel avisa 30 días antes.
- Una key por empresa Effi. Se guarda cifrada en Supabase Vault; la tabla `effi_accounts` solo guarda la referencia.

## Límites
- **120 peticiones/min por key.** Si se pasa, 429 con `Retry-After`. El cliente espacia ≥ 550 ms y reintenta.
- **Paginación:** `pagina` y `por_pagina` (máx. 100); la respuesta trae `paginacion.total_paginas`.
- **Rangos:** `hist_est_guia_transporte` y `movimiento_dinero_effi` exigen fecha desde y aceptan máximo **31 días** por consulta.
- `guia_transporte` sin `desde` solo trae las guías desde ayer; `orden_v` sin parámetros solo el mes actual; `novedad_guia_transporte` sin filtros solo los últimos 5 días y `t_novedad=2`. **Siempre se envían ambos extremos.**
- `hist_est_guia_transporte`: la página 2+ llega vacía. `novedad_guia_transporte`: las páginas se solapan. En esos dos no se pagina: se parte el rango en ventanas de ≤ 100 filas.
- **Llave de cualquier documento:** `empresa + sucursal + id` (el id se repite entre sucursales).
- **Fechas:** los datos vienen en UTC; los filtros se interpretan en la zona horaria de la empresa (`tz_offset_min`).
- **Agregados:** `agrupar_por` en `guia_transporte` (transportadora, estado, ciudad, día, mes…) devuelve totales sin paginar. Sirve para KPIs rápidos y para cuadrar contra el detalle.

## Endpoints que usa Effi Connect
| Endpoint (GET) | Uso |
|---|---|
| `orden_v`, `est_orden_v` | Órdenes de venta y sus estados propios por empresa |
| `remision_v`, `factura_v` | Ventas; traen guía y datos de dropshipping |
| `guia_transporte` | Guías: estado global, recaudo, flete, transportadora, dropshipping |
| `hist_est_guia_transporte` | **Cada fila es un cambio de estado** (el dato más importante) |
| `novedad_guia_transporte`, `gestion_novedad_guia_transporte` | Novedades y sus gestiones |
| `movimiento_dinero_effi` | Wallet; `guia_inicial`/`guia_adicional` unen el dinero con la guía |
| `solicitud_retiro_cuenta_effi`, `transferencia_cuenta_effi` | Caja (fuera del PyG) |
| `est_guia_efficommerce`, `transportadora_efficommerce` | Catálogos globales |
| `cliente`, `articulo`, `centro_costos`, `sucursal` | Catálogos por empresa |

Para crear pedidos y guías desde Effi Connect (ola 4) existen `POST api/orden_v` y `POST api/guia_transporte`; ambos reciben la dirección como datos y aceptan `idempotency_key`.

## Webhooks
- Effi hace `POST` firmado con HMAC-SHA256: `X-Effi-Signature: sha256=<hex>`, `X-Effi-Delivery` (idempotencia) y `X-Effi-Event`.
- Hay que responder 2xx en menos de 5 s: se guarda en `effi_webhook_events` y se procesa aparte.
- Aun con firma válida, el aviso se trata como no confiable: el procesador vuelve a consultar el registro en la API.
- Si el webhook falla, Effi reintenta 12 veces durante unos 3 días y lo marca **Inactivo**; lo que pase mientras tanto no se recupera por webhook. Por eso el sync programado por API sigue siendo obligatorio.

## MCP de Effi
Effi tiene su propio servidor MCP (`https://effi.com.co/mcp`) para que una IA consulte el ERP. Effi Connect no lo usa para sincronizar (usa la API REST); su propio servidor MCP (ola 5) expone las métricas ya calculadas.

## Conectar los webhooks (tiempo real)
En Effi: **Integraciones → Webhooks → Crear**, un webhook por evento, todos con la misma URL:

`https://<tu-proyecto>.supabase.co/functions/v1/effi-webhook?cuenta=<NOMBRE_CORTO>` (ej. `?cuenta=TIENDA_CO`)

Plataforma destino: *Otra*. Sin cabeceras adicionales. Eventos recomendados:

| Evento | Para qué |
|---|---|
| `guia_transporte.tracking` | Cambio de estado de guía (lo más importante) |
| `guia_transporte.crear`, `guia_transporte.anular` | Guías nuevas y anuladas |
| `orden_v.crear`, `orden_v.estado` | Órdenes de venta (En vivo y Agente) |
| `remision_v.crear` | Remisiones (paso de orden a guía) |
| `novedad_guia_transporte.crear`, `gestion_novedad_guia_transporte.crear` | Novedades y sus soluciones |
| `movimiento_dinero_effi.crear` | Wallet: recaudos y fletes |

Cómo funciona: el aviso se guarda y responde en menos de 1 s; en segundo plano se relee la API (sync o vigilancia de la
cuenta), así que el cambio aparece en segundos. El contenido del aviso no se usa como dato. Hay un freno de 5 s para que
una ráfaga de avisos no gaste el límite de la API. El sync de cada minuto sigue de respaldo (Effi desactiva un webhook
tras 12 fallos).

**Verificar la firma (opcional):** al crear cada webhook Effi muestra su secreto una vez. Si lo guardas con
`select public.effi_set_webhook_secreto('<NOMBRE_CORTO>', '<evento>', '<secreto>');` en el SQL Editor, desde ese momento
esa cuenta exige firma `X-Effi-Signature` válida en **todos** sus avisos (guarda el de cada evento que registraste).
