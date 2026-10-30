# Paso 1 · Supabase (base de datos, funciones y Vault)

Objetivo: dejar el proyecto de Supabase con el esquema de Effi Connect, las funciones desplegadas y la URL de funciones en Vault.

## Instrucciones para Claude
1. Comprueba herramientas: `node -v` (≥ 22), `pnpm -v` (10), `git --version` y la CLI de Supabase (`supabase --version`). Si falta algo, dime cómo instalarlo y espera.
2. Confirma que estás en la raíz del repositorio de Effi Connect (deben existir `apps/web`, `supabase/` y `package.json`). Si no es así, clónalo con `git clone https://github.com/El-Master-IA/effi-connect.git` y trabaja dentro de esa carpeta. Corre `pnpm install`.
3. Pídeme el **project ref** de mi proyecto de Supabase (Settings → General). Si no tengo proyecto, guíame para crearlo en supabase.com (el plan gratuito sirve para empezar) y espera.
4. Pídeme que ejecute yo `supabase login` y `supabase link --project-ref <ref>` en mi terminal.
5. Muéstrame qué vas a aplicar y, con mi aprobación:
   - `supabase db push` (aplica todas las migraciones)
   - `supabase functions deploy --use-api` (despliega `effi-sync`, `effi-webhook`, `auto-*`, etc.)
6. Guarda la URL de funciones en Vault. Dame **este SQL** para pegarlo yo en Supabase → SQL Editor, con el ref ya puesto:
   `select vault.create_secret('https://<ref>.supabase.co', 'effi_functions_url');`
   (Sin esa URL, el cron no actúa.)
7. Verifica leyendo, sin escribir: dame un SQL de solo lectura para comprobar que existen `effi_accounts`, `effi_webhook_events` y los trabajos de cron (`select jobname from cron.job order by 1;`).

## Hecho cuando
`db push` terminó sin error, las funciones aparecen desplegadas y `effi_functions_url` existe en Vault.
