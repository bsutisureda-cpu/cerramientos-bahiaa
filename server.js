// Servidor para Railway: sirve el front-end estático y expone la API
// (login, configuración compartida y subida de imágenes a un volumen persistente).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

// Carga simple de .env.local en desarrollo (Railway inyecta las variables reales en producción).
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) process.env[match[1]] = (match[2] || '').trim();
    });
}

const PORT = process.env.PORT || 3344;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CLIENTES_FILE = path.join(DATA_DIR, 'clientes.json');
const PRESUPUESTOS_FILE = path.join(DATA_DIR, 'presupuestos.json');
const CALENDARIO_FILE = path.join(DATA_DIR, 'calendario.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const USUARIO = process.env.USUARIO;
const CLAVE = process.env.CLAVE;
const SECRET = process.env.SESSION_SECRET || `${USUARIO}:${CLAVE}`;

const DEFAULT_CONFIG = {
  empresaNombre: 'Cerramientos Bahía',
  empresaLogo: null,
  empresaHandle: '@CERRAMIENTOS_BAHIA',
  empresaEmail: 'admcerramientos@gmail.com',
  empresaTelefonos: '291 4433628\n291 4405181\n291 4235443',
  tiposAbertura: ['Corrediza', 'Batiente', 'Banderola', 'Paño fijo', 'Oscilobatiente', 'Puerta'],
  tiposManija: [],
  tiposVidrio: [],
  colores: ['Blanco', 'Negro', 'Símil madera', 'Anodizado negro', 'Anodizado gris'],
  lineas: ['M3', 'M5', 'M7'],
  perfiles: [],
  imagenesAbertura: {},
  imagenesManija: {},
  imagenesVidrio: {},
  basesEjemplo: [],
  valores: { cierre: {}, vidrio: {}, perfil: {} },
  cotizacionDolar: 0,
  combinaciones: [],
};

function leerConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return Object.assign(structuredClone(DEFAULT_CONFIG), raw);
  } catch (e) {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function guardarConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function leerJSONArray(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function guardarJSONArray(file, lista) {
  fs.writeFileSync(file, JSON.stringify(lista, null, 2), 'utf8');
}

function leerJSONObjeto(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

function guardarJSONObjeto(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

// --- Sesión (cookie firmada con HMAC, sin dependencias externas) ---
function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(header) {
  const cookies = {};
  (header || '').split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = val;
  });
  return cookies;
}

function sesionValida(req) {
  const token = parseCookies(req.headers.cookie).session;
  if (!token || !token.includes('.')) return false;
  const [exp, signature] = token.split('.');
  if (!exp || !signature) return false;
  return safeEqual(sign(exp, SECRET), signature) && Date.now() < Number(exp);
}

function requireAuth(req, res, next) {
  if (!sesionValida(req)) {
    res.status(401).json({ ok: false, error: 'No autorizado' });
    return;
  }
  next();
}

// --- App ---
const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/login', (req, res) => {
  if (!USUARIO || !CLAVE) {
    res.status(500).json({ ok: false, error: 'Faltan configurar las variables de entorno USUARIO y CLAVE.' });
    return;
  }
  const { usuario, clave } = req.body || {};
  const usuarioOk = typeof usuario === 'string' && safeEqual(usuario, USUARIO);
  const claveOk = typeof clave === 'string' && safeEqual(clave, CLAVE);
  if (!usuarioOk || !claveOk) {
    res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    return;
  }
  const maxAge = 60 * 60 * 8;
  const exp = Date.now() + maxAge * 1000;
  const token = `${exp}.${sign(String(exp), SECRET)}`;
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
  res.json({ ok: true });
});

app.get('/api/check', (req, res) => {
  if (!sesionValida(req)) {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({ ok: true, usuario: USUARIO });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.json({ ok: true });
});

// Público: solo la URL del logo, para mostrarlo en la pantalla de login.
app.get('/api/logo', (req, res) => {
  res.json({ logo: leerConfig().empresaLogo || null });
});

app.get('/api/config', requireAuth, (req, res) => {
  res.json(leerConfig());
});

app.post('/api/config', requireAuth, (req, res) => {
  const config = req.body;
  if (!config || typeof config !== 'object') {
    res.status(400).json({ ok: false, error: 'Configuración inválida.' });
    return;
  }
  guardarConfig(config);
  res.json({ ok: true });
});

app.get('/api/clientes', requireAuth, (req, res) => {
  res.json(leerJSONArray(CLIENTES_FILE));
});

app.post('/api/clientes', requireAuth, (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ ok: false, error: 'Lista de clientes inválida.' });
    return;
  }
  guardarJSONArray(CLIENTES_FILE, req.body);
  res.json({ ok: true });
});

app.get('/api/presupuestos', requireAuth, (req, res) => {
  res.json(leerJSONArray(PRESUPUESTOS_FILE));
});

app.post('/api/presupuestos', requireAuth, (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ ok: false, error: 'Lista de presupuestos inválida.' });
    return;
  }
  guardarJSONArray(PRESUPUESTOS_FILE, req.body);
  res.json({ ok: true });
});

app.get('/api/calendario', requireAuth, (req, res) => {
  res.json(leerJSONObjeto(CALENDARIO_FILE));
});

app.post('/api/calendario', requireAuth, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ ok: false, error: 'Calendario inválido.' });
    return;
  }
  guardarJSONObjeto(CALENDARIO_FILE, req.body);
  res.json({ ok: true });
});

app.get('/api/backup', requireAuth, (req, res) => {
  const backup = {
    exportadoEn: new Date().toISOString(),
    config: leerConfig(),
    clientes: leerJSONArray(CLIENTES_FILE),
    presupuestos: leerJSONArray(PRESUPUESTOS_FILE),
    calendario: leerJSONObjeto(CALENDARIO_FILE),
  };
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="backup-cerramientos-${fecha}.json"`);
  res.json(backup);
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB por imagen
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
    return;
  }
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(__dirname));

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
