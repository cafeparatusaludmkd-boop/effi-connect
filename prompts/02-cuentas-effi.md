# Paso 2 · Cuentas de Effi (una por país)

Objetivo: registrar cada empresa de Effi como una cuenta de Effi Connect y empezar a sincronizar.

## Instrucciones para Claude
1. Para cada país elegido arma el nombre corto (`slug`): MAYÚSCULAS, números y `_`, **terminado en `_` + código de país** (`TIENDA_CO`, `MI_MARCA_GT`). Muéstrame la lista y pide mi OK.
2. Tipo de cuenta según el perfil de `perfiles/perfiles.json`: `marca-propia` y `distribuidor` → `tienda`; `proveedor` → `proveeduria`.
3. Si algún país es **DO**, avísame: el SQL lo acepta, pero el panel web aún no trae su bandera ni umbrales propios (ver `perfiles/paises.json`).
4. Por cada cuenta genera el SQL **sin la key**:
   `node scripts/generar-sql-cuenta.mjs --pais CO --perfil marca-propia --slug TIENDA_CO --nombre "Mi marca Colombia"`
5. Explícame cómo conseguir la API key: en Effi, Administración → Usuarios → un usuario de **solo consulta** → Ver más detalles → API key. Una key por empresa Effi.
6. Dime que abra `salida/conectar-<SLUG>.sql`, pegue la key donde dice `PEGA_AQUI_TU_API_KEY` y lo corra en Supabase → SQL Editor. **No me la pidas ni la leas.**
7. Cuando confirme, dame el SQL de seguimiento (cuentas activas, guías cargadas, estado de los trabajos de `effi_sync_jobs`). La carga histórica llega por tramos en las siguientes horas; el límite de Effi es 120 peticiones/min por key.

## Hecho cuando
Cada cuenta aparece activa en `effi_accounts` y sus trabajos de carga histórica avanzan sin error.
