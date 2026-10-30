#!/usr/bin/env node
// Crea webhooks en Shopify por Admin API (GraphQL webhookSubscriptionCreate).
// Por defecto SOLO MUESTRA el plan (dry-run). Para crear de verdad: --aplicar.
//
// Ojo: Effi Connect todavía no trae un receptor de Shopify. Usa --endpoint con una URL TUYA que sí reciba
// los avisos (por ejemplo un webhook de n8n). Si vendes en Shopify con la integración nativa de Effi,
// no necesitas este script: Effi recibe los pedidos y Effi Connect se entera por los webhooks de Effi.
//
// Uso: node scripts/crear-webhooks-shopify.mjs --endpoint https://tu-receptor.example.com/shopify [--topics ORDERS_CREATE,ORDERS_UPDATED] [--aplicar]
// Requiere en .env: SHOPIFY_SHOP, SHOPIFY_ADMIN_TOKEN y SHOPIFY_API_VERSION (versión estable vigente, ver docs de Shopify).
import { cargarEnv, argumentos, exigir } from './lib.mjs';

cargarEnv();
const a = argumentos();
const endpoint = String(a.endpoint ?? '');
if (!/^https:\/\/[^\s]+$/.test(endpoint)) { console.error('--endpoint debe ser una URL https:// (receptor propio).'); process.exit(1); }

const TOPICS_PERMITIDOS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED', 'ORDERS_PAID', 'PRODUCTS_UPDATE', 'REFUNDS_CREATE'];
const topics = String(a.topics ?? 'ORDERS_CREATE,ORDERS_UPDATED,ORDERS_CANCELLED').split(',').map((t) => t.trim().toUpperCase());
const malos = topics.filter((t) => !TOPICS_PERMITIDOS.includes(t));
if (malos.length) { console.error(`Topics no admitidos: ${malos.join(', ')}. Permitidos: ${TOPICS_PERMITIDOS.join(', ')}`); process.exit(1); }

const tienda = exigir('SHOPIFY_SHOP');
if (!/^[a-z0-9-]+\.myshopify\.com$/.test(tienda)) { console.error('SHOPIFY_SHOP debe verse como mi-tienda.myshopify.com'); process.exit(1); }
const version = exigir('SHOPIFY_API_VERSION');
const aplicar = a.aplicar === true;

console.log(`Tienda: ${tienda} · API ${version}\nDestino: ${endpoint}\nWebhooks: ${topics.join(', ')}`);
if (!aplicar) { console.log('\nDry-run: no se creó nada. Repite con --aplicar cuando la persona lo apruebe.'); process.exit(0); }

const token = exigir('SHOPIFY_ADMIN_TOKEN');
const mutacion = `mutation($topic: WebhookSubscriptionTopic!, $uri: URL!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $uri, format: JSON }) {
    webhookSubscription { id topic }
    userErrors { field message }
  }
}`;

let fallos = 0;
for (const topic of topics) {
  const res = await fetch(`https://${tienda}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: mutacion, variables: { topic, uri: endpoint } }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  const r = cuerpo?.data?.webhookSubscriptionCreate;
  if (!res.ok || cuerpo.errors || r?.userErrors?.length) {
    fallos++;
    console.log(`  ✗ ${topic}: ${JSON.stringify(cuerpo.errors ?? r?.userErrors ?? `HTTP ${res.status}`).slice(0, 200)}`);
  } else {
    console.log(`  ✓ ${topic} → ${r.webhookSubscription.id}`);
  }
}
process.exit(fallos ? 1 : 0);
