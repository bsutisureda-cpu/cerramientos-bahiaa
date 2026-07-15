// ---------------------------------------------------------------------------
// Lector de los Excel de presupuesto que genera Lepton (la app de cotización).
// Devuelve los datos crudos, sin traducir todavía a los tipos de nuestra app.
// (La traducción Lepton -> app se hace después, con la tabla de equivalencias.)
// ---------------------------------------------------------------------------

// Lepton separa los campos del detalle con un punto + espacio duro ( ).
const SEP = /\. /;

function limpiar(txt) {
  return String(txt == null ? '' : txt)
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "660,674.98" -> 660674.98   |  "$  11.138.038,59" -> 11138038.59
function aNumero(txt) {
  const s = limpiar(txt).replace(/[$\s]/g, '');
  if (!s) return 0;
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  let normal;
  if (ultimaComa > ultimoPunto) {
    // formato 1.234,56 -> el decimal es la coma
    normal = s.replace(/\./g, '').replace(',', '.');
  } else {
    // formato 1,234.56 -> el decimal es el punto
    normal = s.replace(/,/g, '');
  }
  const n = parseFloat(normal);
  return isNaN(n) ? 0 : n;
}

// Busca un campo tipo "COLOR: NEGRO" dentro de los segmentos del detalle.
function buscarCampo(segmentos, etiqueta) {
  const re = new RegExp('^' + etiqueta + '\\s*:\\s*(.+)$', 'i');
  for (const seg of segmentos) {
    const m = seg.match(re);
    if (m) return limpiar(m[1]);
  }
  return '';
}

// Desarma el texto "Detalle" de un ítem de Lepton.
// Ej: "Tipo v1 (1500 x 1200 mm):. PRODUCTO: CORREDIZA 2 GUIAS LINEA MONACO TOP .
//      MEDIDAS: 1.50 x 1.20 mts.. Interiores:VIDRIO: FLOAT 4MM+CAMARA 12MM+FLOAT 4MM..
//      COLOR: NEGRO . CON TAPAJUNTAS ."
function parsearDetalle(detalleRaw) {
  const detalle = String(detalleRaw == null ? '' : detalleRaw);
  const segmentos = detalle.split(SEP).map(limpiar).filter(Boolean);

  // Encabezado: "Tipo v1 (1500 x 1200 mm):"
  let nombre = '';
  let ancho = 0;
  let alto = 0;
  const enc = detalle.match(/Tipo\s+([^\s(]+)\s*\((\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*mm\)/i);
  if (enc) {
    nombre = limpiar(enc[1]);
    ancho = aNumero(enc[2]);
    alto = aNumero(enc[3]);
  }

  // "Interiores:VIDRIO: ..." -> normalizamos para poder buscar VIDRIO
  const segsNorm = segmentos.map((s) => s.replace(/^Interiores\s*:\s*/i, ''));

  const producto = buscarCampo(segsNorm, 'PRODUCTO');
  const vidrio = buscarCampo(segsNorm, 'VIDRIO');
  const color = buscarCampo(segsNorm, 'COLOR');

  // El cierre viene como texto suelto: "CIERRE UN PUNTO CON MANIJA ACODADA"
  let cierre = '';
  for (const s of segsNorm) {
    if (/^CIERRE\b/i.test(s)) { cierre = limpiar(s.replace(/^CIERRE\s*/i, '')); break; }
  }

  // Extras sueltos (los que no son campos conocidos ni el encabezado)
  const extras = segsNorm.filter((s) => {
    if (/^(PRODUCTO|MEDIDAS|VIDRIO|COLOR)\s*:/i.test(s)) return false;
    if (/^CIERRE\b/i.test(s)) return false;
    if (/^Tipo\s+\S+\s*\(/i.test(s)) return false;
    return true;
  });

  return {
    nombre,          // "v1"
    ancho,           // 1500 (mm)
    alto,            // 1200 (mm)
    producto,        // "CORREDIZA 2 GUIAS LINEA MONACO TOP"
    vidrio,          // "FLOAT 4MM+CAMARA 12MM+FLOAT 4MM"
    color,           // "NEGRO"
    cierre,          // "UN PUNTO CON MANIJA ACODADA"
    extras,          // ["CON TAPAJUNTAS"]
    detalleOriginal: limpiar(detalle),
  };
}

// Recibe las filas de la hoja (array de arrays) y devuelve el presupuesto crudo.
function parsearFilas(filas) {
  const valor = (f, c) => limpiar(filas[f] && filas[f][c]);

  const encabezado = { numero: '', cliente: '', direccion: '', referencia: '', empresa: '', nota: '', mensajeFinal: '' };
  let filaTitulos = -1;

  for (let i = 0; i < filas.length; i++) {
    const a = valor(i, 0);
    if (!a) continue;
    if (/^Pto\.?\s*Nro/i.test(a)) encabezado.numero = limpiar(a.replace(/^Pto\.?\s*Nro\.?\s*:*\s*/i, ''));
    else if (/^Sres\.?\s*:/i.test(a)) encabezado.cliente = limpiar(a.replace(/^Sres\.?\s*:\s*/i, ''));
    else if (/^Dir\.?\s*:/i.test(a)) encabezado.direccion = limpiar(a.replace(/^Dir\.?\s*:\s*/i, ''));
    else if (/^Ref\.?\s*:/i.test(a)) encabezado.referencia = limpiar(a.replace(/^Ref\.?\s*:\s*/i, ''));
    else if (/^Nota\s*:/i.test(a)) encabezado.nota = limpiar(a.replace(/^Nota\s*:\s*/i, ''));
    else if (/^Item$/i.test(a) && /^Cant/i.test(valor(i, 1))) filaTitulos = i;
    else if (!encabezado.empresa && i === 0) encabezado.empresa = a;
  }

  if (filaTitulos === -1) {
    throw new Error('No encontré la tabla de ítems (falta la fila con "Item / Cant. / Detalle").');
  }

  const items = [];
  let total = 0;

  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const c0 = valor(i, 0);
    if (!c0) continue;

    if (/^Total$/i.test(c0)) { total = aNumero(valor(i, 1)); break; }

    const cant = valor(i, 1);
    const detalle = filas[i] && filas[i][2];
    if (!detalle || !cant) continue;

    const d = parsearDetalle(detalle);
    items.push({
      codigo: c0,                      // "v1"
      cantidad: Math.round(aNumero(cant)) || 1,
      precioUnitario: aNumero(valor(i, 3)),
      totalLinea: aNumero(valor(i, 4)),
      ...d,
    });
  }

  // El texto legal del pie: la celda larga posterior a los ítems
  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const a = valor(i, 0);
    if (a && a.length > 120) { encabezado.mensajeFinal = a.replace(/_x000B_/g, '\n'); break; }
  }

  if (!items.length) throw new Error('El Excel no tiene ítems para presupuestar.');

  return { ...encabezado, items, total };
}

module.exports = { parsearFilas, parsearDetalle, aNumero, limpiar };
