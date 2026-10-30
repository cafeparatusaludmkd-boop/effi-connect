---
name: effi-supabase
description: Paso 1 de Effi Connect. Prepara Supabase para Effi Connect - aplica migraciones, despliega las funciones y guarda la URL de funciones en Vault. Úsala cuando haya que montar o reparar la base de datos de Effi Connect.
---

# Effi Connect · Paso 1 · Supabase

Lee y sigue `../../prompts/01-supabase.md` (relativo a la carpeta base de esta skill).

Recuerda: nada de secretos en el chat; muestra qué vas a aplicar y espera el "sí" antes de `supabase db push` y `supabase functions deploy`. La persona ejecuta ella misma `supabase login`, `supabase link` y el SQL de Vault.
