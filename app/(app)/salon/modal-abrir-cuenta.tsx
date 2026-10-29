'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import type { Catalogo } from '@/dominio/catalogo';
import { puede } from '@/dominio/permisos';
import { nombrePersona } from '@/dominio/texto-mail';
import { nombreMesa, useRegistrar, type Operador } from './contexto';

export type TipoCuenta = 'mesa' | 'mostrador' | 'llevar';

/** Abrir una cuenta: el mozo responsable y los comensales son obligatorios, sin excepción. */
export function ModalAbrirCuenta({
  abierto,
  alCerrar,
  alAbrir,
  tipo,
  mesaId,
  catalogo,
  operador,
}: {
  abierto: boolean;
  alCerrar: () => void;
  alAbrir: (cuentaId: string) => void;
  tipo: TipoCuenta;
  mesaId: string | null;
  catalogo: Catalogo;
  operador: Operador;
}) {
  const registrar = useRegistrar(operador);
  const mozos = catalogo.operadores.filter((o) => puede(o, 'salon.operar'));
  const [mozoId, setMozoId] = useState<string | null>(mozos.some((m) => m.id === operador.id) ? operador.id : null);
  const [comensales, setComensales] = useState(tipo === 'mesa' ? 2 : 1);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const titulo = tipo === 'mesa' ? `Abrir ${nombreMesa(catalogo, mesaId)}` : tipo === 'llevar' ? 'Para llevar' : 'Mostrador';

  function alMandar(e: FormEvent) {
    e.preventDefault();
    if (!mozoId) return setError('Elegí quién atiende');
    const nombreValido = nombre.trim() ? nombrePersona.safeParse(nombre) : null;
    if (nombreValido && !nombreValido.success) return setError(nombreValido.error.issues[0]?.message);
    const cuentaId = crypto.randomUUID();
    iniciar(async () => {
      const ok = await registrar('cuenta_abierta', cuentaId, {
        tipo,
        mesaId: tipo === 'mesa' ? mesaId : null,
        mozoId,
        comensales,
        nombre: nombreValido?.success ? nombreValido.data : null,
      });
      if (ok) alAbrir(cuentaId);
    });
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={titulo}>
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <div>
            <label className="etiqueta-campo">Atiende</label>
            <Selector opciones={mozos.map((m) => ({ valor: m.id, etiqueta: m.nombre }))} valor={mozoId} alElegir={setMozoId} buscador vacio="No hay nadie con permiso para atender" />
          </div>
          <div>
            <p className="etiqueta-campo">Comensales</p>
            <div className="flex items-center gap-3">
              <Boton type="button" variante="secundario" tamano="lg" soloIcono aria-label="Uno menos" onClick={() => setComensales(Math.max(1, comensales - 1))}>
                <Minus size={18} strokeWidth={1.5} />
              </Boton>
              <span className="w-10 text-center text-2xl font-semibold tabular-nums text-tinta" aria-live="polite">
                {comensales}
              </span>
              <Boton type="button" variante="secundario" tamano="lg" soloIcono aria-label="Uno más" onClick={() => setComensales(Math.min(99, comensales + 1))}>
                <Plus size={18} strokeWidth={1.5} />
              </Boton>
            </div>
          </div>
          {tipo !== 'mesa' ? <Campo etiqueta="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /> : null}
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardando}>
            Abrir
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}
