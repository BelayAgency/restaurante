'use client';

import { Plus, ShoppingBag } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { EstadoVacio } from '@/components/ui';
import type { Catalogo } from '@/dominio/catalogo';
import { totalCuenta, type Cuenta } from '@/dominio/reductores/salon';
import { pesosDesdeCentavos } from '@/lib/formato';
import { nombreOperador } from './contexto';

export function FilaCuentaSinMesa({ cuenta, catalogo, alElegir }: { cuenta: Cuenta; catalogo: Catalogo; alElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={alElegir}
      className="flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-fill-fantasma-hover"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{cuenta.nombre ?? (cuenta.tipo === 'llevar' ? 'Para llevar' : 'Mostrador')}</span>
        <span className="block whitespace-nowrap text-xs text-tinta-tenue">{nombreOperador(catalogo, cuenta.mozoId).split(' ')[0]}</span>
      </span>
      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">{pesosDesdeCentavos(totalCuenta(cuenta))}</span>
    </button>
  );
}

/** Las cuentas para llevar abiertas, y desde acá se abre una nueva. */
export function ModalParaLlevar({
  cuentas,
  catalogo,
  puedeAbrir,
  alElegir,
  alNueva,
  alCerrar,
}: {
  cuentas: Cuenta[];
  catalogo: Catalogo;
  puedeAbrir: boolean;
  alElegir: (cuentaId: string) => void;
  alNueva: () => void;
  alCerrar: () => void;
}) {
  return (
    <Modal abierto alCerrar={alCerrar} titulo="Para llevar">
      <div className="modal-cuerpo">
        {cuentas.length === 0 ? (
          <EstadoVacio icono={<ShoppingBag size={28} strokeWidth={1.5} />} titulo="No hay pedidos para llevar abiertos" />
        ) : (
          <ul className="-mx-2.5 flex flex-col gap-0.5">
            {cuentas.map((c) => (
              <li key={c.id}>
                <FilaCuentaSinMesa cuenta={c} catalogo={catalogo} alElegir={() => alElegir(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {puedeAbrir ? (
        <footer className="modal-pie">
          <Boton variante="primario" onClick={alNueva}>
            <Plus size={15} strokeWidth={1.5} /> Nuevo para llevar
          </Boton>
        </footer>
      ) : null}
    </Modal>
  );
}
