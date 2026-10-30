// Receptor de webhooks de Effi → relectura inmediata de la API.
// URL a registrar en Effi (un webhook por evento): https://<proyecto>.supabase.co/functions/v1/effi-webhook?cuenta=TIENDA_CO
//
// El aviso se guarda en effi_webhook_events y se responde 2xx en milisegundos (Effi exige < 5 s). No se confía en su
// contenido: en segundo plano se dispara el sync (guías, estados, novedades, wallet) o la vigilancia del agente
// (órdenes y remisiones), que vuelven a consultar la API con la API key de la cuenta. Así el cambio aparece en
// segundos en lugar de esperar al cron, y un aviso falso no puede meter datos.
// Si la cuenta guardó algún secreto de webhook (effi_set_webhook_secreto), se exige firma X-Effi-Signature en todos sus avisos.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_BYTES = 1_000_000;
const CUENTA_RE = /^[A-Z0-9_]{3,32}$/;
const REINTENTOS = 5;
const ESPERA_MS = 3_000;
const FRENO_S = 5; // como máximo un disparo cada 5 s: el sync en total y la vigilancia por cuenta

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const cab = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...cab, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${path.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: Record<string, unknown> = {}) => sb(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string) {
  if (!cabecera) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperada = `sha256=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(cuerpo)))}`;
  const dada = cabecera.trim().toLowerCase();
  if (esperada.length !== dada.length) return false;
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ dada.charCodeAt(i);
  return diff === 0;
}

async function llamar(funcion: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${funcion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': token },
    body: '{}',
  });
  return res.ok ? res.json().catch(() => ({})) : { error: `HTTP ${res.status}` };
}

// Sync de guías/estados/novedades/wallet: si ya corre otro, espera; si una corrida empezó después del aviso, ya lo cubre.
// El freno global evita que una ráfaga de avisos (reales o falsos) gaste el límite de la API de Effi.
async function sincronizar(recibido: string, token: string) {
  if (!(await rpc('effi_webhook_reservar', { p_clave: 'sync', p_segundos: FRENO_S }))) return 'agrupado con un disparo reciente';
  for (let i = 0; i < REINTENTOS; i++) {
    const [ultima] = await sb('effi_sync_runs?select=inicio&order=id.desc&limit=1');
    if (ultima && ultima.inicio >= recibido) return 'cubierto por una corrida posterior';
    const r = await llamar('effi-sync?esperar=1', token);
    if (!r?.resumen?.omitida) return 'sync ejecutado';
    await sleep(ESPERA_MS);
  }
  return 'sync ocupado: lo toma el cron del próximo minuto';
}

// Órdenes y remisiones las trae la vigilancia del agente.
async function vigilar(cuenta: string, recibido: string, token: string) {
  const [cfg] = await sb(`auto_config?cuenta=eq.${cuenta}&select=ultima_corrida,modo`);
  if (!cfg || cfg.modo === 'apagado') return 'agente apagado para la cuenta';
  if (cfg.ultima_corrida && cfg.ultima_corrida >= recibido) return 'cubierto por una vigilancia posterior';
  if (!(await rpc('effi_webhook_reservar', { p_clave: `vigilar:${cuenta}`, p_segundos: FRENO_S }))) return 'agrupado con un disparo reciente';
  await llamar(`auto-vigilancia?cuenta=${cuenta}`, token);
  return 'vigilancia ejecutada';
}

async function procesar(id: number, cuenta: string, evento: string, recibido: string) {
  try {
    const token: string = await rpc('effi_sync_token_valor');
    const venta = /^(orden_v|remision_v|factura_v)\./.test(evento);
    const pasos: string[] = [];
    if (venta) pasos.push(await vigilar(cuenta, recibido, token));
    // Una remisión o factura suele crear guía: también se relee el sync.
    if (!evento.startsWith('orden_v.')) pasos.push(await sincronizar(recibido, token));
    await sb(`effi_webhook_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ procesado_en: new Date().toISOString(), error: null }) });
    console.log('effi-webhook', cuenta, evento, pasos.join(' · '));
  } catch (e) {
    await sb(`effi_webhook_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ error: String(e).slice(0, 500) }) }).catch(() => {});
    console.error('effi-webhook', cuenta, evento, e);
  }
}

Deno.serve(async (req) => {
  const cuenta = (new URL(req.url).searchParams.get('cuenta') || '').toUpperCase();
  if (req.method === 'GET') return json(200, { ok: true, servicio: 'effi-webhook' });
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  if (!CUENTA_RE.test(cuenta)) return json(400, { ok: false, mensaje: 'Falta ?cuenta=' });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json(413, { ok: false, mensaje: 'Cuerpo demasiado grande' });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, mensaje: 'El cuerpo no es JSON' });
  }

  const [acc] = await sb(`effi_accounts?slug=eq.${cuenta}&activa=eq.true&select=slug`);
  // Misma respuesta para cuenta inexistente o inactiva: no se revela qué cuentas existen.
  if (!acc) return json(404, { ok: false, mensaje: 'Webhook no configurado' });

  // Effi siempre manda el id de la entrega: sin él no se acepta (y un reenvío con el mismo id se descarta).
  const delivery = (req.headers.get('x-effi-delivery') || '').slice(0, 120);
  if (!delivery) return json(400, { ok: false, mensaje: 'Falta X-Effi-Delivery' });

  const evento = (req.headers.get('x-effi-event') || String(payload.evento ?? payload.event ?? '')).toLowerCase().slice(0, 80);
  const firma = req.headers.get('x-effi-signature');
  // Si la cuenta guardó algún secreto, todo aviso debe traer un evento con secreto y firma válida (fail-closed).
  if (await rpc('effi_webhook_requiere_firma', { p_cuenta: cuenta })) {
    const secreto: string | null = evento ? await rpc('effi_webhook_secreto', { p_cuenta: cuenta, p_evento: evento }) : null;
    if (!secreto || !(await firmaValida(raw, firma, secreto))) return json(401, { ok: false, mensaje: 'Firma inválida' });
  }

  let fila: { id: number; recibido_en: string } | undefined;
  try {
    // Idempotente por (cuenta, delivery_id): un reintento de Effi no se procesa dos veces.
    [fila] = await sb('effi_webhook_events?on_conflict=cuenta,delivery_id&select=id,recibido_en', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        cuenta,
        delivery_id: delivery,
        evento: evento || null,
        firma,
        payload,
      }),
    });
  } catch (e) {
    console.error('effi-webhook guardar', e);
    return json(500, { ok: false, mensaje: 'No se pudo guardar el aviso' });
  }

  if (fila) EdgeRuntime.waitUntil(procesar(fila.id, cuenta, evento, fila.recibido_en));
  return json(200, { ok: true, duplicado: !fila });
});
