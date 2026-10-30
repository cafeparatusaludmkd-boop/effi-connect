#!/usr/bin/env node
// Revisa qué webhooks de Effi ya están llegando a tu Effi Connect y cuáles faltan.
// Lee la bandeja effi_webhook_events con la service role key de TU .env (solo local).
//
// Uso: node scripts/verificar-webhooks.mjs --perfil marca-propia [--cuenta TIENDA_CO] [--horas 72]
import { cargarEnv, argumentos, exigir, leerJson, CUENTA_RE } from './lib.mjs';

cargarEnv();
const a = argumentos();
const perfiles = leerJson('perfiles/perfiles.json');
const perfil = perfiles[a.perfil];
if (!perfil) { console.error(`--perfil debe ser uno de ${Object.keys(perfiles).join(', ')}`); process.exit(1); }

const cuenta = String(a.cuenta ?? process.env.CUENTA ?? '').toUpperCase();
if (!CUENTA_RE.test(cuenta)) { console.error('Indica --cuenta (o CUENTA en .env), ej. TIENDA_CO'); process.exit(1); }
const horas = Number(a.horas ?? 72);

const base = exigir('SUPABASE_URL').replace(/\/$/, '');
const clave = exigir('SUPABASE_SERVICE_ROLE_KEY');
const desde = new Date(Date.now() - horas * 3600_000).toISOString();

const url = `${base}/rest/v1/effi_webhook_events?cuenta=eq.${cuenta}&recibido_en=gte.${desde}` +
  '&select=evento,firma,recibido_en,procesado_en,error&order=recibido_en.desc&limit=1000';
const res = await fetch(url, { headers: { apikey: clave, Authorization: `Bearer ${clave}` } });
if (!res.ok) { console.error(`Supabase respondió HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
const filas = await res.json();

const porEvento = new Map();
for (const f of filas) {
  const e = f.evento ?? '(sin evento)';
  const r = porEvento.get(e) ?? { total: 0, firmados: 0, errores: 0, sinProcesar: 0, ultimo: f.recibido_en };
  r.total++;
  if (f.firma) r.firmados++;
  if (f.error) r.errores++;
  if (!f.procesado_en) r.sinProcesar++;
  porEvento.set(e, r);
}

console.log(`Cuenta ${cuenta} · últimas ${horas} h · ${filas.length} avisos\n`);
let faltan = 0;
for (const evento of perfil.webhooksEffi) {
  const r = porEvento.get(evento);
  if (!r) { faltan++; console.log(`  ✗ ${evento}  (no ha llegado ningún aviso)`); continue; }
  const notas = [];
  if (r.errores) notas.push(`${r.errores} con error`);
  if (r.sinProcesar) notas.push(`${r.sinProcesar} sin procesar`);
  if (r.firmados === 0) notas.push('sin firma');
  console.log(`  ✓ ${evento}  ${r.total} avisos, último ${r.ultimo}${notas.length ? ' · ' + notas.join(', ') : ''}`);
}
const extra = [...porEvento.keys()].filter((e) => !perfil.webhooksEffi.includes(e));
if (extra.length) console.log(`\nOtros eventos recibidos: ${extra.join(', ')}`);
console.log(faltan
  ? `\nFaltan ${faltan} evento(s). Pueden no haber ocurrido todavía: genera uno de prueba en Effi o revisa que el webhook exista y esté Activo.`
  : '\nTodos los eventos del perfil han llegado al menos una vez.');
process.exit(faltan ? 2 : 0);
