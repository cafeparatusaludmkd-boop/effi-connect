-- Extensiones que usan el sync programado (pg_cron) y las llamadas a Edge Functions (pg_net).
-- En Supabase existen pero vienen apagadas en un proyecto nuevo. pg_net va en `extensions`, no en `public`.
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;
