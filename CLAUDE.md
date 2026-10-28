# Contexto del proyecto — Belay

Este es el prompt base para cualquier sistema que desarrolle para un cliente de mi agencia de software a medida (Belay). Aplica en todos los proyectos salvo que el objetivo específico del sistema (agregado al final de este documento) indique lo contrario.

Antes de escribir una sola línea de código, preguntame:

1. **¿El sistema es mobile-first o desktop-first?** Define breakpoints, densidad de UI y qué componentes se priorizan. En cualquiera de los dos casos, todo componente nuevo se prueba explícitamente contra 320px de ancho (el piso real, no una redonda cómoda) — un padding fijo o un ancho mínimo que cierra a 375px puede desbordar ahí igual.
2. **¿Debe funcionar offline (aunque sea parcialmente)?** Define si hace falta cache local, service worker, sincronización diferida, o si directamente no aplica. Si la respuesta es sí, no alcanza con tener HTTPS resuelto a nivel dominio (que sí es un requisito técnico): hace falta implementarlo en código — `manifest.json`, service worker registrado en la app con estrategia de cache definida (cache-first para assets estáticos, network-first para llamadas a la API), y versionado del cache atado a cada deploy para que el usuario no quede atrapado viendo una versión vieja de la app. Registralo con `updateViaCache: 'none'`: con el default, el navegador busca el propio `sw.js` en el caché HTTP y Cloudflare puede devolverlo con su propio max-age durante horas, dejando gente con la versión vieja después de un deploy. Probarlo con la pestaña Network de DevTools en modo offline antes de darlo por andando.
3. **¿Debe ser local-first?** Es decir, si los datos viven primero en el dispositivo/cliente y se sincronizan con el servidor en segundo plano, en vez de depender del servidor como fuente de verdad en cada acción. Define el modelo de datos, la estrategia de sincronización y resolución de conflictos.

No asumas ninguna de las tres por defecto.

Una vez contestadas, y antes de escribir código: **armar y presentar una planificación completa del sistema** (entidades principales, flujos clave, estructura de módulos, orden de construcción, y si conviene dividir en microservicios o mantenerlo como monolito) para que la revise. Recién después de esa revisión se empieza a ejecutar, y siempre por fases — nunca todo el sistema de una sola vez.

---

## 1. Stack tecnológico

Siempre la última versión estable disponible al momento de arrancar el proyecto — verificar antes de instalar, no asumir versiones de memoria. Como referencia (agosto 2026):

- **Frontend/Backend:** Next.js (App Router) + TypeScript, sobre React 19.x
- **Estilos:** Tailwind CSS v4, CSS-first (`@theme` en `globals.css`, sin `tailwind.config.ts` — ver sistema de diseño más abajo).
- **Base de datos:** PostgreSQL 18.x
- **ORM:** Drizzle ORM, con migraciones versionadas (`drizzle-kit`)
- **Validación:** Zod, compartido entre frontend y backend (mismo schema, no duplicar reglas)
- **Runtime:** Node.js en su versión LTS activa
- **Contenedores:** Docker + Docker Compose

Solo desarrollo web. Nada de librerías o patrones nativos de mobile.

**Sistema de diseño**: todo sistema nuevo arranca con `references/design-system/globals.css` tal cual — es el sistema visual de la agencia (tokens de color en `@theme` para claro/oscuro, tipografía, sombras, componentes base como tarjeta/campo/fila-nav/modal), no una base a reinterpretar. `references/design-system/components/` ya trae los componentes armados y **hay que usarlos, no rehacerlos**: `marco.tsx` (el mueble: navegación fija, y cajón en el celular), `menu-usuario.tsx`, `boton.tsx` (4 variantes, 3 tamaños, estado `cargando`), `campo.tsx`, `campo-numero.tsx` (separador de miles en vivo), `campo-codigo.tsx` (las seis casillas del código de recuperación), `switch.tsx`, `selector.tsx`, `modal.tsx`, `configuracion.tsx` (el modal de configuración: nav de secciones, bloques y filas), `toast.tsx`, `tema.tsx`, `avatar.tsx`, `carga.tsx` (esqueletos — alimentan tanto los estados de carga dentro de una vista como el `loading.tsx` de cada ruta), `exito.tsx`, `acceso.tsx`, `cartel-pago.tsx` (`CartelPago` — franja o bloqueo de pantalla completa según `servicio.bloquear`, por falta de pago o bloqueado desde el panel, sección 6; los datos los trae `design-system/lib/servicio-belay.ts`, que se copia a `lib/`: consulta desde el servidor con caché de un minuto, falla abierto, y da `sistemaBloqueado()` para que las rutas respondan 423), `cartel-nueva-version.tsx` (con su cableado anotado adentro), `logo-belay.tsx` (isotipo y logo de la agencia en `currentColor` — el pie del acceso lo usa siempre), `campo-buscar.tsx`, `filtro-selector.tsx` (filtro por query string), `paginacion.tsx`, `numero-inline.tsx` (cantidad editable dentro de una fila de tabla), `periodo.tsx` (`NavegadorPeriodo` — las flechas de anterior/siguiente a los costados del nombre del período, y ese nombre es a la vez el selector de semana/mes/año; el período vive en la URL como `?tipo=mes&valor=2026-09`, las opciones y las flechas son enlaces, hacia adelante se corta en el período corriente y cambiar de lupa te deja donde estabas salvo que estés en hoy — y `CifraPeriodo`, la cifra grande sobre `bg-lienzo`; usa `selector-periodo.tsx`, la única parte cliente, y la lógica de `design-system/lib/periodos.ts`, que se copia a `lib/` con sus tests: todo en UTC y en `YYYY-MM-DD`, semana de lunes a domingo, y cualquier URL inválida cae en el mes corriente en vez de romper. Cómo se arma una pantalla de balance con eso —título con el navegador como acción, tres cifras con color sólo en el balance, y debajo los movimientos de entrada y salida mezclados por fecha— está en `design-system/ejemplos/balance-periodo.tsx`), `isla.tsx` (sólo POS), `usuarios.tsx` (`TablaUsuarios` y `ModalNuevoUsuario` — el alta pone la contraseña ahí mismo, sin mail de invitación), `modal-usuario.tsx` (`ModalUsuario` — un solo componente para "Tu perfil" y para la ficha de otro: `esPropio` decide el título y si se edita nombre/foto/email/contraseña o se administra rol/estado; `puedeAdministrar` es la jerarquía de roles —la decide quien llama al componente— y en `false` la ficha queda de sólo lectura, sin una sola acción; y `ModalCambiarCredencial`, el sub-modal de código compartido entre cambiar email y cambiar contraseña) y `ui.tsx` (tarjeta, título de sección, insignia, punto, estado vacío, aviso, métrica, fila de dato, tabla, mono, consola) y `grafico-actividad.tsx` (`GraficoActividad` — curva suave por hora con degradé, siempre en `var(--color-acento)`, nunca un color fijo). Si una pantalla necesita algo que no está, se agrega un componente nuevo siguiendo el mismo criterio: sin colores hardcodeados (todo por token), comentarios sólo donde hay una decisión no obvia, e identificadores (props, funciones, nombres de componentes) en español, como el resto del código del proyecto.

Los tokens de color son **color completo** (`rgb(45 42 38)`), no tripleta. Nunca escribas `rgb(var(--sombra)/0.08)`: el navegador descarta esa declaración en silencio y la sombra no aparece nunca. Para componer transparencia va `color-mix(in srgb, var(--sombra) 8%, transparent)`, y para usar el color pelado, `var(--color-lienzo)`.

**El tema oscuro se conmuta con la clase `.dark` en la raíz** —la pone `tema.tsx` y `globals.css` la engancha con `@custom-variant dark`—, **no** con `prefers-color-scheme` ni `data-theme`. Cualquier estilo propio que dependa del tema se gatea con el variant `dark:` de Tailwind o con el selector `.dark`; atarlo a `prefers-color-scheme` o `data-theme` lo rompe justo cuando el tema está en «sistema» y el SO en oscuro (la app se ve clara pero el estilo cree que es oscuro, o al revés).

**El marco**: `marco.tsx` resuelve el layout de todo panel — navegación fija a la izquierda, contenido a la derecha, y abajo de 900px la navegación se muda a un cajón que se abre desde una barra superior. Recibe la lista en `nav` y el pie —selector de tema y tarjeta de usuario— en `pie`, que el propio componente empuja contra el piso. **Nunca escondas la navegación sin reemplazarla**: es lo que se hace por costumbre en un panel desktop-first, y el día que alguien lo abre desde el teléfono no puede salir de la primera pantalla. 900px es el único corte del sistema, el mismo que usa el acceso. La receta del pie, en orden: `SelectorTema`, el selector de vista del usuario soporte cuando aplica, y `MenuUsuario`, que lleva **Configuración como primer ítem** de sus `acciones` (es la única entrada a Configuración, sección 14) y «Cerrar sesión» como el último — y el cartel de nueva versión envuelve al marco por afuera, en el layout autenticado.

**Isla de acciones**: `references/design-system/components/isla.tsx` es la barra de un punto de venta — sólo para sistemas de mostrador, no para un panel de gestión. Flota sobre el contenido en vez de pegarse a un borde, cada acción es una baldosa alta que se aprieta con el dedo, y cada una muestra su atajo de teclado al pasar por encima (todos juntos mientras se mantiene Alt). El componente dibuja el atajo y lo hace funcionar: una tecla anunciada que no hace nada se prueba una vez y no se vuelve a confiar en ninguna. Si el sistema es un POS, la vista reserva `--isla-hueco` de padding abajo para que la isla no tape el final del contenido.

## 2. Arquitectura y buenas prácticas de código

- Componentes y funciones reutilizables desde el día uno: si algo se repite dos veces, se extrae. Nada de duplicar un formulario, un modal o una query para cada pantalla.
- Componentizar de forma proactiva, no solo cuando algo ya se repitió: cualquier pieza de UI con responsabilidad propia (una card, una fila de tabla, un badge de estado, un selector) va en su propio componente desde que se escribe la primera vez, aunque hoy se use en un solo lugar — así el próximo lugar que lo necesite lo reutiliza en vez de reescribirlo. Preferir siempre reutilizar un componente existente (ajustándolo con props si hace falta) antes que crear uno nuevo parecido.
- Separación clara de capas: UI, lógica de negocio, acceso a datos. Nada de queries de Drizzle sueltas dentro de un componente de UI.
- Server Actions o route handlers para cada operación de escritura — nunca lógica de negocio en el cliente.
- Nombres de campos y tablas explícitos y sin ambigüedad (evitar `fecha`, `estado`, `tipo` genéricos cuando hay más de un significado posible en el dominio).
- Cuando un valor económico (precio, tarifa, comisión) puede cambiar con el tiempo, no se edita el registro — se archiva y se crea uno nuevo, para no perder el historial de lo que se cobró en cada momento.
- Monolito por defecto. Separar en microservicios solo cuando la planificación inicial detecta una razón concreta: procesamiento pesado o asíncrono que no debe bloquear la app principal, un dominio que escala o se despliega a un ritmo distinto del resto, o una integración externa que conviene aislar. Cada microservicio se empaqueta con su propio Docker, coordinado junto al resto en el mismo `docker-compose.yml` (o uno por servicio si la escala lo justifica), nunca mezclado en la misma imagen que la app principal.
- Sin comentarios de relleno que expliquen lo obvio ("crea el formulario de usuario", "este es el botón de guardar"). Comentar solo decisiones no evidentes: por qué se eligió un enfoque, un caso borde, una limitación externa.
- El código no debe leerse como generado por IA: sin comentarios de sección tipo `// ---- Handlers ----`, sin nombres de variable genéricos (`data`, `item`, `temp`) cuando hay un nombre de dominio disponible, sin explicaciones redundantes entre el nombre de la función y su comentario.

## 3. Seguridad — prioridad alta, a dos niveles

### A nivel de código de la aplicación

- Autenticación con sesiones o JWT bien manejadas (expiración, rotación de refresh tokens, invalidación al cerrar sesión).
- **"Mantener la sesión iniciada" no caduca: va al máximo que permite el navegador, 400 días** (`maxAge` = 400 × 24 × 3600 segundos). Es el tope: Chrome (y el estándar de cookies) recorta cualquier `Max-Age`/`Expires` mayor a 400 días, así que poner más no sirve. Se aplica a las DOS puntas, que tienen que coincidir: la cookie de sesión (`HttpOnly`, `Secure`, `SameSite=Lax`, con ese `maxAge`) y el vencimiento de la sesión en el servidor/base (`expiresIn` de la librería de auth). Si sólo se alarga la cookie y el servidor sigue venciendo a los 7 o 30 días, la sesión muere igual. Además es **deslizante**: cada vez que la persona usa el sistema, la cookie y el vencimiento se renuevan por otros 400 días (en la librería de auth, `updateAge` bajo, p. ej. 1 día), así que alguien que entra seguido nunca vuelve a ver el login. Sin marcar el switch, la cookie es de sesión del navegador (se pierde al cerrarlo). Cerrar sesión, cambiar la contraseña ("Cerrar todas las sesiones") o desactivar al usuario invalidan igual la sesión en el servidor, por larga que sea.
- **Todo cambio de contraseña cierra todas las sesiones activas de esa cuenta**, en todos los dispositivos — sea por el flujo de recuperación (login-template.md, pantalla 4), por el autoservicio desde el propio perfil (`ModalCambiarCredencial` en `modal-usuario.tsx`), o por un admin forzándole una nueva a otro usuario. Una contraseña vieja que ya no sirve para entrar pero cuya sesión anterior sigue viva no es un cambio de contraseña real. Además, el usuario puede cerrar sus propias sesiones sin cambiar nada — botón "Cerrar todas las sesiones" en su propia ficha, con modal de confirmación — y quien administra usuarios puede forzarle lo mismo a otra cuenta desde la suya.
- Roles y permisos: cada sistema define al menos un rol admin y uno o más roles de usuario operativo. Ninguna acción sensible sin verificar el rol en el servidor (nunca confiar solo en ocultar un botón en el frontend).
- **Usuario soporte** con rol admin en todo sistema (ver más abajo, "El usuario de soporte").
- Hasheo de contraseñas con bcrypt/argon2, nunca texto plano ni hashes débiles.
- Validación de todo input en el servidor con Zod, aunque ya se haya validado en el cliente.
- Protección contra SQL injection (Drizzle parametriza por defecto — no armar queries con strings concatenados).
- Rate limiting en endpoints sensibles (login, recuperación de contraseña, APIs públicas).
- Sanitización de cualquier input que se renderice como HTML (protección XSS).
- CSRF protection en cualquier acción de estado vía formulario tradicional.
- Nunca loguear contraseñas, tokens ni datos sensibles del cliente en logs de la app.
- Variables de entorno para todo secreto (`.env`, con `.env.example` en el repo sin valores reales). Nunca credenciales hardcodeadas.

### A nivel de servidor/infraestructura

Buena parte de esto ya viene resuelto por el servidor y **no lo monta el proyecto** (ver secciones 8, 10 y 12). Lo que sigue vale igual como criterio, y explicita qué es responsabilidad de la app:

- HTTPS obligatorio. El TLS lo termina el proxy compartido del servidor, no la app. La app **nunca** levanta su propio reverse proxy: los puertos 80 y 443 ya están tomados por el proxy que sirve a todos los sistemas de esa máquina.
- La app escucha en el puerto que le llega por la variable `PORT` y se publica **sólo en loopback** — nunca en `0.0.0.0`, o cualquiera podría saltear el proxy, el certificado y Cloudflare.
- Firewall del VPS: sólo 80/443 (limitados a los rangos de Cloudflare) y SSH con clave, nunca contraseña. Ya está configurado; el proyecto no lo toca.
- Acceso a PostgreSQL restringido a la red interna del proyecto — nunca expuesto públicamente **ni colgado de la red compartida** (ver sección 11).
- Backups automáticos de la base (diarios como mínimo), con retención de al menos 7-14 días, y prueba periódica de restauración. Esto sí es del proyecto — es un backup lógico (`pg_dump` o equivalente), no el snapshot de disco que hace Vultr a nivel de todo el servidor. Son capas distintas: el snapshot de Vultr cubre un desastre del servidor entero, pero como el servidor aloja varios clientes, restaurarlo trae a todos juntos y no sale de Vultr. El backup lógico por proyecto es el único que permite recuperar los datos de un solo cliente sin tocar a los demás, y llevárselo a otro lado si hiciera falta.
- Actualizaciones de seguridad del sistema base de las imágenes Docker (no quedarse en una imagen base vieja con CVEs conocidas).
- Logs a stdout con rotación configurada en el compose (no logs infinitos llenando el disco de un servidor que comparten varios clientes).

### El usuario de soporte

Todo sistema tiene una cuenta de Belay, con rol admin, con **el mismo usuario en todos los sistemas y entornos** y, en el seed, esta contraseña por defecto:

```
info@belay.agency
Soporte2026!
```

Se crea una única vez con el resto del seed inicial y no se recrea en deploys posteriores. `info@belay.agency` es una casilla real que controla la agencia — ahí llegan los códigos, así que tiene que ser una dirección que exista, no un placeholder.

**En producción la contraseña se cambia manualmente** por una única y fuerte —guardada en el gestor de contraseñas de la agencia— una vez que el sistema está levantado. `Soporte2026!` es sólo el default del seed (cumple la política de contraseñas: 10 caracteres, mayúscula, número y símbolo): como es la credencial más poderosa que hay adentro (ver más abajo) y sería la misma en todos los sistemas, dejarla en `Soporte2026!` en producción abriría cualquier sistema a quien pruebe `info@belay.agency`. El usuario y la casilla no cambian; sólo la contraseña.

**Invisible para quien no administra usuarios; visible y marcado para quien sí.** Nunca en reportes, logs de actividad o exportaciones — de ahí no sale para nadie que no sea soporte mismo. Pero en la sección de Usuarios, quien tiene ese permiso sí lo ve: una cuenta admin que nadie puede ver ni razonar sobre ella es peor que una visible y marcada. Ahí aparece con una insignia propia (ícono de escudo, tono neutro, texto "Soporte") en la columna de rol, **en vez de** un selector de rol editable — no se le cambia el rol, no se lo desactiva, no se lo elimina desde la ficha de usuario. Y puede alternar entre las vistas de los distintos roles, para reproducir lo que ve cada tipo de usuario sin crear cuentas de prueba.

**Administra las credenciales de los demás sin pasar por su casilla.** Ésta es la excepción a la regla de los mails de cuenta (13.1):

- Cuando **soporte** le establece una contraseña o una dirección nueva a otro usuario, el código de confirmación va a **`info@belay.agency`**, no a la dirección de esa persona.
- Para todos los demás —y para soporte cambiando lo suyo— sigue valiendo la regla normal: el código va a la dirección propia, y la de email va a la **anterior**.

El motivo es el trabajo real: quien administra el sistema es Belay, y un cliente que perdió el acceso a su propia casilla necesita que alguien se lo pueda devolver. Si el código fuera a la dirección de esa persona, la cuenta de soporte no serviría para lo único para lo que existe.

**Qué puede y qué no puede hacer soporte con los usuarios.** Se declara completo porque es lo que más se presta a interpretaciones distintas en cada sistema. Es un admin con permisos de administración de usuarios, más lo específico de abajo:

Sobre **los demás usuarios**, puede:

- Verlos a todos, también los desactivados.
- Crearlos con cualquier rol, con una contraseña puesta en el alta (misma política que cualquiera).
- Editar sus datos y **cambiarles el rol**.
- **Desactivarlos y reactivarlos**, y eliminarlos si el sistema prevé eliminar usuarios (en un sistema con historial, desactivar es lo que corresponde y eliminar queda reservado a cuentas sin movimientos).
- **Establecerles una contraseña o una dirección nueva** (el código va a `info@belay.agency`, ver arriba).
- **Cerrar todas sus sesiones**, con el mismo modal de confirmación que cualquier admin.

Sobre **sí misma**, sólo puede cambiar su contraseña y cerrar sus propias sesiones. No se le cambia el rol, no se la desactiva, no se la elimina y no se le cambia la dirección — desde ningún lado, ni siquiera por soporte mismo — porque perder esa cuenta es perder el acceso de la agencia a ese sistema.

Lo que **no** puede hacer, aunque técnicamente lo permitiera la base:

- **Ver la contraseña de nadie**: sólo existe el hash, y no hay función de "mostrar contraseña". Soporte la *reemplaza*, no la lee.
- **Entrar como otro usuario** (impersonar, abrir su sesión). Alternar entre las vistas de los roles es ver la interfaz como la vería ese rol, no actuar con la identidad de una persona: lo que soporte hace queda siempre a nombre de soporte.
- **Actuar por fuera de la aplicación sobre los usuarios** (SQL a mano, scripts) como forma normal de trabajo: todo pasa por las mismas funciones de dominio y los mismos permisos del sistema, para que la validación y la auditoría se apliquen igual.
- **Hacer nada de esto sin que quede registro**: cada acción de soporte sobre otro usuario (alta, cambio de rol, desactivación, eliminación, cambio de contraseña o de dirección, cierre de sesiones) queda en la auditoría con quién la hizo y sobre quién, y las que cambian credenciales además se avisan a la dirección de esa persona.

Lo que eso implica, y conviene tenerlo escrito: **esta cuenta puede quedarse con cualquier cuenta del sistema sin tocar el mail de su dueño**, así que es la credencial más valiosa que hay adentro. No queda exenta de nada por ser de soporte — mismo hasheo, mismo rate limit por dirección y por IP, mismo bloqueo por intentos fallidos que cualquier otra. Y cada vez que soporte cambia la credencial de alguien, **queda registrado en la auditoría del sistema con quién lo hizo y sobre quién**.

## 4. UI / UX

- Diseño inspirado en la interfaz actual de Claude.ai: sidebar limpio, cards con bordes suaves y sombra sutil, botones y switches con las mismas proporciones y estados (hover, active, disabled) que ese sistema, iconografía consistente (usar una sola librería de iconos en todo el proyecto, ej. Lucide).
- Modales para acciones puntuales (crear/editar un registro, confirmaciones destructivas) — no navegar a una página nueva para algo que puede resolverse sin perder el contexto.
- **Nada que se abra desde adentro de un modal se corta con su `overflow`.** `Selector` ya lo resuelve (calcula la posición contra el disparador y usa `position: fixed`, que un `overflow-hidden` ancestro no recorta) — cualquier otro control con desplegable propio que se agregue sigue el mismo criterio, nunca `absolute` colgado del padre.
- **Pestañas con `Tabs` de `tabs.tsx`**: barra `bg-lienzo` y, debajo de la pestaña activa, un fondo `bg-superficie` que se **desplaza** (translate + ancho, 300 ms) hasta la pestaña nueva en vez de apagarse y prenderse; la primera medición no se anima y `prefers-reduced-motion` lo desactiva. No armar pestañas a mano con bordes o subrayados que cambian de golpe.
- Dark mode con toggle (`SelectorTema` de `tema.tsx`), no solo tema claro. El script que evita el parpadeo al cargar va en el layout, antes del primer pintado.
- **Cerrar un modal tocando el fondo** (`lib/cierre-fondo.ts`, `useCierreFondo`): sólo se cierra si el gesto empezó **y** terminó en el fondo. Al soltar el mouse, el navegador le asigna el `click` al elemento que contiene tanto el punto donde se apretó como donde se soltó; si alguien aprieta adentro (seleccionando el texto de un campo) y suelta sobre el fondo, el click le cae al propio `<dialog>`, y un modal que cierra con cualquier click sobre el diálogo se cierra sin que nadie lo pida, a veces con un formulario a medio llenar. El hook recuerda en `onPointerDown` dónde se apretó y cierra en `onClick` sólo si ese lugar también fue el fondo. Se aplica en `Modal`, en `ModalConfiguracion`, en el cajón del marco y en cualquier `<dialog>` nuevo que cierre tocando afuera (`<dialog {...useCierreFondo(alCerrar)}>`). Los menús y desplegables no tienen este problema mientras decidan al apretar (`pointerdown`) y no al soltar.
- **Modales que se abren desde la URL** (`?nuevo=1`, `?venta=…`) se abren y se cierran con `useModalUrl` (`lib/modal-url.ts`), nunca con un `router.push`/`replace` suelto. Cerrar es sacar el parámetro, y eso hace que Next pida la página de nuevo al servidor: si el modal espera esa respuesta, queda en pantalla un rato después del click y parece trabado. El hook usa estado optimista de React (`useOptimistic` dentro de una transición): el modal desaparece en el mismo momento del click, la dirección se actualiza por detrás y, cuando el servidor responde, la página ya coincide con lo que se ve.
- Toasts para feedback de acciones (guardado, error, eliminado) — con `ProveedorToasts` y `useToast` de `toast.tsx`, no un `alert()` del browser.
- Estados de carga, vacío y error definidos explícitamente para cada vista con datos — nunca una pantalla en blanco mientras carga o cuando no hay resultados. La carga va con los esqueletos de `carga.tsx`, que tienen la forma de lo que se está esperando, y el vacío con `EstadoVacio` de `ui.tsx`.
- **Todo segmento de ruta que trae datos lleva su `loading.tsx`**, armado con los esqueletos de `carga.tsx`. Sin eso, Next.js no dispara la navegación hasta que el server component termina de resolver — la ruta se siente trabada, aunque el dato tarde solo un instante. Con `loading.tsx`, la navegación cambia al toque y el esqueleto aparece mientras el contenido real llega por streaming detrás. No usar un spinner de página completa como reemplazo: el esqueleto tiene que anticipar la forma de lo que viene (misma lógica que ya rige para el resto de los estados de carga), no ser un genérico centrado.
- Tablas: paginación y filtrado server-side desde el principio (no cargar todo el dataset y filtrar en el cliente), columnas alineadas según tipo de dato (números a la derecha, texto a la izquierda), ordenamiento por columna cuando aplica.
- Exportación a Excel/PDF de listados y reportes cuando el sistema maneja datos que el cliente necesita llevar fuera de la plataforma.
- Inputs numéricos que representen montos/cantidades grandes: usar `CampoNumero` (`design-system/components/campo-numero.tsx`), que ya aplica el separador de miles en vivo mientras se escribe y entrega el número limpio para guardar.
- Placeholders genéricos, nunca un valor concreto: `0` y no `120`, `cuenta@ejemplo.com` y no un mail real. Un número puntual se lee como el valor que hay que poner.
- Nada de "look genérico de IA": evitar gradientes violeta/azul por defecto, evitar el layout de landing-page-de-SaaS-genérico para lo que es un sistema interno de gestión. Priorizar densidad de información legible sobre espacios decorativos.
- Sin texto descriptivo de relleno en la UI (tooltips o labels que expliquen algo ya evidente por el ícono o el contexto).
- Login y recuperación de contraseña: seguir `references/login-template.md` — estructura, copys, estados y reglas de seguridad ya definidos. Se arman con `references/design-system/components/acceso.tsx`, que resuelve el esqueleto de las cuatro pantallas; solo cambian el nombre del sistema, el cliente, el logo y el color de marca. El color de marca del cliente es `--color-acento`: no se agrega un token nuevo, porque ese token ya rutea toda acción primaria del sistema y cambiarlo lo rebrandea entero.
- **Dondequiera que aparezca el logo de Belay** (`LogoBelay`/`IsotipoBelay` de `design-system/components/logo-belay.tsx`) — el pie del login, o cualquier otro lugar que se agregue después (un "Acerca de", un pie de página general) — va envuelto en un link a `https://belay.agency`, en pestaña nueva (`target="_blank" rel="noopener noreferrer"`). Nunca como SVG suelto sin link.

**Mapas**: si el sistema lleva mapa, la referencia completa está en `references/mapas/` — Leaflet + MapLibre con tiles vectoriales de OpenFreeMap (nítidos en cualquier densidad, sin API key ni costo por vista) vestidos con las paletas de Google Maps (Standard para claro, Dark para oscuro), el pin de gota anclado por la punta y los popups tokenizados. No usar el tile raster de OSM: se ve borroso en pantallas densas y su amarillo compite con los pines.

## 5. Localización

- Interfaz en español (Argentina).
- Fechas en formato DD/MM/AAAA.
- Moneda en ARS con separador de miles con punto y decimales con coma ($1.234,56).
- Zona horaria: América/Argentina/Buenos Aires en todo manejo de fechas del backend.

## 6. Cartel de pago pendiente y bloqueo del sistema

Componente global, visible para **todos los usuarios** del sistema (no solo el admin), que se superpone por encima de todo el contenido de la aplicación cuando el cliente está atrasado con el pago a Belay **o cuando Belay bloqueó el sistema desde el panel**.

Sale del servicio de cobros del panel (`GET {BELAY_API_URL}/facturacion`, sección 13.2), de cuatro campos de `servicio` y nada más:

- **`bloquear`** decide si el sistema deja de operar. Es un booleano que ya viene resuelto, y **es lo primero que se mira**: con `bloquear: true` el sistema se bloquea esté como esté el pago. Un bloqueo manual le llega a un cliente que está al día, y un cartel que mire primero `estado` y devuelva nada con `al_dia` no lo mostraría nunca.
- **`motivoBloqueo`** dice por qué, sólo para el texto: `pago` (venció la gracia de un cobro que no entró) o `panel` (lo bloqueó alguien de Belay a mano). `null` sin bloqueo. Si no viene —un panel viejo—, se trata como `pago`.
- **`estado`** decide si se muestra la franja de aviso cuando NO hay bloqueo: con `al_dia` o `sin_cobros` no aparece nada; con `pendiente` o `con_problema`, sí.
- **`graciaHasta`**, sólo para poder decir hasta cuándo en el texto de la franja.

Se arma con `CartelPago` de `design-system/components/cartel-pago.tsx`, que ya resuelve las tres formas y no se rehace a mano: **franja** angosta arriba de todo (igual que `CartelNuevaVersion`) mientras hay un cobro con problema y `bloquear` es `false` — se ve, no interrumpe —; y **bloqueo** de pantalla completa, sin ninguna acción para cerrarlo, cuando `bloquear` es `true`, con un texto para cada motivo. Va en el layout autenticado junto a `CartelNuevaVersion`, por fuera del `marco`.

**El sistema no cuenta días de gracia ni compara fechas, y no decide por qué se bloquea.** El panel da los siete días desde el cobro que no entró —mientras tanto manda `bloquear: false` con el estado en `con_problema`: se ve el aviso y se sigue trabajando—, y el bloqueo manual lo prende y lo apaga Franco desde la ficha del sistema. Que la regla viva en un solo lado es el punto: contar los días en cada sistema son N implementaciones de lo mismo, y la primera que se equivoque deja a un cliente afuera de su propio negocio por un cobro que Mercado Pago iba a reintentar igual.

**El motivo que se escribe en el panel no viaja.** Con `motivoBloqueo: "panel"` el cartel dice un texto fijo («El acceso a este sistema está suspendido. Para más información, comunicate con el administrador del sistema.»). No hay un campo de texto libre que termine en la pantalla del cliente, por lo mismo que el catálogo de plantillas de mails valida cada variable.

### Cómo se consulta: una vez por minuto, en el servidor

`design-system/lib/servicio-belay.ts` resuelve la consulta y se usa, no se rehace: `leerServicioBelay()` devuelve `servicio` o `null`, y `sistemaBloqueado()` el booleano. Tres decisiones que ya trae adentro:

- **Se pregunta desde el servidor, con caché de 60 segundos para todo el proceso**, nunca desde el navegador ni en cada request. `/facturacion` tiene un límite de 60 consultas por minuto por llave: un sistema con veinte usuarios navegando lo pasaría en segundos, y un 429 es "el panel no contesta" — o sea, el bloqueo se apagaría solo justo cuando más gente lo usa. Con la caché, desbloquear o bloquear desde el panel tarda como mucho un minuto en verse.
- Pide `?limite=1`: `servicio` no cambia con la página, y no hace falta traer dos años de cobros para saber si hay que bloquear.
- **Si el panel no contesta, no se bloquea nada.** Timeout de 5 segundos, y ante cualquier error devuelve `null`: sin dato, se asume que está al día. Un problema de red nuestro no puede dejar a un cliente sin su sistema. Sin `BELAY_API_KEY` también devuelve `null` y lo dice una vez en el log.

### El bloqueo se cumple en el servidor, no sólo en la pantalla

El cartel de pantalla completa es lo que ve el usuario, pero un overlay se saca desde las herramientas del navegador. Con `sistemaBloqueado()` en `true`:

- **Toda ruta de API y toda server action del área autenticada responde `423` con `{ "error": "Sistema suspendido" }`** antes de leer o escribir nada. Se resuelve en un solo lugar —el helper que ya valida la sesión, o el middleware— y no ruta por ruta: la que se olvide es la que queda abierta.
- **Quedan afuera** el healthcheck (si responde 423 el deploy lo toma como caído y vuelve a la versión anterior), el login y el logout (alguien tiene que poder entrar a ver la pantalla de suspendido y salir), y los webhooks de terceros que el sistema reciba (un pago que entra mientras está bloqueado se registra igual; perderlo es peor).
- **No se borra ni se toca ningún dato.** Bloquear es dejar de atender, nada más: desbloquear devuelve todo exactamente como estaba.

Cableado, en los dos lugares y nada más (`server-only` va en las dependencias, para que la llave no pueda terminar en el bundle del navegador):

```tsx
// app/(app)/layout.tsx — el layout autenticado
const servicio = await leerServicioBelay();
return (
  <>
    <CartelPago servicio={servicio} />
    <CartelNuevaVersion />
    <Marco /* … */>{children}</Marco>
  </>
);

// lib/sesion.ts — el helper que ya exige sesión en cada ruta y server action
if (await sistemaBloqueado()) return respuestaBloqueado(); // 423, antes de tocar la base
```

Tampoco se construye una integración de pagos nueva por sistema: el sistema lee, no cobra.

## 7. Cartel de nueva versión disponible

Componente global, distinto del cartel de pago: avisa cuando hay un deploy más nuevo que la versión que el usuario tiene cargada en el navegador, para que no siga trabajando sobre una versión vieja sin saberlo.

- Detección: en el build se genera un identificador de versión (hash del commit o timestamp del build), embebido en la app. El cliente lo compara periódicamente contra el que sirve el servidor (endpoint liviano o el que ya devuelve el `index.html`/documento principal). Si no coinciden, hay una versión nueva esperando.
- Franja angosta arriba de todo el contenido (por encima de todo, igual que el cartel de pago, pero no un modal ni un overlay que bloquee la pantalla) con el texto "Nueva actualización disponible" y un botón para refrescar la página.
- Fondo con el color primario del sistema (el mismo que ya define la identidad visual del proyecto, no un color fijo genérico).
- Poco invasivo: no bloquea la interacción con el resto de la app, no reaparece a los pocos segundos si el usuario lo cierra, y no interrumpe una acción en curso (ej. no debe pisar un formulario a medio completar).

## 8. TLS y Cloudflare

Dominio de la agencia: `belay.agency`. Cada **sistema** usa un subdominio propio (`restaurante.belay.agency`). Ojo: un mismo cliente puede tener varios sistemas, cada uno con su subdominio, su repo y su precio — el subdominio identifica al sistema, no al cliente.

El sitio va detrás de Cloudflare con proxy activado y la zona en **Full (strict)**. Nunca Flexible: deja el tramo Cloudflare→origen en texto plano y rompe las cookies de sesión con bucles de redirección.

El origen presenta un **Cloudflare Origin Certificate**, no Let's Encrypt. Con la nube naranja el desafío HTTP-01 no cierra: llega por Cloudflare, que para alcanzar el origen necesita el TLS válido que todavía no existe. Es un círculo.

**Nada de esto lo monta el proyecto.** El certificado es del servidor, lo instala el panel y lo sirve el proxy compartido:

- Vive en `/opt/belay/traefik/certs/` (`origen.pem` 644, `origen.key` 600, `root:root`), fuera de cualquier repo.
- Cubre `*.belay.agency`, así que **el mismo certificado sirve a todos los sistemas de ese servidor**. Uno por servidor, no uno por proyecto.
- Dura 15 años. La clave privada se muestra una sola vez al crearlo; hay copia en el gestor de contraseñas, una entrada por servidor con la fecha de vencimiento anotada.

**La URL base de la aplicación es el dominio https definitivo desde el primer deploy.** Si queda apuntando a la IP, el certificado puede estar perfecto y el login rebota igual: el framework de autenticación valida el origen contra esa variable. Vale para `BETTER_AUTH_URL`, `NEXTAUTH_URL`, `APP_URL` y equivalentes.

Verificación, y no se da por hecho sin esto:

```
echo | openssl s_client -connect 127.0.0.1:443 -servername <dominio> 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

El issuer tiene que ser distinto del subject —si coinciden, es autofirmado y Cloudflare devuelve 526— y el SAN tiene que cubrir el dominio exacto. Después, que el sitio siga respondiendo y que el login funcione POR EL DOMINIO.

## 9. Buenas prácticas de Docker

- **Multi-stage build siempre**: una etapa de build con todas las dependencias de desarrollo, y una etapa final mínima que solo copia el resultado (`.next/standalone`, `dist`, etc.). La imagen final nunca lleva devDependencies, ni el código fuente completo, ni herramientas de build.
- **El peso de la imagen es un costo de cada deploy, no una cuestión estética.** La imagen viaja entera por SSH en cada push y el servidor guarda dos versiones (la que corre y la anterior, que es la vuelta atrás). Dos trampas medidas en proyectos reales:
  - Copiar el `node_modules` completo al runtime anula el `output: 'standalone'` de Next, que ya genera uno mínimo. En un caso real eran 991 MB de una sola capa.
  - Si el runtime necesita correr TypeScript (migraciones, un worker), **empaquetá esos scripts con esbuild** a un `.cjs` cada uno en vez de arrastrar `tsx` y los fuentes. La extensión tiene que ser `.cjs`: el `package.json` que Next deja junto al standalone declara `"type": "module"` y un `.js` se leería como ESM.
  - Referencia: una app Next con standalone bien armada ronda los 400 MB. Si te vas a 2 GB, algo está de más.
- **Imagen base mínima**: variantes `-alpine` o `-slim` de Node, nunca la imagen completa por comodidad.
- **Versión de la imagen base fijada**, nunca `latest` — así un rebuild en seis meses no trae una versión distinta sin que nadie lo haya pedido.
- **Usuario no-root dentro del contenedor**: crear un usuario de aplicación en el Dockerfile. Correr como root en el contenedor es el primer paso de cualquier escalada si algo se compromete.
- **`.dockerignore` desde el primer commit**: `node_modules`, `.git`, `.env`, archivos de build local. Sin esto el `.env` local puede terminar copiado adentro de una imagen por accidente.
- **Orden de capas pensado para cachear**: copiar `package.json` + lockfile e instalar dependencias antes de copiar el resto del código.
- **Nunca secretos horneados en la imagen**: ni en el `Dockerfile` ni copiados como archivo. Todo por variables de entorno en runtime.
- **Healthcheck definido en la imagen o en el compose**: un proceso vivo pero colgado (ej. sin conexión a la base) tiene que marcar unhealthy.
- **Volumen nombrado para Postgres**, nunca un bind mount improvisado — así un `docker compose down` sin `-v` no toca los datos.
- **Logs a stdout/stderr** con `max-size` y `max-file` configurados. En un servidor compartido, un log ruidoso llena el disco de todos.
- **`restart: unless-stopped`** en los servicios de producción.
- **Límites de CPU y memoria**: ya vienen puestos en el compose estándar que mantiene el panel. Si a tu sistema le quedan cortos, se cambian ahí, no en este repo.
- **Para generar PDFs, usar `@react-pdf/renderer`.**
- El compose de desarrollo local (la base del proyecto) también lleva `restart: unless-stopped`: sin eso, cada reinicio de Docker Desktop deja la base caída y el sistema arranca con errores de conexión que parecen otra cosa.
- ESLint ignora `.claude/**` desde el primer commit — si no, el lint barre los archivos de la skill y falla por código que no es del proyecto.

## 10. Qué archivos son tuyos y cuáles del panel

Esto es lo primero que hay que saber, porque editar el archivo equivocado funciona hasta la próxima actualización y después se pierde sin aviso.

**Los mantiene el panel de Belay y los pisa cuando cambia el estándar de deploy:**

| Archivo | Qué es |
| --- | --- |
| `.github/workflows/deploy.yml` | El workflow de deploy, idéntico para todos los sistemas |
| `belay/docker-compose.yml` | El compose base: el servicio `app`, sus límites, su red |
| `belay/LEEME.md` | El contrato del deploy, para quien trabaje en el repo |

Si algo de ahí te queda corto —más memoria, otro puerto, otro healthcheck— **se cambia en el panel y se reenvía a todos los sistemas**. No lo edites acá.

**Son tuyos:**

| Archivo | Qué es |
| --- | --- |
| `Dockerfile` | El de tu app. El panel deja uno de andamio sólo si no existe, y nunca lo pisa. |
| `belay/docker-compose.extra.yml` | Todo lo que tu sistema tenga de más: worker, base de datos, cache. |

En el archivo de servicios extra, un servicio puede usar una imagen pública (la baja el servidor), reusar la imagen de la app con otro comando (`image: ${APP_IMAGEN}`, que es lo que hace un worker), o construirse desde el repo con `build:` — en ese último caso el workflow la construye y la manda junto con la de la app.

## 11. Convivencia con otros sistemas en el mismo servidor

El VPS aloja sistemas de distintos clientes en simultáneo, cada uno con su propio stack de Docker y subdominio. Son máquinas chicas: una de 1 GB de RAM y un núcleo puede estar alojando dos o tres sistemas a la vez.

- **La base de datos de tu sistema NUNCA cuelga de la red compartida `belay`.** Ahí la vería cualquier container de cualquier otro cliente. Va en una red `interna` propia del proyecto; sólo el servicio `app` está en las dos (`belay` para que lo alcance el proxy, `interna` para hablar con su base).
- **El servidor no construye nada.** Un `next build` en una máquina compartida de 1 GB se lleva puesta la base de datos de otro cliente por OOM. La imagen se construye en GitHub Actions, siempre.
- Cada sistema usa su propio nombre de proyecto de compose (`docker compose -p <slug>`), así los comandos scopeados no pueden afectar a otro por accidente.
- **El identificador (slug) va de 3 a 28 caracteres**, minúsculas y guiones. El límite no es estético: el slug también es el usuario de Linux de la app (`app-<slug>`) y Linux corta los nombres de usuario en 32.
- Nunca entrar, inspeccionar, modificar, reiniciar ni borrar contenedores, archivos, bases de datos o configuración de **otro** proyecto/cliente que esté en el mismo servidor, aunque sean visibles con `docker ps` o listando `/home`. Solo se toca lo del proyecto actual.
- Cualquier acción en el servidor (deploy, debug, lectura de logs) se limita a `~/app` del usuario `app-<slug>`. No navegar a los directorios de otros clientes por curiosidad o para descartar la causa de un problema.
- Excepción: si Franco pide explícitamente en el mensaje algo sobre otro sistema del servidor, ahí sí se procede — la restricción es por defecto, no absoluta.

## 12. Deploy

**Un push a `main` despliega.** Nada más. `main` es la rama de producción: no se pushea ahí lo que no está listo para salir.

El setup lo hace el panel de Belay, no vos ni a mano:

- Crea el repo privado en la organización.
- Genera una clave SSH propia del sistema: la privada va como secret del repo (`SSH_PRIVATE_KEY`) y no se guarda en ningún lado — si se pierde, se rota; no se recupera. La pública va al `authorized_keys` del usuario de la app en el servidor.
- Carga las variables del repo: `SSH_HOST`, `SSH_USER`, `APP_SLUG`, `APP_DOMINIO`, `APP_PUERTO`. Son variables y no secrets a propósito: GitHub enmascara los secrets en los logs, y tener el host tachado en un deploy fallido no ayuda a nadie.
- Publica los archivos del estándar en el repo (ver sección 10).

Lo único manual, una vez por sistema: pegar como root en el servidor el comando que muestra el panel, que crea el usuario `app-<slug>` y le autoriza la clave.

Qué hace el workflow, en orden:

1. **Hacer lugar en el servidor**, antes de copiar y antes de levantar: borra las imágenes viejas de ese sistema (conserva la que corre, la anterior y la que se está por desplegar) acotado con `--filter reference=<slug>` — nunca un prune global (`system`/`image`/`builder`), porque en una máquina compartida entre clientes tocar de más pesa más que los megas que libera. Borra también un tarball a medio subir de un intento anterior. Mide el espacio libre contra un mínimo dinámico (`3 × tamaño de la imagen comprimida + 1 GB`, no un número fijo — un umbral fijo le queda grande a un sistema de 600 MB y corto a uno de 2 GB) y corta el deploy antes de transferir un solo byte si no alcanza.
2. Construye la imagen **en el runner de Actions**.
3. Si el repo tiene `belay/docker-compose.extra.yml`, construye también las imágenes extra que se armen desde el repo (las públicas las baja el servidor).
4. Empaqueta todo con `docker save | gzip` y lo manda por SSH junto con los compose.
5. En el servidor: `docker load`, escribe `~/app/.env` con las variables de infraestructura y levanta el stack con los dos compose.
6. Mira el container durante un minuto. **Si no se sostiene, vuelve solo a la versión anterior** y falla con los logs a la vista — y si falla el healthcheck, imprime `df -h` junto a los logs: un 502 con el disco lleno se lee igual que cualquier otra falla si no se mira explícitamente.
7. Comprueba que el dominio responda desde afuera.

No hay registry: la imagen viaja por el mismo SSH que ya existe. Eso es deliberado — si esa máquina se compromete, no se lleva puesto el acceso a los repos ni a las imágenes de los otros clientes.

Los secretos de la aplicación en el servidor:

- `~/app/.env.app` — los tuyos (`DATABASE_URL`, claves de sesión, credenciales de terceros). **El deploy nunca los toca.**
- `~/app/.env` — variables de infraestructura que escribe el deploy. **Se reescribe en cada push**: lo que pongas ahí se pierde.

Un cambio que sólo toca archivos `.md` no dispara deploy. No hace falta que hagas nada: está en el `paths-ignore` del workflow.

El ruteo del subdominio lo declara el panel con un archivo en el proxy del servidor, **no con labels de Traefik en tu compose**. Poner labels no hace nada: Traefik le pide al daemon de Docker una versión de API que Docker 29 ya no acepta, así que el descubrimiento por labels no funciona — y falla en silencio.

**Acceso interactivo desde Claude Code (debug manual, no deploy).** La clave de `SSH_PRIVATE_KEY` es del workflow, no de ninguna computadora — no sirve ni conviene copiarla para entrar a mano. Para que Claude Code se conecte directo al servidor de un sistema puntual (ver logs en vivo, revisar el disco, lo que no cubre el deploy), se genera una segunda clave, separada:

1. Una sola vez, no por proyecto: `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_belay-code`. Es la clave interactiva de la agencia, no la de ningún sistema en particular.
2. Se autoriza en `authorized_keys` del usuario `app-<slug>` de cada servidor, junto a la del deploy — nunca en lugar de ella. Si se filtra, se revoca sola sin tocar el deploy automático.
3. Un alias por sistema en `~/.ssh/config` (`Host <slug>` → `HostName`, `User app-<slug>`, esa `IdentityFile`), documentado en el CLAUDE.md del proyecto puntual — no en este prompt genérico, que es el mismo para todos los sistemas.

Sigue rigiendo la sección 11 igual con clave interactiva que con la del deploy: nada de tocar el servidor, los archivos o los contenedores de otro cliente salvo que se pida explícitamente.

---

## 13. La API del panel de Belay

El panel le presta al sistema **dos servicios distintos**, y conviene tenerlos separados en la cabeza aunque compartan la puerta de entrada:

| Servicio | Endpoint | Para qué | Detalle en |
|---|---|---|---|
| **Mails** | `POST {BELAY_API_URL}/mails` | El panel manda los mails del sistema | 13.1 |
| **Cobros** | `GET {BELAY_API_URL}/facturacion` | El sistema le muestra a su cliente qué le cobró Belay, y se entera si tiene que bloquearse | 13.2 y 6 |

Los dos existen por la misma razón: hay una credencial que el sistema no tiene ni debe tener. En mails es la key de Resend y el dominio verificado; en cobros, el acceso a Mercado Pago. En los dos casos el sistema pregunta y el panel responde.

**La dirección es siempre la misma: el sistema le habla al panel, el panel nunca le escribe al sistema.** Vale para los dos servicios y no tiene excepción.

**Una sola llave para los dos.** `BELAY_API_KEY`, una por sistema, en `Authorization: Bearer` (credenciales en 13.3). No hay una llave por servicio: serían dos rotaciones, dos instalaciones y el mismo 401 para depurar por duplicado. Que la llave sea una no los vuelve el mismo servicio.

**La llave dice de qué sistema es**, así que nada que identifique al sistema o a su cliente viaja en el pedido. Ni el nombre del sistema en un mail, ni un id de cliente en los cobros: si viajara, sería una forma de leer lo de cualquiera probando valores.

### 13.1 Envío de mails

El sistema **no manda mails por su cuenta y no tiene credenciales de ningún proveedor de correo**. Todos los mails salen por el panel de Belay, que es el único que tiene la API key de Resend y el dominio verificado.

#### Cómo funciona

El sistema le pide al panel que mande, indicando una plantilla, un destinatario y las variables que esa plantilla necesita. El panel valida, arma el mail con la identidad visual de la agencia y lo despacha.

Lo que **queda siempre del lado del sistema**, nunca del panel:

- Los usuarios y sus direcciones.
- Los códigos de recuperación: se generan acá, se guardan hasheados acá, se validan acá y se cuentan los intentos acá. Al panel se le manda el código ya generado, sólo para que lo escriba en el mail.
- Las contraseñas.

El panel transporta el mensaje. No sabe quiénes son los usuarios ni puede crear cuentas. Si el panel se viera comprometido, no se lleva las cuentas de nadie.

#### El contrato

`POST {BELAY_API_URL}/mails`, con `Authorization: Bearer {BELAY_API_KEY}` y cuerpo JSON:

```json
{ "plantilla": "recuperacion-contrasena", "destinatario": "alguien@ejemplo.com", "variables": { "codigo": "404040", "minutos": 15 } }
```

Respuestas: **2xx** si el mail salió, **401** si la key no vale o fue borrada, **422** si la plantilla no existe o las variables no validan, **429** si se pasó del límite (trae `Retry-After`), **502** si el proveedor rechazó el envío. El cuerpo del error trae un `error` en castellano, para el log del sistema — no para mostrárselo a un usuario.

El límite es de 120 mails por minuto por key. Es tráfico transaccional de un sistema interno: si se llega a ese número, es un bucle, no demanda.

#### Plantillas

Catálogo cerrado: no hay forma de mandar un mail con cuerpo libre. El panel arma el HTML con la identidad visual de la agencia.

| `plantilla` | `variables` | Cuándo |
|---|---|---|
| `recuperacion-contrasena` | `codigo` (4 a 8 dígitos), `minutos` (entero) | Alguien pidió recuperar su contraseña |
| `aviso-cambio-contrasena` | ninguna | La contraseña de una cuenta acaba de cambiar |
| `cambio-correo` | `codigo` (4 a 8 dígitos), `minutos` (entero) | Alguien pidió cambiar la dirección de correo — el código va a la dirección **anterior** |
| `aviso-cambio-correo` | ninguna | La dirección de correo de una cuenta acaba de cambiar |

**El nombre del sistema no se manda**: el panel lo sabe por la key con la que te autenticaste, y con eso el mail dice "tu contraseña de Kioscos" en vez de llegar firmado por una agencia que quien lo recibe no conoce.

Ninguna de estas plantillas lleva un solo link, y el código nunca va en el asunto. Si un sistema necesita una plantilla nueva, se agrega en el panel: no se resuelve mandando HTML.

#### Texto que escriben los usuarios

Cualquier texto que un usuario pueda escribir y que termine dentro de un mail —un nombre, una nota— se valida antes de guardarlo: máximo 60 caracteres para un nombre, y se rechaza si contiene saltos de línea, `://`, `www.`, `@` o algo con forma de dominio.

El motivo: los clientes de correo convierten cualquier dominio suelto en un link, aunque viaje como texto plano. Sin esta validación, un texto guardado por un usuario puede convertir un mail legítimo de Belay en uno de phishing, firmado con el dominio de la agencia. El panel valida lo mismo por su cuenta, pero el lugar correcto para rechazarlo es acá, donde el usuario ve el error y entiende por qué.

#### Mails de cuenta

**La recuperación es por código, no por enlace.** Seis dígitos que la persona escribe en el sistema. El mail suele leerse en el celular y el sistema estar abierto en la computadora del mostrador: con un enlace, la sesión nueva arranca en el aparato equivocado. De paso, un mail sin links es un mail que no se puede confundir con phishing.

- El código se guarda **hasheado**, como una contraseña.
- Es de **un solo uso** y vence a los 15 minutos. Se invalida al usarlo y al cambiar la contraseña por cualquier otra vía.
- **Máximo 5 intentos**, y ahí el código muere y hay que pedir otro. Sin ese corte, seis dígitos se prueban por fuerza bruta en minutos.
- **El código no va en el asunto.** El asunto dice "Tu código para cambiar la contraseña" y nada más: el asunto entero se lee en la notificación del celular, y ahí lo ve cualquiera que mire la pantalla apagada.
- **El mail nunca revela si la cuenta existe.** La pantalla contesta lo mismo siempre; si la dirección no está registrada, no se manda nada.
- Rate limit por dirección **y por IP**.
- Los cambios de contraseña o de dirección se avisan también a la dirección anterior, y el código para cambiar de dirección va a la **anterior**, no a la nueva: si no, alcanza con una sesión robada para quedarse con la cuenta.
- **Única excepción**: cuando el usuario de soporte le cambia la contraseña o la dirección a otro, el código va a `info@belay.agency` (sección 3, "El usuario de soporte"). El aviso posterior sí va a la dirección de esa persona: que Belay pueda entrar a arreglar algo no es motivo para que su dueño no se entere.

**No hay mail de invitación.** Un usuario nuevo se crea con una contraseña que pone quien administra el sistema, en el momento del alta, y se la pasa por fuera del sistema (de palabra, por WhatsApp) — no por acá. La cuenta queda activa desde que se crea, sin un paso intermedio de "invitación pendiente". Esa contraseña sigue las mismas reglas que cualquier otra (10 caracteres, mayúscula, número y símbolo — `evaluarPassword`), y quien la recibe la puede cambiar después desde su perfil.

### 13.2 Cobros: qué le cobró Belay al cliente

El cliente paga a Belay un abono mensual por hosting y mantenimiento, que se debita solo por Mercado Pago. Ese historial se muestra **dentro de su sistema**, en Configuración → Facturación (sección 14), y el sistema se lo pide al panel.

#### Por qué se pregunta y no se guarda

Nada de esto se copia a una tabla local, y no es por simplificar. Un pago no es un hecho quieto: Mercado Pago lo mueve de `pending` a `approved` días después, y una devolución o un contracargo lo cambian meses más tarde. Una copia acá quedaría mostrando "aprobado" sobre algo que se devolvió, y mantenerla al día exigiría que el panel saliera a escribir en la base de cada sistema — al revés de cómo funciona todo lo demás.

**El sistema le habla al panel; el panel nunca le escribe al sistema.** Es la misma dirección que los mails.

#### El contrato

Con la misma llave de 13.3, en `Authorization: Bearer {BELAY_API_KEY}`.

**`GET {BELAY_API_URL}/facturacion`**

```json
{
  "sistema": "acme",
  "servicio": {
    "feeUsdCentavos": 3500,
    "montoArsCentavos": 4850000,
    "proximoCobro": "2026-10-01",
    "estado": "al_dia",
    "graciaHasta": null,
    "bloquear": false,
    "motivoBloqueo": null
  },
  "cobros": [
    {
      "id": "36fb2763-3470-4291-b8e2-22be186a5b29",
      "fecha": "2026-09-01",
      "periodo": "2026-09",
      "montoArsCentavos": 4850000,
      "estado": "aprobado",
      "pagoMercadoPago": "128374915",
      "comprobante": true
    }
  ],
  "paginacion": { "limite": 24, "offset": 0, "total": 30, "hayMas": true }
}
```

`servicio.estado`: `al_dia`, `pendiente`, `con_problema` o `sin_cobros` — lo decide el último cobro. `sin_cobros` es un estado real y hay que mostrarlo como tal: decir "al día" cuando todavía no se cobró nada es una mentira cómoda.

`servicio.bloquear`, `servicio.motivoBloqueo` y `servicio.graciaHasta`: el bloqueo y la ventana de gracia, ya resueltos por el panel (sección 6). `bloquear` es lo único que se mira para cortar el sistema, y es `true` por dos razones que dice `motivoBloqueo`: `pago` (venció la gracia) o `panel` (lo bloqueó Belay a mano, aunque el cliente esté al día); `null` sin bloqueo; `graciaHasta` es una fecha ISO para el texto del cartel, no para hacer cuentas. Un cobro rechazado NO bloquea el mismo día: `estado` pasa a `con_problema` y `bloquear` sigue en `false` durante siete días.

`cobros[].estado`: `aprobado`, `pendiente`, `rechazado`, `devuelto`, `contracargo` u `otro`. Vienen ya traducidos del inglés de Mercado Pago; no hay que mapearlos de nuevo.

Los cobros vienen del más nuevo al más viejo. Límite de 60 consultas por minuto por llave.

**Paginación**: `?limite=` (1 a 100, por defecto 24) y `?offset=` (por defecto 0). La respuesta trae `paginacion` con el `total` del cliente y `hayMas`, así que para saber si falta algo se mira eso y no si vinieron menos filas de las pedidas. Un valor fuera de rango o no numérico da **422**; un `offset` más allá del total devuelve la lista vacía, que no es un error.

Con doce cobros por año, las 24 por defecto son dos años y la mayoría de los sistemas no van a paginar nunca. Está igual para que el día que un cliente lleve cinco años, el historial viejo no desaparezca en silencio.

**`servicio` no cambia con la página.** El estado y el próximo cobro describen siempre el último cobro, no el primero de la página que se pidió: en la página 2 eso sería un cobro de hace dos años. Se puede pedir `?offset=48` y seguir leyendo `servicio.estado` con confianza.

**`GET {BELAY_API_URL}/facturacion/{id}/comprobante`** → el PDF, `application/pdf`.

Se pide **sólo** cuando `comprobante` es `true` en esa fila. Un cobro pendiente todavía no acreditó y uno rechazado no ocurrió: para ésos el panel contesta **409**, y ofrecer un botón que falla es peor que no ofrecerlo. Límite de 30 por minuto.

Códigos: **401** llave inválida o borrada · **404** el cobro no existe *o es de otro cliente* (no se distinguen a propósito: decir "existe pero no es tuyo" ya es dar el dato) · **409** el cobro no está aprobado · **429** límite, con `Retry-After` · **5xx** problema del panel.

#### Los importes vienen en centavos enteros

`montoArsCentavos: 4850000` son $ 48.500,00. **No se dividen por 100 en un float** para mostrarlos: se formatea el entero, separando los últimos dos dígitos. Es la misma regla con la que el panel los guarda, y romperla no rompe nada visible — sólo muestra un importe que no es el que se cobró.

`feeUsdCentavos` es el abono en dólares; el monto en pesos sale de aplicarle el MEP del día del cobro, y por eso cambia mes a mes.

### 13.3 Credenciales: la llave de los dos servicios

Dos variables, las dos en `~/app/.env.app` en el servidor — el archivo de secretos que el deploy nunca pisa. Nunca en el repo ni en los secrets de GitHub. `.env.example` las lleva con un placeholder.

```
BELAY_API_KEY=blay_...
BELAY_API_URL=https://panel.belay.agency
```

La key es **propia de este sistema y contra el panel**, no contra Resend. La genera Franco desde el panel (API del sistema → Nueva llave). Una key por sistema: borrar una no toca a las demás, y el límite de uso es por key, así que un bucle acá no se lleva puesta la cuota de los otros.

**Una sola llave para todo lo que el sistema le pide al panel**, no una por servicio: con la misma se mandan mails y se consultan los cobros (13.2). Por eso se llama `BELAY_API_KEY` y no `MAILS_API_KEY` — dos llaves serían dos rotaciones, dos instalaciones y el mismo 401 para depurar por duplicado. Si en algún repo viejo quedaron las variables con el nombre anterior, el panel las borra del `.env.app` al instalar la nueva.

**El sistema no maneja la llave: la instala el panel.** Al generarla, el panel entra por SSH al servidor de este sistema, escribe las dos variables en `~/app/.env.app` respetando todo lo demás que haya en el archivo, y recrea el stack para que el container las tome —recrear y no reiniciar, porque `env_file` se resuelve al crear el container—. Después comprueba adentro del container que la llave que está corriendo es la que acaba de generar.

De este lado eso significa: **la llave se lee de `process.env` y de ningún otro lado**. No se pide por pantalla, no se guarda en un archivo de configuración del sistema, no va al repo ni a los secrets de GitHub, y nadie la copia a mano. Si falta la variable, el sistema no manda mails y lo dice en el log: no la inventa ni la pide.

Que la llave aparezca en pantalla es la excepción, no el camino normal — el panel sólo la muestra si no pudo instalarla (el sistema todavía no está desplegado, el servidor no responde), y ahí sí hay que pegarla a mano en `~/app/.env.app` y levantar el sistema de nuevo.

**Rotar**: se borra la vieja en el panel y se genera otra, que se instala sola. Las llaves se borran, no se revocan. Del lado del sistema no hay nada que hacer más que aguantar los segundos que tarda el container en recrearse. Recuperar una llave perdida no existe.

`BELAY_API_URL` es la base, sin `/mails`: el cliente arma la ruta. Es lo que instala el panel, así que si acá se le agrega el path, el sistema termina pegando contra `/mails/mails`.

En desarrollo no hay panel: `references/scripts/mails-simulado.mjs` levanta uno falso en 127.0.0.1:9096 que imprime cada mail (y su código de recuperación) por consola. Sin él, el flujo de recuperación no se puede probar en local.

### 13.4 Cuando el panel no contesta

Hay que preverlo, no descubrirlo en producción. El timeout contra el panel es corto (5 segundos) — un usuario esperando un formulario no tolera más, y si el panel tarda más que eso, está caído.

- **Mails que bloquean una acción** (recuperación, invitación, verificación): un reintento corto, y si no sale la operación falla. **No se consume el token ni se marca la invitación como enviada** — el usuario tiene que poder reintentar dentro de un rato con el mismo resultado. El mensaje dice la verdad: "No pudimos enviar el mail, probá en unos minutos" — nunca "revisá tu correo" cuando el mail no salió, porque eso deja a alguien esperando algo que no va a llegar. Queda registrado en el sistema, no solo en el panel: si el panel está caído, tampoco lo va a registrar.
- **Mails que no bloquean nada** (avisos, confirmaciones de algo ya ocurrido): se mandan sin esperar y si fallan solo se registran. Que no salga un aviso no puede hacer fallar la operación que lo generó.
- **Consultas de cobros**: la sección no carga y lo dice — "No pudimos traer el historial, probá en unos minutos". **No se muestra una lista vacía**, que se leería como "nunca te cobramos", ni se guarda la anterior para mostrarla después: un cobro cambia de estado y una copia vieja diría que está aprobado algo que se devolvió. Es una pantalla de consulta; que no cargue no frena nada de la operación del sistema.

## 14. Configuración

Una sola pantalla para la cuenta de quien está usando el sistema y para su relación con Belay. **Es un modal**, no una ruta: se abre encima de donde estabas y al cerrarlo seguís ahí. Configurar algo casi nunca es a lo que uno vino, y mandarlo a otra página lo obliga a volver.

**Se entra desde el menú del usuario**, al pie de la navegación, como primer ítem. Ahí y en ningún otro lado: un acceso en dos lugares distintos son dos lugares donde buscarlo.

No lleva una entrada "Mi perfil" aparte. Los datos de la cuenta ya están adentro de Configuración, y dos ítems que llevan casi al mismo lugar terminan apretándose uno por el otro —el mismo motivo por el que "cerrar sesión" vive dentro del menú y no suelto al lado del nombre.

### Estructura

Nav de secciones fija a la izquierda (208px), panel a la derecha que scrollea solo, cerrar arriba a la derecha. Dos secciones, y sólo dos:

- **General** — Perfil (nombre, correo, contraseña) y Preferencias (apariencia).
- **Facturación** — el servicio y los cobros de 13.2.

El esqueleto está resuelto en `design-system/components/configuracion.tsx`: `ModalConfiguracion`, `SeccionConfig` y `FilaConfig`. Se usa, no se rehace — vale lo mismo que para el acceso.

Es un `<dialog>`: el foco atrapado adentro, el cierre con Escape, el `inert` sobre el resto y el `::backdrop` vienen dados por el navegador. Uno casero casi siempre queda con el foco suelto detrás.

Abajo de 900px la nav pasa a una fila horizontal arriba y las filas apilan el control debajo del rótulo.

### La tabla de cobros

Fecha y período van en **una sola columna** —la fecha arriba, el mes abajo en chico— y no en dos: con seis columnas la tabla no entra en el ancho del modal y aparece scroll horizontal.

El **id de pago de Mercado Pago es una columna visible**, en monoespaciada. Es lo que le permite al cliente cruzar la fila con su resumen de tarjeta o reclamarle a MP; sin eso, el comprobante que emite Belay no se puede verificar contra nada.

Sin acciones: no se paga desde ahí, no se cancela y no se cambia el medio de pago. Es para mirar y bajar un PDF; todo lo demás se habla con la agencia.

Estado vacío: "Todavía no hay cobros", con la fecha del primero si se sabe.

## Objetivo específico del sistema

**Sistema:** `restaurante` — `restaurante.belay.agency`, usuario `app-restaurante`, repo `restaurante`. Cliente nuevo de Belay.

### Respuestas a las preguntas iniciales (ya contestadas, no repreguntar)

1. **Formato mixto.** Mozos y cocina trabajan desde el celular o una tablet (mobile-first: mapa, carga de pedidos, estado de mesas). Caja, administración, stock, recetas y reportes son desktop-first. Las dos mitades comparten el mismo sistema y los mismos componentes; lo que cambia es qué vista se prioriza para cada rol.
2. **Funciona offline.** Si se cae el wifi del local, el servicio no se corta: se siguen abriendo mesas, cargando pedidos, mandando comandas y cobrando.
3. **Local-first completo.** Los datos viven primero en el dispositivo y se sincronizan con el servidor en segundo plano. La planificación inicial tiene que definir, antes de cualquier pantalla: la librería o el mecanismo de sync (verificar las opciones vigentes, no asumir), el modelo de datos del lado del cliente, cómo se propagan los cambios entre los dispositivos del mismo local (que un mozo vea en su celular la mesa que otro acaba de abrir) y la resolución de conflictos. Criterio de base: toda operación del salón es un **evento append-only con id generado en el cliente** (idempotente: reenviarlo dos veces no duplica nada), y el estado de una mesa o de una caja se deriva de sus eventos. Así dos mozos operando la misma mesa sin red no se pisan: se suman. Lo que no admite conflicto (un cobro, una anulación autorizada) queda con su autor, su dispositivo y su hora local y de servidor.

### El problema del cliente

El dueño pierde plata y no sabe dónde. **El sistema existe para responder esa pregunta.** Cada peso que entra o no entra, y cada gramo de mercadería que sale del depósito, tiene que poder rastrearse hasta una persona, un momento y un motivo. Todo lo que sigue se diseña con ese criterio: si una funcionalidad facilita operar pero abre un hueco por donde se puede ir plata sin dejar rastro, el hueco se cierra aunque cueste un paso más.

### 1. Inicio: mapa del salón

La pantalla de inicio es el plano del local, dibujado en canvas (evaluar Konva/react-konva u otra opción vigente en la planificación), interactivo y usable con el dedo: arrastrar, pellizcar para hacer zoom, tocar una mesa para abrirla.

**Modo edición** (sólo admin): sectores o plantas separados (salón, terraza, barra, VIP, los que haya), mesas de distintas formas y tamaños, rotación, grilla con imán, elementos fijos no operables (paredes, barra, columnas, puertas, cocina) para que el plano se reconozca. Cada mesa tiene número y capacidad.

**Modo operación** (todos): cada mesa muestra su estado con color y tiempo — libre, ocupada, con pedido demorado, pidió la cuenta, precuenta impresa, reservada. Sobre una mesa ocupada se ve el mozo, los comensales, el total parcial y hace cuánto se abrió. Los cambios de un dispositivo se reflejan en los demás en vivo (y diferidos cuando no hay red, según el modelo de sync).

### 2. Cuentas y pedidos

- **Abrir mesa:** mozo responsable y cantidad de comensales (obligatorio — sirve después para cruzar cubiertos contra consumo).
- **Cargar ítems** desde la carta: categorías, búsqueda, modificadores (punto de cocción, sin sal, guarnición), notas para cocina, cantidades. Cada ítem queda con quién lo cargó y cuándo.
- **Enviar a cocina:** los ítems se rutean por estación (cocina, parrilla, barra, postres — configurable). Una vez enviado, un ítem **no se borra**: se anula (ver sección 5).
- **Operaciones de mesa:** mover a otra mesa, unir mesas, pasar ítems de una cuenta a otra, cambiar de mozo — todas quedan en auditoría.
- **Precuenta:** imprimir o mostrar la cuenta. Queda registrada como evento con su total; cualquier cambio posterior a una precuenta se marca.
- **Cobro:** dividir (en partes iguales, por ítem, por persona), pagos mixtos (efectivo, débito, crédito, transferencia, QR — definir con el cliente cuáles usa), propina separada del consumo, cierre de la mesa. El cobro se hace en caja o desde el dispositivo del mozo según el rol lo permita.
- **Cuentas sin mesa:** mostrador y para llevar, con el mismo circuito de comanda y cobro. Delivery, a confirmar con el cliente.

### 3. Cocina

Comanda por estación con número de mesa, mozo, ítems, modificadores y notas, en el orden en que entraron. A definir con el cliente en la planificación: pantalla de cocina (KDS, con estados "en preparación / listo" y tiempo transcurrido), impresora térmica por estación, o las dos. Regla operativa que el sistema sostiene: **en cocina no se prepara nada que no haya entrado como comanda.** Un plato que sale sin estar cargado es exactamente la plata que el dueño no encuentra.

### 4. Carta, insumos, recetas y stock

- **Carta:** platos y bebidas con precio, categoría, estación de cocina y disponibilidad. Precios con historial (regla de la sección 2 del prompt base: se archiva y se crea uno nuevo, nunca se edita).
- **Insumos:** unidad de compra y unidad de uso con su conversión (se compra el aceite por bidón, se usa por mililitro), depósito (cámara, cocina, barra, bodega), stock mínimo con alerta.
- **Recetas (escandallo):** cada plato descompone en insumos con cantidad, unidad y rendimiento/merma. Sub-recetas para preparaciones intermedias (salsas, masas, fondos) que a su vez descuentan sus insumos. De ahí sale el **costo teórico de cada plato, su food cost % y su margen**, recalculados cuando cambia el costo de un insumo.
- **Descuento automático:** cada venta descuenta del stock lo que dice la receta. Eso es el **consumo teórico**.
- **Compras:** ingreso de mercadería por proveedor, con número de factura, cantidades y costo; actualiza el stock y el costo del insumo (definir en la planificación promedio ponderado vs último costo).
- **Producción:** registrar cuándo se elabora una preparación intermedia (sale insumo, entra preparación).
- **Movimientos:** transferencias entre depósitos, mermas y vencimientos con motivo obligatorio, comida del personal como salida propia (no mezclada con merma).
- **Conteo físico (inventario):** **ciego** — quien cuenta no ve el stock teórico, sólo carga lo que hay. El sistema calcula la diferencia después. Conteos totales y parciales (por depósito o por categoría, por ejemplo bebidas todas las noches).
- **Teórico vs. real:** la diferencia entre lo que la receta dice que debería haberse consumido y lo que realmente falta en el depósito, por insumo y por período, en cantidad y en pesos. Es el reporte central del sistema.

### 5. Control interno y seguridad operativa

Esto es el corazón del pedido, no un agregado.

- **Cada persona con su usuario.** Nadie opera con la cuenta de otro. En los dispositivos compartidos del salón, cambio rápido de operador con PIN personal, y cada acción queda a nombre de quien puso el PIN.
- **Auditoría inmutable, append-only,** de toda operación de salón, caja y stock. No hay pantalla ni función que borre una venta, un cobro o un movimiento: se corrige con un contra-movimiento que referencia al original.
- **Acciones que requieren autorización de un encargado** (PIN de un rol superior en el momento, con motivo obligatorio de una lista + texto opcional): anular un ítem ya enviado a cocina, descuentos, cortesías/invitaciones, cambiar un precio en la cuenta, reabrir una mesa cerrada, cambiar el medio de pago de un cobro ya hecho, modificar una cuenta después de la precuenta, cerrar una mesa sin cobrar. Los motivos y quiénes autorizan se configuran.
- **Caja:** apertura por turno con fondo inicial y responsable; retiros y egresos con motivo y autorización; **arqueo ciego al cierre** (el cajero declara lo que cuenta por medio de pago sin ver el esperado); diferencia registrada por cajero y turno. Cierre del día que congela lo operado: después de cerrado, nada de ese día se toca.
- **Alertas al dueño dentro del sistema** (no por mail — el catálogo de plantillas del panel es cerrado): anulaciones después de la precuenta, mesas abiertas demasiado tiempo, mesas cerradas sin cobro, diferencias de caja, descuentos por encima de un umbral, conteos con diferencias grandes, anulaciones fuera de horario.
- **Tablero de control del dueño** — "dónde se va la plata", por período (usar `NavegadorPeriodo`): diferencia teórico vs. real de stock, mermas, comida de personal, anulaciones, descuentos y cortesías, diferencias de caja — cada rubro en cantidad y en pesos, con desglose por persona, por turno y por producto, y bajada al detalle de cada evento.
- **Rankings por persona:** anulaciones, descuentos y cortesías por mozo y por encargado que las autorizó; diferencias de caja por cajero; consumo por comensal por mozo. El patrón, no el caso suelto, es lo que delata.

### 6. Roles

Dueño (admin), encargado, cajero, mozo, cocina (sólo su vista de comandas), compras/stock. Más el usuario soporte del prompt base. Qué ve y qué autoriza cada uno se valida en el servidor y, en modo offline, también en el cliente con la misma regla (Zod compartido y un único módulo de permisos), revalidado al sincronizar: un evento que llega sin la autorización requerida se rechaza y queda como alerta.

### 7. Interfaz de caja

La caja es un sistema de mostrador: usa `isla.tsx` con atajos de teclado para las acciones frecuentes (cobrar, dividir, precuenta, abrir caja/cerrar caja).

### 8. Reportes y exportación

Ventas por período, por hora, por día de semana, por mozo, por plato y por categoría; platos más y menos rentables (cruzando venta con costo teórico); ticket promedio y consumo por comensal; compras por proveedor; valorización del stock. Todo exportable a Excel/PDF.

### 9. Integraciones a definir con el cliente

- **Facturación electrónica (ARCA):** confirmar si la necesita desde el sistema. Si aplica, es candidata a ir aislada como integración/microservicio (sección 2 del prompt base), sin bloquear el cobro si el servicio externo no responde.
- Impresoras térmicas (comandas y precuentas), lectores de QR de pago, reservas online: a relevar.

### Pendiente de relevar con el cliente

Nombre del restaurante, logo y color de marca (`--color-acento`), cantidad de sectores y mesas, estaciones de cocina, impresoras disponibles, medios de pago que acepta, si factura electrónicamente, cantidad de dispositivos del salón, y cómo maneja hoy compras y stock (para la carga inicial de insumos y recetas). Lo que falte se marca en la planificación como supuesto, no se inventa.

### Orden de construcción sugerido (a validar en la planificación)

El modelo local-first y la auditoría se definen en la primera fase aunque sus pantallas lleguen después — son la base de todo lo demás y no se agregan al final.

1. Base: auth, roles, PIN de operador, auditoría, modelo de eventos y sincronización.
2. Mapa del salón (edición y operación) y cuentas de mesa.
3. Comandas a cocina.
4. Caja: cobros, pagos mixtos, apertura/arqueo/cierre.
5. Insumos, recetas, compras, stock y conteos.
6. Autorizaciones, alertas y tablero de control.
7. Reportes, exportaciones e integraciones.
