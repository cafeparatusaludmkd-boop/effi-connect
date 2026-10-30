---
name: effi-cuentas
description: Paso 2 de Effi Connect. Registra una cuenta de Effi por país en Effi Connect (slug terminado en _PAÍS), genera el SQL sin la API key y arranca el sync. Úsala para conectar o añadir una empresa de Effi, o renovar su API key.
---

# Effi Connect · Paso 2 · Cuentas de Effi

Lee y sigue `../../prompts/02-cuentas-effi.md` (relativo a la carpeta base de esta skill).

Genera el SQL con `../../scripts/generar-sql-cuenta.mjs` ejecutándolo desde la carpeta de trabajo. **Nunca pidas ni leas la API key**: la persona la pega en el SQL Editor de Supabase. Perfiles en `../../perfiles/perfiles.json`; países en `../../perfiles/paises.json` (avisa que DO aún no está completa en el panel web).
