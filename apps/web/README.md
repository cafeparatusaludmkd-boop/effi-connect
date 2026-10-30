# Effi Connect · web

Panel web de Effi Connect (Next.js 16 App Router, React 19, Tailwind 4, Supabase): guías, estados, novedades, publicidad y dinero de Effi en vivo.

## Requisitos

- Node 24 y pnpm.
- Un proyecto de Supabase con el esquema de `supabase/` aplicado.

## Variables de entorno

Crea `apps/web/.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
```

## Desarrollo

Desde la raíz del monorepo:

```bash
pnpm install
pnpm --filter @effi-connect/web dev        # http://localhost:3100
pnpm --filter @effi-connect/web typecheck  # next typegen && tsc --noEmit
pnpm --filter @effi-connect/web build
pnpm --filter @effi-connect/web start      # puerto 3100
```

## Cuentas de Effi

Cada cuenta se identifica con un slug que termina en el código de país (`TIENDA_CO`, `TIENDA_GT`, ...). De ese código salen país, bandera, moneda, zona horaria e indicativo (ver `src/lib/paises.ts`).
