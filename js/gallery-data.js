// ---------------------------------------------------------------------------
// Listas editables: agregá/quitá tipos de abertura, cierres o imágenes acá.
// ---------------------------------------------------------------------------

const TIPOS_ABERTURA = [
  'Corrediza',
  'Batiente',
  'Banderola',
  'Paño fijo',
  'Oscilobatiente',
  'Puerta',
];

const TIPOS_CIERRE = ['Cremona', 'Manija', 'Cerradura', 'Falleba'];

// Galería fija de imágenes. "tipo" debe coincidir con un valor de TIPOS_ABERTURA.
const GALERIA = [
  { id: 'corrediza_blanco', tipo: 'Corrediza', file: 'img/tipologias/corrediza_blanco.svg', label: 'Corrediza blanco' },
  { id: 'corrediza_negro', tipo: 'Corrediza', file: 'img/tipologias/corrediza_negro.svg', label: 'Corrediza negro' },
  { id: 'batiente_blanco', tipo: 'Batiente', file: 'img/tipologias/batiente_blanco.svg', label: 'Batiente blanco' },
  { id: 'batiente_negro', tipo: 'Batiente', file: 'img/tipologias/batiente_negro.svg', label: 'Batiente negro' },
  { id: 'banderola_blanco', tipo: 'Banderola', file: 'img/tipologias/banderola_blanco.svg', label: 'Banderola blanco' },
  { id: 'banderola_negro', tipo: 'Banderola', file: 'img/tipologias/banderola_negro.svg', label: 'Banderola negro' },
  { id: 'panofijo_blanco', tipo: 'Paño fijo', file: 'img/tipologias/panofijo_blanco.svg', label: 'Paño fijo blanco' },
  { id: 'panofijo_negro', tipo: 'Paño fijo', file: 'img/tipologias/panofijo_negro.svg', label: 'Paño fijo negro' },
  { id: 'oscilobatiente_blanco', tipo: 'Oscilobatiente', file: 'img/tipologias/oscilobatiente_blanco.svg', label: 'Oscilobatiente blanco' },
  { id: 'oscilobatiente_negro', tipo: 'Oscilobatiente', file: 'img/tipologias/oscilobatiente_negro.svg', label: 'Oscilobatiente negro' },
  { id: 'puerta_blanco', tipo: 'Puerta', file: 'img/tipologias/puerta_blanco.svg', label: 'Puerta blanco' },
  { id: 'puerta_negro', tipo: 'Puerta', file: 'img/tipologias/puerta_negro.svg', label: 'Puerta negro' },
];

function imagenesPorTipo(tipo) {
  return GALERIA.filter((img) => img.tipo === tipo);
}

function imagenPorId(id) {
  return GALERIA.find((img) => img.id === id);
}
