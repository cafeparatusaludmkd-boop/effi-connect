import { describe, expect, it } from 'vitest';
import { crearRegistro, type LLMProvider } from '../src/index.ts';

// Adaptador mínimo de ejemplo: sirve de plantilla para escribir uno real.
const eco: LLMProvider = {
  id: 'eco',
  modeloPorDefecto: 'eco-1',
  async chat({ messages }) {
    return { text: messages.at(-1)?.content ?? '', toolCalls: [] };
  },
};

describe('registro de adaptadores', () => {
  it('registra y obtiene por id', async () => {
    const r = crearRegistro<LLMProvider>('LLM');
    r.registrar(eco);
    expect(r.tiene('eco')).toBe(true);
    expect((await r.obtener('eco').chat({ messages: [{ role: 'user', content: 'hola' }] })).text).toBe('hola');
  });
  it('no permite ids duplicados', () => {
    const r = crearRegistro<LLMProvider>('LLM');
    r.registrar(eco);
    expect(() => r.registrar(eco)).toThrow(/Ya hay/);
  });
  it('explica qué hay registrado cuando falta uno', () => {
    const r = crearRegistro<LLMProvider>('LLM');
    r.registrar(eco);
    expect(() => r.obtener('anthropic')).toThrow(/Registrados: eco/);
  });
});
