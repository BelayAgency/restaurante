# Acceso — login y recuperación, común a todos los sistemas

Las cuatro pantallas de entrada son iguales en todos los sistemas de Belay. Lo único que cambia por cliente son el nombre del sistema, el nombre del cliente, el logo y el color de marca.

Se construyen con `design-system/components/acceso.tsx` y las clases de `design-system/globals.css` (`.acceso*`, `.requisito*`) — no copiando markup. El componente ya resuelve el esqueleto: panel de marca a la izquierda, formulario a la derecha, crédito de Belay al pie.

El envío de los mails de este flujo (recuperación, invitación) sigue las reglas de `prompt-base.md` 13.1 — código hasheado, un solo uso, vencimiento de 15 minutos, máximo 5 intentos, rate limit por dirección y por IP, y sin revelar nunca si una cuenta existe. El código no va en el asunto: el asunto dice "Tu código para cambiar la contraseña" y nada más, porque el asunto entero se lee en la notificación del celular y ahí lo ve cualquiera que mire la pantalla apagada.

## Qué cambia por sistema

- Nombre del sistema, nombre del cliente, logo del cliente.
- **El color de marca es `--color-acento`.** No se agrega un token nuevo: el sistema de diseño ya rutea por ahí toda acción primaria, todo estado activo y el foco de los campos, así que cambiar ese único valor rebrandea el sistema entero y no sólo el login. `--color-acento-hover` y `--color-acento-tenue` se derivan de él, no se eligen a mano.
- Si el color de marca es claro (amarillo, lima, celeste pastel), el panel lleva `data-marca="clara"` y su texto pasa a `--color-tinta`. Blanco sobre esos colores no se lee.
- Los grises —texto, bordes, fondo de campo— son los neutros del sistema y no dependen del color de marca.

## El esqueleto

Dos columnas cuando el contenedor mide 900px o más: marca a la izquierda (26rem fija), formulario a la derecha. Alto mínimo 44rem.

**El breakpoint es una container query, no un media query.** Responde al ancho del contenedor donde la pantalla efectivamente entra, no al del viewport: con un viewport de 980px y la pantalla metida en un contenedor de 676 —una vista previa, un iframe, un panel partido— el media query daba dos columnas y el formulario terminaba en 148px de ancho. Por eso `.acceso` es el contenedor y `.acceso-grilla` la grilla: un elemento no puede preguntarse su propio ancho.

**Columna izquierda — panel de marca.** Fondo con el color de marca, texto blanco. El logo del cliente arriba. Al piso (empujado con `margin-top: auto`): el rótulo "Sistema de gestión" en mayúscula con tracking abierto, el nombre del sistema grande, una barra corta del mismo color aclarado, y "Desarrollado por Belay para {cliente}". El nombre del sistema va abajo y no arriba para que sea lo último que se lee antes de pasar los ojos al primer campo.

**Es la única superficie grande con el color de marca en todo el sistema.** Es una excepción deliberada a la regla del acento —"nunca como fondo de superficies grandes"— y no se extiende a ninguna otra vista. El login es la única pantalla que alguien ve antes de estar adentro; ahí la identidad pesa más que la densidad. Adentro, el acento vuelve a ser sólo la acción primaria.

**Columna derecha — formulario.** Fondo `--color-lienzo`, contenido centrado con `max-width: 25rem`. Sin tarjeta: la división en dos columnas ya da toda la estructura que la pantalla necesita, y una tarjeta encima agrega un borde que no separa nada.

**En pantallas angostas el panel de marca no desaparece**: se achica, baja el padding y queda arriba del formulario. Un login sin marca podría ser el de cualquiera, y esa pantalla es lo único que el cliente le muestra a su gente todos los días.

**Pie**: "Desarrollado por" + `LogoBelay` (de `logo-belay.tsx`, en `currentColor`), 16px de alto, 75% de opacidad, en las cuatro pantallas. El logo va con link a `https://belay.agency` (pestaña nueva) — como cualquier otro lugar del sistema donde aparezca la marca de Belay.

## Controles

Los del sistema de diseño, sin variantes propias y **sin rehacer ninguno a mano**. Lo que se arma a mano es lo que después no se parece al resto del sistema.

La distinción importa, porque el sistema de diseño está partido en dos y no todo se resuelve con una clase:

**Componentes**, que se importan de `design-system/components/`:

| Qué | De dónde |
|---|---|
| `Acceso` y `Requisitos` — el esqueleto y la lista de requisitos de la contraseña | `acceso.tsx` |
| `Campo` — los inputs. Ya aplica `.campo` y `.etiqueta-campo`, y resuelve el `htmlFor` y el anuncio del error | `campo.tsx` |
| `Switch` (o `CampoSwitch`, si lleva texto al lado) — "Mantener la sesión iniciada" | `switch.tsx` |
| `CampoCodigo` — las seis casillas del código de recuperación | `campo-codigo.tsx` |
| `Boton` — la acción de la pantalla | `boton.tsx` |
| `LogoBelay` — el del pie | `logo-belay.tsx` |

**Clases** de `globals.css`: `.acceso*` y `.requisito*` (las aplica el componente), y `.aviso` con su tono para los mensajes de estado.

**No existe ninguna clase `.switch` en `globals.css`, y no es un olvido**: el control es una composición de utilidades, así que vive en TSX como el resto de `components/`. Si lo buscás en la hoja de estilos no lo vas a encontrar. Armarlo a mano da un switch con otra geometría, otro color de encendido y otro foco que el de todo el resto del sistema — y es la única pantalla que alguien ve antes de entrar.

El botón de acción va en tamaño `lg` (44px de alto) y ancho completo: es la única acción de la pantalla, no tiene con qué competir por el espacio.

El link "¿La olvidaste?" va **arriba**, en la misma línea que la etiqueta "Contraseña". Abajo del campo queda pegado al lugar donde aparece el mensaje de error, y se termina apretando uno queriendo leer el otro.

## Estados

- **Error de credenciales**: `.aviso` en tono error arriba del formulario. "El mail o la contraseña no coinciden", y debajo los intentos restantes. **Nunca dice cuál de los dos campos está mal**: un login que responde distinto según si el mail está registrado es un buscador de usuarios válidos. Por el mismo motivo tampoco se marca sólo el campo de contraseña.
- **Enviando**: el botón queda deshabilitado con el texto "Entrando…" — evita el doble submit mientras se verifica.
- **Cuenta bloqueada**: `.aviso` en tono alerta, "La cuenta está bloqueada por seguridad", los minutos que faltan, y la opción de restablecer la contraseña de inmediato.

## Pantalla 1 — Entrar

- Título: "Ingresá a tu cuenta"
- Campos: Email (`type=email`, `autocomplete=username`) y Contraseña (`type=password`, `autocomplete=current-password`)
- Switch: "Mantener la sesión iniciada" — marcado, la sesión dura el máximo posible (400 días, deslizante: se renueva con cada uso; ver prompt-base, sección 3); sin marcar, cookie de sesión del navegador
- Link: "¿La olvidaste?" → pantalla 2
- Botón: "Entrar"

## Pantalla 2 — Pedir el código

Mismo esqueleto, con el link "← Volver al inicio de sesión" arriba de todo.

- Título: "Recuperar el acceso"
- Campo: Email
- Botón: "Enviarme el código"

## Pantalla 3 — Poner el código

**Se recupera con un código de seis dígitos que se escribe acá, no con un enlace que abre otra pestaña.** El motivo es práctico: el mail suele leerse en el celular y el sistema estar abierto en la computadora del mostrador. Con un enlace, la sesión nueva arranca en el teléfono equivocado; con un código, se mira la pantalla chica y se sigue trabajando donde ya se estaba. De paso, un mail sin links es un mail que no se puede confundir con phishing.

- Título: "Revisá tu correo", bajada: "Te mandamos un código de seis dígitos a {emailIngresado}."
- Campo: `CampoCodigo` (`design-system/components/campo-codigo.tsx`) — seis casillas, no un campo largo. El foco avanza solo, el borrado retrocede, y pegar los seis de una vez los reparte. Se valida al entrar el sexto dígito, sin obligar a apretar un botón.
- **`autocomplete="one-time-code"` va en las SEIS casillas**, no sólo en la primera: es lo que hace que el teclado del celular ofrezca el código que acaba de llegar. Con `off` en las otras cinco, la sugerencia llena una sola y deja el resto vacío, que es peor que no ofrecer nada.
- Debajo: "El código vence en {minutos} minutos. Si no lo ves, mirá en spam."
- Reenvío disponible recién después de un cooldown en segundos.

**A esta pantalla se llega siempre**, exista o no la cuenta con ese mail. Nunca confirmar ni negar si una dirección está registrada: si la cuenta no existe no se manda nada, pero la pantalla es la misma y el error de código inválido también.

## Pantalla 3 bis — El código no anduvo

- Código incorrecto: `.aviso` en tono error, "El código no es correcto o ya venció", y los intentos que quedan.
- **A los {máximo} intentos el código se invalida** y hay que pedir uno nuevo. Sin ese corte, seis dígitos se prueban por fuerza bruta en minutos.

## Pantalla 4 — Elegir la contraseña

- Título: "Elegí tu contraseña", bajada "Vas a entrar como {emailUsuario}."
- Campos: contraseña nueva + repetirla (`autocomplete=new-password`)
- Botón: "Guardar y entrar"

**Los requisitos se muestran desde el primer momento, no después de fallar.** Inventar una contraseña, mandarla, y que recién ahí te digan que faltaba un símbolo es la forma más rápida de que alguien la termine anotando en un papel. Cada uno con su marca: gris mientras no se cumple, verde con tilde cuando se cumple.

Los requisitos son los mismos que usa el panel de la agencia: **10 caracteres, una mayúscula, un número y un símbolo.** Quién cumple y quién no lo decide una función del dominio (`evaluarPassword`), no el componente: la misma función tiene que correr en el servidor al guardar, y dos implementaciones de la misma regla siempre terminan discrepando.

Al guardar: se cierran todas las sesiones activas de ese usuario en todos los dispositivos, y sale el mail de aviso de cambio de contraseña. Si el código ya venció, se ofrece pedir uno nuevo ahí mismo, sin mandar de vuelta al login.
