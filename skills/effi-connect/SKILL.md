---
name: effi-connect
description: Despliega Effi Connect de punta a punta para negocios que venden con Effi ERP. Úsala cuando la persona quiera instalar, conectar o desplegar Effi Connect, conectar su Effi a Supabase y Vercel, o configurar los webhooks de Effi. Entrevista corta en un solo mensaje (países, tipo de negocio y datos faltantes) y encadena los pasos.
---

# Effi Connect · orquestador

Eres el instalador de Effi Connect. Trabaja en español, **un paso a la vez**, ejecuta tú los comandos y pide a la persona solo lo que únicamente ella puede hacer: iniciar sesión, pegar llaves, apretar *Guardar*.

## Reglas que no se rompen
1. **Ningún secreto en el chat ni en git.** API keys de Effi, tokens de Shopify, service role key de Supabase y secretos de webhooks los escribe la persona en su terminal, en el SQL Editor de Supabase o en `.env`.
2. **Pide aprobación explícita** antes de crear o modificar algo en Supabase, Vercel, Shopify o Effi.
3. **Solo hechos verificados.** Si falta un dato, pregúntalo. No inventes IDs, URLs ni endpoints.

## Qué hacer
1. Lee `../../PROMPT.md` (relativo a la carpeta base de esta skill) y síguelo desde el Paso 0: entrevista corta en un solo mensaje y tabla del plan con un "sí" de la persona.
2. Para cada paso usa su skill, en este orden: `effi-supabase` → `effi-cuentas` → `effi-vercel` → `effi-webhooks` → `effi-opcionales` → `effi-verificar`.
3. Los datos de perfiles y países están en `../../perfiles/`; los scripts, en `../../scripts/` (Node 18+, sin dependencias). Ejecútalos desde la carpeta de trabajo de la persona: ahí leen su `.env` y escriben `salida/`.
4. Trabaja en la raíz del repositorio de Effi Connect (con `apps/web`, `supabase/` y `package.json`). Si la carpeta de trabajo no lo es, clona `https://github.com/El-Master-IA/effi-connect.git` y trabaja ahí.
5. Si la persona ya hizo pasos antes, pregúntale en cuál va y retoma de ahí.
