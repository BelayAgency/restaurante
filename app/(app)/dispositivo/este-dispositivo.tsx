'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useConsultaLocal } from '@/local/consulta';
import { CloudOff, RefreshCw, Tablet, UserRoundCheck } from 'lucide-react';
import { Boton } from '@/components/boton';
import { Campo } from '@/components/campo';
import { CargandoTarjeta } from '@/components/carga';
import { Modal } from '@/components/modal';
import { Selector } from '@/components/selector';
import { useToast } from '@/components/toast';
import { Aviso, EstadoVacio, FilaDato, Insignia, Mono, Tabla, Tarjeta, Td, Th, TituloSeccion } from '@/components/ui';
import type { EventoNuevo } from '@/dominio/eventos';
import { puede } from '@/dominio/permisos';
import { verificarPin } from '@/dominio/pin';
import { pinBloqueado, reducirDispositivo } from '@/dominio/reductores/dispositivo';
import { NOMBRE_ROL } from '@/dominio/roles';
import { fechaHora } from '@/lib/formato';
import { baseLocal, guardarAjuste } from '@/local/base';
import { registrarEvento, sincronizar } from '@/local/sync';
import { useEstadoSync } from '../motor-sync';
import { useSesion } from '../sesion-cliente';
import { accionRegistrarDispositivo } from './acciones';

const TEXTO_EVENTO: Record<EventoNuevo['tipo'], string> = {
  operador_cambiado: 'Cambio de operador',
  pin_fallido: 'PIN incorrecto',
};

const PROBLEMA: Record<'sesion' | 'dispositivo' | 'suspendido', string> = {
  sesion: 'La sesión de este dispositivo venció. Volvé a iniciar sesión para que se sincronice.',
  dispositivo: 'Este dispositivo fue dado de baja. Lo que cargue no se va a aceptar.',
  suspendido: 'El sistema está suspendido: lo cargado queda guardado acá hasta que se reactive.',
};

function Registro({ alRegistrar }: { alRegistrar: () => void }) {
  const { usuario } = useSesion();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [guardando, iniciar] = useTransition();

  if (!puede(usuario, 'dispositivos.registrar')) {
    return (
      <Tarjeta>
        <EstadoVacio
          icono={<Tablet size={28} strokeWidth={1.5} />}
          titulo="Este dispositivo no está registrado"
          detalle="Pedile al encargado o al dueño que lo registre para poder operar sin conexión."
        />
      </Tarjeta>
    );
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const id = crypto.randomUUID();
      const resultado = await accionRegistrarDispositivo(id, nombre);
      if (!resultado.ok) return toast.error(resultado.error);
      await guardarAjuste('dispositivo', id);
      toast.exito('Dispositivo registrado');
      alRegistrar();
      await sincronizar();
    });
  }

  return (
    <Tarjeta>
      <form onSubmit={alMandar} className="flex flex-col gap-4">
        <div>
          <p className="text-base font-medium text-tinta">Registrar este dispositivo</p>
          <p className="mt-1 text-sm text-tinta-tenue">
            Un dispositivo registrado guarda lo que se carga aunque se corte la conexión, y permite cambiar de operador con PIN.
          </p>
        </div>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={guardando} required />
        <div>
          <Boton type="submit" variante="primario" cargando={guardando}>
            Registrar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function ModalCambiarOperador({
  abierto,
  alCerrar,
  operadorActualId,
  dispositivoId,
  bloqueado,
}: {
  abierto: boolean;
  alCerrar: () => void;
  operadorActualId: string;
  dispositivoId: string;
  bloqueado: (usuarioId: string) => boolean;
}) {
  const { usuario } = useSesion();
  const toast = useToast();
  const operadores = useConsultaLocal(() => baseLocal.operadores.orderBy('nombre').toArray(), []);
  const [elegido, setElegido] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [verificando, iniciar] = useTransition();

  const opciones = (operadores ?? [])
    .filter((o) => o.id !== operadorActualId)
    .map((o) => ({ valor: o.id, etiqueta: o.nombre, detalle: o.pinHash ? NOMBRE_ROL[o.rol] : 'Sin PIN' }));

  function cerrar() {
    setElegido(null);
    setPin('');
    setError(undefined);
    alCerrar();
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    const destino = operadores?.find((o) => o.id === elegido);
    if (!destino) return;
    if (!destino.pinHash) return setError('Esta persona todavía no tiene PIN. Lo carga desde Configuración o se lo pone el dueño.');
    if (bloqueado(destino.id)) return setError('Demasiados PIN incorrectos. Esperá unos minutos.');

    // El evento lo firma quien está operando ahora; el de cambio, quien entra.
    const actual = operadores?.find((o) => o.id === operadorActualId) ?? { id: usuario.id, rol: usuario.rol };
    iniciar(async () => {
      if (await verificarPin(pin, destino.pinHash!)) {
        await registrarEvento('operador_cambiado', dispositivoId, { operadorAnteriorId: operadorActualId }, destino);
        toast.exito(`Ahora opera ${destino.nombre}`);
        cerrar();
      } else {
        await registrarEvento('pin_fallido', dispositivoId, { usuarioIntentadoId: destino.id }, actual);
        setPin('');
        setError('El PIN no es correcto');
      }
    });
  }

  return (
    <Modal abierto={abierto} alCerrar={cerrar} titulo="Cambiar de operador">
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <div>
            <label className="etiqueta-campo">Quién opera</label>
            <Selector opciones={opciones} valor={elegido} alElegir={setElegido} placeholder="Elegí a la persona" buscador vacio="No hay nadie más con acceso" />
          </div>
          <Campo
            etiqueta="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            disabled={verificando || !elegido}
            error={error}
          />
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={cerrar} disabled={verificando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={verificando} disabled={!elegido || pin.length < 4}>
            Entrar
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}

export function EsteDispositivo() {
  const { usuario } = useSesion();
  const sync = useEstadoSync();
  const [cambiando, setCambiando] = useState(false);
  const [registrado, setRegistrado] = useState(0);

  const datos = useConsultaLocal(async () => {
    const dispositivoId = (await baseLocal.ajustes.get('dispositivo'))?.valor ?? null;
    if (!dispositivoId) return { dispositivoId: null } as const;
    const [confirmados, pendientes, rechazados, operadores, cursor] = await Promise.all([
      baseLocal.confirmados.where('agregadoId').equals(dispositivoId).sortBy('secuencia'),
      baseLocal.pendientes.orderBy('orden').toArray(),
      baseLocal.rechazados.orderBy('rechazadoEn').reverse().limit(10).toArray(),
      baseLocal.operadores.toArray(),
      baseLocal.ajustes.get('cursor'),
    ]);
    return { dispositivoId, confirmados, pendientes, rechazados, operadores, cursor: cursor?.valor ?? '0' } as const;
  }, [registrado]);

  const estado = useMemo(() => {
    if (!datos?.dispositivoId) return null;
    const propios = datos.pendientes.map((p) => p.evento).filter((e) => e.agregadoId === datos.dispositivoId);
    return reducirDispositivo([...datos.confirmados, ...propios]);
  }, [datos]);

  if (datos === undefined) return <CargandoTarjeta />;
  if (!datos.dispositivoId) return <Registro alRegistrar={() => setRegistrado((n) => n + 1)} />;

  const operadorId = estado?.operadorId ?? usuario.id;
  const nombreOperador = datos.operadores.find((o) => o.id === operadorId)?.nombre ?? (operadorId === usuario.id ? usuario.nombre : 'Desconocido');
  const recientes = [
    ...datos.pendientes.map((p) => ({ evento: p.evento, estado: 'pendiente' as const })),
    ...datos.confirmados
      .slice(-20)
      .reverse()
      .map((e) => ({ evento: e as EventoNuevo, estado: 'confirmado' as const })),
  ].slice(0, 20);
  const nombreDe = (id: string) => datos.operadores.find((o) => o.id === id)?.nombre ?? (id === usuario.id ? usuario.nombre : '—');

  return (
    <div className="flex flex-col gap-5">
      {sync.problema ? <Aviso tono="alerta">{PROBLEMA[sync.problema]}</Aviso> : null}

      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserRoundCheck size={22} strokeWidth={1.5} className="text-tinta-tenue" />
            <div>
              <p className="text-xs text-tinta-tenue">Opera ahora</p>
              <p className="text-base font-medium text-tinta">{nombreOperador}</p>
            </div>
          </div>
          <Boton variante="secundario" onClick={() => setCambiando(true)}>
            Cambiar de operador
          </Boton>
        </div>
      </Tarjeta>

      <Tarjeta>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-base font-medium text-tinta">Sincronización</p>
          {sync.enLinea ? (
            <Insignia tono="exito">En línea</Insignia>
          ) : (
            <Insignia tono="alerta">
              <CloudOff size={12} strokeWidth={2} aria-hidden="true" /> Sin conexión
            </Insignia>
          )}
        </div>
        <dl>
          <FilaDato etiqueta="Pendientes de enviar">{datos.pendientes.length}</FilaDato>
          <FilaDato etiqueta="Último evento recibido">#{datos.cursor}</FilaDato>
          <FilaDato etiqueta="Último contacto">{sync.ultimoContacto ? fechaHora(sync.ultimoContacto) : 'Nunca'}</FilaDato>
          <FilaDato etiqueta="Identificador">
            <Mono>{datos.dispositivoId.slice(0, 8)}</Mono>
          </FilaDato>
        </dl>
        <div className="mt-3">
          <Boton variante="secundario" tamano="sm" onClick={() => void sincronizar()} cargando={sync.sincronizando}>
            <RefreshCw size={13} strokeWidth={1.5} /> Sincronizar ahora
          </Boton>
        </div>
      </Tarjeta>

      {datos.rechazados.length > 0 ? (
        <Aviso tono="error" titulo="Eventos rechazados por el servidor">
          {datos.rechazados.map((r) => (
            <span key={r.id} className="block">
              {TEXTO_EVENTO[r.evento.tipo]} · {fechaHora(r.evento.creadoEnDispositivo)}: {r.motivo}
            </span>
          ))}
        </Aviso>
      ) : null}

      <section>
        <TituloSeccion>Movimientos de este dispositivo</TituloSeccion>
        <Tarjeta>
          {recientes.length === 0 ? (
            <EstadoVacio titulo="Todavía no hay movimientos" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Qué</Th>
                  <Th>Quién</Th>
                  <Th>Cuándo</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {recientes.map(({ evento, estado: e }) => (
                  <tr key={evento.id}>
                    <Td>{TEXTO_EVENTO[evento.tipo]}</Td>
                    <Td>{nombreDe(evento.operadorId)}</Td>
                    <Td className="tabular-nums">{fechaHora(evento.creadoEnDispositivo)}</Td>
                    <Td>{e === 'pendiente' ? <Insignia tono="alerta">Sin enviar</Insignia> : <Insignia tono="neutro">Sincronizado</Insignia>}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </section>

      <ModalCambiarOperador
        abierto={cambiando}
        alCerrar={() => setCambiando(false)}
        operadorActualId={operadorId}
        dispositivoId={datos.dispositivoId}
        bloqueado={(id) => (estado ? pinBloqueado(estado, id, new Date()) : false)}
      />
    </div>
  );
}
