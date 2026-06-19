# Presupuestos de Aberturas

App web para generar presupuestos de aberturas de aluminio (ventanas y puertas). Cliente 100% estático (HTML/CSS/JS vanilla), con login protegido por una función serverless de Vercel.

## Estructura

```
index.html          → pantalla de login
app.html             → app principal (3 paneles + vista de presupuesto)
css/style.css        → estilos (incluye hoja @media print para el PDF)
js/login.js          → lógica del formulario de login
js/gallery-data.js   → listas editables: tipos de abertura, tipos de cierre, galería de imágenes
js/app.js            → lógica principal de la app (paneles, ítems, presupuesto, localStorage)
img/tipologias/       → galería fija de imágenes (SVG) por tipo de abertura
api/login.js         → función serverless: valida usuario/clave contra variables de entorno
api/check.js         → función serverless: valida la cookie de sesión
api/logout.js        → función serverless: borra la cookie de sesión
```

No hay backend de datos: todo lo que el usuario carga (presupuestos, ítems) se guarda en `localStorage` del navegador.

## Cómo editar las listas (tipos de abertura, cierres, imágenes)

Todo está centralizado en [`js/gallery-data.js`](js/gallery-data.js):

- `TIPOS_ABERTURA`: lista de tipos que aparecen en el select del Panel 2.
- `TIPOS_CIERRE`: lista de tipos de cierre.
- `GALERIA`: array de imágenes disponibles, cada una con `tipo` (debe coincidir con un valor de `TIPOS_ABERTURA`), `file` (ruta del SVG/PNG) y `label`.

Para agregar una imagen nueva: copiá el archivo a `img/tipologias/` y agregá una entrada en `GALERIA`.

## Login

El login NO tiene usuario/contraseña escritos en el código. Se validan en el servidor (función serverless `api/login.js`) contra dos variables de entorno:

- `USUARIO`
- `CLAVE`

Si coinciden, el servidor responde con una cookie `httpOnly` firmada (HMAC) que dura 8 horas. `app.html` verifica esa cookie contra `api/check.js` antes de mostrar la app; si no es válida, redirige a `index.html`. El botón "Cerrar sesión" llama a `api/logout.js`, que borra la cookie.

Variable opcional `SESSION_SECRET`: se usa para firmar la cookie. Si no la definís, se usa `USUARIO:CLAVE` como secreto (funciona, pero es más prolijo definir una propia, larga y aleatoria).

## Deploy en Vercel

1. Subí esta carpeta a un repositorio de GitHub (o usá `vercel` CLI directamente desde esta carpeta).
2. En [vercel.com](https://vercel.com), hacé **Add New → Project** e importá el repositorio (o ejecutá `vercel` desde la terminal en esta carpeta).
3. Vercel detecta automáticamente que es un proyecto estático con funciones en `/api` — no requiere configuración de build especial.
4. Antes (o después) del primer deploy, configurá las variables de entorno en **Project Settings → Environment Variables**:
   - `USUARIO` = el usuario que vas a usar para entrar
   - `CLAVE` = la contraseña
   - `SESSION_SECRET` (opcional pero recomendado) = una cadena larga y aleatoria
5. Hacé deploy (o redeploy si ya habías importado el proyecto antes de configurar las variables).
6. Entrá a la URL que te da Vercel, vas a ver la pantalla de login. Ingresá con el `USUARIO`/`CLAVE` que configuraste.

### Probar en local con Vercel CLI

```bash
npm i -g vercel
vercel dev
```

Te va a pedir crear un archivo `.env.local` (podés copiar `.env.example` y completarlo) para que las funciones de `/api` tengan acceso a `USUARIO`, `CLAVE` y `SESSION_SECRET` en desarrollo. La primera vez te va a pedir loguearte con tu cuenta de Vercel.

### Alternativa sin Vercel CLI

Si no querés loguearte con la Vercel CLI, hay un servidor mínimo incluido (`dev-server.js`) que simula las funciones de `/api` en local:

```bash
copy .env.example .env.local   # completá USUARIO y CLAVE
npm run dev
```

Abrí `http://localhost:3344`. Este servidor es solo para pruebas locales, no se usa en producción (en Vercel se usan las funciones de `/api` reales).

## Uso de la app

1. **Panel 1 — Datos generales**: completá cliente, contacto, número de presupuesto (autoincremental, editable), validez y fecha.
2. **Panel 2 — Configuración de la abertura**: elegí tipo, cierre, cajón/mosquitero, medidas, cantidad e imagen (se autoselecciona según el tipo, pero podés elegir otra de la galería).
3. **Panel 3 — Lista de ítems**: cada "Agregar al presupuesto" suma una fila; se puede editar o eliminar cualquier ítem.
4. **Generar presupuesto**: valida los campos obligatorios (cliente, número, al menos un ítem) y muestra la vista final, lista para completar el precio a mano y guardar/imprimir.
5. **Guardar presupuesto**: lo persiste en `localStorage`. Podés recuperarlo después desde "Presupuestos guardados" en la barra superior.
6. **Imprimir / Guardar PDF**: usa `window.print()` con una hoja de estilos pensada para A4, ocultando toda la interfaz y dejando solo el presupuesto.
