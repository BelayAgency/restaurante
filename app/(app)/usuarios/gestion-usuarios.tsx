'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/components/boton';
import { ModalUsuario } from '@/components/modal-usuario';
import { useToast } from '@/components/toast';
import { TituloSeccion } from '@/components/ui';
import { ModalNuevoUsuario, TablaUsuarios } from '@/components/usuarios';
import { puede, puedeAdministrarCuenta } from '@/dominio/permisos';
import { NOMBRE_ROL, ROLES, rolAlcanza, type Rol } from '@/dominio/roles';
import type { FilaListado } from '@/servidor/usuarios';
import {
  accionCambiarEstado,
  accionCambiarRol,
  accionCerrarSesiones,
  accionCrearUsuario,
  accionEditarNombre,
  accionEliminarUsuario,
  accionEnviarCodigo,
} from '../acciones';
import { CambioCredencial } from '../cambio-credencial';
import { ModalPin } from '../modal-pin';
import { useSesion } from '../sesion-cliente';

type Resultado = { ok: true } | { ok: false; error: string };

export function GestionUsuarios({ usuarios }: { usuarios: FilaListado[] }) {
  const { usuario: actor } = useSesion();
  const toast = useToast();
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [nombrePropio, setNombrePropio] = useState(actor.nombre);
  const [credencial, setCredencial] = useState<'email' | 'contrasena' | null>(null);
  const [pinAbierto, setPinAbierto] = useState(false);
  const [guardando, iniciar] = useTransition();

  const ficha = usuarios.find((u) => u.id === fichaId);
  const esPropio = ficha?.id === actor.id;
  const administra = ficha ? puedeAdministrarCuenta(actor, ficha) : false;
  // Sólo se ofrecen los roles que quien administra puede dar.
  const roles = ROLES.filter((r) => rolAlcanza(actor.rol, r) || actor.esSoporte).map((r) => ({ valor: r, etiqueta: NOMBRE_ROL[r] }));

  function hacer(accion: () => Promise<Resultado>, exito: string) {
    iniciar(async () => {
      const resultado = await accion();
      if (resultado.ok) {
        toast.exito(exito);
        router.refresh();
      } else {
        toast.error(resultado.error);
      }
    });
  }

  return (
    <>
      <TituloSeccion
        accion={
          puede(actor, 'usuarios.administrar') ? (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus size={15} strokeWidth={1.75} /> Nuevo usuario
            </Boton>
          ) : null
        }
      >
        Usuarios
      </TituloSeccion>

      <TablaUsuarios
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nombre: u.activo ? u.nombre : `${u.nombre} (desactivado)`,
          email: u.email,
          foto: u.foto,
          rol: NOMBRE_ROL[u.rol],
          esSoporte: u.esSoporte,
        }))}
        alAbrirFicha={(id) => {
          setNombrePropio(actor.nombre);
          setFichaId(id);
        }}
      />

      <ModalNuevoUsuario
        abierto={creando}
        alCerrar={() => setCreando(false)}
        roles={roles}
        guardando={guardando}
        alCrear={(datos) =>
          iniciar(async () => {
            const resultado = await accionCrearUsuario(datos);
            if (!resultado.ok) return toast.error(resultado.error);
            toast.exito('Usuario creado', 'Pasale la contraseña por fuera del sistema.');
            setCreando(false);
            router.refresh();
          })
        }
      />

      <ModalUsuario
        abierto={!!ficha}
        alCerrar={() => setFichaId(null)}
        usuario={
          ficha
            ? { nombre: esPropio ? nombrePropio : ficha.nombre, email: ficha.email, foto: ficha.foto, rol: ficha.rol, estado: ficha.activo ? 'activo' : 'desactivado' }
            : undefined
        }
        esPropio={esPropio}
        esSoporte={ficha?.esSoporte && !esPropio}
        puedeAdministrar={administra}
        roles={roles.length ? roles : ROLES.map((r) => ({ valor: r, etiqueta: NOMBRE_ROL[r] }))}
        guardando={guardando}
        alCambiarNombre={setNombrePropio}
        alGuardar={() => hacer(() => accionEditarNombre(nombrePropio), 'Nombre guardado')}
        alCambiarRol={(rol) => ficha && hacer(() => accionCambiarRol(ficha.id, rol as Rol), 'Rol cambiado')}
        alPedirCambioEmail={esPropio ? (actor.esSoporte ? undefined : () => setCredencial('email')) : actor.esSoporte ? () => setCredencial('email') : undefined}
        alPedirCambioContrasena={() => setCredencial('contrasena')}
        alForzarNuevaContrasena={
          ficha && !esPropio
            ? actor.esSoporte
              ? () => setCredencial('contrasena')
              : () => hacer(() => accionEnviarCodigo(ficha.id), 'Le mandamos un código a su correo')
            : undefined
        }
        alDesactivar={() => ficha && hacer(() => accionCambiarEstado(ficha.id, false), 'Usuario desactivado')}
        alReactivar={() => ficha && hacer(() => accionCambiarEstado(ficha.id, true), 'Usuario reactivado')}
        alCerrarSesiones={() => ficha && hacer(() => accionCerrarSesiones(ficha.id), 'Sesiones cerradas')}
        alEliminar={() =>
          ficha &&
          hacer(async () => {
            const resultado = await accionEliminarUsuario(ficha.id);
            if (resultado.ok) setFichaId(null);
            return resultado;
          }, 'Usuario eliminado')
        }
        alCambiarPin={() => setPinAbierto(true)}
        tienePin={ficha?.tienePin}
      />

      {ficha && credencial ? (
        <CambioCredencial
          abierto
          alCerrar={() => {
            setCredencial(null);
            router.refresh();
          }}
          objetivoId={ficha.id}
          tipo={credencial}
        />
      ) : null}
      {ficha ? (
        <ModalPin
          abierto={pinAbierto}
          alCerrar={() => {
            setPinAbierto(false);
            router.refresh();
          }}
          usuarioId={ficha.id}
          nombre={esPropio ? undefined : ficha.nombre}
        />
      ) : null}
    </>
  );
}
