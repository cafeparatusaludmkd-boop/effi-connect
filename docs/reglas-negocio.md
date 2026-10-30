# Reglas de negocio — Effi contraentrega

Única definición de las métricas. El código vive en `packages/core` y cada regla tiene su test en `packages/core/test`. **Si una regla cambia, se cambia aquí y en su test, en el mismo PR.**

## 1. Estados unificados de guía (`estados.ts`)
| Estado Effi (texto) | Estado unificado |
|---|---|
| Entregada a destino | ENTREGADO |
| En transito, En reparto, Recolectado | EN_TRANSITO |
| Devolución a origen | DEVOLUCION |
| Novedad | NOVEDAD |
| Generada, Pendiente | PENDIENTE |
| Disponible para retiro en oficina | EN_OFICINA |
| Indemnización | INDEMNIZACION |
| Cancelada, Rechazada, Cancelada por transportadora | EXCLUIDA (fuera de todo cálculo) |

- **Cerradas:** ENTREGADO y DEVOLUCION. **Abiertas:** EN_TRANSITO, NOVEDAD, PENDIENTE y EN_OFICINA.
- **El wallet manda:** si existe un movimiento "Recaudo de venta" para la guía, cuenta como ENTREGADO aunque su estado nominal diga otra cosa.
- Un texto que no se reconoce devuelve `null`: se muestra como "sin clasificar" y no se adivina.

## 2. Métricas de guías (`guias.ts`)
- **Efectividad** = entregadas / (entregadas + devueltas). Solo guías cerradas; INDEMNIZACION no entra.
- **% devolución por transportadora** = devueltas / total de guías vigentes de esa transportadora.
- **Promedio por guía** = Σ valor de recaudo / número de guías contraentrega.
- **Recaudo potencial** = Σ recaudo de las guías contraentrega. **Recaudo efectivo** = Σ recaudo de las ENTREGADO.
- **Guía estancada:** abierta y sin cambio de estado en más de N días (5 por defecto).
- **Entrega en oficina:** la dirección coincide con `/oficina|inter\s*rapid|interrapid|recoge|punto de/i`.
- **Nombres de transportadora:** INTERRAPIDISIMO → INTER RAPIDÍSIMO; ENVIA → ENVÍA COLVANES.

## 3. Novedades (`novedades.ts`)
- Una guía puede tener varias novedades; los conteos son por guía única.
- **Recuperada:** guía con novedad que termina ENTREGADO. **% recuperación** = recuperadas / guías con novedad.
- **Devuelta por novedad:** estado de la novedad `/cerrado|devoluci|incidencia/`.

## 4. Dinero (`wallet.ts`)
| Movimiento | Línea | Tratamiento |
|---|---|---|
| Recaudo de venta | INGRESO | PyG |
| Entrada por garantía / indemnización | INGRESO | PyG |
| Compra de mercancía (dropshipping a proveedor) | COSTO_MERCANCIA | PyG |
| Flete crédito con recaudo | FLETE_CON_RECAUDO | PyG |
| Flete crédito devolución | FLETE_DEVOLUCION | PyG (valor real del wallet) |
| Flete sin recaudo | FLETE_SIN_RECAUDO | PyG |
| Servicio de Fulfillment | FULFILLMENT | PyG |
| 4xmil, comisión por retiro, cruce de factura | OTROS | PyG |
| Débito revertido / Crédito revertido | REVERSION | PyG |
| Retiro de dinero, transferencias entre wallets, recargas | CAJA | **Fuera del PyG** |

- **Guías sin liquidar:** ENTREGADO sin "Recaudo de venta" acreditado. Hay que reclamarlas.
- **Días entrega → pago** = fecha del "Recaudo de venta" − fecha de ENTREGADO.
- **Costo de mercancía = 0** en devoluciones. **Ganancia por guía** = venta − costo − flete − otros (solo ENTREGADO).
- **Devoluciones proyectadas:** las abiertas se proyectan como devolución con el flete de devolución promedio real del país.
- **Montos:** la API devuelve `valor` en la moneda de la cuenta, con signo (créditos +, débitos −). No se divide entre 100.

## 5. Semáforos por país (`paises.ts`)
| País | Moneda | Verde | Amarillo | Rojo |
|---|---|---|---|---|
| Colombia | COP (0 dec) | ≤25 % | ≤32 % | >32 % |
| Ecuador | USD (2 dec) | ≤25 % | ≤35 % | >35 % |
| Guatemala | GTQ (0 dec) | ≤22 % | ≤30 % | >30 % |
| Costa Rica | CRC | ≤25 % | ≤35 % | >35 % |
| Honduras | HNL | ≤25 % | ≤35 % | >35 % |

Países sin datos reales (Costa Rica, Honduras, cualquiera nuevo) usan los umbrales de Ecuador. **Efectividad por ciudad:** verde ≥70 %, amarillo ≥50 %, rojo por debajo.

## 6. Proveeduría
- El **cliente** de una proveeduría es el distribuidor o dropshipper que despacha sus productos (`empresa_distribuidor` en guías y remisiones; `dropshipping_proveedor=1` las aísla).
- **Rankings:** clientes por guías, venta y efectividad; productos por unidades y venta; % de devolución por cliente y por producto.
- **Fulfillment:** quién lo paga se decide por la dirección del remitente, no por el nombre del proveedor.
- Una organización puede ser tienda y proveeduría a la vez: el tablero muestra cada rol por separado y un consolidado.
