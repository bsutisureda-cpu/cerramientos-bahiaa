// ---------------------------------------------------------------------------
// Lector de los Excel de presupuesto que genera Winmaker (la app de cotización).
// La pestaña de la hoja suele llamarse "lepton" (nombre interno de la plantilla
// de Winmaker), pero no dependemos de ese nombre para leerla.
// Devuelve los datos crudos, sin traducir todavía a los tipos de nuestra app.
// (La traducción Winmaker -> app se hace después, con la tabla de equivalencias.)
// ---------------------------------------------------------------------------

// Winmaker separa los campos del detalle con un punto + espacio duro ( ).
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
  } else if (ultimaComa === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Sólo puntos separando grupos de 3 -> son miles, formato argentino.
    // Pasa en la nota del pie: "$ 840.000" es 840000, no 840.
    normal = s.replace(/\./g, '');
  } else {
    // formato 1,234.56 -> el decimal es el punto
    normal = s.replace(/,/g, '');
  }
  const n = parseFloat(normal);
  return isNaN(n) ? 0 : n;
}

// Convierte "1.50 x 1.20 mts" (o "0.30 x 1.20 mts", o "300 x 700 mm") a mm.
// Si no trae unidad, se asume metros (así lo escribe Winmaker en "MEDIDAS").
function medidasAmm(texto) {
  const m = String(texto == null ? '' : texto).match(/([\d.,]+)\s*x\s*([\d.,]+)\s*(mm|mts|mt|m)?/i);
  if (!m) return null;
  const unidad = (m[3] || '').toLowerCase();
  const factor = unidad === 'mm' ? 1 : 1000; // metros -> mm por defecto
  const ancho = Math.round(aNumero(m[1]) * factor);
  const alto = Math.round(aNumero(m[2]) * factor);
  return { ancho, alto };
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

// Desarma el texto "Detalle" de un ítem de Winmaker.
// Ej: "Tipo v1 (1500 x 1200 mm):. PRODUCTO: CORREDIZA 2 GUIAS LINEA MONACO TOP .
//      MEDIDAS: 1.50 x 1.20 mts.. Interiores:VIDRIO: FLOAT 4MM+CAMARA 12MM+FLOAT 4MM..
//      COLOR: NEGRO . CON TAPAJUNTAS ."
function parsearDetalle(detalleRaw) {
  const detalle = String(detalleRaw == null ? '' : detalleRaw);
  const segmentos = detalle.split(SEP).map(limpiar).filter(Boolean);

  // Encabezado: "Tipo v1 (1500 x 1200 mm):" — de acá sacamos el nombre y, como
  // respaldo, las medidas (pero la fuente principal es el campo MEDIDAS).
  let nombre = '';
  let ancho = 0;
  let alto = 0;
  // El nombre puede traer palabras extra antes del paréntesis
  // ("Tipo v1 cocina (1570 x 2200 mm)" -> nombre "v1"), y la medida puede venir
  // en mm o en metros ("Tipo V5 ab (0.30 x 1.00 mts)").
  const enc = detalle.match(
    /Tipo\s+([^\s(]+)[^(]*\(\s*([\d.,]+)\s*x\s*([\d.,]+)\s*(mm|mts|mt|m)?\s*\)/i
  );
  if (enc) {
    nombre = limpiar(enc[1]);
    const u = (enc[4] || '').toLowerCase();
    const factor = (u === 'mts' || u === 'mt' || u === 'm') ? 1000 : 1; // sin unidad => mm
    ancho = Math.round(aNumero(enc[2]) * factor);
    alto = Math.round(aNumero(enc[3]) * factor);
  }

  // "Interiores:VIDRIO: ..." -> normalizamos para poder buscar VIDRIO
  const segsNorm = segmentos.map((s) => s.replace(/^Interiores\s*:\s*/i, ''));

  // Recorremos los segmentos EN ORDEN para armar las partes. Cada "PRODUCTO:"
  // abre una parte; sus "MEDIDAS:" y "VIDRIO:" son los que vienen hasta el
  // próximo "PRODUCTO:". Así soportamos aberturas combinadas (varios productos).
  const partes = [];
  let actual = null;
  for (const s of segsNorm) {
    const mProd = s.match(/^PRODUCTO\s*:\s*(.+)$/i);
    if (mProd) {
      actual = { producto: limpiar(mProd[1]), ancho: 0, alto: 0, vidrio: '' };
      partes.push(actual);
      continue;
    }
    if (!actual) continue;
    const mMed = s.match(/^MEDIDAS\s*:\s*(.+)$/i);
    if (mMed) {
      const m = medidasAmm(mMed[1]);
      if (m) { actual.ancho = m.ancho; actual.alto = m.alto; }
      continue;
    }
    const mVid = s.match(/^VIDRIO\s*:\s*(.+)$/i);
    if (mVid) { actual.vidrio = limpiar(mVid[1]); continue; }
  }

  // "MARCO UNIFICADO" no es una abertura: es el marco total de la combinación.
  // Nos quedamos con su medida como total y lo sacamos de las partes reales.
  const esMarco = (p) => /MARCO\s+UNIFICADO/i.test(p.producto);
  const marco = partes.find(esMarco);
  const partesReales = partes.filter((p) => !esMarco(p));

  const color = buscarCampo(segsNorm, 'COLOR');

  // Medida total: la del marco unificado; si no, la del encabezado; si no, la
  // suma de anchos y el alto máximo de las partes.
  if (marco && marco.ancho > 0) { ancho = marco.ancho; alto = marco.alto; }
  else {
    const med = medidasAmm(buscarCampo(segsNorm, 'MEDIDAS'));
    if (med && med.ancho > 0 && partesReales.length <= 1) { ancho = med.ancho; alto = med.alto; }
    else if (partesReales.length) {
      const sum = partesReales.reduce((a, p) => a + (p.ancho || 0), 0);
      const maxH = partesReales.reduce((mx, p) => Math.max(mx, p.alto || 0), 0);
      if (sum > 0) ancho = sum;
      if (maxH > 0) alto = maxH;
    }
  }

  const principal = partesReales[0] || { producto: '', ancho, alto, vidrio: '' };

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
    nombre,                          // "v1"
    ancho,                           // total (mm)
    alto,                            // total (mm)
    producto: principal.producto,    // producto de la parte principal
    vidrio: principal.vidrio,        // vidrio de la parte principal
    color,                           // "BLANCO"
    cierre,                          // "UN PUNTO CON MANIJA ACODADA"
    extras,                          // ["CON TAPAJUNTAS"]
    esCombinada: partesReales.length > 1,
    partes: partesReales,            // [{producto, ancho, alto, vidrio}, ...]
    detalleOriginal: limpiar(detalle),
  };
}

// Winmaker no pone los cajones en la tabla de ítems: los deja escritos en la
// nota del pie, así:
//   "CAJONES COMPACTOS ROLLER CON CORTINA PARA: V1: ( 1 UNIDAD) $ 840.000 + IVA .
//    V5: (3 UNIDAD) $ 1.303.450 + IVA . TOTAL CAJONES: $ 3.088.200 + IVA"
// Los sacamos de ahí para poder mostrarlos dentro de cada ventana.
// El precio es el TOTAL de esa línea (no el unitario): así lo escribe Winmaker.
// Se escribe de dos formas distintas según quién arme el presupuesto:
//   A) "CAJONES COMPACTOS ROLLER CON CORTINA PARA: V1: ( 1 UNIDAD) $ 840.000 + IVA
//       ... TOTAL CAJONES: $ 3.088.200 + IVA"
//   B) "CAJON V1 $550.000 + IVA . CAJON V2 $350.000 + IVA"
// Se soportan las dos.
function parsearCajones(texto) {
  const vacio = { porCodigo: {}, etiqueta: '', total: 0 };
  const t = limpiar(texto);
  if (!/CAJON/i.test(t)) return vacio;

  const porCodigo = {};
  const agregar = (cod, unidades, monto) => {
    const codigo = String(cod).replace(/\s+/g, '').toUpperCase();
    const total = aNumero(monto);
    if (!codigo || !total) return;
    // Si el mismo código aparece dos veces, se suman.
    const ya = porCodigo[codigo];
    porCodigo[codigo] = {
      unidades: (ya ? ya.unidades : 0) + (parseInt(unidades, 10) || 1),
      total: (ya ? ya.total : 0) + total,
    };
  };

  // --- Forma A: listado "CAJONES ... PARA:" con "( N UNIDAD )" ---
  const desdeListado = t.search(/CAJONES[^.]*PARA\s*:/i);
  let etiqueta = 'Cajón';
  let totalDeclarado = 0;
  if (desdeListado !== -1) {
    const resto = t.slice(desdeListado);
    const mTotal = resto.match(/TOTAL\s+CAJONES\s*:\s*\$\s*([\d.,]+)/i);
    const listado = mTotal ? resto.slice(0, resto.indexOf(mTotal[0])) : resto;
    if (mTotal) totalDeclarado = aNumero(mTotal[1]);

    const mEtiqueta = listado.match(/^(CAJONES[^:]*?)\s*PARA\s*:/i);
    if (mEtiqueta) etiqueta = limpiar(mEtiqueta[1]);

    const reA = /\b([A-Za-z]{1,3}\s?\d+[A-Za-z]?)\s*:\s*\(\s*(\d+)\s*UNIDAD(?:ES)?\s*\)\s*\$\s*([\d.,]+)/gi;
    let m;
    while ((m = reA.exec(listado)) !== null) agregar(m[1], m[2], m[3]);
  }

  // --- Forma B: "CAJON V1 $550.000" (la palabra CAJON antes del código) ---
  // Sólo se usa si la forma A no encontró nada, para no duplicar.
  if (!Object.keys(porCodigo).length) {
    const reB = /\bCAJON(?:ES)?\s+([A-Za-z]{1,3}\s?\d+[A-Za-z]?)\s*:?\s*\$\s*([\d.,]+)/gi;
    let m;
    while ((m = reB.exec(t)) !== null) agregar(m[1], 1, m[2]);
  }

  const sumaFilas = Object.values(porCodigo).reduce((a, c) => a + c.total, 0);
  return { porCodigo, etiqueta, total: totalDeclarado || sumaFilas };
}

// Deja sólo los dígitos del código: "VA1" y "V1" comparten el "1".
function numeroDeCodigo(cod) {
  const m = String(cod).match(/\d+/);
  return m ? m[0] : '';
}

// Pega cada cajón a su ventana. Primero por código exacto; si no aparece,
// prueba por el número (VA1 <-> V1) pero SÓLO si no hay ambigüedad.
// Lo que no se pueda asociar se devuelve para avisarle al usuario: nunca
// se descarta plata en silencio.
function asignarCajones(items, cajones) {
  const aproximados = [];
  const sinAsignar = [];
  const tomados = new Set();

  const aplicar = (item, dato) => {
    item.precioCajon = dato.total;
    item.etiquetaCajon = cajones.etiqueta;
    tomados.add(item);
  };

  const pendientes = [];
  for (const [cod, dato] of Object.entries(cajones.porCodigo)) {
    const exacto = items.find(
      (i) => String(i.codigo).toUpperCase() === cod && !tomados.has(i)
    );
    if (exacto) aplicar(exacto, dato);
    else pendientes.push([cod, dato]);
  }

  for (const [cod, dato] of pendientes) {
    const num = numeroDeCodigo(cod);
    const candidatos = num
      ? items.filter((i) => !tomados.has(i) && numeroDeCodigo(i.codigo) === num)
      : [];
    if (candidatos.length === 1) {
      aplicar(candidatos[0], dato);
      aproximados.push({ cajon: cod, item: candidatos[0].codigo, total: dato.total });
    } else {
      sinAsignar.push({ cajon: cod, total: dato.total, candidatos: candidatos.length });
    }
  }

  return { aproximados, sinAsignar };
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

  // Los cajones viven en la nota del pie: se los pegamos a la ventana que corresponde.
  const cajones = parsearCajones(encabezado.mensajeFinal);
  const { aproximados, sinAsignar } = asignarCajones(items, cajones);

  return { ...encabezado, items, total, cajones: { ...cajones, aproximados, sinAsignar } };
}

// Lee el .xlsx (el archivo que llega por Telegram) y lo pasa por parsearFilas.
async function leerArchivo(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo no tiene ninguna hoja.');

  const filas = [];
  ws.eachRow({ includeEmpty: true }, (row, nro) => {
    const celdas = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        // Celdas con formato o fórmula: nos quedamos con el texto visible.
        if (v.richText) v = v.richText.map((t) => t.text).join('');
        else if (v.text !== undefined) v = v.text;
        else if (v.result !== undefined) v = v.result;
        else v = '';
      }
      celdas[col - 1] = v == null ? '' : String(v);
    });
    filas[nro - 1] = celdas;
  });

  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];

  return parsearFilas(filas);
}

module.exports = {
  parsearFilas, parsearDetalle, parsearCajones, asignarCajones,
  leerArchivo, aNumero, limpiar,
};
