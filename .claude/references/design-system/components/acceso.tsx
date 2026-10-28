import { Check } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Campo } from './campo';
import { CampoSwitch } from './switch';
import { Boton } from './boton';
import { CampoCodigo } from './campo-codigo';
import { LogoBelay } from './logo-belay';
import { Aviso } from './ui';

/**
 * Acceso — el esqueleto de las cuatro pantallas de entrada.
 *
 * Entrar, pedir el código, ponerlo y elegir la contraseña comparten
 * este marco: el panel de marca a la izquierda y el formulario a la derecha.
 * Lo único que cambia es lo que va adentro. Se resuelve con un componente y no
 * copiando el markup cuatro veces porque el panel de marca es lo que hace que
 * las cuatro se lean como el mismo sistema, y basta que una quede vieja para
 * que el flujo entero parezca roto.
 *
 * Es la única pantalla que alguien ve antes de estar adentro, y por eso la
 * única que usa el color de marca como superficie grande.
 */

export function Acceso({
  /** El logo del cliente. Un <img> o el nombre escrito si no hay logo. */
  logo,
  nombreSistema,
  nombreCliente,
  /**
   * `true` cuando el color de marca es claro (amarillo, lima): el panel pasa a
   * texto oscuro. Sin esto el blanco sobre esos colores no se lee.
   */
  marcaClara,
  children,
}: {
  logo: ReactNode;
  nombreSistema: string;
  nombreCliente: string;
  marcaClara?: boolean;
  children: ReactNode;
}) {
  return (
    // Dos elementos y no uno: el de afuera es el contenedor que se consulta, el
    // de adentro la grilla que cambia de columnas. Un elemento no puede
    // preguntarse su propio ancho.
    <div className="acceso" data-marca={marcaClara ? 'clara' : undefined}>
      <div className="acceso-grilla">
        <div className="acceso-marca">
          <div className="acceso-logo">{logo}</div>

          <div className="acceso-marca-pie">
            <p className="acceso-rotulo">Sistema de gestión</p>
            <h1 className="acceso-sistema">{nombreSistema}</h1>
            <span className="acceso-barra" aria-hidden="true" />
            <p className="acceso-credito flex items-center gap-1.5">
              Desarrollado por
              <a
                href="https://belay.agency"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex opacity-90 transition-opacity hover:opacity-100"
              >
                <LogoBelay className="h-4 w-auto" />
              </a>
              para {nombreCliente}
            </p>
          </div>
        </div>

        <div className="acceso-forma">
          <div className="acceso-caja">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Los requisitos de la contraseña, con el estado de cada uno.
 *
 * Se muestran desde el primer momento y no después de fallar: inventar una
 * contraseña, mandarla, y que recién ahí te digan que faltaba un símbolo es la
 * forma más rápida de que alguien la termine anotando en un papel.
 *
 * Quién cumple y quién no lo decide el dominio (`evaluarPassword`), no este
 * componente: la misma función tiene que correr en el servidor al guardar, y
 * dos implementaciones de la misma regla siempre terminan discrepando.
 */
export function Requisitos({
  items,
  className,
}: {
  items: { texto: string; cumplido: boolean }[];
  className?: string;
}) {
  return (
    // Los cambios se anuncian a medida que se tipea, sin robar el foco.
    <ul className={cn('requisitos', className)} aria-live="polite">
      {items.map((r) => (
        <li key={r.texto} className="requisito" data-cumplido={r.cumplido ? 'true' : undefined}>
          <span className="requisito-marca" aria-hidden="true">
            <Check strokeWidth={3} />
          </span>
          {r.texto}
          {/* El tilde verde no llega al lector de pantalla: el estado se dice. */}
          <span className="sr-only">{r.cumplido ? ': cumplido' : ': falta'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Un solo tono para las dos cosas que puede decir esta pantalla: algo salió
 *  mal (error) o la cuenta está temporalmente frenada (alerta). Nunca éxito
 *  ni neutro acá — para eso está la pantalla siguiente del flujo. */
export interface AvisoAcceso {
  tono: 'error' | 'alerta';
  titulo?: string;
  detalle?: ReactNode;
}

function AvisoDeAcceso({ aviso }: { aviso?: AvisoAcceso }) {
  if (!aviso) return null;
  return (
    <Aviso tono={aviso.tono} titulo={aviso.titulo}>
      {aviso.detalle}
    </Aviso>
  );
}

/**
 * Pantalla 1 — Entrar.
 *
 * El aviso de error nunca dice cuál de los dos campos está mal: un login que
 * responde distinto según si el mail existe es un buscador de cuentas
 * válidas. Por eso tampoco se resalta sólo el campo de contraseña.
 */
export function PantallaEntrar({
  email,
  alCambiarEmail,
  password,
  alCambiarPassword,
  mantenerSesion,
  alCambiarMantenerSesion,
  alEnviar,
  enviando,
  aviso,
  hrefOlvidaste,
}: {
  email: string;
  alCambiarEmail: (v: string) => void;
  password: string;
  alCambiarPassword: (v: string) => void;
  mantenerSesion: boolean;
  alCambiarMantenerSesion: (v: boolean) => void;
  alEnviar: () => void;
  enviando?: boolean;
  aviso?: AvisoAcceso;
  hrefOlvidaste: string;
}) {
  function alMandar(e: FormEvent) {
    e.preventDefault();
    alEnviar();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={alMandar}>
      <h1 className="acceso-titulo">Ingresá a tu cuenta</h1>

      <AvisoDeAcceso aviso={aviso} />

      <Campo
        etiqueta="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => alCambiarEmail(e.target.value)}
        disabled={enviando}
        required
      />

      <div>
        {/* La etiqueta y el link comparten renglón: abajo del campo, el link
            queda pegado a donde aparece el error y se termina apretando uno
            queriendo leer el otro. */}
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label className="etiqueta-campo mb-0" htmlFor="acceso-password">
            Contraseña
          </label>
          <a href={hrefOlvidaste} className="text-xs font-medium text-acento hover:underline">
            ¿La olvidaste?
          </a>
        </div>
        <input
          id="acceso-password"
          type="password"
          autoComplete="current-password"
          className="campo"
          value={password}
          onChange={(e) => alCambiarPassword(e.target.value)}
          disabled={enviando}
          required
        />
      </div>

      <CampoSwitch
        titulo="Mantener la sesión iniciada"
        activo={mantenerSesion}
        alCambiar={alCambiarMantenerSesion}
        deshabilitado={enviando}
      />

      <Boton type="submit" variante="primario" tamano="lg" ancho cargando={enviando}>
        Entrar
      </Boton>
    </form>
  );
}

/** Pantalla 2 — Pedir el código. */
export function PantallaPedirCodigo({
  email,
  alCambiarEmail,
  alEnviar,
  enviando,
  aviso,
  hrefVolver,
}: {
  email: string;
  alCambiarEmail: (v: string) => void;
  alEnviar: () => void;
  enviando?: boolean;
  aviso?: AvisoAcceso;
  hrefVolver: string;
}) {
  function alMandar(e: FormEvent) {
    e.preventDefault();
    alEnviar();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={alMandar}>
      <a href={hrefVolver} className="text-xs font-medium text-acento hover:underline">
        ← Volver al inicio de sesión
      </a>
      <h1 className="acceso-titulo">Recuperar el acceso</h1>

      <AvisoDeAcceso aviso={aviso} />

      <Campo
        etiqueta="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => alCambiarEmail(e.target.value)}
        disabled={enviando}
        required
      />

      <Boton type="submit" variante="primario" tamano="lg" ancho cargando={enviando}>
        Enviarme el código
      </Boton>
    </form>
  );
}

/**
 * Pantalla 3 — Poner el código.
 *
 * Se llega acá siempre, exista o no la cuenta: nunca confirmar ni negar si un
 * mail está registrado. Si no existe, no se manda nada — pero la pantalla es
 * la misma, y el error de código inválido también.
 */
export function PantallaCodigo({
  emailIngresado,
  valor,
  alCambiar,
  alCompletar,
  minutos,
  segundosParaReenviar,
  alReenviar,
  deshabilitado,
  aviso,
}: {
  emailIngresado: string;
  valor: string;
  alCambiar: (v: string) => void;
  alCompletar?: (v: string) => void;
  minutos: number;
  /** 0 habilita el link de reenvío. */
  segundosParaReenviar: number;
  alReenviar: () => void;
  deshabilitado?: boolean;
  aviso?: AvisoAcceso;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="acceso-titulo">Revisá tu correo</h1>
        <p className="acceso-bajada">Te mandamos un código de seis dígitos a {emailIngresado}.</p>
      </div>

      <AvisoDeAcceso aviso={aviso} />

      <CampoCodigo
        valor={valor}
        alCambiar={alCambiar}
        alCompletar={alCompletar}
        deshabilitado={deshabilitado}
      />

      <p className="acceso-nota text-center">
        El código vence en {minutos} minutos. Si no lo ves, mirá en spam.
      </p>

      <button
        type="button"
        onClick={alReenviar}
        disabled={segundosParaReenviar > 0 || deshabilitado}
        className="text-sm font-medium text-acento hover:underline disabled:cursor-not-allowed disabled:text-tinta-tenue disabled:no-underline"
      >
        {segundosParaReenviar > 0 ? `Reenviar en ${segundosParaReenviar}s` : 'Reenviar código'}
      </button>
    </div>
  );
}

/**
 * Pantalla 4 — Elegir la contraseña.
 *
 * Si el código venció, esta misma pantalla ofrece pedir uno nuevo ahí mismo
 * en vez de mandar de vuelta al login — por eso `codigoVencido` reemplaza al
 * formulario en lugar de sumarse a él.
 */
export function PantallaNuevaContrasena({
  emailUsuario,
  password,
  alCambiarPassword,
  repetir,
  alCambiarRepetir,
  requisitos,
  alGuardar,
  enviando,
  aviso,
  codigoVencido,
  alPedirNuevoCodigo,
}: {
  emailUsuario: string;
  password: string;
  alCambiarPassword: (v: string) => void;
  repetir: string;
  alCambiarRepetir: (v: string) => void;
  requisitos: { texto: string; cumplido: boolean }[];
  alGuardar: () => void;
  enviando?: boolean;
  aviso?: AvisoAcceso;
  codigoVencido?: boolean;
  alPedirNuevoCodigo?: () => void;
}) {
  if (codigoVencido) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="acceso-titulo">El código venció</h1>
        <Aviso tono="alerta" titulo="Este código ya no es válido">
          Pedí uno nuevo para seguir.
        </Aviso>
        <Boton variante="primario" tamano="lg" ancho onClick={alPedirNuevoCodigo}>
          Pedir un código nuevo
        </Boton>
      </div>
    );
  }

  function alMandar(e: FormEvent) {
    e.preventDefault();
    alGuardar();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={alMandar}>
      <div>
        <h1 className="acceso-titulo">Elegí tu contraseña</h1>
        <p className="acceso-bajada">Vas a entrar como {emailUsuario}.</p>
      </div>

      <AvisoDeAcceso aviso={aviso} />

      <Campo
        etiqueta="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => alCambiarPassword(e.target.value)}
        disabled={enviando}
        required
      />
      <Campo
        etiqueta="Repetila"
        type="password"
        autoComplete="new-password"
        value={repetir}
        onChange={(e) => alCambiarRepetir(e.target.value)}
        disabled={enviando}
        required
      />

      <Requisitos items={requisitos} />

      <Boton type="submit" variante="primario" tamano="lg" ancho cargando={enviando}>
        Guardar y entrar
      </Boton>
    </form>
  );
}
