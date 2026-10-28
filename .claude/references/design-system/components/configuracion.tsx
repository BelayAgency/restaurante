'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useCierreFondo } from '@/lib/cierre-fondo';

/**
 * El modal de configuración: nav de secciones a la izquierda, panel a la derecha.
 *
 * Es un modal y no una ruta porque configurar algo casi nunca es a lo que uno
 * vino: se abre encima de donde estabas y al cerrarlo seguís ahí. Mandarlo a una
 * página aparte obliga a volver.
 *
 * Se apoya en `<dialog>` por lo mismo que `modal.tsx`: el foco atrapado adentro,
 * el cierre con Escape, el `inert` sobre el resto de la página y el `::backdrop`
 * vienen dados por el navegador.
 *
 * Qué sección está abierta lo maneja este componente y no quien lo usa: es
 * estado de la pantalla, no del sistema. Si alguna vez hace falta abrirlo
 * directamente en una sección —desde un aviso de cobro rechazado, por ejemplo—
 * se le pasa `seccionInicial`.
 */

export interface SeccionConfiguracion {
  /** Identificador estable. No se muestra. */
  id: string;
  titulo: string;
  icono: ReactNode;
  contenido: ReactNode;
}

export function ModalConfiguracion({
  abierto,
  alCerrar,
  secciones,
  seccionInicial,
}: {
  abierto: boolean;
  alCerrar: () => void;
  secciones: SeccionConfiguracion[];
  seccionInicial?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [activa, setActiva] = useState(seccionInicial ?? secciones[0]?.id);

  // El callback cambia de identidad en cada render; guardarlo en una ref evita
  // reenganchar los listeners a cada rato.
  const fondo = useCierreFondo(alCerrar);
  const alCerrarRef = useRef(alCerrar);
  // eslint-disable-next-line react-hooks/refs -- patrón del design system de la agencia
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    // Se frena el cierre nativo: cierra React cambiando el estado, así hay una
    // sola fuente de verdad.
    const alCancelar = (evento: Event) => {
      evento.preventDefault();
      alCerrarRef.current();
    };
    // Y si algo lo cierra por fuera de React, el estado se vuelve a atar a la
    // realidad del DOM en vez de quedar diciendo que sigue abierto.
    const alCerrarse = () => alCerrarRef.current();

    dialogo.addEventListener('cancel', alCancelar);
    dialogo.addEventListener('close', alCerrarse);
    return () => {
      dialogo.removeEventListener('cancel', alCancelar);
      dialogo.removeEventListener('close', alCerrarse);
    };
  }, []);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    else if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  /**
   * Al reabrirlo vuelve a la primera sección: es donde uno espera entrar.
   *
   * Depende SÓLO de `abierto`. Con `secciones` en las dependencias el efecto
   * corría en cada render —el array se pasa en línea, así que cambia de
   * identidad siempre— y cualquier re-render del padre devolvía la vista a la
   * primera sección con el modal abierto: se elegía "Facturación" y volvía sola
   * a "General".
   */
  const inicialRef = useRef(seccionInicial);
  // eslint-disable-next-line react-hooks/refs -- patrón del design system de la agencia
  inicialRef.current = seccionInicial ?? secciones[0]?.id;

  useEffect(() => {
    if (abierto) setActiva(inicialRef.current);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    // `showModal` bloquea la interacción con el fondo pero no su scroll.
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];

  return (
    <dialog
      ref={ref}
      className="config"
      aria-labelledby={idTitulo}
      {...fondo}
    >
      <nav className="config-nav" aria-label="Secciones de configuración">
        <h2 id={idTitulo}>Configuración</h2>
        <ul>
          {secciones.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActiva(s.id)}
                {...(s.id === actual?.id ? { 'aria-current': 'page' as const } : {})}
              >
                {s.icono}
                <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="config-panel">
        <header className="config-cabecera">
          <h3>{actual?.titulo}</h3>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="fila-nav-accion pointer-events-auto opacity-100"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        </header>

        {/* La sección se remonta al cambiar: un formulario a medio llenar de
            otra sección no debe seguir vivo escondido. */}
        <div className="config-cuerpo" key={actual?.id}>
          {actual?.contenido}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Un bloque titulado dentro de una sección: "Perfil", "Preferencias", "Cobros".
 *
 * La bajada es opcional y va arriba de las filas, no adentro de la primera:
 * explica el bloque entero, no su primer dato.
 */
export function SeccionConfig({
  titulo,
  bajada,
  children,
}: {
  titulo: string;
  bajada?: string;
  children: ReactNode;
}) {
  return (
    <section className="bloque-config">
      <h4>{titulo}</h4>
      {bajada ? <p className="bloque-config-bajada">{bajada}</p> : null}
      {children}
    </section>
  );
}

/**
 * Una fila: rótulo (y explicación) a la izquierda, control a la derecha.
 *
 * Abajo de 900px el control baja debajo del rótulo y ocupa el ancho: al lado,
 * en un teléfono, un campo de texto queda de dos centímetros.
 */
export function FilaConfig({
  rotulo,
  descripcion,
  children,
}: {
  rotulo: ReactNode;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <div className="fila-config">
      <div className="fila-config-izq">
        <div className="fila-config-rotulo">{rotulo}</div>
        {descripcion ? <p className="fila-config-desc">{descripcion}</p> : null}
      </div>
      <div className="fila-config-der">{children}</div>
    </div>
  );
}
