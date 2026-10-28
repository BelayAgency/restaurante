import { UtensilsCrossed } from 'lucide-react';
import { EstadoVacio, Tarjeta } from '@/components/ui';

export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <Tarjeta className="w-full">
        <EstadoVacio
          icono={<UtensilsCrossed size={28} />}
          titulo="Restaurante"
          detalle="Sistema en construcción."
        />
      </Tarjeta>
    </main>
  );
}
