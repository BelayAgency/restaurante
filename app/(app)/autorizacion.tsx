'use client';

import { createContext, use, useRef, useState, useTransition, type ReactNode } from 'react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { ACCIONES_AUTORIZABLES, puedeAutorizar, type AccionAutorizable } from '@/dominio/autorizaciones';
import { verificarPin } from '@/dominio/pin';
import { pinBloqueado, reducirDispositivo } from '@/dominio/reductores/dispositivo';
import { useDatosLocales } from '@/local/salon';
import { registrarEvento } from '@/local/sync';

export interface Autorizacion {
  autorizadoPorId: string;
  motivoId: string;
  motivoTexto: string | null;
}

type Pedir = (accion: AccionAutorizable, operador: { id: string; rol: Parameters<typeof puedeAutorizar>[0] }) => Promise<Autorizacion | null>;

const Contexto = createContext<Pedir | null>(null);

/**
 * La autorización en el momento: alguien con más responsabilidad pone su PIN
 * en el mismo dispositivo y elige el motivo. Funciona sin red con los PIN y
 * los motivos del catálogo; el servidor vuelve a controlar quién y por qué.
 */
export function ProveedorAutorizacion({ children }: { children: ReactNode }) {
  const datos = useDatosLocales();
  const [pedido, setPedido] = useState<{ accion: AccionAutorizable; operador: { id: string; rol: Parameters<typeof puedeAutorizar>[0] } } | null>(null);
  const resolver = useRef<((resultado: Autorizacion | null) => void) | null>(null);
  const [autorizadorId, setAutorizadorId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [motivoId, setMotivoId] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [error, setError] = useState<string>();
  const [verificando, iniciar] = useTransition();

  const pedir: Pedir = (accion, operador) =>
    new Promise((resolverPedido) => {
      resolver.current?.(null);
      resolver.current = resolverPedido;
      setAutorizadorId(null);
      setPin('');
      setMotivoId(null);
      setMotivoTexto('');
      setError(undefined);
      setPedido({ accion, operador });
    });

  function terminar(resultado: Autorizacion | null) {
    resolver.current?.(resultado);
    resolver.current = null;
    setPedido(null);
  }

  const catalogo = datos?.catalogo;
  const autorizadores = pedido && catalogo ? catalogo.operadores.filter((o) => o.pinHash && puedeAutorizar(o.rol, pedido.accion, catalogo.reglas)) : [];
  const motivos = pedido && catalogo ? catalogo.motivos.filter((m) => m.accion === pedido.accion) : [];

  function confirmar() {
    if (!pedido || !datos?.dispositivoId) return;
    const autorizador = autorizadores.find((a) => a.id === autorizadorId);
    if (!autorizador?.pinHash) return setError('Elegí quién autoriza');
    if (!motivoId) return setError('Elegí el motivo');
    const estadoDispositivo = reducirDispositivo(datos.eventos.filter((e) => e.agregadoId === datos.dispositivoId));
    if (pinBloqueado(estadoDispositivo, autorizador.id, new Date())) return setError('Demasiados PIN incorrectos. Esperá unos minutos.');
    iniciar(async () => {
      if (await verificarPin(pin, autorizador.pinHash!)) {
        terminar({ autorizadoPorId: autorizador.id, motivoId, motivoTexto: motivoTexto.trim() || null });
        return;
      }
      // El intento fallido queda registrado a nombre de quien estaba operando.
      await registrarEvento('pin_fallido', datos.dispositivoId!, { usuarioIntentadoId: autorizador.id }, pedido.operador).catch(() => undefined);
      setPin('');
      setError('El PIN no es correcto');
    });
  }

  return (
    <Contexto value={pedir}>
      {children}
      {pedido ? (
        <Modal abierto alCerrar={() => terminar(null)} titulo="Necesita autorización" descripcion={ACCIONES_AUTORIZABLES[pedido.accion]}>
          <div className="modal-cuerpo flex flex-col gap-4">
            <div>
              <label className="etiqueta-campo">Autoriza</label>
              <Selector
                opciones={autorizadores.map((a) => ({ valor: a.id, etiqueta: a.nombre }))}
                valor={autorizadorId}
                alElegir={setAutorizadorId}
                vacio="Nadie con PIN puede autorizar esto"
              />
            </div>
            <Campo
              etiqueta="PIN"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              disabled={!autorizadorId || verificando}
            />
            <div>
              <label className="etiqueta-campo">Motivo</label>
              <Selector opciones={motivos.map((m) => ({ valor: m.id, etiqueta: m.texto }))} valor={motivoId} alElegir={setMotivoId} vacio="No hay motivos cargados para esta acción" />
            </div>
            <Campo etiqueta="Detalle (opcional)" value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} maxLength={280} />
            {error ? <p className="text-sm text-error">{error}</p> : null}
          </div>
          <footer className="modal-pie">
            <Boton variante="secundario" onClick={() => terminar(null)} disabled={verificando}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={confirmar} cargando={verificando} disabled={pin.length < 4}>
              Autorizar
            </Boton>
          </footer>
        </Modal>
      ) : null}
    </Contexto>
  );
}

export function usePedirAutorizacion(): Pedir {
  const pedir = use(Contexto);
  if (!pedir) throw new Error('usePedirAutorizacion fuera de ProveedorAutorizacion');
  return pedir;
}
