import glosario from "@/lib/glosario.json";
import { GlosarioLista } from "./lista";

// Definiciones de los términos del tablero (lib/glosario.json).
export default function GlosarioPage() {
  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">📖 Glosario</h1>
      <p className="text-sm text-muted mt-1.5">Qué significa cada término, cómo se calcula y dónde aparece. Las definiciones que usa el tablero.</p>
      <GlosarioLista terminos={glosario as { c: string; t: string; d: string; f: string; w: string }[]} />
    </div>
  );
}
