# Presupuestos de Aberturas

App web para generar presupuestos de aberturas de aluminio (ventanas y puertas). Front-end HTML/CSS/JS vanilla + un servidor Node/Express que sirve la app, valida el login y guarda la configuración (tipos, colores, imágenes) en un volumen persistente. Pensada para desplegarse en **Railway**.

## Estructura

```
index.html          → pantalla de login
app.html             → app principal (3 paneles + vista de presupuesto + Configuración)
css/style.css        → estilos
js/login.js          → lógica del formulario de login
js/config-data.js    → acceso a la API de configuración (carga/guarda/sube imágenes)
js/app.js            → lógica principal de la app (paneles, ítems, presupuesto, configuración)
server.js            → servidor Express: login, API de configuración, subida de imágenes y archivos estáticos
package.json         → dependencias (express, multer) y script de arranque
```

No hay base de datos relacional: la configuración, los clientes y los presupuestos guardados se guardan como archivos JSON (`config.json`, `clientes.json`, `presupuestos.json`) y las imágenes subidas como archivos sueltos, todo dentro de una carpeta de datos persistente (`DATA_DIR`). Así, **todos los navegadores que entren a la app ven lo mismo** (clientes, presupuestos guardados, configuración e imágenes), a diferencia de una versión que use solo `localStorage`, que sería por navegador.

## Cómo administrar tipos, colores, líneas e imágenes

Desde la app, botón **"Configuración"** en la barra superior (no se edita código):

- **Datos de la empresa**: nombre, logo, usuario/Instagram, email y teléfonos — se muestran en el encabezado del presupuesto.
- **Colores** y **Líneas**: listas simples, solo agregar/eliminar.
- **Tipos de abertura**: lista editable + subís una imagen para cada combinación tipo+color+mosquitero (con/sin).
- **Tipos de manija**: lista editable + subís una imagen para cada combinación manija+color.
- **Tipos de vidrio**: lista editable + subís una imagen por tipo de vidrio.

Las imágenes se suben como archivo (PNG/JPG/SVG) al servidor (`POST /api/upload`) y quedan disponibles para cualquiera que entre a la app. Si todavía no subiste una imagen para una combinación, se muestra un placeholder genérico hasta que la cargues.

## Login

El login NO tiene usuario/contraseña escritos en el código. Se validan en el servidor contra dos variables de entorno:

- `USUARIO`
- `CLAVE`

Si coinciden, el servidor responde con una cookie `httpOnly` firmada (HMAC) que dura 8 horas. `app.html` verifica esa cookie contra `GET /api/check` antes de mostrar la app; si no es válida, redirige a `index.html`. El botón "Cerrar sesión" llama a `POST /api/logout`, que borra la cookie. Las rutas `GET/POST /api/config` y `POST /api/upload` también exigen sesión válida.

Variable opcional `SESSION_SECRET`: se usa para firmar la cookie. Si no la definís, se usa `USUARIO:CLAVE` como secreto (funciona, pero es más prolijo definir una propia, larga y aleatoria).

## Deploy en Railway

1. Subí esta carpeta a un repositorio de GitHub.
2. En [railway.app](https://railway.app), creá un proyecto nuevo → **Deploy from GitHub repo** → elegí este repositorio.
3. Railway detecta el `package.json` y corre `npm install` + `npm start` (`node server.js`) automáticamente.
4. **Agregá un Volume** (Railway → tu servicio → pestaña *Volumes* → *Add Volume*). Montalo, por ejemplo, en `/data`.
5. Configurá las variables de entorno del servicio (pestaña *Variables*):
   - `USUARIO` = el usuario para entrar
   - `CLAVE` = la contraseña
   - `SESSION_SECRET` (opcional pero recomendado) = una cadena larga y aleatoria
   - `DATA_DIR` = `/data` (la misma ruta donde montaste el Volume — así la configuración y las imágenes sobreviven a cada redeploy)
6. Railway te da una URL pública (`*.up.railway.app`) o podés conectar un dominio propio. Entrá, vas a ver la pantalla de login.

Sin `DATA_DIR` apuntando a un Volume montado, los datos se guardarían en el filesystem efímero del contenedor y **se perderían en cada redeploy** — no te olvides de ese paso.

### Probar en local

```bash
npm install
copy .env.example .env.local   # completá USUARIO y CLAVE
npm run dev
```

Abrí `http://localhost:3344`. En local, si no definís `DATA_DIR`, los datos se guardan en una carpeta `data/` dentro del proyecto (ignorada por git).

## Uso de la app

1. **Panel 1 — Datos generales**: completá cliente, contacto, número de presupuesto (autoincremental, editable), validez y fecha.
2. **Panel 2 — Configuración de la abertura**: elegí tipo, color, línea, manija (con su color)/vidrio (opcionales), cajón/mosquitero, medidas y cantidad. Las imágenes se muestran solas según lo que asignaste en Configuración.
3. **Panel 3 — Lista de ítems**: cada "Agregar al presupuesto" suma una fila; se puede editar o eliminar cualquier ítem.
4. **Generar presupuesto**: valida los campos obligatorios (cliente, número, al menos un ítem) y muestra la vista final — cada unidad de cada ítem aparece en su propia tarjeta — lista para completar el precio a mano y guardar/descargar.
5. **Guardar presupuesto**: lo persiste en el servidor (compartido entre dispositivos). Podés recuperarlo después desde "Presupuestos guardados" en la barra lateral, o desde la ficha del cliente en "Clientes" si el presupuesto tiene un cliente registrado asignado.
6. **Clientes**: sección para registrar clientes (nombre, apellido, teléfono, email). Al elegir un "Cliente registrado" en el Panel 1, se autocompletan nombre y teléfono. Cada presupuesto guardado con un cliente asignado queda visible en la ficha de ese cliente.
7. **Vista previa / Descargar PDF**: genera el PDF en el navegador (con [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://github.com/niklasvh/html2canvas), cargados desde CDN) y lo muestra en una vista previa antes de descargarlo como archivo `.pdf`.
