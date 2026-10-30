// Verificación de los webhooks de Effi.
// Effi firma el cuerpo con HMAC-SHA256 y lo manda en `X-Effi-Signature: sha256=<hex>`.
// `X-Effi-Delivery` es la llave de idempotencia. Hay que responder 2xx en < 5 s: se encola y se procesa aparte.
// Aun con firma válida, el aviso se trata como no confiable: el procesador vuelve a consultar el registro en la API.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function firmar(cuerpo: string, secreto: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `sha256=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(cuerpo)))}`;
}

/** Comparación en tiempo constante (no corta en el primer carácter distinto). */
function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verificarFirma(cuerpo: string, cabeceraFirma: string | null | undefined, secreto: string): Promise<boolean> {
  if (!cabeceraFirma || !secreto) return false;
  return igualesSeguro(await firmar(cuerpo, secreto), cabeceraFirma.trim().toLowerCase());
}

export interface AvisoEffi {
  deliveryId: string;
  evento: string | null;
  payload: unknown;
}

export type ResultadoWebhook = { ok: true; aviso: AvisoEffi } | { ok: false; status: 400 | 401 | 413; mensaje: string };

const MAX_BYTES = 1_000_000;

/** Valida tamaño, firma, delivery y JSON. No guarda nada: eso lo decide quien lo llama. */
export async function leerWebhook(cuerpo: string, cabeceras: Headers, secreto: string): Promise<ResultadoWebhook> {
  if (cuerpo.length > MAX_BYTES) return { ok: false, status: 413, mensaje: 'Cuerpo demasiado grande' };
  if (!(await verificarFirma(cuerpo, cabeceras.get('x-effi-signature'), secreto)))
    return { ok: false, status: 401, mensaje: 'Firma inválida' };
  const deliveryId = cabeceras.get('x-effi-delivery');
  if (!deliveryId) return { ok: false, status: 400, mensaje: 'Falta X-Effi-Delivery' };
  try {
    return { ok: true, aviso: { deliveryId, evento: cabeceras.get('x-effi-event'), payload: JSON.parse(cuerpo) } };
  } catch {
    return { ok: false, status: 400, mensaje: 'El cuerpo no es JSON' };
  }
}
