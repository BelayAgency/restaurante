'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { Tabs } from '@/components/tabs';
import { EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import { fechaHora } from '@/lib/formato';
import type { Stock } from '@/servidor/stock';
import { accionAbrirConteo } from '../acciones';

interface FilaConteo {
  id: string;
  alcance: string;
  abiertoEn: string;
  cerradoEn: string | null;
  deposito: string;
}

function ModalNuevoConteo({ stock, alCerrar }: { stock: Stock; alCerrar: () => void }) {
  const router = useRouter();
  const [depositoId, setDepositoId] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<'total' | 'parcial'>('total');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [abriendo, iniciar] = useTransition();

  function abrir() {
    iniciar(async () => {
      const resultado = await accionAbrirConteo({ depositoId, insumoIds: alcance === 'parcial' ? elegidos : null });
      if (!resultado.ok) return setError(resultado.error);
      router.push(`/stock/conteos/${resultado.datos}`);
    });
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Nuevo conteo" descripcion="Quien cuenta no ve el stock que debería haber: carga lo que encuentra.">
      <div className="modal-cuerpo flex flex-col gap-4">
        <div>
          <label className="etiqueta-campo">Depósito</label>
          <Selector opciones={stock.depositos.map((d) => ({ valor: d.id, etiqueta: d.nombre }))} valor={depositoId} alElegir={setDepositoId} />
        </div>
        <Tabs
          etiqueta="Alcance"
          valor={alcance}
          alCambiar={(v) => setAlcance(v as 'total' | 'parcial')}
          opciones={[
            { valor: 'total', etiqueta: 'Todo' },
            { valor: 'parcial', etiqueta: 'Algunos insumos' },
          ]}
        />
        {alcance === 'parcial' ? (
          <ul className="max-h-60 overflow-y-auto">
            {stock.insumos.map((i) => (
              <li key={i.id}>
                <label className="flex items-center gap-3 border-b border-borde/60 py-2 text-sm text-tinta last:border-0">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-acento)]"
                    checked={elegidos.includes(i.id)}
                    onChange={() => setElegidos(elegidos.includes(i.id) ? elegidos.filter((x) => x !== i.id) : [...elegidos, i.id])}
                  />
                  {i.nombre}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
      <footer className="modal-pie">
        <Boton variante="secundario" onClick={alCerrar} disabled={abriendo}>
          Cancelar
        </Boton>
        <Boton variante="primario" onClick={abrir} cargando={abriendo} disabled={alcance === 'parcial' && !elegidos.length}>
          Empezar a contar
        </Boton>
      </footer>
    </Modal>
  );
}

export function PantallaConteos({ conteos, stock }: { conteos: FilaConteo[]; stock: Stock }) {
  const [nuevo, setNuevo] = useState(false);
  return (
    <>
      <TituloSeccion
        accion={
          <Boton variante="primario" onClick={() => setNuevo(true)}>
            <Plus size={15} strokeWidth={1.75} /> Nuevo conteo
          </Boton>
        }
      >
        Conteos
      </TituloSeccion>
      <Tarjeta>
        {conteos.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay conteos" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Abierto</Th>
                <Th>Depósito</Th>
                <Th>Alcance</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {conteos.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/stock/conteos/${c.id}`} className="font-medium text-tinta hover:text-acento">
                      {fechaHora(c.abiertoEn)}
                    </Link>
                  </Td>
                  <Td>{c.deposito}</Td>
                  <Td className="text-tinta-suave">{c.alcance === 'total' ? 'Todo' : 'Parcial'}</Td>
                  <Td>{c.cerradoEn ? <Insignia tono="neutro">Cerrado</Insignia> : <Insignia tono="alerta">Contando</Insignia>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
      {nuevo ? <ModalNuevoConteo stock={stock} alCerrar={() => setNuevo(false)} /> : null}
    </>
  );
}
