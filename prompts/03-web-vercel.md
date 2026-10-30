# Paso 3 · Panel web en Vercel

Objetivo: publicar el panel (`apps/web` de Effi Connect) conectado a mi Supabase.

## Instrucciones para Claude
1. Pídeme desde Supabase → Settings → API la **Project URL** y la **anon/publishable key** (la pública, no la service role). Ambas pueden ir en variables públicas.
2. En la raíz del repositorio, crea `apps/web/.env.local` con solo:
   `NEXT_PUBLIC_SUPABASE_URL=` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (yo pego los valores). Comprueba que `.env.local` esté ignorado por git.
3. Prueba local: `pnpm install` y `pnpm dev` (http://localhost:3100). Verifica que la página de registro carga.
4. **El primer usuario que se registre queda como dueño.** Pídeme que me registre yo, con el correo del dueño que dije en la entrevista, antes de compartir la URL.
5. Despliegue en Vercel (con mi aprobación): proyecto desde el repo con *Root Directory* `apps/web`, framework Next.js, y las dos variables `NEXT_PUBLIC_*`. Si uso la CLI, que ejecute yo `vercel login`. Verifica el build leyendo los logs.
6. Cuando la URL de Vercel funcione, pídeme que cree mi usuario si aún no lo hice y revisa que las cuentas creadas en el Paso 2 aparezcan en el selector del panel.

## Hecho cuando
El panel responde 200 en la URL de Vercel, entro como dueño y veo mis cuentas.
