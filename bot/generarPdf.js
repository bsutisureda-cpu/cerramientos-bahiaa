// ---------------------------------------------------------------------------
// Genera el PDF del presupuesto abriendo la PROPIA app en un Chrome invisible.
//
// Así el PDF sale idéntico al que se descarga a mano: mismo diseño, mismas
// imágenes y misma configuración. No duplicamos el diseño en el servidor.
//
// El navegador se abre sólo para generar y se cierra enseguida (en Railway se
// paga por consumo, así que no conviene dejarlo prendido).
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const fs = require('fs');

// Puppeteer es un módulo ESM: hay que cargarlo con import() dinámico.
// Con require() falla en Node 18/20 (que es lo que corre en Railway), aunque
// funcione en Node 24. Se carga una sola vez y se reutiliza.
let puppeteer = null;
async function cargarPuppeteer() {
  if (puppeteer) return puppeteer;
  const mod = await import('puppeteer');
  puppeteer = mod.default || mod;
  return puppeteer;
}

// Busca un Chromium instalado en el sistema (en Railway lo instala nixpacks.toml).
// Si no encuentra ninguno, devuelve undefined y se usa el que baja puppeteer.
function buscarChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidatos = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/root/.nix-profile/bin/chromium',
  ];
  for (const ruta of candidatos) {
    try { if (fs.existsSync(ruta)) return ruta; } catch (e) { /* seguimos */ }
  }
  if (process.platform !== 'win32') {
    try {
      const { execSync } = require('child_process');
      const ruta = execSync('command -v chromium || command -v chromium-browser', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (ruta) return ruta;
    } catch (e) { /* no hay chromium en el PATH */ }
  }
  return undefined;
}

// Cookie de sesión válida, firmada igual que en server.js.
function cookieDeSesion(secret, horas = 1) {
  const exp = Date.now() + horas * 60 * 60 * 1000;
  const firma = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  return `${exp}.${firma}`;
}

async function generarPdf({ panel1, items, guardar = true, baseUrl, secret }) {
  let pptr;
  try {
    pptr = await cargarPuppeteer();
  } catch (e) {
    throw new Error(`No pude cargar puppeteer: ${e.message}`);
  }

  const chromium = buscarChromium();
  console.log('[pdf] Chromium:', chromium || '(el que trae puppeteer)');

  const navegador = await pptr.launch({
    headless: 'new',
    executablePath: chromium,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const pagina = await navegador.newPage();

    // La app avisa "Presupuesto guardado" con un alert; lo cerramos solos.
    pagina.on('dialog', (d) => d.accept().catch(() => {}));

    const url = new URL(baseUrl);
    await pagina.setCookie({
      name: 'session',
      value: cookieDeSesion(secret),
      domain: url.hostname,
      path: '/',
      httpOnly: true,
    });

    await pagina.goto(new URL('/app.html', baseUrl).href, { waitUntil: 'networkidle0', timeout: 60000 });

    // Esperamos a que la app termine de cargar su configuración.
    await pagina.waitForFunction('window.presupuestoAPI && !document.getElementById("app-root").hidden', { timeout: 30000 });

    const resultado = await pagina.evaluate(
      (datos) => window.presupuestoAPI.render(datos),
      { panel1, items, guardar }
    );

    // El @media print de la app deja sólo la hoja del presupuesto.
    const pdf = await pagina.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return { pdf, numero: resultado.numero };
  } finally {
    await navegador.close();
  }
}

module.exports = { generarPdf, cookieDeSesion };
