# Effi Connect

**El panel y la operación para negocios que venden con [Effi ERP](https://effi.com.co/registro?ref=MzUyMTXHhDE=), listos para desplegar con un solo prompt.** Todo está en este repositorio: el panel web, la base de datos, las funciones, los webhooks y los prompts que le dicen a Claude Code cómo instalarlo por ti.

Parte de El Máster IA ([@elmaster.ia](https://www.instagram.com/elmaster.ia/)) · El Laboratorio. Licencia AGPL-3.0. Proyecto independiente, no oficial de Effi: usa la API pública de Effi con la API key de cada empresa.

## Despliégalo con un solo prompt
Abre Claude Code en una carpeta vacía y pega **todo el contenido de [`PROMPT.md`](PROMPT.md)** (también está, con botón Copiar, en la pestaña Instalación de la página del recurso en El Laboratorio). Ese prompt hace todo: revisa tus herramientas, clona este repositorio, te entrevista, despliega Supabase, conecta tus cuentas de Effi, publica el panel en Vercel, crea los webhooks y verifica el resultado.

Si prefieres algo más corto, esta versión descarga el repositorio y sigue el mismo guion:

```text
Quiero desplegar Effi Connect. Clona https://github.com/El-Master-IA/effi-connect (si no existe la carpeta effi-connect), trabaja dentro de ella, lee PROMPT.md completo y síguelo desde el Paso 0, un paso a la vez y pidiéndome aprobación antes de cambiar algo. Ninguna llave por el chat.
```

Claude te entrevista (países, tipo de negocio y lo que falte) y despliega lo que te toca:
1. **¿En qué países vendes?** Colombia, Ecuador, Guatemala, República Dominicana o Costa Rica.
2. **¿Qué eres?** Marca propia con e-commerce, distribuidor dropshipping o proveedor dropshipping.
3. Lo que falte (nombre de la marca, correo del dueño, si usas Shopify, qué opcionales quieres).

### O como plugin de Claude Code
Para tenerlo siempre a mano (siete skills y el comando `/effi-connect:desplegar`):

```text
/plugin marketplace add El-Master-IA/effi-connect
/plugin install effi-connect@effi-connect
/effi-connect:desplegar
```

Skills: `effi-connect` (orquestador), `effi-supabase`, `effi-cuentas`, `effi-vercel`, `effi-webhooks`, `effi-opcionales` y `effi-verificar`. Puedes llamar cualquiera por separado, por ejemplo para añadir un país o reparar un webhook.

## Qué necesitas
- [Claude Code](https://claude.com/claude-code), Node ≥ 22, pnpm 10 y Git.
- Una cuenta de [Supabase](https://supabase.com) y una de [Vercel](https://vercel.com).
- Tu empresa en Effi con un usuario de **solo consulta** (de ahí sale la API key). ¿Aún no usas Effi? [Crea tu cuenta con mi enlace](https://effi.com.co/registro?ref=MzUyMTXHhDE=).

## Qué se despliega según lo que eres
| | Marca propia | Distribuidor | Proveedor |
|---|---|---|---|
| Supabase + funciones + cron | ✔ | ✔ | ✔ |
| Cuenta Effi tipo `tienda` | ✔ | ✔ | — |
| Cuenta Effi tipo `proveeduria` + módulo Proveeduría | — | — | ✔ |
| Panel en Vercel | ✔ | ✔ | ✔ |
| Webhooks de Effi | 9 eventos | 9 eventos | 7 eventos |
| Agente, informe diario, Meta Ads | opcional | opcional | informe |

## Los webhooks
Claude te muestra la lista exacta de webhooks y **espera tu aprobación** antes de crear nada.
- **Effi** no tiene API para crearlos, así que Claude conduce el navegador y llena cada formulario; tú aprietas *Guardar* y pegas el secreto en Supabase.
- **Shopify** sí permite crearlos por API (`scripts/crear-webhooks-shopify.mjs`), pero el panel aún no tiene receptor de Shopify: solo si tienes tu propio receptor.
- `scripts/verificar-webhooks.mjs` te dice qué eventos ya llegan y cuáles faltan.

## Qué trae el panel
| Pantalla | Para qué |
|---|---|
| 🛒 **Datos** | Despachado vs. entregado, resumen diario, PyG, pendientes y gastos de un país |
| 🏤 **Disponible en oficina** | CRM para llamar a los clientes con guías esperando en oficina |
| ⚠️ **Novedades** | Bandeja de novedades con seguimiento, llamadas y soluciones |
| 🤖 **Agente** | Convierte órdenes en guías y vigila novedades de forma automática |
| 🏭 **Proveeduría** | Ventas a las tiendas, inventario, compras y cartera de la proveeduría |
| 🌎 **Global** | Todos los países juntos, en moneda local y en USD |
| 📢 **Publicidad** | Gasto en Meta Ads frente a ventas (opcional) |
| 🚚 **Transportadoras y ciudades**, 🪙 **Wallet en vivo**, 💰 **Wallet y PyG** | La operación y el dinero minuto a minuto |
| ⏳ **Guías sin liquidar** | Entregadas sin recaudo acreditado: para reclamarlas |
| 👥 **Usuarios y permisos** | Socios, empleados y proveedores con módulos y cuentas asignadas |

## Estructura del repositorio
| Carpeta | Qué es |
|---|---|
| `apps/web` | Panel Next.js 16 + Tailwind 4 |
| `supabase/` | Migraciones (Postgres + RLS), Edge Functions, seed de demostración y tests |
| `packages/core` | Reglas de negocio puras ([docs/reglas-negocio.md](docs/reglas-negocio.md)) |
| `packages/effi` | Cliente de la API de Effi ([docs/effi-api.md](docs/effi-api.md)) |
| `packages/adapters` | Puertos para IA, canales, logística y comercio ([docs/adaptadores.md](docs/adaptadores.md)) |
| `PROMPT.md`, `prompts/` | El guion maestro y un prompt por paso |
| `skills/`, `commands/`, `.claude-plugin/` | El plugin de Claude Code |
| `perfiles/` | Perfiles de negocio y datos por país |
| `scripts/` | Generador de SQL de cuentas, verificador y creador de webhooks, y utilidades de claves |
| `docs/` | Arquitectura, API de Effi, datos que vas a necesitar y seguridad |

Detalle técnico en [docs/arquitectura.md](docs/arquitectura.md).

## Desarrollo
```bash
pnpm install
pnpm check        # typecheck + tests (incluye las migraciones sobre Postgres real)
pnpm dev          # panel en http://localhost:3100
```
¿Solo quieres verlo? Carga `supabase/seed/demo.sql` (y `demo-simulador.sql` para ver En vivo en movimiento).

## Seguridad
Ninguna llave pasa por el chat ni por git. Las pegas tú en el SQL Editor de Supabase o en tu `.env` local. Detalle en [`docs/seguridad.md`](docs/seguridad.md) y [`SECURITY.md`](SECURITY.md).

## Hoja de ruta
- [x] **Núcleo**: reglas de negocio, cliente de Effi, webhooks con firma.
- [x] **Panel de analítica**, sync, agente e informes.
- [x] **Despliegue guiado por prompts y plugin** (este kit).
- [ ] **República Dominicana** completa en el panel (el SQL ya la acepta).
- [ ] **Organizaciones abiertas**: alta de organización y conexión de cuentas Effi desde el panel, sin SQL.
- [ ] **Pedidos contraentrega**: crear orden y guía en Effi desde el panel.
- [ ] **Adaptadores**: Shopify, WhatsApp, Beemo y asistentes de IA con tu propia clave (hoy solo hay las interfaces).
- [ ] **MCP**: consulta y opera tu negocio desde Claude, ChatGPT o Gemini.

## Comunidad
Si entras a Effi con [mi enlace](https://effi.com.co/registro?ref=MzUyMTXHhDE=), no te cuesta más y te sumas a la [comunidad de El Máster IA en WhatsApp](https://chat.whatsapp.com/F5QDgl4imsjBjW1KL2DhRE). Ahí comparto cada recurso que armo para Effi (prompts, plugins, automatizaciones y las novedades de este panel) para que lo integres a tu operación.

## Contribuir
Lee [CONTRIBUTING.md](CONTRIBUTING.md). Los adaptadores nuevos (otra IA, otro canal, otra logística) son la contribución más útil.

## Créditos
El panel de analítica parte de *Torre de Control*, de Oswaldo Alarcón.

## Licencia
El código, los prompts y el plugin están bajo [AGPL-3.0](LICENSE), titular El Máster IA. Puedes usarlo, modificarlo y alojarlo. Si ofreces una versión modificada como servicio, tienes que publicar tus cambios.

**Marcas y arte.** Los logos de Effi, Claude, OpenAI, Gemini, Copilot, Supabase, Vercel y Shopify son marcas de sus dueños y esta licencia no los cubre. La portada, el panda y la marca El Máster (incluido `.claude-plugin/icon.png`) son de El Máster IA, todos los derechos reservados.
