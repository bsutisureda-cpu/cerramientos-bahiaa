const crypto = require('crypto');

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
  const USUARIO = process.env.USUARIO;
  const CLAVE = process.env.CLAVE;
  const SECRET = process.env.SESSION_SECRET || `${USUARIO}:${CLAVE}`;

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session;

  if (!token || !token.includes('.')) {
    res.status(401).json({ ok: false });
    return;
  }

  const [exp, signature] = token.split('.');
  if (!exp || !signature) {
    res.status(401).json({ ok: false });
    return;
  }

  const expected = sign(exp, SECRET);
  const validSignature = safeEqual(expected, signature);
  const validExpiry = Date.now() < Number(exp);

  if (!validSignature || !validExpiry) {
    res.status(401).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
};
