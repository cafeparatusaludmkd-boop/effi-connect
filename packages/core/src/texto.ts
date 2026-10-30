// Minúsculas, sin tildes y con espacios simples: así se comparan los textos que devuelve Effi.
export const normalizar = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
