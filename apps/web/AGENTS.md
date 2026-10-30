# Effi Connect · web

- Gestor de paquetes: pnpm. Comandos desde la raíz del monorepo con `pnpm --filter @effi-connect/web <script>`.
- Servidor de desarrollo en el puerto 3100.
- Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (en `apps/web/.env.local`).
- No tocar `supabase/` desde aquí: el contrato con la base son las funciones RPC que llama la web.
- Antes de entregar: `pnpm --filter @effi-connect/web typecheck` y `pnpm --filter @effi-connect/web build`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
