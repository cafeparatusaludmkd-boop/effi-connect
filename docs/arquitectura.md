# Arquitectura

Effi Connect junta tres fuentes:

1. **El panel de analítica Effi**: fork de *Torre de Control* (Next.js + Supabase). Aporta el diseño, las 24 pantallas, el sync con la API de Effi y los indicadores en SQL.
2. **La operación de un SaaS contraentrega tipo iComfly**: pedidos, bandeja de WhatsApp, asistentes de IA, flujos y logística.
3. **El conocimiento de Effi ERP** (23 módulos, 342 endpoints, 186 eventos de webhook, MCP): qué hace la API y qué le falta, para construir encima lo que Effi todavía no trae.

```
apps/web            Panel Next.js 16 (diseño y pantallas del fork), puerto 3100
packages/core       Reglas de negocio puras y probadas (estados, métricas, wallet/PyG, semáforos)
packages/effi       Cliente de la API de Effi, sync por ventanas, verificación HMAC de webhooks
packages/adapters   Puertos para IA (BYOK), canales (WhatsApp, Zernio, voz), logística y comercio
supabase/           Migraciones, Edge Functions (sync, webhook, agente, informes, Meta Ads) y tests
```

## Datos y permisos (heredado del fork)
- **Cuenta Effi** = `effi_accounts.slug` (`TIENDA_CO`, `PROV_GT1`…), de tipo `tienda` o `proveeduria`. Cada cuenta pertenece a una **sociedad**, que hace de organización.
- **Usuarios**: `owner` (ve todo y elige qué sociedad mirar), `socio` (todas las tiendas de su sociedad), `empleado` y `proveedor` (solo las cuentas y módulos que les asignen), `pendiente` (registrado y esperando aprobación).
- **Módulos** (`apps/web/src/lib/modulos.ts`): Datos, Global, Disponible en oficina, Guías y en vivo, Novedades, Dinero, Agente, Proveeduría. RLS en Postgres hace que cada usuario solo lea lo suyo.
- Los indicadores se calculan en SQL (`kpi_*`, `envivo_*`, `novedades_*`, `oficina_*`, `prov_*`) con resúmenes precalculados. Por eso el panel es rápido con decenas de miles de guías.

## Flujo de datos Effi
1. **Webhook** (`effi-webhook`): guarda el aviso y responde en < 5 s.
2. **Sync** (`effi-sync`, cron cada minuto): trae cada recurso desde su cursor y avanza las cargas históricas; Postgres mapea y hace upsert idempotente.
3. **Agente** (`auto-convertir`, `auto-vigilancia`): convierte órdenes en guías y vigila novedades según la configuración de cada cuenta.
4. **Informes** (`informe-diario`, `informe-imagen`) y **TRM diaria** (`trm-diaria`) para la vista multi-moneda.

## Lo que se suma desde iComfly y Effi-System (hoja de ruta)
| Módulo | De dónde sale | Cómo se conecta |
|---|---|---|
| **Pedidos contraentrega** | iComfly (pipeline sin confirmar → guía → tránsito → novedad → entregado) | `POST api/orden_v` y `POST api/guia_transporte` de Effi, con `idempotency_key` |
| **Bandeja de WhatsApp** | iComfly | `ChannelProvider` (WhatsApp Cloud API). Effi no expone EffiChat por API |
| **Asistentes de IA con tu clave** (ventas, novedades, cobranza) | iComfly (8 asistentes BYOK) | `LLMProvider`: Claude, GPT o Gemini, a elección de cada organización |
| **Redes sociales y voz** | iComfly + pedido del dueño | `ChannelProvider` con Zernio (redes) y un proveedor de voz |
| **MCP propio** | iComfly (conector MCP) + MCP oficial de Effi | Consultar y operar el negocio desde Claude, ChatGPT o Gemini |
| **Alertas proactivas** | Effi-System (huecos detectados: stock, cartera, resoluciones DIAN, guías estancadas) | Webhooks de Effi + canal de WhatsApp o correo |
| **Bot de cobranza** | Effi-System | `POST api/seguimiento_cobro` + WhatsApp |
| **Catálogo de dropshipping** | Effi-System (Effi no expone convenios por API) | Vista de proveeduría + sincronización con la tienda del distribuidor |

## Seguridad
- Toda tabla con datos de una cuenta tiene RLS; las funciones de servidor se revocan para `anon` y `authenticated`.
- Webhooks: idempotencia por delivery; el aviso se reconsulta en la API antes de confiar en él.
- Secretos (API keys de Effi, tokens de Meta, credenciales de correo) solo en Supabase Vault.
- Repo público: sin datos de clientes reales, sin credenciales y sin material de auditorías de terceros.
