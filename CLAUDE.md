# Effi Connect — contexto para Claude Code

Plataforma open source (AGPL-3.0) de analítica + operación para negocios que venden con Effi ERP. Monorepo pnpm.
El panel (`apps/web`) y el SQL (`supabase/`) son un fork de *Torre de Control*; `packages/` es la base para la parte de operación (pedidos, WhatsApp, IA, MCP) inspirada en iComfly y en lo que la API de Effi no cubre.

## Comandos
- `pnpm check` — typecheck (paquetes + web) y todos los tests. Correrlo antes de dar algo por terminado.
- `pnpm dev` — panel en http://localhost:3100.
- `pnpm test` — Vitest; `supabase/test` aplica todas las migraciones sobre PGlite con Supabase simulado.

## Mapa
- `apps/web` — Next 16 App Router. Cada pantalla consulta Supabase con RPC SQL (`kpi_*`, `envivo_*`, `novedades_*`, `oficina_*`, `prov_*`, `auto_*`, `app_*`). Menú en `src/lib/menu.ts`, módulos y roles en `src/lib/modulos.ts`, países en `src/lib/paises.ts`.
- `supabase/migrations` — esquema heredado: cuentas por `slug` (`TIENDA_CO`), sociedades como organización, usuarios en `app_usuarios` con rol y módulos.
- `supabase/functions` — `effi-sync`, `effi-webhook`, agente (`auto-*`), `novedades`, `proveeduria`, `informe-*`, `meta-gasto`, `trm-diaria`, `registro`.
- `packages/core` — reglas de negocio puras con tests. Fuente de verdad: `docs/reglas-negocio.md`.
- `packages/effi` — cliente REST de Effi y verificación HMAC. `packages/adapters` — puertos LLM / canal / logística / comercio.

## Reglas
- Repo público: **nunca** datos reales de clientes (nombres de empresas, IDs de Effi, correos, teléfonos), secretos ni material de auditorías de otros productos.
- **Dropi no se soporta.** No reintroducir tablas, cargas ni selectores de Dropi.
- Al cambiar una RPC que usa la web, conservar la firma o cambiar la web en el mismo commit.
- Políticas RLS de SELECT que consulten la misma tabla rompen `INSERT … RETURNING`: poner primero una condición que no lea la tabla.
- Los avisos de webhook no son confiables aunque la firma sea válida: se reconsulta el registro en la API.
- Versiones de dependencias: verificarlas en el registro, no de memoria; preferir versiones con ≥ 2 semanas publicadas.
