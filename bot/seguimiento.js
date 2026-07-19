// ---------------------------------------------------------------------------
// Seguimiento de presupuestos: avisa por Telegram cuáles siguen sin respuesta.
//
// Un presupuesto enviado y olvidado es una venta perdida. Una vez por día
// revisamos los que siguen "pendiente" hace varios días y mandamos la lista
// para que se los pueda seguir.
//
// Para no ser pesado:
//   - de cada presupuesto se avisa como mucho una vez por semana
//   - los muy viejos se dejan de recordar (ya se dan por perdidos)
//   - si no hay nada para avisar, no manda nada
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { cookieDeSesion } = require('./generarPdf');

const TOKEN = process.env.TELEGRAM_TOKEN;

const DESTINO = (
  process.env.TELEGRAM_SEGUIMIENTO_CHAT ||
  (process.env.TELEGRAM_ALLOWED || '').split(',')[0] ||
  ''
).trim();

// Días sin respuesta a partir de los cuales avisamos.
const DIAS = Number(process.env.SEGUIMIENTO_DIAS || 7);
// Pasado este tiempo dejamos de insistir.
const MAX_DIAS = Number(process.env.SEGUIMIENTO_MAX_DIAS || 60);
// Cada cuánto se puede volver a recordar el mismo presupuesto.
const RECORDAR_CADA = Number(process.env.SEGUIMIENTO_RECORDAR_CADA || 7);

const UN_DIA = 24 * 60 * 60 * 1000;
const CADA_CUANTO_REVISA = 12 * 60 * 60 * 1000;

function archivoAvisos(dataDir) {
  return path.join(dataDir, 'seguimiento-avisos.json');
}

function leerAvisos(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(archivoAvisos(dataDir), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function guardarAvisos(dataDir, avisos) {
  try {
    fs.writeFileSync(archivoAvisos(dataDir), JSON.stringify(avisos, null, 2), 'utf8');
  } catch (e) {
    console.error('[seguimiento] no pude guardar los avisos:', e.message);
  }
}

async function pedirPresupuestos(baseUrl, secret) {
  const r = await fetch(new URL('/api/presupuestos', baseUrl), {
    headers: { Cookie: `session=${cookieDeSesion(secret)}` },
  });
  if (!r.ok) throw new Error(`la app respondió ${r.status}`);
  const lista = await r.json();
  return Array.isArray(lista) ? lista : [];
}

function totalDe(registro) {
  const bruto = (registro.items || []).reduce(
    (acum, item) => acum + (item.precio || 0) * (item.cantidad || 1),
    0
  );
  const p1 = registro.panel1 || {};
  const descuento = bruto * ((p1.descuentoPorcentaje || 0) / 100);
  const base = bruto - descuento;
  return base + base * ((p1.ivaPorcentaje || 21) / 100);
}

const plata = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function diasDesde(iso) {
  const t = new Date(iso).getTime();
  if (!t) return null;
  return Math.floor((Date.now() - t) / UN_DIA);
}

// Devuelve los presupuestos que merecen un recordatorio hoy.
function aSeguir(presupuestos, avisos) {
  return presupuestos
    .filter((p) => (p.estado || 'pendiente') === 'pendiente')
    .map((p) => ({ p, dias: diasDesde(p.guardadoEn) }))
    .filter(({ dias }) => dias !== null && dias >= DIAS && dias <= MAX_DIAS)
    .filter(({ p }) => {
      const ultimo = avisos[p.numero];
      if (!ultimo) return true;
      const d = diasDesde(ultimo);
      return d === null || d >= RECORDAR_CADA;
    })
    .sort((a, b) => b.dias - a.dias);
}

function armarMensaje(lista) {
  const lineas = lista.map(({ p, dias }) => {
    const p1 = p.panel1 || {};
    const tel = p1.telefono ? ` · 📞 ${p1.telefono}` : '';
    return `• *N.º ${p.numero}* — ${p1.nombre || 'Sin nombre'}${tel}\n   hace ${dias} días · $ ${plata(totalDe(p))}`;
  });

  const cuantos = lista.length === 1 ? '1 presupuesto sigue' : `${lista.length} presupuestos siguen`;
  return (
    `🔔 *Seguimiento de presupuestos*\n\n` +
    `${cuantos} sin respuesta. Un mensaje puede cerrar la venta:\n\n` +
    lineas.join('\n\n') +
    `\n\nCuando alguno se defina, marcalo como aprobado o rechazado en la app.`
  );
}

async function mandarMensaje(texto) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: DESTINO, text: texto, parse_mode: 'Markdown' }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram: ${j.description}`);
}

// Revisa y avisa. Con manual=true contesta aunque no haya nada pendiente.
async function revisarSeguimiento({ baseUrl, secret, dataDir, manual = false, chatId = null }) {
  if (!TOKEN) throw new Error('TELEGRAM_TOKEN no configurado.');

  const presupuestos = await pedirPresupuestos(baseUrl, secret);
  const avisos = leerAvisos(dataDir);
  const lista = aSeguir(presupuestos, avisos);

  if (!lista.length) {
    if (manual) {
      const destinoManual = chatId || DESTINO;
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: destinoManual,
          text: '✅ No hay presupuestos pendientes para seguir. Todo al día.',
        }),
      });
    }
    return { avisados: 0 };
  }

  await mandarMensaje(armarMensaje(lista));

  const ahora = new Date().toISOString();
  lista.forEach(({ p }) => { avisos[p.numero] = ahora; });
  guardarAvisos(dataDir, avisos);

  return { avisados: lista.length };
}

function iniciarSeguimiento({ baseUrl, secret, dataDir }) {
  if (!TOKEN || !DESTINO) {
    console.log('[seguimiento] sin TELEGRAM_TOKEN o sin destinatario: seguimiento apagado.');
    return;
  }

  async function revisar() {
    try {
      const { avisados } = await revisarSeguimiento({ baseUrl, secret, dataDir });
      if (avisados) console.log(`[seguimiento] avisé de ${avisados} presupuesto(s) sin respuesta.`);
    } catch (e) {
      console.error('[seguimiento] no pude revisar:', e.message);
    }
  }

  setTimeout(revisar, 60 * 1000).unref();
  setInterval(revisar, CADA_CUANTO_REVISA).unref();

  console.log(`[seguimiento] activo: avisa de los pendientes de más de ${DIAS} día(s).`);
}

module.exports = { iniciarSeguimiento, revisarSeguimiento };
