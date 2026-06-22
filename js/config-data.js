// ---------------------------------------------------------------------------
// Configuración editable de la app: tipos de abertura, manijas,
// vidrios, colores y líneas. Se guarda en el servidor (compartida entre
// todos los navegadores) y se administra desde la pantalla "Configuración".
// ---------------------------------------------------------------------------

async function cargarConfigRemota() {
  const resp = await fetch('/api/config');
  if (!resp.ok) throw new Error('No se pudo cargar la configuración.');
  return resp.json();
}

async function guardarConfigRemota(config) {
  const resp = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!resp.ok) throw new Error('No se pudo guardar la configuración.');
}

async function subirImagen(file) {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!resp.ok) throw new Error('No se pudo subir la imagen.');
  const data = await resp.json();
  return data.url;
}

// Placeholder neutro (SVG inline) para cuando todavía no se subió imagen.
function placeholderImagen(texto) {
  const safe = (texto || 'Sin imagen').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 170">
    <rect width="200" height="170" fill="#eef0f2"/>
    <rect x="20" y="20" width="160" height="100" fill="none" stroke="#b7bcc2" stroke-width="3" stroke-dasharray="6,5"/>
    <text x="100" y="140" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#8a9099">${safe}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function claveAbertura(tipo, color, mosquitero, cajon) {
  return `${tipo}||${color}||${mosquitero === 'si' ? 'si' : 'no'}||${cajon === 'si' ? 'si' : 'no'}`;
}

function claveManija(manija, color) {
  return `${manija}||${color}`;
}

function imagenAbertura(config, tipo, color, mosquitero, cajon) {
  const etiquetaMosquitero = mosquitero === 'si' ? 'con mosquitero' : 'sin mosquitero';
  const etiquetaCajon = cajon === 'si' ? 'con cajón' : 'sin cajón';
  return (
    config.imagenesAbertura[claveAbertura(tipo, color, mosquitero, cajon)] ||
    placeholderImagen(`${tipo} · ${color} · ${etiquetaMosquitero} · ${etiquetaCajon}`)
  );
}

function imagenManija(config, manija, color) {
  if (!manija) return null;
  return config.imagenesManija[claveManija(manija, color)] || placeholderImagen(`${manija} · ${color}`);
}

function imagenVidrio(config, vidrio) {
  if (!vidrio) return null;
  return config.imagenesVidrio[vidrio] || placeholderImagen(vidrio);
}
