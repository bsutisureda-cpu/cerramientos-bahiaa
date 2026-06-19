// Servidor mínimo para probar la app en local sin depender de "vercel dev"
// (útil si no querés/podés loguearte con la Vercel CLI). Simula las funciones de /api.
// Uso: node dev-server.js  →  http://localhost:3344
const http = require('http');
const fs = require('fs');
const path = require('path');

// Carga simple de .env.local (USUARIO, CLAVE, SESSION_SECRET) sin dependencias externas.
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) process.env[match[1]] = (match[2] || '').trim();
    });
}

const login = require('./api/login.js');
const check = require('./api/check.js');
const logout = require('./api/logout.js');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
};

function wrapRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  return res;
}

const PORT = process.env.PORT || 3344;

const server = http.createServer((req, res) => {
  wrapRes(res);
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    req.body = body;
    if (req.url === '/api/login') return login(req, res);
    if (req.url === '/api/check') return check(req, res);
    if (req.url === '/api/logout') return logout(req, res);

    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath.split('?')[0]);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('No encontrado');
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
      res.end(data);
    });
  });
});

server.listen(PORT, () => console.log(`Dev server en http://localhost:${PORT}`));
