import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { firmar, leerWebhook, verificarFirma } from '../src/index.ts';

const secreto = 'whsec_prueba';
const cuerpo = JSON.stringify({ evento: 'guia_transporte.cambio_estado', data: { id: 1 } });
const firmaNode = 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');

describe('firma HMAC', () => {
  it('coincide con la firma de referencia de Node', async () => {
    expect(await firmar(cuerpo, secreto)).toBe(firmaNode);
  });
  it('acepta la firma correcta (sin importar mayúsculas)', async () => {
    expect(await verificarFirma(cuerpo, firmaNode.toUpperCase().replace('SHA256', 'sha256'), secreto)).toBe(true);
  });
  it('rechaza cuerpo alterado, firma ausente o secreto vacío', async () => {
    expect(await verificarFirma(cuerpo + ' ', firmaNode, secreto)).toBe(false);
    expect(await verificarFirma(cuerpo, null, secreto)).toBe(false);
    expect(await verificarFirma(cuerpo, firmaNode, '')).toBe(false);
  });
});

describe('leerWebhook', () => {
  const cab = (extra: Record<string, string> = {}) =>
    new Headers({ 'x-effi-signature': firmaNode, 'x-effi-delivery': 'd-123', 'x-effi-event': 'guia.estado', ...extra });

  it('devuelve el aviso cuando todo es válido', async () => {
    const r = await leerWebhook(cuerpo, cab(), secreto);
    expect(r).toEqual({ ok: true, aviso: { deliveryId: 'd-123', evento: 'guia.estado', payload: JSON.parse(cuerpo) } });
  });
  it('401 con firma inválida', async () => {
    const r = await leerWebhook(cuerpo, cab({ 'x-effi-signature': 'sha256=00' }), secreto);
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it('400 sin X-Effi-Delivery', async () => {
    const h = cab();
    h.delete('x-effi-delivery');
    expect(await leerWebhook(cuerpo, h, secreto)).toMatchObject({ ok: false, status: 400 });
  });
  it('413 si el cuerpo es enorme', async () => {
    expect(await leerWebhook('x'.repeat(1_000_001), cab(), secreto)).toMatchObject({ ok: false, status: 413 });
  });
});
