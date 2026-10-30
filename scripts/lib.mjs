// Utilidades compartidas. Sin dependencias: solo Node >= 18.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// RAIZ es la carpeta del kit o del plugin (perfiles/, scripts/). El .env y la salida viven en la carpeta
// de trabajo de la persona (process.cwd()), así funcionan igual con el plugin instalado.
export const TRABAJO = process.cwd();

export function cargarEnv() {
  const ruta = join(TRABAJO, '.env');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function leerJson(ruta) {
  return JSON.parse(readFileSync(join(RAIZ, ruta), 'utf8'));
}

export function argumentos(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const sig = argv[i + 1];
    out[k] = sig === undefined || sig.startsWith('--') ? true : (i++, sig);
  }
  return out;
}

export function exigir(nombre) {
  const v = process.env[nombre];
  if (!v) {
    console.error(`Falta ${nombre}. Defínelo en tu archivo .env (copia .env.example).`);
    process.exit(1);
  }
  return v;
}

export const CUENTA_RE = /^[A-Z0-9_]{3,32}$/;
