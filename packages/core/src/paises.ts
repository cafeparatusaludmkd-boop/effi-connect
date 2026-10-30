// Semáforos por país sobre el % de devolución (docs/reglas-negocio.md §5).
export type Semaforo = 'verde' | 'amarillo' | 'rojo';

export interface Pais {
  codigo: string;
  divisa: string;
  decimales: number;
  /** Hasta este % es verde (inclusive). */
  verdeHasta: number;
  /** Hasta este % es amarillo (inclusive); por encima, rojo. */
  amarilloHasta: number;
}

export const PAISES: Record<string, Pais> = {
  CO: { codigo: 'CO', divisa: 'COP', decimales: 0, verdeHasta: 0.25, amarilloHasta: 0.32 },
  EC: { codigo: 'EC', divisa: 'USD', decimales: 2, verdeHasta: 0.25, amarilloHasta: 0.35 },
  GT: { codigo: 'GT', divisa: 'GTQ', decimales: 0, verdeHasta: 0.22, amarilloHasta: 0.3 },
  // Sin datos reales todavía: se usan los umbrales de Ecuador.
  CR: { codigo: 'CR', divisa: 'CRC', decimales: 0, verdeHasta: 0.25, amarilloHasta: 0.35 },
  HN: { codigo: 'HN', divisa: 'HNL', decimales: 0, verdeHasta: 0.25, amarilloHasta: 0.35 },
};

export function semaforoDevolucion(pais: string, porcentajeDevolucion: number): Semaforo {
  const p = PAISES[pais.toUpperCase()] ?? PAISES.EC!;
  if (porcentajeDevolucion <= p.verdeHasta) return 'verde';
  if (porcentajeDevolucion <= p.amarilloHasta) return 'amarillo';
  return 'rojo';
}

/** Efectividad por ciudad: verde ≥ 70 %, amarillo ≥ 50 %, rojo por debajo. */
export const semaforoCiudad = (efectividad: number): Semaforo =>
  efectividad >= 0.7 ? 'verde' : efectividad >= 0.5 ? 'amarillo' : 'rojo';
