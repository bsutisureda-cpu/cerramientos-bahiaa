// ---------------------------------------------------------------------------
// Bot de Telegram: recibe el Excel de Winmaker y devuelve el PDF del presupuesto.
//
//   Excel -> leer -> traducir -> (si hay dudas, preguntar) -> PDF -> devolver
//
// Habla con la API de Telegram directamente (sin librerías) y escucha con
// long polling, así no hace falta configurar webhooks ni URLs públicas.
// ---------------------------------------------------------------------------
const { leerArchivo } = require('./parseExcel');
const { traducir, agruparIdenticos } = require('./mapear');
const { generarPdf, cookieDeSesion } = require('./generarPdf');

const TOKEN = process.env.TELEGRAM_TOKEN;
// IDs de Telegram autorizados, separados por coma. Si está vacío, el bot no responde.
const AUTORIZADOS = (process.env.TELEGRAM_ALLOWED || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const API = `https://api.telegram.org/bot${TOKEN}`;

// Conversaciones en curso, una por chat. Se pierden si se reinicia el servidor
// (no pasa nada: se vuelve a mandar el Excel).
const sesiones = new Map();

async function api(metodo, params) {
  const r = await fetch(`${API}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${metodo}: ${j.description}`);
  return j.result;
}

const decir = (chatId, text, extra) => api('sendMessage', { chat_id: chatId, text, ...extra });

async function mandarPdf(chatId, pdf, nombre) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', new Blob([pdf], { type: 'application/pdf' }), nombre);
  const r = await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
  const j = await r.json();
  if (!j.ok) throw new Error(`sendDocument: ${j.description}`);
}

async function bajarArchivo(fileId) {
  const f = await api('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error('No pude descargar el archivo de Telegram.');
  return Buffer.from(await r.arrayBuffer());
}

function autorizado(id) {
  return AUTORIZADOS.includes(String(id));
}

async function leerConfig(baseUrl, secret) {
  const r = await fetch(new URL('/api/config', baseUrl), {
    headers: { Cookie: `session=${cookieDeSesion(secret)}` },
  });
  if (!r.ok) throw new Error('No pude leer la configuración de la app.');
  return r.json();
}

// --- Preguntas ------------------------------------------------------------
async function preguntarSiguiente(chatId, ses) {
  const duda = ses.dudas[ses.i];
  if (!duda) return finalizar(chatId, ses);

  // callback_data tiene un límite chico: mandamos índices, no textos.
  const botones = duda.opciones.slice(0, 12).map((op, k) => [{ text: op, callback_data: `r:${ses.i}:${k}` }]);

  await decir(chatId, `❓ ${duda.pregunta}`, {
    reply_markup: { inline_keyboard: botones },
  });
}

async function finalizar(chatId, ses) {
  sesiones.delete(chatId);

  // Las ventanas idénticas se muestran una sola vez, con la cantidad sumada.
  const antes = ses.items.length;
  const items = agruparIdenticos(ses.items);
  if (items.length < antes) {
    await decir(chatId, `ℹ️ Junté ${antes} ítems en ${items.length}: había repetidos idénticos.`);
  }

  await decir(chatId, '⏳ Armando el presupuesto y generando el PDF...');

  try {
    const { pdf, numero } = await generarPdf({
      panel1: {
        nombre: ses.wm.cliente || 'Sin nombre',
        direccion: ses.wm.direccion || '',
        arquitecto: ses.wm.referencia || '',
        extra: ses.wm.nota || '',
      },
      items,
      guardar: true, // queda registrado en Presupuestos guardados
      baseUrl: ses.baseUrl,
      secret: ses.secret,
    });

    await mandarPdf(chatId, pdf, `presupuesto_${numero}.pdf`);
    await decir(chatId, `✅ Listo. Presupuesto N.º ${numero} (guardado en la app).`);
  } catch (e) {
    await decir(chatId, `❌ No pude generar el PDF: ${e.message}`);
  }
}

// --- Entrada de mensajes --------------------------------------------------
async function onDocumento(chatId, doc, ctx) {
  const nombre = (doc.file_name || '').toLowerCase();
  if (!nombre.endsWith('.xlsx') && !nombre.endsWith('.xls')) {
    return decir(chatId, 'Mandame el Excel del presupuesto (.xlsx) que genera Winmaker.');
  }

  await decir(chatId, '📄 Recibí el Excel, lo estoy leyendo...');

  let wm;
  try {
    wm = await leerArchivo(await bajarArchivo(doc.file_id));
  } catch (e) {
    return decir(chatId, `❌ No pude leer el Excel: ${e.message}`);
  }

  let config;
  try {
    config = await leerConfig(ctx.baseUrl, ctx.secret);
  } catch (e) {
    return decir(chatId, `❌ ${e.message}`);
  }

  const { items, dudas } = traducir(wm, config);
  const ses = { wm, items, dudas, i: 0, baseUrl: ctx.baseUrl, secret: ctx.secret };
  sesiones.set(chatId, ses);

  await decir(
    chatId,
    `Cliente: ${wm.cliente || '—'}\nÍtems: ${items.length}` +
      (dudas.length ? `\n\nNecesito que me aclares ${dudas.length} cosa(s):` : '')
  );

  return preguntarSiguiente(chatId, ses);
}

async function onRespuesta(chatId, data, ses) {
  const [, iStr, kStr] = data.split(':');
  const duda = ses.dudas[Number(iStr)];
  if (!duda) return;

  const valor = duda.opciones[Number(kStr)];
  ses.items[duda.indice][duda.campo] = valor;

  // Si eligió un cierre, el color del cierre sigue al color de la abertura.
  if (duda.campo === 'manija') {
    ses.items[duda.indice].colorManija = valor === 'SIN CIERRE' ? '' : ses.items[duda.indice].color || '';
  }

  await decir(chatId, `✔️ ${duda.codigo}: ${valor}`);
  ses.i++;
  return preguntarSiguiente(chatId, ses);
}

// --- Loop principal -------------------------------------------------------
async function procesar(update, ctx) {
  const msg = update.message;
  const cb = update.callback_query;

  if (cb) {
    const chatId = cb.message.chat.id;
    await api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    if (!autorizado(cb.from.id)) return;
    const ses = sesiones.get(chatId);
    if (!ses) return decir(chatId, 'Se me perdió el hilo. Mandame el Excel de nuevo.');
    if (cb.data.startsWith('r:')) return onRespuesta(chatId, cb.data, ses);
    return;
  }

  if (!msg) return;
  const chatId = msg.chat.id;

  if (!autorizado(msg.from.id)) {
    console.log('[bot] mensaje de un ID no autorizado:', msg.from.id);
    return decir(chatId, `No estás autorizado a usar este bot. Tu ID es ${msg.from.id}.`);
  }

  if (msg.document) return onDocumento(chatId, msg.document, ctx);

  if (msg.text && msg.text.startsWith('/start')) {
    return decir(
      chatId,
      '👋 Mandame el Excel de Winmaker y te devuelvo el PDF del presupuesto.\n\n' +
        'Comandos:\n' +
        '/backup — respaldo de los datos\n' +
        '/seguimiento — presupuestos que siguen sin respuesta'
    );
  }

  if (msg.text && msg.text.startsWith('/backup')) {
    await decir(chatId, '📦 Armando el respaldo...');
    try {
      await require('./backup').enviarBackup({ baseUrl: ctx.baseUrl, secret: ctx.secret, manual: true });
    } catch (e) {
      await decir(chatId, `❌ No pude armar el backup: ${e.message}`);
    }
    return;
  }

  if (msg.text && msg.text.startsWith('/seguimiento')) {
    try {
      await require('./seguimiento').revisarSeguimiento({
        baseUrl: ctx.baseUrl,
        secret: ctx.secret,
        dataDir: ctx.dataDir,
        manual: true,
        chatId,
      });
    } catch (e) {
      await decir(chatId, `❌ No pude revisar el seguimiento: ${e.message}`);
    }
    return;
  }

  return decir(chatId, 'Mandame el Excel del presupuesto (.xlsx) y te devuelvo el PDF.');
}

function iniciarBot({ baseUrl, secret, dataDir }) {
  if (!TOKEN) {
    console.log('[bot] TELEGRAM_TOKEN no configurado: el bot queda apagado.');
    return;
  }
  if (!AUTORIZADOS.length) {
    console.log('[bot] TELEGRAM_ALLOWED vacío: el bot no le va a responder a nadie.');
  }

  const ctx = { baseUrl, secret, dataDir };
  let offset = 0;
  let fallando = false;

  (async function loop() {
    for (;;) {
      try {
        const updates = await api('getUpdates', { offset, timeout: 30 });
        fallando = false;
        for (const u of updates) {
          offset = u.update_id + 1;
          procesar(u, ctx).catch((e) => console.error('[bot] error procesando:', e.message));
        }
      } catch (e) {
        if (!fallando) console.error('[bot] error de conexión:', e.message);
        fallando = true;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  console.log('[bot] escuchando Telegram. Autorizados:', AUTORIZADOS.join(', ') || '(ninguno)');
}

module.exports = { iniciarBot };
