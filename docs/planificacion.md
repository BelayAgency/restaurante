# Planificación — `restaurante`

Estado: **aprobada el 28/10/2026, sin nodo local** (decisión 0.1, opción A; el protocolo queda preparado para sumarlo cuando se definan impresoras). Las decisiones 0.2 a 0.6 rigen con su supuesto o recomendación hasta que se releven con el cliente. Lo marcado como *supuesto* es algo que no está relevado con el cliente y se decidió provisoriamente para poder planificar; se cambia sin costo mientras no se construya la fase que lo usa.

---

## 0. Las decisiones que necesito antes de arrancar

Ordenadas por cuánto cambian el diseño.

1. **¿Hay un nodo local en el restaurante?** Es la decisión más grande y no está en el pedido. Si se corta *internet* pero el wifi del local sigue andando, cada dispositivo puede seguir trabajando solo — pero sin un servidor dentro del local **no se ven entre ellos**: el mozo no ve la mesa que abrió otro, y **la cocina no recibe las comandas** hasta que vuelva internet. Opciones:
   - **A. Sin nodo local** (todo contra `restaurante.belay.agency`). Offline = cada dispositivo aislado, sincroniza al volver. La comanda offline sólo llega a cocina si se imprime/muestra en el mismo dispositivo o se le canta a cocina.
   - **B. Con nodo local** (mini PC o similar en el local, ~USD 150–250): corre el mismo relé de sincronización, los dispositivos del local hablan con él por la LAN y él sincroniza con la nube cuando hay internet. Resuelve además las impresoras térmicas (una página web no puede mandarle ESC/POS a una impresora de red; el nodo sí).
   - **Recomendación:** diseñar el protocolo desde la fase 1 para que el relé pueda estar en la nube o en el local sin cambiar nada del cliente, **arrancar con A** y sumar B cuando se definan impresoras. Si el cliente va a imprimir comandas, B deja de ser opcional.
   - Si se cae el router del local (no hay ni LAN), con A o con B cada dispositivo queda aislado. Eso no lo resuelve ningún software; sí lo mitiga que cada dispositivo pueda imprimir/mostrar su comanda.
2. **¿El mozo cobra desde su celular, o sólo caja?** Cambia qué roles tienen eventos de cobro offline y cuánta superficie de control hay que cubrir (*supuesto*: cobra sólo caja; el mozo pide la cuenta y emite precuenta).
3. **KDS, impresora o las dos** en cocina (*supuesto*: KDS en tablet por estación, impresora después con el nodo local).
4. **Dispositivos del local o personales** para los mozos (*supuesto*: tablets/celulares del local registrados por el dueño, con cambio de operador por PIN; un celular personal también puede registrarse como dispositivo).
5. **Costo de insumos: promedio ponderado** (recomendado: el último costo hace saltar el food cost con cada compra chica y el teórico-vs-real se vuelve ruido) vs último costo.
6. **Stock, compras, recetas y configuración sólo con conexión** (recomendado, ver 2.3). El pedido exige offline para salón y cobro; extenderlo a stock duplica el modelo de sync sin ganar nada operativo: un conteo o una compra se carga cuando vuelve internet.

---

## 1. Stack verificado (28/10/2026)

| Pieza | Versión | Nota |
|---|---|---|
| Node.js | 24 LTS | |
| Next.js | 16.4 (App Router) | en 16 el `middleware.ts` pasó a llamarse `proxy.ts` |
| React | 19.3 | |
| Tailwind CSS | 4.3, CSS-first | `globals.css` del sistema de diseño tal cual |
| PostgreSQL | 18 | |
| Drizzle ORM / drizzle-kit | 0.45 / 0.31 | |
| Zod | 4.6 | |
| Auth | better-auth 1.7 | sesión de 400 días deslizante, sección 3 |
| Plano del salón | konva 10.9 + react-konva 19.3 | soporta React 19; pellizco y arrastre con eventos táctiles propios de Konva |
| Base local | Dexie 4.4 (IndexedDB) | ver 2.1 |
| Hash | `@node-rs/argon2` 2.2 | sin compilación nativa en el build de Alpine |
| PDF / Excel | `@react-pdf/renderer` 4.9 / `exceljs` 4.4 | exceljs no se actualiza desde 2024 pero es estable; revisar alternativa en la fase 7 |
| Íconos | lucide-react | |
| Service worker | escrito a mano (o Serwist 9.5 si su soporte de Turbopack ya está firme en la fase 1) | `updateViaCache: 'none'`, versión de caché atada al build |

---

## 2. Arquitectura local-first

### 2.1 Mecanismo de sync: propio, sobre un log de eventos

Opciones evaluadas: **PowerSync** (Open Edition, FSL, self-hosted en Docker, beta), **Zero** (Rocicorp), **Electric**, **LiveStore** (0.5, event-sourced), **RxDB**, **Replicache**.

**Recomendación: motor propio, chico, sobre Postgres + Dexie.** Motivos:

- El dominio ya *es* un log append-only con ids de cliente. Los motores genéricos sincronizan **filas**; acá lo que hay que sincronizar son **hechos**, y el estado de una mesa se deriva. Con PowerSync o Electric terminaríamos modelando un log encima de un motor de filas.
- Zero está pensado para escrituras con conexión; su soporte offline no cubre una cola de escrituras de horas.
- LiveStore es exactamente el modelo, pero está en 0.x y sus backends de sync son Cloudflare o Electric. No conviene apoyar el control de caja de un cliente en una librería pre-1.0.
- PowerSync agrega un servicio más (Node + almacenamiento de buckets) y exige replicación lógica en Postgres, en una máquina de 1 GB compartida con otros clientes.
- La validación de permisos al recibir un evento (sección 6 del objetivo) tiene que ser nuestra igual, en cualquier opción.

El costo: el protocolo lo mantenemos nosotros. Es acotado — dos endpoints y un canal en vivo:

- `POST /api/sync/eventos` — el dispositivo manda su bandeja de salida. El servidor valida cada evento (Zod + permisos + reglas), lo inserta con `ON CONFLICT (id) DO NOTHING` y le asigna una `secuencia` global. Devuelve por evento `aceptado` o `rechazado` con motivo. Reenviar es inocuo.
- `GET /api/sync/eventos?desde=<secuencia>` — el dispositivo trae lo que no tiene, en orden de secuencia.
- `GET /api/sync/vivo` — SSE. Avisa "hay secuencia nueva N"; el cliente hace pull. Entre procesos se reparte con `LISTEN/NOTIFY` de Postgres. Si el SSE se cae, el cliente hace pull periódico.

El mismo protocolo lo puede servir un nodo local (decisión 0.1) sin cambiar el cliente.

### 2.2 Del lado del dispositivo

- **Dexie** con: `bandeja_salida` (eventos propios todavía no aceptados, con intentos y último error), `eventos` (confirmados, desde el último cierre de día — no la historia entera), `catalogo` (snapshot versionado de carta, precios vigentes, plano, motivos, reglas, usuarios operativos con hash de PIN), `cursor` (última secuencia recibida).
- **Estado visible** = `reducir(eventos confirmados por secuencia + bandeja_salida por orden local)`. Un evento propio aparece al instante y no "salta" cuando el servidor lo confirma.
- **Los reductores son un paquete de dominio puro** (`dominio/`), sin React ni Drizzle, que corre igual en el navegador y en el servidor. El servidor usa los mismos para armar sus proyecciones. Una sola fuente de verdad para "qué significa este evento".
- Service worker: cache-first para estáticos, network-first para API, y la app abre sin red. La escritura offline no pasa por el SW: va a Dexie y la bandeja se vacía cuando vuelve la conexión.
- Cada evento lleva `creado_en_dispositivo` (hora local) y el servidor anota `recibido_en`. Se mide el desfase de reloj de cada dispositivo; más de 5 minutos dispara alerta (un reloj atrasado es una forma de meter una venta en un turno ya cerrado).

### 2.3 Qué funciona offline y qué no

| Offline | Sólo con conexión |
|---|---|
| Abrir mesa, cargar ítems, enviar comanda, operaciones de mesa, precuenta | Editar carta, precios, recetas, insumos, plano |
| Cambio de operador por PIN, autorizaciones por PIN | Compras, producción, movimientos, conteos |
| Cobro, apertura de caja, retiros/egresos, arqueo | Cierre del día |
| Estados de KDS (en preparación / listo) | Usuarios, roles, configuración, reportes, tablero |

Lo "sólo con conexión" se edita contra el servidor como cualquier CRUD (server actions) y baja a los dispositivos como nueva versión del catálogo.

### 2.4 Conflictos

Los eventos se diseñan como **hechos que se suman, no como estados que se pisan**: `item_agregado {item_id}`, `item_anulado {item_id}`, nunca `mesa.items = [...]`. Con eso casi todo conmuta. Los casos que no:

| Caso | Resolución |
|---|---|
| Dos mozos abren la misma mesa sin red | Quedan dos cuentas en esa mesa. El mapa la muestra con dos cuentas y sale una alerta para unirlas. No se pierde nada. |
| Un ítem se mueve a otra cuenta y a la vez se anula | Los dos eventos refieren al `item_id`; se aplican ambos. |
| Dos cobros sobre la misma cuenta | Se aceptan los dos — si se cobró dos veces, pasó. El reductor marca cobro excedente y alerta. |
| Precio cambió mientras el dispositivo estaba offline | El ítem viaja con el `precio_id` que el dispositivo tenía vigente. Se acepta; si el precio ya estaba archivado se marca y alerta. Lo cobrado es lo cobrado. |
| Evento sin la autorización que su tipo exige | Se rechaza, queda en el log como rechazado (no se pierde) y alerta. |
| Evento con fecha de un día ya cerrado | No toca ese día: entra en el día siguiente marcado "llegó después del cierre" y alerta. El cierre muestra antes qué dispositivos tienen bandeja pendiente o hace cuánto no reportan. |

### 2.5 PIN de operador y autorizaciones sin red

- Un **dispositivo** se registra una vez con una cuenta (sesión de 400 días). Sobre ese dispositivo, cada persona se identifica con su PIN; cada evento lleva `operador_id`.
- Para validar PIN sin red el dispositivo necesita el hash. Un PIN de 6 dígitos con su hash a mano se rompe por fuerza bruta, así que: **el PIN no sirve para entrar al sistema**, sólo identifica a alguien dentro de un dispositivo ya registrado; los hashes bajan sólo a dispositivos registrados; 5 PIN fallidos bloquean al operador en ese dispositivo y generan evento; cambiar un PIN o dar de baja un dispositivo invalida lo descargado.
- Una autorización es un evento con `autorizado_por` + `motivo_id` + texto opcional. El servidor no puede re-verificar el PIN, pero sí verifica que el que autorizó tuviera, en ese momento, un rol que puede autorizar esa acción.

---

## 3. Modelo de datos (servidor)

### 3.1 El log

`eventos` — `id uuid` (cliente, PK) · `secuencia bigint` (servidor, única) · `tipo` · `version_esquema` · `agregado_tipo` / `agregado_id` (cuenta, mesa, turno_caja…) · `payload jsonb` · `operador_id` · `autorizado_por_id` · `motivo_id` · `dispositivo_id` · `creado_en_dispositivo` · `recibido_en` · `resultado` (aceptado/rechazado) · `motivo_rechazo` · `dia_operativo_id`.

Inmutable en la base, no sólo en el código: el rol de la app no tiene `UPDATE`/`DELETE` sobre la tabla y un trigger lo rechaza igual. Una corrección es otro evento que referencia al original.

### 3.2 Proyecciones (derivadas, reconstruibles)

`cuentas`, `items_cuenta`, `cobros`, `pagos_cobro`, `turnos_caja`, `estado_mesas`. Se actualizan en la misma transacción que acepta el evento y se pueden tirar y reconstruir desde el log. Los reportes leen de acá.

### 3.3 Catálogo y configuración (CRUD con auditoría)

- Salón: `sectores`, `elementos_plano` (forma, posición, rotación, si es operable), `mesas` (número, capacidad, elemento).
- Carta: `categorias`, `productos`, `precios_producto` (vigente_desde / archivado_en — nunca se edita), `grupos_modificador`, `modificadores` (con su precio también versionado), `estaciones`.
- Control: `medios_pago`, `motivos` (por tipo de acción), `reglas_autorizacion` (acción → roles que autorizan, umbrales), `umbrales_alerta`.
- Identidad: tablas de better-auth, `roles`, `pines_operador` (hash), `dispositivos`.

### 3.4 Stock

`insumos` (unidad de uso, stock mínimo) · `unidades_compra` (conversión) · `depositos` · `recetas` + `lineas_receta` (versionadas, con rendimiento/merma; una línea apunta a insumo o a sub-receta) · `costos_insumo` (historial, promedio ponderado) · `proveedores` · `compras` + `lineas_compra` · `movimientos_stock` (append-only; tipo: `venta_teorica`, `compra`, `produccion_salida`, `produccion_entrada`, `transferencia`, `merma`, `vencimiento`, `comida_personal`, `ajuste_conteo`) · `conteos` + `lineas_conteo` (ciego: la cantidad teórica se fija al cerrar el conteo, no se muestra al cargarlo).

El consumo teórico lo genera el servidor al aceptar un `item_enviado_cocina` (no el dispositivo), con la versión de receta vigente en ese momento.

### 3.5 Control

`dias_operativos` (abierto/cerrado, quién cerró, totales congelados) · `alertas` · `auditoria` (acciones de administración fuera del log de salón: usuarios, roles, catálogo, acciones de soporte — quién, sobre qué, antes/después).

---

## 4. Estructura del repo

```
app/
  (acceso)/            login y recuperación (Acceso)
  (app)/layout.tsx     CartelPago + CartelNuevaVersion + Marco
  (app)/salon/         mapa (inicio), cuenta de mesa
  (app)/cocina/        KDS por estación
  (app)/caja/          mostrador con Isla
  (app)/carta/ stock/ compras/ recetas/ control/ reportes/ usuarios/
  api/sync/            eventos, vivo
  api/salud/
components/            el sistema de diseño copiado tal cual + componentes propios
dominio/               puro: esquemas Zod de eventos, reductores, permisos, reglas
  eventos/  reductores/  permisos.ts  dinero.ts (centavos enteros)
local/                 cliente: Dexie, bandeja, motor de sync, hooks de estado
servidor/              acceso a datos (Drizzle), aceptación de eventos, proyecciones, alertas
db/                    esquema Drizzle, migraciones, seed
lib/                   servicio-belay, periodos, cierre-fondo, modal-url, sesion
public/sw.js, manifest.json
belay/docker-compose.extra.yml   Postgres en red `interna`
```

Montos siempre en **centavos enteros** (`bigint`), en la base, en los eventos y en los cálculos; se formatean al mostrar.

**Monolito.** Un único servicio `app` + Postgres. Se separa sólo:
- facturación ARCA, si aplica — worker con la misma imagen (`image: ${APP_IMAGEN}`) que toma cobros de una cola en Postgres, para que un ARCA caído no frene un cobro;
- el nodo local, si se decide — no es un microservicio del VPS sino un despliegue en el restaurante del mismo relé.

---

## 5. Flujos clave

- **Abrir mesa y pedir:** toque en mesa libre → modal con mozo y comensales → `cuenta_abierta` → carta con búsqueda y modificadores → `item_agregado` (borrador, se puede quitar) → "Enviar" → `items_enviados_cocina {estacion}`. Desde ahí un ítem sólo se anula con PIN de encargado.
- **Cocina:** el KDS de cada estación reduce los eventos de envío/anulación de su estación; `comanda_en_preparacion`, `comanda_lista`. Una anulación posterior al envío aparece en el KDS tachada, no desaparece.
- **Precuenta y cobro:** `precuenta_emitida {total}` → cualquier evento posterior sobre esa cuenta pide autorización y queda marcado → caja: `cobro_registrado {pagos[], propina, division}` → `cuenta_cerrada`. Cerrar sin cobrar = autorización.
- **Caja:** `turno_abierto {fondo}` → retiros/egresos con autorización → `arqueo_declarado {por medio}` sin mostrar el esperado → el servidor calcula la diferencia → `turno_cerrado`.
- **Cierre del día** (con conexión): lista de dispositivos con bandeja pendiente → confirma → congela totales del día.
- **Stock:** compra → movimientos + costo promedio; conteo ciego → diferencia contra teórico → ajuste como movimiento.

---

## 6. Permisos

Un único módulo `dominio/permisos.ts`: `puede(rol, accion)` y `requiereAutorizacion(accion, contexto)` (contexto: hay precuenta, monto del descuento contra umbral, horario). Lo usan la UI (para no ofrecer lo que no se puede), el dispositivo al generar el evento y el servidor al aceptarlo. Las reglas configurables (quién autoriza qué, umbrales) bajan con el catálogo.

| Rol | Ve / opera | Autoriza |
|---|---|---|
| Dueño (admin) | todo | todo |
| Encargado | salón, cocina, caja, stock, alertas | anulaciones, descuentos, cortesías, reaperturas, cambios de medio de pago |
| Cajero | caja, cuentas, precuentas | — |
| Mozo | mapa, sus mesas, carga de pedidos | — |
| Cocina | KDS de su estación | — |
| Compras/stock | insumos, compras, producción, movimientos, conteos | — |
| Soporte | como el prompt base, sección 3 | |

---

## 7. Fases

Cada fase termina desplegada en `restaurante.belay.agency` y probada; la siguiente arranca después de tu revisión.

| Fase | Entrega | Cómo se prueba |
|---|---|---|
| **0. Andamio** | Next 16 + Tailwind con el sistema de diseño, Docker multi-stage, compose extra con Postgres en `interna`, Drizzle, healthcheck, ESLint ignorando `.claude/**`, primer deploy | el dominio responde con el certificado bien |
| **1. Base** | login y recuperación, usuarios con soporte, Configuración (General + Facturación), carteles de pago y versión, 423 en `lib/sesion.ts`; log de eventos inmutable, motor de sync, Dexie, SW/manifest, registro de dispositivos, PIN, módulo de permisos | dos navegadores: uno offline genera eventos, vuelve, el otro los ve en vivo; reenviar no duplica; DevTools offline abre la app |
| **2. Salón** | editor de plano (sectores, mesas, elementos fijos, rotación, imán) y mapa en operación; abrir mesa, cargar ítems, operaciones de mesa, precuenta | en un celular a 320px y en tablet |
| **3. Cocina** | ruteo por estación, KDS | |
| **4. Caja** | Isla con atajos, división, pagos mixtos, propina, turno, arqueo ciego, cierre del día | |
| **5. Stock** | insumos, recetas con sub-recetas y costo, compras, producción, movimientos, conteos ciegos, consumo teórico | |
| **6. Control** | autorizaciones configurables, alertas, tablero "dónde se va la plata", rankings | |
| **7. Reportes** | reportes de ventas/rentabilidad/compras/stock, exportación Excel y PDF, integraciones que se confirmen | |

Las fases 0 y 1 son las largas y no muestran nada del restaurante todavía: es a propósito, el pedido dice que la base no se agrega al final.

---

## 8. Supuestos

- Nombre, logo y color de marca: sin definir; se usa el acento por defecto del sistema de diseño.
- Un solo local. El modelo lleva `local_id` desde el día uno para no migrar si aparece un segundo.
- Medios de pago: efectivo, débito, crédito, transferencia, QR — configurables, sin integración con terminales.
- Sin delivery, sin reservas online, sin ARCA hasta que se confirme.
- Estaciones: cocina, parrilla, barra, postres — configurables.
- Carga inicial de carta, insumos y recetas: por planilla importable (formato a definir en la fase 5 según cómo lo lleve hoy el cliente).
- Facturación (Configuración) la ve sólo el dueño: la relación con Belay no es de cada mozo.
- Administrar usuarios es del dueño (y soporte). El encargado ve la lista, sin soporte, y no la edita.
- Cambiar el email o la contraseña de otra cuenta sólo lo hace soporte (el código va a la agencia). Un dueño le manda a otro el código de recuperación a su casilla.
- Tipografía: Inter, hasta que la agencia indique otra.

---

## 9. Estado

**Fase 0** — hecha.

**Fase 1** — hecha, sin desplegar. Probado:
- Login con contador de intentos por dirección (exista o no la cuenta) y bloqueo a los 5; sesión de 400 días deslizante.
- Recuperación por código y cambio de credenciales: código hasheado, 15 minutos, 5 intentos; soporte sobre otra cuenta → el código va a `info@belay.agency` y el aviso a la persona; todo cambio de contraseña cierra todas las sesiones; cada acción queda en `auditoria`.
- Log de eventos inmutable en la base (trigger), recepción idempotente, rechazados guardados con motivo y no repartidos, dispositivo sin registrar → 403, canal en vivo por LISTEN/NOTIFY.

**Fase 2** — hecha, sin desplegar. Probado en el build de producción:
- Carta: estaciones, categorías, productos con precio versionado (cambiarlo archiva el anterior) y grupos de modificadores.
- Editor del plano (Konva): sectores, mesas redondas y rectangulares, paredes, barra, columnas, puerta y cocina; arrastrar con imán a la grilla, girar, redimensionar; guardado con auditoría y mesas archivadas, nunca borradas.
- Salón: el mapa con el estado de cada mesa (libre, ocupada, pidió la cuenta, precuenta, dos cuentas), abrir mesa con mozo y comensales, cargar desde la carta con modificadores obligatorios, enviar a cocina, precuenta imprimible, mover, unir, pasar ítems y cambiar de mozo. Cuentas de mostrador y para llevar.
- El servidor rechaza un ítem cuyo precio no coincide con la carta.
- A 320 px de ancho.

Pendiente de fases siguientes: reservas (sin módulo todavía), cierre de la cuenta (cobro, fase 4).

**Fase 3** — hecha, sin desplegar. Pantalla de cocina (`/cocina`) por estación, guardada en el dispositivo: cada envío se parte por estación, se marca «Empezar» y «Listo», y lo listo se puede reabrir. Borde ámbar a los 10 minutos, rojo a los 20 (demorada), y la mesa se pinta de rojo en el plano. Suena un aviso cuando entra una comanda. El mozo ve cada ítem «Listo» en la cuenta. Un usuario de cocina entra directo a su pantalla. Impresoras térmicas: quedan para cuando haya nodo local (decisión 0.1).

**Fase 4** — hecha, sin desplegar. Caja (`/caja`) con la isla de atajos (C cobrar, D dividir, P precuenta, R retiro, A/X abrir y cerrar caja). Cobro total, en partes iguales o por ítem, con varios medios, propina aparte y vuelto; si salda, la cuenta se cierra y la mesa queda libre. Turno con fondo inicial, retiros y egresos con motivo, y arqueo ciego: quien cierra declara sin ver lo esperado, y la diferencia la ve el encargado o el dueño. Cierre del día (`/caja/cierre`, con conexión): exige caja y cuentas cerradas, congela los totales y avisa qué dispositivos no sincronizaron; lo que llegue después con hora de un día cerrado entra en el siguiente, marcado. El servidor no deja abrir dos cajas a la vez ni imputar nada a una cerrada. Medios de pago: efectivo, débito, crédito, transferencia y QR (supuesto, se editan más adelante). Probado de punta a punta en el build de producción.

**Fase 5** — hecha, sin desplegar. Stock (`/stock`, con conexión): insumos en g, ml o unidades con sus presentaciones de compra, depósitos (supuesto: cocina, cámara, barra y bodega; la cocina es de donde sale lo vendido), proveedores. Recetas con merma y rendimiento, versionadas como los precios, con costo teórico, food cost y margen de cada plato; preparaciones intermedias con su receta, que se elaboran con una producción. Compras que suman stock y recalculan el costo promedio ponderado. Bajas con motivo (merma, vencimiento, comida del personal, cada una por separado) y transferencias entre depósitos. Consumo teórico automático al enviar a cocina, con la receta vigente en ese momento y una sola vez por ítem. Conteos ciegos, totales o parciales: quien cuenta no ve el teórico; al cerrar se ajusta el stock y queda la diferencia. Teórico vs. real por período. Los movimientos de stock tampoco se modifican ni se borran. Probado con `npm run test:integracion` contra la base y en pantalla.

**Fase 6** — hecha, sin desplegar. Autorizaciones por PIN de un rol superior con motivo de una lista (y texto opcional) para: anular un ítem enviado, descuentos, cortesías, cambiar un precio, reabrir una cuenta, cambiar el medio de pago de un cobro, modificar una cuenta después de la precuenta, cerrar sin cobrar y retiros o egresos de caja. Funciona sin red con los PIN y motivos del catálogo; el servidor vuelve a verificar quién autorizó, con qué rol y qué motivo, y rechaza lo que no cumple. Nada se borra: lo anulado queda tachado en la cuenta y en cocina. Control (`/control`, el dueño): «dónde se va la plata» por período con cada rubro en plata y cantidad, rankings por persona (quién hizo, quién autorizó, en las mesas de qué mozo, diferencias de caja por cajero, consumo por comensal) y el detalle de cada corrección. Alertas calculadas del log (anulación tras precuenta o fuera de horario, cerrada sin cobrar, descuento alto, diferencia de caja o de conteo, cuenta abierta hace demasiado) que se marcan como vistas. Configuración de quién autoriza cada acción, de los motivos y de los umbrales (supuestos: 3 h, 15 %, $1.000 de caja, $5.000 de conteo, de 11 a 2). Probado con `npm run test:integracion` y en pantalla.

**Fase 7** — hecha, sin desplegar. Reportes (`/reportes`, dueño y encargado) por período: ventas, propinas, cuentas, ticket promedio y consumo por comensal; ventas por hora, por día, por día de la semana, por categoría, por plato y por mozo; platos que más y menos dejan (venta contra costo teórico de la receta); compras por proveedor; valorización del stock. Exportación a Excel (una hoja por reporte, la plata como número) y a PDF.

## 10. Integraciones pendientes de relevar

No se construyeron: dependen de respuestas del cliente.

- **Facturación electrónica (ARCA).** Si la necesita: un worker aparte con la misma imagen (`image: ${APP_IMAGEN}` en `belay/docker-compose.extra.yml`) que toma los cobros de una cola en Postgres y pide el CAE. El cobro nunca espera a ARCA: si no responde, queda en la cola y se reintenta. Hace falta: CUIT, punto de venta, certificado y tipo de comprobante.
- **Impresoras térmicas** (comandas por estación y precuentas). Una página web no le puede mandar ESC/POS a una impresora de red: hace falta el nodo local del restaurante (decisión 0.1), que reciba los eventos y los imprima. Hoy la precuenta se imprime con el diálogo del navegador.
- **Cobro con QR o terminal** (Mercado Pago u otro). Hoy el medio se registra a mano. Integrarlo es leer el pago confirmado y registrar el cobro con su referencia.
- **Reservas online.** Sin módulo, y por eso el plano todavía no muestra mesas reservadas.
- **Delivery.** A confirmar con el cliente.

Sin verificar todavía:
- El modal de autorización por PIN en pantalla (la regla y la validación del servidor tienen tests).
- La carga de formularios de stock de punta a punta en pantalla (la lógica está cubierta por el test de integración).
- El aviso sonoro de cocina (el navegador de esta sesión no reproduce audio).
- El service worker: el navegador embebido de esta sesión no deja registrar ninguno. Probar en Chrome: que se registre, que la app abra sin red y que lo cargado sin red salga al volver.
- La prueba con DevTools en modo offline (el panel del navegador de esta sesión no lo permite): abrir la app sin red, cambiar de operador y ver que la bandeja se vacía al volver.
- El cambio de operador por PIN de punta a punta en pantalla (el reductor y el PIN tienen tests).
