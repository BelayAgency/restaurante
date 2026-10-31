'use client';

import type { FormEvent } from 'react';
import { LockOpen } from 'lucide-react';
import { Boton, BotonEnlace } from '@/components/boton';
import { CampoNumero } from '@/components/campo-numero';
import { puede } from '@/dominio/permisos';
import { useAbrirCaja } from '../caja/modales-turno';
import type { Operador } from './contexto';

/**
 * Sin caja abierta el salón no se opera: lo que se cobrara no tendría turno
 * donde imputarse. Tapa el plano entero (no es un `<dialog>` modal, que
 * bloquearía también la navegación) y lo abre ahí mismo quien puede.
 */
export function CartelAbrirCaja({ operador, verCajas }: { operador: Operador; /** Las cajas cerradas se miran en Reportes, sin abrir una nueva. */ verCajas: boolean }) {
  const { fondo, setFondo, abrir, guardando } = useAbrirCaja(operador);
  const puedeAbrir = puede(operador, 'caja.operar');

  function alMandar(e: FormEvent) {
    e.preventDefault();
    abrir();
  }

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-lienzo/40 p-4 backdrop-blur-sm">
      <form onSubmit={alMandar} className="tarjeta w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-acento-tenue text-acento">
            <LockOpen size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-tinta">Abrir caja</h2>
            <p className="text-sm text-tinta-tenue">{puedeAbrir ? `Queda a nombre de ${operador.nombre}.` : 'La abre el cajero o el encargado.'}</p>
          </div>
        </div>
        {puedeAbrir ? (
          <>
            <CampoNumero etiqueta="Fondo inicial en efectivo" valor={fondo} alCambiar={setFondo} decimales={2} prefijo="$" placeholder="0" />
            <Boton type="submit" variante="primario" cargando={guardando} className="mt-5 w-full">
              Abrir caja
            </Boton>
          </>
        ) : null}
        {verCajas ? (
          <BotonEnlace href="/reportes" variante="fantasma" tamano="sm" ancho className="mt-2">
            Ver cajas anteriores
          </BotonEnlace>
        ) : null}
      </form>
    </div>
  );
}
