// ---------------------------------------------------------------------------
// Traduce lo que dice Winmaker a los valores configurados en nuestra app.
//
// Orden de resolución para cada campo:
//   1) La tabla de equivalencias que el dueño edita en Configuración (manda).
//   2) Un match automático por palabras (para no tener que cargar todo a mano).
//   3) Si no se puede resolver o hay varias opciones -> se devuelve como "duda"
//      y el bot pregunta por Telegram.
// ---------------------------------------------------------------------------

function normalizar(txt) {
  return String(txt == null ? '' : txt)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')     // '+' , '/', '.' , etc -> espacio
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(txt) {
  const n = normalizar(txt);
  return n ? n.split(' ') : [];
}

// ¿Los tokens de `cand` alcanzan para cubrir todos los de `busca`? (contando repetidos)
function cubre(cand, busca) {
  const pool = {};
  for (const t of cand) pool[t] = (pool[t] || 0) + 1;
  for (const t of busca) {
    if (!pool[t]) return false;
    pool[t]--;
  }
  return true;
}

function equivalencias(config) {
  const e = (config && config.equivalencias) || {};
  return {
    productos: e.productos || {},
    vidrios: e.vidrios || {},
    colores: e.colores || {},
    cierres: e.cierres || {},
  };
}

// Busca en la tabla manual, comparando normalizado (para que no falle por
// mayúsculas, acentos o espacios de más).
function buscarEnTabla(tabla, valor) {
  const objetivo = normalizar(valor);
  if (!objetivo) return null;
  for (const clave of Object.keys(tabla)) {
    if (normalizar(clave) === objetivo) return tabla[clave];
  }
  return null;
}

// Elige de una lista el que coincida exacto (normalizado). Ej: "NEGRO" -> "Negro"
function matchExacto(lista, valor) {
  const objetivo = normalizar(valor);
  if (!objetivo) return null;
  return lista.find((x) => normalizar(x) === objetivo) || null;
}

// Detecta la línea (M3, Monaco top, ...) dentro del texto del producto.
// Devuelve la más específica (la de más palabras) que aparezca.
function detectarLinea(producto, lineas) {
  const prodTokens = tokens(producto);
  let mejor = null;
  let mejorLargo = 0;
  for (const linea of lineas) {
    const lt = tokens(linea);
    if (!lt.length) continue;
    if (cubre(prodTokens, lt) && lt.length > mejorLargo) {
      mejor = linea;
      mejorLargo = lt.length;
    }
  }
  return mejor;
}

// Saca del producto las palabras de la línea y la palabra "LINEA".
function baseDelProducto(producto, linea) {
  const fuera = new Set([...tokens(linea), 'LINEA']);
  return tokens(producto).filter((t) => !fuera.has(t)).join(' ');
}

// Tipo de abertura: puede quedar ambiguo (ej: "CORREDIZA 2 GUIAS" -> 2/3/4 hojas)
function detectarTipo(producto, linea, tiposAbertura, tablaProductos) {
  const base = baseDelProducto(producto, linea);

  // La tabla se consulta primero por el texto completo (más específico) y
  // después por el producto "pelado" (sin la línea), para que una sola entrada
  // sirva para todas las líneas. Ej: "VENTANA DE ABRIR" -> Ventana de abrir 1 hoja
  const manual = buscarEnTabla(tablaProductos, producto) || buscarEnTabla(tablaProductos, base);
  if (manual) {
    // La tabla puede guardar solo el tipo, o {tipo, linea}
    if (typeof manual === 'string') return { tipo: manual, opciones: null };
    if (manual && manual.tipo) return { tipo: manual.tipo, linea: manual.linea || linea, opciones: null };
  }

  if (!base) return { tipo: null, opciones: tiposAbertura };

  const candidatos = tiposAbertura.filter((t) => {
    const a = normalizar(t);
    const b = base;
    return a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
  });

  if (candidatos.length === 1) return { tipo: candidatos[0], opciones: null };
  if (candidatos.length > 1) return { tipo: null, opciones: candidatos };
  return { tipo: null, opciones: tiposAbertura };
}

// Vidrio: Winmaker escribe "FLOAT 4MM+CAMARA 12MM+FLOAT 4MM" y nosotros
// "DVH FLOAT 4mm CAMARA 12MM FLOAT 4mm" (con palabras de más y a veces al revés).
// Buscamos el nuestro que contenga todas las palabras del de Winmaker.
function detectarVidrio(vidrioWM, tiposVidrio, tablaVidrios) {
  if (!vidrioWM) return { valor: '', opciones: null };

  const manual = buscarEnTabla(tablaVidrios, vidrioWM);
  if (manual) return { valor: manual, opciones: null };

  const exacto = matchExacto(tiposVidrio, vidrioWM);
  if (exacto) return { valor: exacto, opciones: null };

  const busca = tokens(vidrioWM);
  const candidatos = tiposVidrio
    .map((v) => ({ v, t: tokens(v) }))
    .filter((c) => cubre(c.t, busca))
    .sort((a, b) => a.t.length - b.t.length); // el que menos palabras de más agrega

  if (!candidatos.length) return { valor: null, opciones: tiposVidrio };
  if (candidatos.length === 1) return { valor: candidatos[0].v, opciones: null };
  // Si el mejor es claramente más ajustado que el siguiente, lo tomamos
  if (candidatos[0].t.length < candidatos[1].t.length) return { valor: candidatos[0].v, opciones: null };
  return { valor: null, opciones: candidatos.map((c) => c.v) };
}

function detectarColor(colorWM, colores, tablaColores) {
  if (!colorWM) return { valor: '', opciones: null };
  const manual = buscarEnTabla(tablaColores, colorWM);
  if (manual) return { valor: manual, opciones: null };
  const exacto = matchExacto(colores, colorWM);
  if (exacto) return { valor: exacto, opciones: null };
  return { valor: null, opciones: colores };
}

function detectarCierre(cierreWM, tiposManija, tablaCierres) {
  if (!cierreWM) return { valor: '', opciones: null };
  const manual = buscarEnTabla(tablaCierres, cierreWM);
  if (manual) return { valor: manual, opciones: null };
  const exacto = matchExacto(tiposManija, cierreWM);
  if (exacto) return { valor: exacto, opciones: null };
  return { valor: null, opciones: ['SIN CIERRE', ...tiposManija] };
}

function tieneExtra(extras, palabra) {
  return (extras || []).some((e) => normalizar(e).includes(normalizar(palabra)));
}

// ---------------------------------------------------------------------------
// Traduce un presupuesto entero.
// Devuelve { items, dudas }:
//   - items: los ítems con el formato de nuestra app (los campos sin resolver
//            quedan en null y se completan cuando el dueño responde).
//   - dudas: [{ indice, campo, pregunta, opciones }] para que el bot pregunte.
// ---------------------------------------------------------------------------
function traducir(presupuestoWM, config) {
  const tablas = equivalencias(config);
  const tiposAbertura = config.tiposAbertura || [];
  const lineas = config.lineas || [];
  const colores = config.colores || [];
  const tiposVidrio = config.tiposVidrio || [];
  const tiposManija = config.tiposManija || [];

  const items = [];
  const dudas = [];

  (presupuestoWM.items || []).forEach((it, i) => {
    const linea = detectarLinea(it.producto, lineas);
    const rTipo = detectarTipo(it.producto, linea, tiposAbertura, tablas.productos);
    const rVidrio = detectarVidrio(it.vidrio, tiposVidrio, tablas.vidrios);
    const rColor = detectarColor(it.color, colores, tablas.colores);
    const rCierre = detectarCierre(it.cierre, tiposManija, tablas.cierres);

    const item = {
      tipo: rTipo.tipo,
      linea: (rTipo.linea !== undefined ? rTipo.linea : linea) || '',
      color: rColor.valor,
      vidrio: rVidrio.valor,
      manija: rCierre.valor,
      colorManija: rCierre.valor && rCierre.valor !== 'SIN CIERRE' ? rColor.valor : '',
      cajon: 'no',
      mosquitero: tieneExtra(it.extras, 'MOSQUITERO') ? 'si' : 'no',
      tapajuntas: tieneExtra(it.extras, 'TAPAJUNTAS') ? 'si' : 'no',
      ancho: it.ancho,
      alto: it.alto,
      cantidad: it.cantidad,
      precio: it.precioUnitario,
      _codigoWM: it.codigo,
    };

    if (!rTipo.tipo) {
      dudas.push({
        indice: i, campo: 'tipo', codigo: it.codigo,
        pregunta: `Ítem ${it.codigo} (${it.ancho}x${it.alto} mm): "${it.producto}" — ¿qué tipo es?`,
        opciones: rTipo.opciones || tiposAbertura,
      });
    }
    if (rVidrio.valor === null) {
      dudas.push({
        indice: i, campo: 'vidrio', codigo: it.codigo,
        pregunta: `Ítem ${it.codigo}: vidrio "${it.vidrio}" — ¿cuál es?`,
        opciones: rVidrio.opciones || tiposVidrio,
      });
    }
    if (rColor.valor === null) {
      dudas.push({
        indice: i, campo: 'color', codigo: it.codigo,
        pregunta: `Ítem ${it.codigo}: color "${it.color}" — ¿cuál es?`,
        opciones: rColor.opciones || colores,
      });
    }
    if (rCierre.valor === null) {
      dudas.push({
        indice: i, campo: 'manija', codigo: it.codigo,
        pregunta: `Ítem ${it.codigo}: cierre "${it.cierre}" — ¿cuál es?`,
        opciones: rCierre.opciones || tiposManija,
      });
    }

    items.push(item);
  });

  return { items, dudas };
}

module.exports = { traducir, normalizar, detectarLinea, detectarTipo, detectarVidrio, detectarColor, detectarCierre };
