---
name: effi-webhooks
description: Paso 4 de Effi Connect. Aprueba y crea los webhooks que avisan a Effi Connect en tiempo real - los de Effi conducidos por el navegador (Effi no tiene API para crearlos) y los de Shopify por API si hay receptor propio. Úsala para crear, revisar o reparar webhooks.
---

# Effi Connect · Paso 4 · Webhooks

Lee y sigue `../../prompts/04-webhooks.md` (relativo a la carpeta base de esta skill).

Puntos críticos:
- **Primero el plan y un "sí" explícito** (tabla cuenta → URL → eventos). Sin aprobación no se crea nada.
- Eventos por perfil en `../../perfiles/perfiles.json`.
- En Effi la persona aprieta *Guardar* y copia el secreto ella misma; tú no lo lees. Si guarda el secreto de un evento, esa cuenta exige firma en todos sus avisos: guardar el de cada evento.
- Shopify: `../../scripts/crear-webhooks-shopify.mjs` (dry-run por defecto; `--aplicar` solo con aprobación). Effi Connect no trae receptor de Shopify todavía.
- Verifica con `../../scripts/verificar-webhooks.mjs`.
