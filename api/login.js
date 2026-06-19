const crypto = require('crypto');

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      body = {};
    }
  }

  const { usuario, clave } = body || {};
  const USUARIO = process.env.USUARIO;
  const CLAVE = process.env.CLAVE;
  const SECRET = process.env.SESSION_SECRET || `${USUARIO}:${CLAVE}`;

  if (!USUARIO || !CLAVE) {
    res.status(500).json({
      ok: false,
      error: 'Faltan configurar las variables de entorno USUARIO y CLAVE en Vercel.',
    });
    return;
  }

  const usuarioOk = typeof usuario === 'string' && safeEqual(usuario, USUARIO);
  const claveOk = typeof clave === 'string' && safeEqual(clave, CLAVE);

  if (!usuarioOk || !claveOk) {
    res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const maxAge = 60 * 60 * 8; // 8 horas
  const exp = Date.now() + maxAge * 1000;
  const payload = `${exp}`;
  const signature = sign(payload, SECRET);
  const token = `${payload}.${signature}`;

  res.setHeader(
    'Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
  );
  res.status(200).json({ ok: true });
};
