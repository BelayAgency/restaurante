'use client';

import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from './modal';
import { Avatar } from './avatar';
import { Campo } from './campo';
import { Selector, type OpcionSelector } from './selector';
import { Boton } from './boton';
import { Insignia, Tabla, Th, Td } from './ui';
import { Requisitos } from './acceso';

/**
 * Usuarios — el listado y el alta. La ficha de cada uno (ver, cambiar rol,
 * dar de baja) es `modal-usuario.tsx`; esto es sólo la tabla y el "+ Nuevo
 * usuario".
 *
 * Soporte convive en esta misma tabla, nunca en una lista aparte: separarlo
 * sería más fácil de ocultar por error el día que alguien copie la query de
 * un lado a otro. Se distingue por la insignia de la columna Rol.
 */

export interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  foto?: string | null;
  rol: string;
  esSoporte?: boolean;
}

export function TablaUsuarios({
  usuarios,
  alAbrirFicha,
}: {
  usuarios: FilaUsuario[];
  alAbrirFicha: (id: string) => void;
}) {
  return (
    <section className="tarjeta p-5 sm:p-6">
      <Tabla>
        <thead>
          <tr>
            <Th>Nombre</Th>
            <Th>Email</Th>
            <Th>Rol</Th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">
                <button
                  type="button"
                  onClick={() => alAbrirFicha(u.id)}
                  className="inline-flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-tinta hover:text-acento"
                >
                  <Avatar nombre={u.nombre} foto={u.foto} tamano="sm" />
                  {u.nombre}
                </button>
              </Td>
              <Td className="text-tinta-suave">{u.email}</Td>
              <Td>
                {u.esSoporte ? (
                  <Insignia tono="neutro">
                    <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                    Soporte
                  </Insignia>
                ) : (
                  <Insignia tono="acento">{u.rol}</Insignia>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </section>
  );
}

/**
 * El alta pone la contraseña ahí mismo: no hay mail de invitación (ver
 * `prompt-base.md` sección 13.1). Quien crea la cuenta se la pasa a la
 * persona por fuera del sistema, así que el campo es de texto visible y no
 * un password oculto — copiarla a mano de un campo tipo `password` es un
 * ejercicio de transcripción que nadie necesita.
 *
 * Los requisitos son los mismos y con el mismo componente que la pantalla de
 * "Elegí tu contraseña" del login: una sola función del dominio decide qué
 * cuenta como válida, acá y ahí.
 */
export function ModalNuevoUsuario({
  abierto,
  alCerrar,
  roles,
  alCrear,
  guardando,
}: {
  abierto: boolean;
  alCerrar: () => void;
  roles: OpcionSelector[];
  alCrear: (datos: { nombre: string; email: string; rol: string; contrasena: string }) => void;
  guardando?: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState('');

  const requisitos = [
    { texto: '10 caracteres', cumplido: contrasena.length >= 10 },
    { texto: 'Una mayúscula', cumplido: /[A-Z]/.test(contrasena) },
    { texto: 'Un número', cumplido: /[0-9]/.test(contrasena) },
    { texto: 'Un símbolo', cumplido: /[^A-Za-z0-9]/.test(contrasena) },
  ];
  const contrasenaValida = requisitos.every((r) => r.cumplido);

  function alCerrarModal() {
    setNombre('');
    setEmail('');
    setRol(null);
    setContrasena('');
    alCerrar();
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    if (!rol || !contrasenaValida) return;
    alCrear({ nombre, email, rol, contrasena });
  }

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrarModal}
      titulo="Nuevo usuario"
      descripcion="Una cuenta con acceso al panel. Pasale la contraseña; después la puede cambiar."
    >
      <form onSubmit={alMandar}>
        <div className="modal-cuerpo flex flex-col gap-4">
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            required
            data-foco-inicial
          />
          <Campo
            etiqueta="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={guardando}
            required
          />
          <div>
            <label className="etiqueta-campo">Rol</label>
            <Selector opciones={roles} valor={rol} alElegir={setRol} deshabilitado={guardando} />
          </div>
          <div>
            <Campo
              etiqueta="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              disabled={guardando}
              required
            />
            <Requisitos items={requisitos} className="mt-2" />
          </div>
        </div>
        <footer className="modal-pie">
          <Boton type="button" variante="secundario" onClick={alCerrarModal} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardando} disabled={!rol || !contrasenaValida}>
            Crear
          </Boton>
        </footer>
      </form>
    </Modal>
  );
}
