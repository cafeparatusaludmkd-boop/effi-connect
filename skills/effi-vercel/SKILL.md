---
name: effi-vercel
description: Paso 3 de Effi Connect. Publica el panel web de Effi Connect en Vercel conectado a Supabase, con las dos variables públicas, y registra al dueño. Úsala para desplegar o reparar el panel.
---

# Effi Connect · Paso 3 · Panel en Vercel

Lee y sigue `../../prompts/03-web-vercel.md` (relativo a la carpeta base de esta skill).

Solo van variables `NEXT_PUBLIC_*` (URL y anon key). La service role key **nunca** va al panel ni a Vercel. El primer usuario registrado queda como dueño: que se registre la persona antes de compartir la URL.
