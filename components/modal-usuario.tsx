'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Hash, Mail, KeyRound, LoaderCircle, ShieldCheck, Upload } from 'lucide-react';
import { Modal } from './modal';
import { Avatar } from './avatar';
import { Campo } from './campo';
import { Selector, type OpcionSelector } from './selector';
import { Boton } from './boton';
import { CampoCodigo } from './campo-codigo';
import { Insignia, Aviso } from './ui';
import { CargandoFilas } from './carga';
import { Requisitos } from './acceso';

/**
 * El modal de una cuenta, propia o ajena — un solo modal y no dos: la misma
 * ficha, con el mismo orden (foto, nombre, email, contraseña, pie). Lo único
 * que cambia es el título —"Tu perfil" o el nombre de la persona— y lo que se
 * puede tocar: en la propia se edita el nombre y se cambian email y contraseña;
 * en la ajena el nombre queda fijo, se suman el estado y el rol, y las acciones
 * pasan a ser de administrar (enviar código, desactivar, eliminar).
 *
 * Nunca las dos cosas a la vez: nadie edita su propio rol ni se manda a sí
 * mismo un código de "olvidé mi contraseña" estando adentro.
 *
 * `puedeAdministrar` es la jerarquía de roles, y la decide quien llama al
 * componente (compara el rol propio contra el de `usuario`), no esto: acá no
 * hay orden de roles que conocer, sólo un booleano que ocultar. Sin él, se ve
 * la ficha en modo lectura — nombre, mail, rol e insignia de estado, sin un
 * solo botón. Alguien con un rol menor no puede ni desactivar ni eliminar a
 * alguien con un rol mayor, sea cual sea su propio permiso general de
 * usuarios.
 *
 * El usuario "soporte" nunca es editable desde acá, tenga quien lo mire el
 * permiso que tenga: aparece con su insignia en vez de un rol elegible, y sin
 * ninguna acción — es de la agencia, no del cliente.
 */

export type EstadoUsuario = 'activo' | 'desactivado';

export interface UsuarioFicha {
  nombre: string;
  email: string;
  foto?: string | null;
  rol: string;
  estado: EstadoUsuario;
}

const TONO_ESTADO: Record<EstadoUsuario, 'exito' | 'neutro'> = {
  activo: 'exito',
  desactivado: 'neutro',
};

const TEXTO_ESTADO: Record<EstadoUsuario, string> = {
  activo: 'Activo',
  desactivado: 'Desactivado',
};

export function ModalUsuario({
  abierto,
  alCerrar,
  cargando,
  usuario,
  esPropio,
  esSoporte,
  /** Sólo importa cuando `!esPropio`. Sin ella (o en `false`), la ficha
   * queda en modo lectura: se ve todo, no se puede tocar nada. */
  puedeAdministrar,
  roles,
  alCambiarRol,
  alCambiarNombre,
  alSubirFoto,
  alPedirCambioEmail,
  alPedirCambioContrasena,
  alForzarNuevaContrasena,
  alDesactivar,
  alReactivar,
  alCerrarSesiones,
  alEliminar,
  alGuardar,
  alCambiarPin,
  tienePin,
  guardando,
  aviso,
}: {
  abierto: boolean;
  alCerrar: () => void;
  /** Se está trayendo el detalle: se muestra el esqueleto en vez del contenido. */
  cargando?: boolean;
  usuario?: UsuarioFicha;
  esPropio?: boolean;
  esSoporte?: boolean;
  puedeAdministrar?: boolean;
  roles: OpcionSelector[];
  alCambiarRol: (rol: string) => void;
  /** Sólo con `esPropio`. */
  alCambiarNombre?: (v: string) => void;
  alSubirFoto?: (archivo: File) => void;
  /** Arranca el flujo de código propio — ver `ModalCambiarCredencial`. */
  alPedirCambioEmail?: () => void;
  alPedirCambioContrasena?: () => void;
  /**
   * Sólo con `!esPropio`. Manda el mismo código de 6 dígitos que la
   * recuperación normal — no una contraseña nueva elegida acá. Quien
   * administra el sistema nunca debería llegar a conocer la contraseña de
   * otra cuenta, ni siquiera la que él mismo le puso al crearla.
   */
  alForzarNuevaContrasena?: () => void;
  alDesactivar?: () => void;
  alReactivar?: () => void;
  /** Sin esta prop no aparece la acción. Aparece tanto en `esPropio` (cerrar
   * las propias sesiones en el resto de los dispositivos) como en la ficha de
   * otro (forzarle el logout). Confirma en un modal propio: no es tan grave
   * como para bloquear la ficha entera con un aviso permanente, pero sí para
   * pedir un click más. */
  alCerrarSesiones?: () => void;
  /** Sin esta prop no aparece la acción: borrar un usuario no es reversible
   * y no todo rol tiene por qué poder hacerlo. */
  alEliminar?: () => void;
  /** Sólo con `esPropio`: el botón "Guardar" del pie. */
  alGuardar?: () => void;
  /** El PIN con el que la persona se identifica en los dispositivos compartidos. Sin esta prop no aparece la fila. */
  alCambiarPin?: () => void;
  tienePin?: boolean;
  guardando?: boolean;
  aviso?: { tono: 'error' | 'alerta'; titulo?: string; detalle?: ReactNode };
}) {
  const [confirmandoSesiones, setConfirmandoSesiones] = useState(false);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  function alCerrarModal() {
    setConfirmandoSesiones(false);
    setConfirmandoBaja(false);
    alCerrar();
  }

  const soloLectura = !esPropio && !esSoporte && !puedeAdministrar;
  /** Las acciones sobre otra cuenta: ni sobre soporte ni sin permiso. */
  const accionesDeAdmin = !esPropio && !esSoporte && !!puedeAdministrar;
  const titulo = esPropio ? 'Tu perfil' : usuario?.nombre ?? 'Usuario';

  function alMandar(e: FormEvent) {
    e.preventDefault();
    alGuardar?.();
  }

  return (
    <>
      <Modal abierto={abierto} alCerrar={alCerrarModal} titulo={titulo}>
        {cargando || !usuario ? (
          <div className="modal-cuerpo">
            <CargandoFilas filas={4} />
          </div>
        ) : (
          <form onSubmit={alMandar}>
            <div className="modal-cuerpo flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <Avatar nombre={usuario.nombre} foto={usuario.foto} tamano="lg" />

                {esPropio && alSubirFoto ? (
                  <>
                    <input
                      ref={inputFoto}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) alSubirFoto(archivo);
                      }}
                    />
                    <Boton type="button" variante="secundario" tamano="sm" onClick={() => inputFoto.current?.click()}>
                      <Upload size={13} strokeWidth={1.5} /> Subir foto
                    </Boton>
                  </>
                ) : null}

                {!esPropio ? (
                  <Insignia tono={TONO_ESTADO[usuario.estado]} className="ml-auto shrink-0">
                    {TEXTO_ESTADO[usuario.estado]}
                  </Insignia>
                ) : null}
              </div>

              {aviso ? (
                <Aviso tono={aviso.tono} titulo={aviso.titulo}>
                  {aviso.detalle}
                </Aviso>
              ) : null}

              {/* El nombre se edita sólo en el perfil propio; en el de otro se ve
                  en el mismo lugar, fijo. */}
              <Campo
                etiqueta="Nombre"
                value={usuario.nombre}
                onChange={(e) => alCambiarNombre?.(e.target.value)}
                disabled={guardando || !esPropio}
                required
                data-foco-inicial={esPropio || undefined}
              />

              {!esPropio ? (
                <div>
                  <label className="etiqueta-campo">Rol</label>
                  {esSoporte ? (
                    <Insignia tono="neutro">
                      <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                      Soporte
                    </Insignia>
                  ) : soloLectura ? (
                    <Insignia tono="acento">{roles.find((r) => r.valor === usuario.rol)?.etiqueta ?? usuario.rol}</Insignia>
                  ) : (
                    <Selector
                      opciones={roles}
                      valor={usuario.rol}
                      alElegir={alCambiarRol}
                      deshabilitado={guardando}
                    />
                  )}
                </div>
              ) : null}

              {soloLectura ? (
                <Aviso tono="alerta">No podés administrar a alguien con un rol superior al tuyo.</Aviso>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-lienzo px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">Email</p>
                  <p className="truncate text-xs text-tinta-tenue">{usuario.email}</p>
                </div>
                {esPropio || accionesDeAdmin ? (
                  alPedirCambioEmail ? (
                    <Boton type="button" variante="secundario" tamano="sm" onClick={alPedirCambioEmail}>
                      <Mail size={13} strokeWidth={1.5} /> Cambiar email
                    </Boton>
                  ) : null
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-lienzo px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tinta">Contraseña</p>
                  <p className="truncate text-xs text-tinta-tenue">••••••••••</p>
                </div>
                {esPropio ? (
                  <Boton type="button" variante="secundario" tamano="sm" onClick={alPedirCambioContrasena}>
                    <KeyRound size={13} strokeWidth={1.5} /> Cambiar contraseña
                  </Boton>
                ) : accionesDeAdmin && alForzarNuevaContrasena ? (
                  <Boton type="button" variante="secundario" tamano="sm" onClick={alForzarNuevaContrasena} disabled={guardando}>
                    <KeyRound size={13} strokeWidth={1.5} /> Enviar código
                  </Boton>
                ) : null}
              </div>

              {alCambiarPin && (esPropio || accionesDeAdmin) ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-lienzo px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tinta">PIN de operador</p>
                    <p className="truncate text-xs text-tinta-tenue">{tienePin ? '••••' : 'Sin PIN'}</p>
                  </div>
                  <Boton type="button" variante="secundario" tamano="sm" onClick={alCambiarPin} disabled={guardando}>
                    <Hash size={13} strokeWidth={1.5} /> {tienePin ? 'Cambiar PIN' : 'Poner PIN'}
                  </Boton>
                </div>
              ) : null}
            </div>

            <footer className="modal-pie justify-between">
              {esPropio ? (
                <>
                  {alCerrarSesiones ? (
                    <Boton
                      type="button"
                      variante="secundario"
                      onClick={() => setConfirmandoSesiones(true)}
                      disabled={guardando}
                    >
                      Cerrar todas las sesiones
                    </Boton>
                  ) : (
                    <div />
                  )}
                  <div className="flex gap-2">
                    <Boton type="button" variante="fantasma" onClick={alCerrarModal} disabled={guardando}>
                      Cancelar
                    </Boton>
                    <Boton type="submit" variante="primario" cargando={guardando}>
                      Guardar
                    </Boton>
                  </div>
                </>
              ) : accionesDeAdmin ? (
                <>
                  {alCerrarSesiones ? (
                    <Boton
                      type="button"
                      variante="secundario"
                      onClick={() => setConfirmandoSesiones(true)}
                      disabled={guardando}
                    >
                      Cerrar todas las sesiones
                    </Boton>
                  ) : (
                    <div />
                  )}
                  <div className="flex gap-2">
                    {usuario.estado === 'desactivado' && alReactivar ? (
                      <Boton type="button" variante="secundario" onClick={alReactivar} disabled={guardando}>
                        Reactivar
                      </Boton>
                    ) : null}
                    {usuario.estado !== 'desactivado' && alDesactivar ? (
                      <Boton type="button" variante="secundario" onClick={alDesactivar} disabled={guardando}>
                        Desactivar
                      </Boton>
                    ) : null}
                    {alEliminar ? (
                      <Boton type="button" variante="peligro" onClick={() => setConfirmandoBaja(true)} disabled={guardando}>
                        Eliminar
                      </Boton>
                    ) : null}
                  </div>
                </>
              ) : null}
            </footer>
          </form>
        )}
      </Modal>

      {/* Confirmar: cerrar sesiones. Modal propio y no un aviso inline: es una
          acción que afecta a la persona ahí mismo, en el momento — merece un
          paso explícito de más, no una casilla que se pasa por alto. */}
      {alCerrarSesiones ? (
        <Modal
          abierto={confirmandoSesiones}
          alCerrar={() => setConfirmandoSesiones(false)}
          titulo="Cerrar todas las sesiones"
        >
          <div className="modal-cuerpo">
            <p className="text-sm text-tinta-suave">
              {esPropio
                ? 'Vas a tener que volver a iniciar sesión en el resto de tus dispositivos.'
                : 'La cuenta va a tener que volver a iniciar sesión en todos los dispositivos.'}
            </p>
          </div>
          <div className="modal-pie">
            <Boton variante="secundario" onClick={() => setConfirmandoSesiones(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={guardando}
              onClick={() => {
                alCerrarSesiones();
                setConfirmandoSesiones(false);
              }}
            >
              Cerrar sesiones
            </Boton>
          </div>
        </Modal>
      ) : null}

      {/* Confirmar: eliminar. Modal propio y no el cuerpo de la ficha
          reemplazado: borrar a alguien es la única acción de acá sin vuelta
          atrás. */}
      {!esPropio && alEliminar ? (
        <Modal abierto={confirmandoBaja} alCerrar={() => setConfirmandoBaja(false)} titulo="Eliminar usuario">
          <div className="modal-cuerpo">
            <p className="text-sm text-tinta-suave">
              Se borra la cuenta y sus sesiones. Esta acción no se puede deshacer.
            </p>
          </div>
          <div className="modal-pie">
            <Boton variante="secundario" onClick={() => setConfirmandoBaja(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={guardando}
              onClick={() => {
                alEliminar();
                setConfirmandoBaja(false);
              }}
            >
              Eliminar
            </Boton>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

type PasoCredencial = 'pidiendo' | 'codigo' | 'valor-nuevo';

/**
 * El sub-modal de código, compartido por "Cambiar email" y "Cambiar
 * contraseña" de la ficha propia. Arranca en `pidiendo` (spinner, mientras el
 * código ya salió por mail) y pasa a `codigo` cuando `enviado` se vuelve
 * `true`. El consumidor es dueño del paso: este componente no dispara el
 * envío por su cuenta, para no reenviarlo si el modal se vuelve a montar.
 */
export function ModalCambiarCredencial({
  abierto,
  alCerrar,
  tipo,
  enviado,
  paso,
  valor,
  alCambiarValor,
  requisitos,
  alReenviar,
  alConfirmar,
  guardando,
  error,
}: {
  abierto: boolean;
  alCerrar: () => void;
  tipo: 'email' | 'contrasena';
  enviado: boolean;
  paso: PasoCredencial;
  valor: string;
  alCambiarValor: (v: string) => void;
  /** Sólo para `tipo: 'contrasena'`, en el paso `valor-nuevo`. */
  requisitos?: { texto: string; cumplido: boolean }[];
  alReenviar: () => void;
  alConfirmar: () => void;
  guardando?: boolean;
  error?: string;
}) {
  const titulo = tipo === 'email' ? 'Cambiar el email' : 'Cambiar la contraseña';

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={titulo}>
      <div className="modal-cuerpo flex flex-col gap-4">
        {!enviado || paso === 'pidiendo' ? (
          <div className="flex justify-center py-6">
            <LoaderCircle size={22} strokeWidth={1.5} className="animate-spin text-tinta-tenue" aria-hidden="true" />
            <span className="sr-only">Enviando el código…</span>
          </div>
        ) : paso === 'codigo' ? (
          <>
            <p className="text-sm text-tinta-suave">Te mandamos un código a tu email. Ingresalo acá.</p>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <CampoCodigo valor={valor} alCambiar={alCambiarValor} alCompletar={alConfirmar} deshabilitado={guardando} />
            <button
              type="button"
              onClick={alReenviar}
              disabled={guardando}
              className="text-sm font-medium text-acento hover:underline"
            >
              Reenviar código
            </button>
          </>
        ) : (
          <>
            <Campo
              etiqueta={tipo === 'email' ? 'Email nuevo' : 'Contraseña nueva'}
              type={tipo === 'email' ? 'email' : 'password'}
              autoComplete={tipo === 'email' ? undefined : 'new-password'}
              value={valor}
              onChange={(e) => alCambiarValor(e.target.value)}
              disabled={guardando}
              required
            />
            {requisitos ? <Requisitos items={requisitos} /> : null}
          </>
        )}
      </div>

      <footer className="modal-pie">
        <Boton type="button" variante="fantasma" onClick={alCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        {paso === 'valor-nuevo' ? (
          <Boton type="button" variante="primario" onClick={alConfirmar} cargando={guardando}>
            Confirmar
          </Boton>
        ) : null}
      </footer>
    </Modal>
  );
}
