// ---------------------------------------------------------------------------
// Backup automático: manda por Telegram el respaldo de los datos de la app.
//
// Los datos viven en un solo disco de Railway. Esto los saca de ahí una vez por
// semana, para que si el disco falla no se pierda nada.
//
// Se le pide el respaldo a la propia app (/api/backup), así siempre incluye lo
// mismo que el botón "Descargar backup" de la pantalla de configuración.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { cookieDeSesion } = require('./generarPdf');

const TOKEN = process.env.TELEGRAM_TOKEN;

// A quién se le manda. Por defecto, el primer ID autorizado.
const DESTINO = (
  process.env.TELEGRAM_BACKUP_CHAT ||
  (process.env.TELEGRAM_ALLOWED || '').split(',')[0] ||
  ''
).trim();

const DIAS = Number(process.env.BACKUP_DIAS || 7);
const UN_DIA = 24 * 60 * 60 * 1000;
// Cada cuánto se fija si ya toca (no es cuándo manda: eso lo decide DIAS).
const CADA_CUANTO_REVISA = 6 * 60 * 60 * 1000;

function archivoMarca(dataDir) {
  return path.join(dataDir, 'ultimo-backup.txt');
}

function leerUltimo(dataDir) {
  try {
    return new Date(fs.readFileSync(archivoMarca(dataDir), 'utf8').trim()).getTime() || 0;
  } catch (e) {
    return 0; // nunca se hizo uno
  }
}

function guardarUltimo(dataDir) {
  try {
    fs.writeFileSync(archivoMarca(dataDir), new Date().toISOString(), 'utf8');
  } catch (e) {
    console.error('[backup] no pude guardar la marca de tiempo:', e.message);
  }
}

async function pedirBackup(baseUrl, secret) {
  const r = await fetch(new URL('/api/backup', baseUrl), {
    headers: { Cookie: `session=${cookieDeSesion(secret)}` },
  });
  if (!r.ok) throw new Error(`la app respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function mandarPorTelegram(buf, nombre, texto) {
  const form = new FormData();
  form.append('chat_id', DESTINO);
  form.append('document', new Blob([buf], { type: 'application/json' }), nombre);
  form.append('caption', texto);
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram: ${j.description}`);
}

// Arma el respaldo y lo manda. Devuelve un resumen para poder avisar por chat.
async function enviarBackup({ baseUrl, secret, manual = false }) {
  if (!TOKEN) throw new Error('TELEGRAM_TOKEN no configurado.');
  if (!DESTINO) throw new Error('No hay a quién mandarle el backup (TELEGRAM_ALLOWED vacío).');

  const buf = await pedirBackup(baseUrl, secret);
  const fecha = new Date().toISOString().slice(0, 10);
  const kb = Math.max(1, Math.round(buf.length / 1024));

  // Contamos lo que lleva adentro para que el mensaje diga algo útil.
  let detalle = '';
  try {
    const datos = JSON.parse(buf.toString('utf8'));
    const clientes = (datos.clientes || []).length;
    const presupuestos = (datos.presupuestos || []).length;
    detalle = `\n${clientes} cliente(s) · ${presupuestos} presupuesto(s)`;
  } catch (e) { /* si no se puede leer, no pasa nada */ }

  const titulo = manual ? '📦 Backup a pedido' : '📦 Backup automático semanal';
  await mandarPorTelegram(
    buf,
    `backup-cerramientos-${fecha}.json`,
    `${titulo}\nDatos de la app al ${fecha} (${kb} KB).${detalle}\n\nGuardalo: si algún día falla el servidor, con este archivo se recupera todo.`
  );

  return { fecha, kb };
}

function iniciarBackupAutomatico({ baseUrl, secret, dataDir }) {
  if (!TOKEN || !DESTINO) {
    console.log('[backup] sin TELEGRAM_TOKEN o sin destinatario: backup automático apagado.');
    return;
  }

  async function revisar() {
    const ultimo = leerUltimo(dataDir);
    const pasaron = Date.now() - ultimo;
    if (ultimo && pasaron < DIAS * UN_DIA) return;

    try {
      const { kb } = await enviarBackup({ baseUrl, secret });
      guardarUltimo(dataDir);
      console.log(`[backup] enviado por Telegram (${kb} KB).`);
    } catch (e) {
      // No guardamos la marca: se reintenta en la próxima revisión.
      console.error('[backup] no pude enviarlo:', e.message);
    }
  }

  // Primera revisión al ratito de arrancar (que el servidor termine de levantar).
  setTimeout(revisar, 30 * 1000).unref();
  setInterval(revisar, CADA_CUANTO_REVISA).unref();

  console.log(`[backup] automático activo: cada ${DIAS} día(s), a Telegram.`);
}

module.exports = { iniciarBackupAutomatico, enviarBackup };
