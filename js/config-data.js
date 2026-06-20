// ---------------------------------------------------------------------------
// Configuración editable de la app: tipos de abertura, cierres, manijas,
// vidrios, colores y líneas. Todo se guarda en localStorage y se administra
// desde la pantalla "Configuración" dentro de la app (no se edita a mano).
// ---------------------------------------------------------------------------

const CONFIG_KEY = 'cerr_config';

const DEFAULT_CONFIG = {
  tiposAbertura: ['Corrediza', 'Batiente', 'Banderola', 'Paño fijo', 'Oscilobatiente', 'Puerta'],
  tiposCierre: ['Cremona', 'Manija', 'Cerradura', 'Falleba'],
  tiposManija: [],
  tiposVidrio: [],
  colores: ['Blanco', 'Negro', 'Símil madera', 'Anodizado negro', 'Anodizado gris'],
  lineas: ['M3', 'M5', 'M7'],
  // Imágenes subidas por el usuario (data URLs en base64), indexadas por clave.
  imagenesAbertura: {}, // clave: `${tipo}||${color}||${mosquitero}` (mosquitero: "si" | "no")
  imagenesManija: {}, // clave: `${manija}||${color}`
  imagenesVidrio: {}, // clave: `${vidrio}`
};

function cargarConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    // merge con defaults para no romper si se agregan campos nuevos en el futuro
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function guardarConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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

function claveAbertura(tipo, color, mosquitero) {
  return `${tipo}||${color}||${mosquitero === 'si' ? 'si' : 'no'}`;
}

function claveManija(manija, color) {
  return `${manija}||${color}`;
}

function imagenAbertura(config, tipo, color, mosquitero) {
  const etiquetaMosquitero = mosquitero === 'si' ? 'con mosquitero' : 'sin mosquitero';
  return (
    config.imagenesAbertura[claveAbertura(tipo, color, mosquitero)] ||
    placeholderImagen(`${tipo} · ${color} · ${etiquetaMosquitero}`)
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
