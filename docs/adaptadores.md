# Cómo escribir un adaptador

Effi Connect no amarra a nadie a un proveedor. IA, canales, logística y comercio se conectan con adaptadores que cumplen una interfaz de `packages/adapters`.

| Interfaz | Para | Ejemplos |
|---|---|---|
| `LLMProvider` | Modelos de lenguaje con la clave de la organización | Anthropic (Claude), OpenAI, Google (Gemini), un AI Gateway |
| `ChannelProvider` | Recibir y enviar mensajes | WhatsApp Cloud API, Zernio (redes sociales), voz (Vapi, Retell), SMS, correo |
| `LogisticsProvider` | Crear guías y consultar estados | Effi; otras logísticas en el futuro |
| `CommerceProvider` | Catálogo de una tienda | Shopify, WooCommerce |

## Reglas
1. **Un paquete o carpeta por adaptador**, con su `id` único (`"whatsapp-cloud"`, `"zernio"`…).
2. **Nada de secretos en el código.** Las credenciales llegan por parámetro y salen del Vault en el servidor.
3. **Webhooks entrantes:** `recibir()` verifica la firma del proveedor con el cuerpo crudo y lanza `FirmaInvalida` si no coincide. Sin firma, no hay mensaje.
4. **Idempotencia:** `crearGuia()` usa `referencia` como llave; llamarlo dos veces con la misma referencia no crea dos guías.
5. **Tests con `fetch` falso**, como `packages/effi/test/cliente.test.ts`. Nada de llamadas reales en CI.

## Ejemplo mínimo

```ts
import { crearRegistro, type LLMProvider } from '@effi-connect/adapters';

const eco: LLMProvider = {
  id: 'eco',
  modeloPorDefecto: 'eco-1',
  async chat({ messages }) {
    return { text: messages.at(-1)?.content ?? '', toolCalls: [] };
  },
};

const llms = crearRegistro<LLMProvider>('LLM');
llms.registrar(eco);
```
