'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import type { Catalogo } from '@/dominio/catalogo';
import { nombrePersona } from '@/dominio/texto-mail';
import { nombreMesa, useRegistrar, type Operador } from './contexto';

export type TipoCuenta = 'mesa' | 'mostrador' | 'llevar';

/**
 * Abrir una cuenta. La atiende quien la abre (se cambia después desde la
 * cuenta) y los comensales no se piden. Igual se confirma con un modal: un
 * toque de más sobre el plano no tiene que abrir una mesa.
 */
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
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  const titulo = tipo === 'mesa' ? `Abrir ${nombreMesa(catalogo, mesaId)}` : tipo === 'llevar' ? 'Para llevar' : 'Mostrador';

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const nombreValido = nombre.trim() ? nombrePersona.safeParse(nombre) : null;
    if (nombreValido && !nombreValido.success) return setError(nombreValido.error.issues[0]?.message);
    const cuentaId = crypto.randomUUID();
    iniciar(async () => {
      const ok = await registrar('cuenta_abierta', cuentaId, {
        tipo,
        mesaId: tipo === 'mesa' ? mesaId : null,
        mozoId: operador.id,
        comensales: 0,
        nombre: nombreValido?.success ? nombreValido.data : null,
      });
      if (ok) alAbrir(cuentaId);
    });
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={titulo}>
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <p className="text-sm text-tinta-suave">
            La cuenta queda a nombre de <strong className="font-medium text-tinta">{operador.nombre}</strong>. Quién atiende se puede cambiar después desde la cuenta.
          </p>
          {tipo !== 'mesa' ? <Campo etiqueta="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /> : null}
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardando} autoFocus>
            Abrir cuenta
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}
