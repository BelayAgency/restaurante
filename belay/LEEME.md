# Cómo se despliega este sistema

Este archivo lo escribió el panel de Belay. Describe el contrato del deploy: qué hace solo, qué
tenés que hacer vos y dónde mirar cuando algo no anda.

## Qué pasa cuando pusheás a `main`

1. GitHub Actions construye la imagen con el `Dockerfile` de la raíz.
2. La imagen viaja por SSH al servidor. No hay registry: nada de esto necesita credenciales
   guardadas en la máquina del cliente.
3. En el servidor se levanta con `docker compose`, con la app aislada del resto de los sistemas que
   comparten ese servidor.
4. Si el container no se sostiene, el deploy vuelve solo a la versión anterior y falla con los logs
   a la vista.

## Lo que el deploy necesita de vos

- **Un `Dockerfile` en la raíz** que levante la app escuchando en el puerto que llega por la
  variable de entorno `PORT`. Si el panel dejó uno de andamio, editalo o reemplazalo.
- **Los secretos de la aplicación**, en el servidor, en `~/app/.env.app` del usuario de esta app.
  El deploy nunca pisa ese archivo. Las variables de infraestructura (dominio, puerto, imagen) van
  en `~/app/.env` y esas sí las reescribe en cada deploy.

## Si el sistema es más que un container

Worker, base de datos, cache: van en `belay/docker-compose.extra.yml`, que creás vos en este repo.
Se levanta junto con el compose estándar, con el mismo proyecto de compose, así que los servicios se
ven entre sí por su nombre (`db`, `worker`) y los volúmenes sobreviven a los deploys.

Un servicio de ahí puede:

- usar una imagen pública (`postgres:18`, `redis:7`) — la baja el servidor;
- reusar la imagen de la app con otro comando — `image: ${APP_IMAGEN}`, que es lo que hace un worker;
- construirse desde este repo con `build:` — el workflow la construye y la manda junto con la de la app.
  En ese caso **declarale un `image:` con nombre fijo** (`image: <slug>-<servicio>:actual`). Sin eso
  compose deriva el nombre del proyecto de compose, que no es el mismo en Actions que en el servidor:
  se construiría una imagen y se buscaría otra. El deploy se niega a arrancar si falta.

Ese archivo es tuyo: el panel no lo toca ni lo pisa.

## Lo que NO hay que tocar

`.github/workflows/deploy.yml` y `belay/docker-compose.yml` los mantiene el panel y los pisa cuando
se actualiza el estándar. Si algo de ahí te queda corto —más memoria, otro puerto, otro healthcheck—
se cambia desde el panel, no acá.

## El deploy puede negarse a desplegar

Antes de mandar nada, el workflow limpia las imágenes viejas de este sistema en
el servidor —las tagueadas y las que quedaron sin nombre al ser reemplazadas— y
mide el espacio libre. Si no alcanza para la imagen nueva, **corta
ahí**: no transfiere, no carga, y la versión que está corriendo sigue sirviendo
sin enterarse.

El orden es la lección entera y está aprendida a los golpes. Si se limpiara
recién al final, un deploy que falla dejaría la imagen cargada ocupando lugar, el
siguiente arrancaría con menos espacio, volvería a fallar, y cada intento
empeoraría al anterior hasta llenar el disco y tumbar a todos los sistemas de esa
máquina.

Si te corta por espacio, el log dice cuánto hay y cuánto hace falta. Casi siempre
la salida no es liberar a mano sino **achicar la imagen**: viaja entera por SSH en
cada push y el servidor guarda dos versiones, así que cada 100 MB de más se pagan
dos veces y en cada deploy.

## Cuando falla

| Síntoma | Dónde mirar |
| --- | --- |
| Falla antes de construir | Faltan variables o el secret: el panel los recarga desde *Repositorio*. |
| Falla construyendo | Es tu `Dockerfile` o tu build. El log de Actions dice dónde. |
| `Sin espacio` en *Hacer lugar en el servidor* | No es un error del sistema: es la guarda de disco. Ver arriba. |
| Construye pero no arranca | El deploy imprime las últimas líneas del container y vuelve a la versión anterior. Casi siempre falta algo en `.env.app`. |
| Arranca pero el dominio no responde | Ya no es el deploy: es DNS, el proxy o el certificado. |
| `Permission denied (publickey)` | La clave del sistema no está autorizada en el servidor. Se resuelve desde el panel. |
