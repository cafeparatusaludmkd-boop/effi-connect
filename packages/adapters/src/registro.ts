// Registro de adaptadores: cada instalación registra los que usa y el resto del código los pide por id.

export interface Registro<T extends { readonly id: string }> {
  registrar(adaptador: T): void;
  obtener(id: string): T;
  tiene(id: string): boolean;
  lista(): T[];
}

export function crearRegistro<T extends { readonly id: string }>(tipo: string): Registro<T> {
  const items = new Map<string, T>();
  return {
    registrar(a) {
      if (items.has(a.id)) throw new Error(`Ya hay un adaptador de ${tipo} con id "${a.id}"`);
      items.set(a.id, a);
    },
    obtener(id) {
      const a = items.get(id);
      if (!a) throw new Error(`No hay adaptador de ${tipo} "${id}". Registrados: ${[...items.keys()].join(', ') || 'ninguno'}`);
      return a;
    },
    tiene: (id) => items.has(id),
    lista: () => [...items.values()],
  };
}
