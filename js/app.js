(function () {
  const state = {
    items: [],
    editingItemId: null,
    editingClienteId: null,
    config: null,
    clientes: [],
    presupuestos: [],
    calendario: {},
    calVista: new Date(),
    calDiaSeleccionado: null,
  };

  // ---------------------------------------------------------------------
  // Datos remotos: clientes y presupuestos (compartidos en el servidor)
  // ---------------------------------------------------------------------
  async function cargarClientesRemoto() {
    const resp = await fetch('/api/clientes');
    if (!resp.ok) throw new Error('No se pudo cargar la lista de clientes.');
    return resp.json();
  }

  async function guardarClientesRemoto(lista) {
    const resp = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lista),
    });
    if (!resp.ok) throw new Error('No se pudo guardar la lista de clientes.');
  }

  async function cargarPresupuestosRemoto() {
    const resp = await fetch('/api/presupuestos');
    if (!resp.ok) throw new Error('No se pudo cargar los presupuestos guardados.');
    return resp.json();
  }

  async function guardarPresupuestosRemoto(lista) {
    const resp = await fetch('/api/presupuestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lista),
    });
    if (!resp.ok) throw new Error('No se pudo guardar el presupuesto.');
  }

  async function cargarCalendarioRemoto() {
    const resp = await fetch('/api/calendario');
    if (!resp.ok) throw new Error('No se pudo cargar el calendario.');
    return resp.json();
  }

  async function guardarCalendarioRemoto(datos) {
    const resp = await fetch('/api/calendario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    if (!resp.ok) throw new Error('No se pudo guardar el calendario.');
  }

  // ---------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------
  async function checkSession() {
    try {
      const resp = await fetch('/api/check', { method: 'GET' });
      if (!resp.ok) throw new Error('no autorizado');
      const datosSesion = await resp.json();
      document.getElementById('sidebar-usuario').textContent = datosSesion.usuario || '';
      state.config = await cargarConfigRemota();
      ordenarListasConfig(state.config);
      state.clientes = await cargarClientesRemoto();
      state.presupuestos = await cargarPresupuestosRemoto();
      state.calendario = await cargarCalendarioRemoto();
      document.getElementById('auth-loading').hidden = true;
      document.getElementById('app-root').hidden = false;
      initApp();
    } catch (e) {
      window.location.href = 'index.html';
    }
  }

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      /* sigue de todas formas */
    }
    window.location.href = 'index.html';
  });

  // ---------------------------------------------------------------------
  // Helpers generales
  // ---------------------------------------------------------------------
  function uid() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nextNumero() {
    const last = state.presupuestos.reduce((max, p) => Math.max(max, parseInt(p.numero, 10) || 0), 0);
    return String(last + 1);
  }

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function formatFechaLegible(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  function formatFechaHoraLegible(isoDateTime) {
    if (!isoDateTime) return '';
    const fecha = new Date(isoDateTime);
    return fecha.toLocaleDateString('es-AR') + ' ' + fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function populateSelect(id, values, placeholder) {
    const select = document.getElementById(id);
    const valorActual = select.value;
    select.innerHTML = '';
    if (placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if (valorActual && values.includes(valorActual)) select.value = valorActual;
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function initApp() {
    refrescarSelectsPanel2();
    poblarSelectClientes();
    actualizarLogoSidebar();

    document.getElementById('p1-numero').value = nextNumero();
    document.getElementById('p1-fecha').value = todayISO();

    actualizarPreviewImagenes();
    renderListaItems();

    ['p2-tipo', 'p2-color', 'p2-mosquitero', 'p2-cajon', 'p2-manija', 'p2-color-manija', 'p2-vidrio'].forEach((id) =>
      document.getElementById(id).addEventListener('change', actualizarPreviewImagenes)
    );
    ['p2-tipo', 'p2-linea'].forEach((id) =>
      document.getElementById(id).addEventListener('change', aplicarBaseEjemplo)
    );

    document.getElementById('btn-agregar-item').addEventListener('click', onAgregarOActualizarItem);
    document.getElementById('btn-cancelar-edicion').addEventListener('click', cancelarEdicion);
    document.getElementById('btn-generar').addEventListener('click', onGenerarPresupuesto);
    document.getElementById('btn-volver-editar').addEventListener('click', () => {
      volverAEditar();
      activarNav('nav-crear');
    });
    document.getElementById('btn-guardar-presupuesto').addEventListener('click', onGuardarPresupuesto);
    document.getElementById('btn-vista-previa-pdf').addEventListener('click', onVistaPreviaPDF);
    document.getElementById('btn-cerrar-pdf-preview').addEventListener('click', cerrarVistaPreviaPDF);
    document.getElementById('btn-descargar-pdf').addEventListener('click', descargarPDFActual);

    document.getElementById('guardados-filtro-cliente').addEventListener('input', renderListaGuardados);
    document.getElementById('guardados-filtro-fecha').addEventListener('change', renderListaGuardados);
    document.getElementById('btn-limpiar-filtros-guardados').addEventListener('click', () => {
      document.getElementById('guardados-filtro-cliente').value = '';
      document.getElementById('guardados-filtro-fecha').value = '';
      renderListaGuardados();
    });

    document.getElementById('nav-crear').addEventListener('click', () => {
      cerrarConfig();
      cerrarClientes();
      cerrarCalendario();
      cerrarGuardados();
      cerrarReportes();
      volverAEditar();
      activarNav('nav-crear');
    });
    document.getElementById('nav-guardados').addEventListener('click', () => {
      cerrarConfig();
      cerrarClientes();
      cerrarCalendario();
      cerrarReportes();
      abrirGuardados();
      activarNav('nav-guardados');
    });
    document.getElementById('nav-clientes').addEventListener('click', () => {
      cerrarCalendario();
      cerrarGuardados();
      cerrarReportes();
      abrirClientes();
      activarNav('nav-clientes');
    });
    document.getElementById('nav-calendario').addEventListener('click', () => {
      cerrarClientes();
      cerrarGuardados();
      cerrarReportes();
      abrirCalendario();
      activarNav('nav-calendario');
    });
    document.getElementById('nav-reportes').addEventListener('click', () => {
      cerrarClientes();
      cerrarCalendario();
      cerrarGuardados();
      cerrarConfig();
      abrirReportes();
      activarNav('nav-reportes');
    });
    document.getElementById('nav-config').addEventListener('click', () => {
      cerrarClientes();
      cerrarCalendario();
      cerrarGuardados();
      cerrarReportes();
      abrirConfig();
      activarNav('nav-config');
    });
    initConfigEvents();
    initClientesEvents();
    initCalendarioEvents();
  }

  function activarNav(navId) {
    ['nav-crear', 'nav-guardados', 'nav-clientes', 'nav-calendario', 'nav-reportes', 'nav-config'].forEach((id) => {
      document.getElementById(id).classList.toggle('active', id === navId);
    });
  }

  function refrescarSelectsPanel2() {
    populateSelect('p2-tipo', state.config.tiposAbertura);
    populateSelect('p2-color', state.config.colores);
    populateSelect('p2-linea', state.config.lineas);
    populateSelect('p2-manija', state.config.tiposManija, 'Ninguna');
    populateSelect('p2-color-manija', state.config.colores);
    populateSelect('p2-vidrio', state.config.tiposVidrio, 'Ninguno');
  }

  // ---------------------------------------------------------------------
  // Panel 2: imágenes automáticas según tipo/manija/vidrio + color
  // ---------------------------------------------------------------------
  function actualizarPreviewImagenes() {
    const tipo = document.getElementById('p2-tipo').value;
    const color = document.getElementById('p2-color').value;
    const mosquitero = document.getElementById('p2-mosquitero').value;
    const cajon = document.getElementById('p2-cajon').value;
    const manija = document.getElementById('p2-manija').value;
    const colorManija = document.getElementById('p2-color-manija').value;
    const vidrio = document.getElementById('p2-vidrio').value;

    document.getElementById('p2-img-abertura').src = imagenAbertura(state.config, tipo, color, mosquitero, cajon);

    const manijaBox = document.getElementById('p2-img-manija-box');
    if (manija) {
      manijaBox.hidden = false;
      document.getElementById('p2-img-manija').src = imagenManija(state.config, manija, colorManija);
    } else {
      manijaBox.hidden = true;
    }

    const vidrioBox = document.getElementById('p2-img-vidrio-box');
    if (vidrio) {
      vidrioBox.hidden = false;
      document.getElementById('p2-img-vidrio').src = imagenVidrio(state.config, vidrio);
    } else {
      vidrioBox.hidden = true;
    }
  }

  function aplicarBaseEjemplo() {
    const manijaSelect = document.getElementById('p2-manija');
    if (manijaSelect.value) return;

    const tipo = document.getElementById('p2-tipo').value;
    const linea = document.getElementById('p2-linea').value;
    if (!tipo || !linea) return;

    const base = (state.config.basesEjemplo || []).find(
      (b) => b.tipo === tipo && (b.linea === linea || b.linea === 'TODAS')
    );
    if (!base) return;

    manijaSelect.value = base.cierre;
    actualizarPreviewImagenes();
  }

  // ---------------------------------------------------------------------
  // Panel 2 -> Panel 3 (agregar / editar ítem)
  // ---------------------------------------------------------------------
  function leerFormularioItem() {
    return {
      tipo: document.getElementById('p2-tipo').value,
      color: document.getElementById('p2-color').value,
      linea: document.getElementById('p2-linea').value,
      manija: document.getElementById('p2-manija').value,
      colorManija: document.getElementById('p2-color-manija').value,
      vidrio: document.getElementById('p2-vidrio').value,
      cajon: document.getElementById('p2-cajon').value,
      mosquitero: document.getElementById('p2-mosquitero').value,
      ancho: parseFloat(document.getElementById('p2-ancho').value),
      alto: parseFloat(document.getElementById('p2-alto').value),
      cantidad: parseInt(document.getElementById('p2-cantidad').value, 10),
      precio: parseFloat(document.getElementById('p2-precio').value),
    };
  }

  function validarFormularioItem(data) {
    if (!data.tipo) return 'Elegí el tipo de abertura.';
    if (!data.color) return 'Elegí un color.';
    if (!data.ancho || data.ancho <= 0) return 'Ingresá un ancho válido.';
    if (!data.alto || data.alto <= 0) return 'Ingresá un alto válido.';
    if (!data.cantidad || data.cantidad <= 0) return 'Ingresá una cantidad válida.';
    if (!data.precio || data.precio <= 0) return 'Ingresá un precio bruto válido.';
    return null;
  }

  function onAgregarOActualizarItem() {
    const errorEl = document.getElementById('p2-error');
    const data = leerFormularioItem();
    const error = validarFormularioItem(data);

    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    if (state.editingItemId) {
      const idx = state.items.findIndex((it) => it.id === state.editingItemId);
      if (idx !== -1) state.items[idx] = { ...data, id: state.editingItemId };
      cancelarEdicion();
    } else {
      state.items.push({ ...data, id: uid() });
    }

    renderListaItems();
    resetFormularioItem();
  }

  function resetFormularioItem() {
    document.getElementById('p2-ancho').value = '';
    document.getElementById('p2-alto').value = '';
    document.getElementById('p2-cantidad').value = '1';
    document.getElementById('p2-precio').value = '';
    document.getElementById('p2-cajon').value = 'no';
    document.getElementById('p2-mosquitero').value = 'no';
    document.getElementById('p2-manija').value = '';
    document.getElementById('p2-vidrio').value = '';
    aplicarBaseEjemplo();
    actualizarPreviewImagenes();
  }

  function cancelarEdicion() {
    state.editingItemId = null;
    document.getElementById('panel2-titulo').textContent = 'Agregar abertura';
    document.getElementById('btn-agregar-item').textContent = 'Agregar al presupuesto';
    document.getElementById('btn-cancelar-edicion').hidden = true;
  }

  function descripcionItem(item) {
    const partes = [`${item.ancho}cm x ${item.alto}cm`, `Cant: ${item.cantidad}`];
    if (item.linea) partes.push(`Línea: ${item.linea}`);
    partes.push(`Cajón: ${item.cajon === 'si' ? 'Sí' : 'No'}`);
    partes.push(`Mosquitero: ${item.mosquitero === 'si' ? 'Sí' : 'No'}`);
    if (item.manija) partes.push(`Cierre: ${item.manija}${item.colorManija ? ' (' + item.colorManija + ')' : ''}`);
    if (item.vidrio) partes.push(`Vidrio: ${item.vidrio}`);
    if (item.precio) {
      partes.push(`Precio: $ ${formatMoney(item.precio)} c/u (Subtotal: $ ${formatMoney(item.precio * item.cantidad)})`);
    }
    return partes.join(' · ');
  }

  function renderListaItems() {
    const cont = document.getElementById('lista-items');
    const emptyMsg = document.getElementById('items-empty');

    if (!state.items.length) {
      cont.innerHTML = '';
      cont.appendChild(emptyMsg);
      emptyMsg.hidden = false;
      return;
    }

    cont.innerHTML = '';
    state.items.forEach((item) => {
      const img = imagenAbertura(state.config, item.tipo, item.color, item.mosquitero, item.cajon);
      const div = document.createElement('div');
      div.className = 'item-card';
      div.innerHTML = `
        <img src="${img}" alt="${item.tipo}" />
        <div class="item-info">
          <strong>${item.tipo} · ${item.color}</strong>
          <span class="item-detalles">${descripcionItem(item)}</span>
        </div>
        <div class="item-card-actions">
          <button type="button" data-action="editar" data-id="${item.id}">Editar</button>
          <button type="button" data-action="eliminar" data-id="${item.id}">Eliminar</button>
        </div>
      `;
      cont.appendChild(div);
    });

    cont.querySelectorAll('[data-action="editar"]').forEach((btn) =>
      btn.addEventListener('click', () => editarItem(btn.dataset.id))
    );
    cont.querySelectorAll('[data-action="eliminar"]').forEach((btn) =>
      btn.addEventListener('click', () => eliminarItem(btn.dataset.id))
    );
  }

  function editarItem(id) {
    const item = state.items.find((it) => it.id === id);
    if (!item) return;

    state.editingItemId = id;
    document.getElementById('p2-tipo').value = item.tipo;
    document.getElementById('p2-color').value = item.color;
    document.getElementById('p2-linea').value = item.linea || '';
    document.getElementById('p2-manija').value = item.manija || '';
    document.getElementById('p2-color-manija').value = item.colorManija || '';
    document.getElementById('p2-vidrio').value = item.vidrio || '';
    document.getElementById('p2-cajon').value = item.cajon;
    document.getElementById('p2-mosquitero').value = item.mosquitero;
    document.getElementById('p2-ancho').value = item.ancho;
    document.getElementById('p2-alto').value = item.alto;
    document.getElementById('p2-cantidad').value = item.cantidad;
    document.getElementById('p2-precio').value = item.precio || '';
    actualizarPreviewImagenes();

    document.getElementById('panel2-titulo').textContent = 'Editar abertura';
    document.getElementById('btn-agregar-item').textContent = 'Guardar cambios';
    document.getElementById('btn-cancelar-edicion').hidden = false;

    document.getElementById('panel2-titulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function eliminarItem(id) {
    state.items = state.items.filter((it) => it.id !== id);
    if (state.editingItemId === id) cancelarEdicion();
    renderListaItems();
  }

  // ---------------------------------------------------------------------
  // Generar presupuesto / vista
  // ---------------------------------------------------------------------
  function leerPanel1() {
    return {
      clienteId: document.getElementById('p1-cliente-select').value || null,
      nombre: document.getElementById('p1-nombre').value.trim(),
      telefono: document.getElementById('p1-telefono').value.trim(),
      direccion: document.getElementById('p1-direccion').value.trim(),
      localidad: document.getElementById('p1-localidad').value.trim(),
      arquitecto: document.getElementById('p1-arquitecto').value.trim(),
      numero: document.getElementById('p1-numero').value.trim(),
      validez: document.getElementById('p1-validez').value.trim(),
      fecha: document.getElementById('p1-fecha').value,
      ivaPorcentaje: parseFloat(document.getElementById('p1-iva').value) || 21,
      descuentoPorcentaje: parseFloat(document.getElementById('p1-descuento').value) || 0,
      extra: document.getElementById('p1-extra').value.trim(),
    };
  }

  function onGenerarPresupuesto() {
    const errorEl = document.getElementById('generar-error');
    const datos = leerPanel1();

    if (!datos.nombre) {
      errorEl.textContent = 'Ingresá el nombre del cliente.';
      errorEl.hidden = false;
      return;
    }
    if (!datos.numero) {
      errorEl.textContent = 'Ingresá un número de presupuesto.';
      errorEl.hidden = false;
      return;
    }
    if (!state.items.length) {
      errorEl.textContent = 'Agregá al menos un ítem al presupuesto.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    renderVistaPresupuesto(datos);
    document.getElementById('editor-view').hidden = true;
    document.getElementById('vista-presupuesto').hidden = false;
  }

  function renderVistaPresupuesto(datos) {
    state.datosActuales = datos;
    document.getElementById('vp-empresa-nombre').textContent = state.config.empresaNombre || '';
    const logo = document.getElementById('vp-logo');
    if (state.config.empresaLogo) {
      logo.src = state.config.empresaLogo;
      logo.hidden = false;
    } else {
      logo.hidden = true;
    }
    document.getElementById('vp-empresa-handle').textContent = state.config.empresaHandle || '';
    document.getElementById('vp-empresa-email').textContent = state.config.empresaEmail || '';
    document.getElementById('vp-empresa-telefonos').textContent = state.config.empresaTelefonos || '';

    const mensajeFinal = state.config.empresaMensajeFinal || '';
    document.getElementById('vp-mensaje-final').textContent = mensajeFinal;
    document.getElementById('vp-mensaje-final-box').hidden = !mensajeFinal;

    document.getElementById('vp-fecha').textContent = formatFechaLegible(datos.fecha);
    document.getElementById('vp-validez').textContent = datos.validez ? `${datos.validez} días` : '-';

    setFila('vp-fila-cliente', 'vp-cliente', datos.nombre);
    setFila('vp-fila-direccion', 'vp-direccion', datos.direccion);
    setFila('vp-fila-arquitecto', 'vp-arquitecto', datos.arquitecto);

    const cont = document.getElementById('vp-lista-items');
    cont.innerHTML = '';
    state.items.forEach((item) => {
      const unidades = Math.max(1, item.cantidad || 1);
      for (let i = 0; i < unidades; i++) {
        cont.appendChild(crearVentanaCard(item));
      }
    });

    actualizarTotales(calcularTotalBrutoItems(), datos.ivaPorcentaje, datos.descuentoPorcentaje);
  }

  function formatMoney(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function calcularTotalBrutoItems() {
    return state.items.reduce((acum, item) => acum + (item.precio || 0) * (item.cantidad || 1), 0);
  }

  function actualizarTotales(totalBruto, ivaPorcentaje, descuentoPorcentaje) {
    ivaPorcentaje = ivaPorcentaje || 21;
    descuentoPorcentaje = descuentoPorcentaje || 0;

    const descuento = totalBruto * (descuentoPorcentaje / 100);
    const baseConDescuento = totalBruto - descuento;
    const iva = baseConDescuento * (ivaPorcentaje / 100);
    const total = baseConDescuento + iva;

    document.getElementById('vp-total-bruto-out').textContent = `$ ${formatMoney(totalBruto)}`;

    const descuentoFila = document.getElementById('vp-descuento-fila');
    descuentoFila.hidden = !descuento;
    if (descuento) {
      document.getElementById('vp-descuento-porcentaje-out').textContent = descuentoPorcentaje;
      document.getElementById('vp-descuento-out').textContent = `- $ ${formatMoney(descuento)}`;
    }

    document.getElementById('vp-iva-porcentaje-out').textContent = ivaPorcentaje;
    document.getElementById('vp-iva-out').textContent = formatMoney(iva);
    document.getElementById('vp-total-out').textContent = formatMoney(total);
    document.getElementById('vp-totales-box').hidden = !totalBruto;
  }

  function crearVentanaCard(item) {
    const imgAbertura = imagenAbertura(state.config, item.tipo, item.color, item.mosquitero, item.cajon);
    const imgManija = item.manija ? imagenManija(state.config, item.manija, item.colorManija) : null;
    const imgVidrio = item.vidrio ? imagenVidrio(state.config, item.vidrio) : null;

    const card = document.createElement('div');
    card.className = 'vp-ventana';
    card.innerHTML = `
      <div class="vp-item-row">
        <img src="${imgAbertura}" alt="${item.tipo}" />
        <div class="vp-item-info">
          <strong>${item.tipo} (${item.ancho} x ${item.alto} mm)</strong>
          ${specsItem(item)}
        </div>
      </div>
      ${
        imgManija || imgVidrio
          ? `<div class="vp-extra-row">
              <div class="vp-extra-col">
                ${imgManija ? `<img src="${imgManija}" alt="${item.manija}" /><span>${item.manija}</span>` : ''}
              </div>
              <div class="vp-extra-col">
                ${imgVidrio ? `<img src="${imgVidrio}" alt="${item.vidrio}" /><span>${item.vidrio}</span>` : ''}
              </div>
            </div>`
          : ''
      }
    `;
    return card;
  }

  function setFila(filaId, spanId, valor) {
    const fila = document.getElementById(filaId);
    document.getElementById(spanId).textContent = valor || '';
    fila.style.display = valor ? '' : 'none';
  }

  function specsItem(item) {
    const lineas = [
      `PRODUCTO: ${item.tipo}${item.linea ? ' LÍNEA ' + item.linea : ''}`,
      `MEDIDAS: ${item.ancho} x ${item.alto} mm`,
    ];
    if (item.vidrio) lineas.push(`VIDRIO: ${item.vidrio}`);
    lineas.push(`COLOR: ${item.color}`);
    if (item.manija) lineas.push(`CIERRE: ${item.manija}${item.colorManija ? ' · ' + item.colorManija : ''}`);
    if (item.cajon === 'si') lineas.push('LLEVA CAJÓN');
    if (item.mosquitero === 'si') lineas.push('LLEVA MOSQUITERO');
    if (item.precio) lineas.push(`PRECIO BRUTO: $ ${formatMoney(item.precio)}`);
    return lineas.map((l) => `<span class="vp-spec-linea">${l}</span>`).join('');
  }

  function volverAEditar() {
    ocultarTodasLasVistas();
    document.getElementById('editor-view').hidden = false;
  }

  // ---------------------------------------------------------------------
  // Vista previa y descarga de PDF (jsPDF + html2canvas)
  // ---------------------------------------------------------------------
  async function generarPDFBlob() {
    const hoja = document.getElementById('hoja-presupuesto');
    const canvas = await html2canvas(hoja, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  }

  async function onVistaPreviaPDF() {
    const modal = document.getElementById('modal-pdf-preview');
    const status = document.getElementById('pdf-preview-status');
    const frame = document.getElementById('pdf-preview-frame');
    const btnDescargar = document.getElementById('btn-descargar-pdf');

    modal.hidden = false;
    status.hidden = false;
    status.textContent = 'Generando PDF...';
    frame.hidden = true;
    btnDescargar.disabled = true;

    try {
      const blob = await generarPDFBlob();
      if (state.pdfBlobUrl) URL.revokeObjectURL(state.pdfBlobUrl);
      state.pdfBlobUrl = URL.createObjectURL(blob);

      frame.src = state.pdfBlobUrl;
      frame.hidden = false;
      status.hidden = true;
      btnDescargar.disabled = false;
    } catch (e) {
      status.textContent = 'No se pudo generar el PDF. Intentá nuevamente.';
    }
  }

  function cerrarVistaPreviaPDF() {
    document.getElementById('modal-pdf-preview').hidden = true;
  }

  function descargarPDFActual() {
    if (!state.pdfBlobUrl) return;
    const numero = state.datosActuales ? state.datosActuales.numero : 'presupuesto';
    const a = document.createElement('a');
    a.href = state.pdfBlobUrl;
    a.download = `presupuesto_${numero}.pdf`;
    a.click();
  }

  // ---------------------------------------------------------------------
  // Guardar / recuperar presupuestos en localStorage
  // ---------------------------------------------------------------------
  async function onGuardarPresupuesto() {
    const datos = leerPanel1();

    const registro = {
      numero: datos.numero,
      clienteId: datos.clienteId,
      panel1: datos,
      items: state.items,
      guardadoEn: new Date().toISOString(),
    };

    const idx = state.presupuestos.findIndex((p) => p.numero === registro.numero);
    if (idx !== -1) state.presupuestos[idx] = { ...registro, descripcion: state.presupuestos[idx].descripcion };
    else state.presupuestos.push(registro);

    try {
      await guardarPresupuestosRemoto(state.presupuestos);
      alert('Presupuesto guardado.');
    } catch (e) {
      alert('No se pudo guardar el presupuesto. Probá nuevamente.');
    }
  }

  async function abrirGuardados() {
    try {
      state.presupuestos = await cargarPresupuestosRemoto();
    } catch (e) {
      /* usamos lo que ya tenemos en memoria */
    }

    renderListaGuardados();
    ocultarTodasLasVistas();
    document.getElementById('guardados-view').hidden = false;
  }

  function cerrarGuardados() {
    document.getElementById('guardados-view').hidden = true;
  }

  // ---------------------------------------------------------------------
  // Reportes
  // ---------------------------------------------------------------------
  async function abrirReportes() {
    try {
      state.presupuestos = await cargarPresupuestosRemoto();
    } catch (e) {
      /* usamos lo que ya tenemos en memoria */
    }

    renderReportes();
    ocultarTodasLasVistas();
    document.getElementById('reportes-view').hidden = false;
  }

  function cerrarReportes() {
    document.getElementById('reportes-view').hidden = true;
  }

  function renderReportes() {
    const cont = document.getElementById('tabla-reportes-mes');
    const aprobados = state.presupuestos.filter((p) => p.estado === 'aprobado');

    if (!aprobados.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no hay presupuestos aprobados.</p>';
      return;
    }

    const datosPorMes = {};
    aprobados.forEach((p) => {
      const fecha = p.panel1.fecha;
      if (!fecha) return;
      const clave = fecha.slice(0, 7);
      if (!datosPorMes[clave]) datosPorMes[clave] = { total: 0, cantidad: 0 };
      datosPorMes[clave].total += calcularTotalRegistro(p);
      datosPorMes[clave].cantidad += 1;
    });

    const claves = Object.keys(datosPorMes).sort().reverse();
    cont.innerHTML = '';

    claves.forEach((clave) => {
      const [y, m] = clave.split('-');
      const etiqueta = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', {
        month: 'long',
        year: 'numeric',
      });
      const { total, cantidad } = datosPorMes[clave];
      const row = document.createElement('div');
      row.className = 'nota-row';
      row.innerHTML = `
        <span>${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)} · ${cantidad} presupuesto(s)</span>
        <strong>$ ${formatMoney(total)}</strong>
      `;
      cont.appendChild(row);
    });
  }

  function renderListaGuardados() {
    const cont = document.getElementById('lista-guardados');
    cont.innerHTML = '';

    if (!state.presupuestos.length) {
      cont.innerHTML = '<p class="empty-msg">No hay presupuestos guardados.</p>';
      return;
    }

    const filtroCliente = document.getElementById('guardados-filtro-cliente').value.trim().toLowerCase();
    const filtroFecha = document.getElementById('guardados-filtro-fecha').value;

    const filtrados = state.presupuestos.filter((p) => {
      if (filtroCliente && !(p.panel1.nombre || '').toLowerCase().includes(filtroCliente)) return false;
      if (filtroFecha && p.panel1.fecha !== filtroFecha) return false;
      return true;
    });

    if (!filtrados.length) {
      cont.innerHTML = '<p class="empty-msg">No hay presupuestos que coincidan con la búsqueda.</p>';
      return;
    }

    filtrados
      .slice()
      .reverse()
      .forEach((p) => {
        const row = document.createElement('div');
        row.className = 'guardado-row';
        const estado = p.estado || 'pendiente';
        row.innerHTML = `
          <div class="guardado-info">
            <strong>N.º ${p.numero}</strong> — ${p.panel1.nombre || 'Sin nombre'}<br/>
            <span>Fecha del presupuesto: ${formatFechaLegible(p.panel1.fecha)} · ${p.items.length} ítem(s) · Total: $ ${formatMoney(calcularTotalRegistro(p))}</span><br/>
            <span class="guardado-fecha-guardado">Guardado el: ${formatFechaHoraLegible(p.guardadoEn)}</span>
            <div class="field guardado-descripcion-field">
              <label>Estado</label>
              <select class="guardado-estado-select" data-estado="${p.numero}">
                <option value="pendiente" ${estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="aprobado" ${estado === 'aprobado' ? 'selected' : ''}>Aprobado</option>
                <option value="rechazado" ${estado === 'rechazado' ? 'selected' : ''}>Rechazado</option>
              </select>
            </div>
            <div class="field guardado-descripcion-field">
              <label>Descripción (opcional)</label>
              <textarea rows="2" data-descripcion="${p.numero}" placeholder="Agregar una descripción...">${p.descripcion || ''}</textarea>
            </div>
          </div>
          <div class="guardado-acciones">
            <button type="button" data-action="cargar" data-numero="${p.numero}">Cargar</button>
            <button type="button" data-action="eliminar" data-numero="${p.numero}">Eliminar</button>
          </div>
        `;
        cont.appendChild(row);
      });

    cont.querySelectorAll('[data-action="cargar"]').forEach((btn) =>
      btn.addEventListener('click', () => cargarGuardado(btn.dataset.numero))
    );
    cont.querySelectorAll('[data-action="eliminar"]').forEach((btn) =>
      btn.addEventListener('click', () => eliminarGuardado(btn.dataset.numero))
    );
    cont.querySelectorAll('[data-descripcion]').forEach((textarea) =>
      textarea.addEventListener('blur', () => onGuardarDescripcion(textarea.dataset.descripcion, textarea.value))
    );
    cont.querySelectorAll('[data-estado]').forEach((select) =>
      select.addEventListener('change', () => onCambiarEstado(select.dataset.estado, select.value))
    );
  }

  async function onGuardarDescripcion(numero, descripcion) {
    const registro = state.presupuestos.find((p) => p.numero === numero);
    if (!registro || registro.descripcion === descripcion) return;
    registro.descripcion = descripcion;
    try {
      await guardarPresupuestosRemoto(state.presupuestos);
    } catch (e) {
      alert('No se pudo guardar la descripción. Probá nuevamente.');
    }
  }

  async function onCambiarEstado(numero, estado) {
    const registro = state.presupuestos.find((p) => p.numero === numero);
    if (!registro) return;
    registro.estado = estado;
    try {
      await guardarPresupuestosRemoto(state.presupuestos);
    } catch (e) {
      alert('No se pudo guardar el estado. Probá nuevamente.');
    }
  }

  function calcularTotalRegistro(registro) {
    const totalBruto = (registro.items || []).reduce(
      (acum, item) => acum + (item.precio || 0) * (item.cantidad || 1),
      0
    );
    const ivaPorcentaje = registro.panel1.ivaPorcentaje || 21;
    const descuentoPorcentaje = registro.panel1.descuentoPorcentaje || 0;
    const descuento = totalBruto * (descuentoPorcentaje / 100);
    const base = totalBruto - descuento;
    const iva = base * (ivaPorcentaje / 100);
    return base + iva;
  }

  function cargarGuardado(numero) {
    const registro = state.presupuestos.find((p) => p.numero === numero);
    if (!registro) return;

    document.getElementById('p1-cliente-select').value = registro.clienteId || '';
    document.getElementById('p1-nombre').value = registro.panel1.nombre || '';
    document.getElementById('p1-telefono').value = registro.panel1.telefono || '';
    document.getElementById('p1-direccion').value = registro.panel1.direccion || '';
    document.getElementById('p1-localidad').value = registro.panel1.localidad || '';
    document.getElementById('p1-arquitecto').value = registro.panel1.arquitecto || '';
    document.getElementById('p1-numero').value = registro.panel1.numero || '';
    document.getElementById('p1-validez').value = registro.panel1.validez || '';
    document.getElementById('p1-fecha').value = registro.panel1.fecha || todayISO();
    document.getElementById('p1-iva').value = registro.panel1.ivaPorcentaje || 21;
    document.getElementById('p1-descuento').value = registro.panel1.descuentoPorcentaje || '';
    document.getElementById('p1-extra').value = registro.panel1.extra || '';

    state.items = registro.items || [];
    cancelarEdicion();
    renderListaItems();

    volverAEditar();
    cerrarGuardados();
    cerrarClientes();
    activarNav('nav-crear');
  }

  async function eliminarGuardado(numero) {
    if (!confirm('¿Eliminar este presupuesto guardado?')) return;
    state.presupuestos = state.presupuestos.filter((p) => p.numero !== numero);
    try {
      await guardarPresupuestosRemoto(state.presupuestos);
    } catch (e) {
      alert('No se pudo eliminar el presupuesto. Probá nuevamente.');
    }
    renderListaGuardados();
  }

  function ocultarTodasLasVistas() {
    document.getElementById('editor-view').hidden = true;
    document.getElementById('vista-presupuesto').hidden = true;
    document.getElementById('config-view').hidden = true;
    document.getElementById('clientes-view').hidden = true;
    document.getElementById('calendario-view').hidden = true;
    document.getElementById('guardados-view').hidden = true;
    document.getElementById('reportes-view').hidden = true;
  }

  // ---------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------
  function abrirClientes() {
    cancelarEdicionCliente();
    renderClientes();
    ocultarTodasLasVistas();
    document.getElementById('clientes-view').hidden = false;
  }

  function cerrarClientes() {
    document.getElementById('clientes-view').hidden = true;
  }

  function poblarSelectClientes() {
    const select = document.getElementById('p1-cliente-select');
    const valorActual = select.value;
    select.innerHTML = '<option value="">— Nuevo / sin registrar —</option>';
    state.clientes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.nombre} ${c.apellido || ''}`.trim();
      select.appendChild(opt);
    });
    if (state.clientes.some((c) => c.id === valorActual)) select.value = valorActual;
  }

  function onSeleccionarClientePanel1() {
    const id = document.getElementById('p1-cliente-select').value;
    if (!id) return;
    const cliente = state.clientes.find((c) => c.id === id);
    if (!cliente) return;
    document.getElementById('p1-nombre').value = `${cliente.nombre} ${cliente.apellido || ''}`.trim();
    document.getElementById('p1-telefono').value = cliente.telefono || '';
  }

  function renderClientes() {
    const cont = document.getElementById('lista-clientes');
    cont.innerHTML = '';

    if (!state.clientes.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no agregaste clientes.</p>';
      return;
    }

    state.clientes.forEach((cliente) => {
      const presupuestosCliente = state.presupuestos.filter((p) => p.clienteId === cliente.id);
      const div = document.createElement('div');
      div.className = 'cliente-row';
      div.innerHTML = `
        <div class="guardado-row">
          <div class="guardado-info">
            <strong>${cliente.nombre} ${cliente.apellido || ''}</strong><br/>
            <span>${cliente.telefono || ''}${cliente.telefono && cliente.email ? ' · ' : ''}${cliente.email || ''}</span><br/>
            <span>${presupuestosCliente.length} presupuesto(s) guardado(s)</span>
          </div>
          <div class="guardado-acciones">
            <button type="button" data-action="editar">Editar</button>
            <button type="button" data-action="eliminar">Eliminar</button>
          </div>
        </div>
      `;
      if (presupuestosCliente.length) {
        const lista = document.createElement('div');
        lista.className = 'cliente-presupuestos';
        presupuestosCliente.forEach((p) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'cliente-presupuesto-link';
          item.textContent = `N.º ${p.numero} · ${formatFechaLegible(p.panel1.fecha)} · ${p.items.length} ítem(s)`;
          item.addEventListener('click', () => cargarGuardado(p.numero));
          lista.appendChild(item);
        });
        div.appendChild(lista);
      }
      div.querySelector('[data-action="editar"]').addEventListener('click', () => editarCliente(cliente.id));
      div.querySelector('[data-action="eliminar"]').addEventListener('click', () => eliminarCliente(cliente.id));
      cont.appendChild(div);
    });
  }

  function leerFormularioCliente() {
    return {
      nombre: document.getElementById('cliente-nombre').value.trim(),
      apellido: document.getElementById('cliente-apellido').value.trim(),
      telefono: document.getElementById('cliente-telefono').value.trim(),
      email: document.getElementById('cliente-email').value.trim(),
    };
  }

  function resetFormularioCliente() {
    document.getElementById('cliente-nombre').value = '';
    document.getElementById('cliente-apellido').value = '';
    document.getElementById('cliente-telefono').value = '';
    document.getElementById('cliente-email').value = '';
  }

  function cancelarEdicionCliente() {
    state.editingClienteId = null;
    document.getElementById('clientes-form-titulo').textContent = 'Nuevo cliente';
    document.getElementById('btn-guardar-cliente').textContent = 'Guardar cliente';
    document.getElementById('btn-cancelar-cliente').hidden = true;
    resetFormularioCliente();
  }

  function editarCliente(id) {
    const cliente = state.clientes.find((c) => c.id === id);
    if (!cliente) return;
    state.editingClienteId = id;
    document.getElementById('cliente-nombre').value = cliente.nombre || '';
    document.getElementById('cliente-apellido').value = cliente.apellido || '';
    document.getElementById('cliente-telefono').value = cliente.telefono || '';
    document.getElementById('cliente-email').value = cliente.email || '';
    document.getElementById('clientes-form-titulo').textContent = 'Editar cliente';
    document.getElementById('btn-guardar-cliente').textContent = 'Guardar cambios';
    document.getElementById('btn-cancelar-cliente').hidden = false;
  }

  async function onGuardarCliente() {
    const errorEl = document.getElementById('cliente-error');
    const datos = leerFormularioCliente();

    if (!datos.nombre) {
      errorEl.textContent = 'Ingresá el nombre del cliente.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    if (state.editingClienteId) {
      const idx = state.clientes.findIndex((c) => c.id === state.editingClienteId);
      if (idx !== -1) state.clientes[idx] = { ...datos, id: state.editingClienteId };
    } else {
      state.clientes.push({ ...datos, id: uid() });
    }

    try {
      await guardarClientesRemoto(state.clientes);
    } catch (e) {
      alert('No se pudo guardar el cliente. Probá nuevamente.');
      return;
    }

    cancelarEdicionCliente();
    renderClientes();
    poblarSelectClientes();
  }

  async function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente? (los presupuestos guardados que tenga asociado no se borran)')) return;
    state.clientes = state.clientes.filter((c) => c.id !== id);
    try {
      await guardarClientesRemoto(state.clientes);
    } catch (e) {
      alert('No se pudo eliminar el cliente. Probá nuevamente.');
    }
    if (state.editingClienteId === id) cancelarEdicionCliente();
    renderClientes();
    poblarSelectClientes();
  }

  function initClientesEvents() {
    document.getElementById('btn-guardar-cliente').addEventListener('click', onGuardarCliente);
    document.getElementById('btn-cancelar-cliente').addEventListener('click', cancelarEdicionCliente);
    document.getElementById('p1-cliente-select').addEventListener('change', onSeleccionarClientePanel1);
  }

  // ---------------------------------------------------------------------
  // Calendario
  // ---------------------------------------------------------------------
  function claveFecha(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function abrirCalendario() {
    if (!state.calDiaSeleccionado) {
      state.calDiaSeleccionado = claveFecha(new Date());
    }
    ocultarTodasLasVistas();
    document.getElementById('calendario-view').hidden = false;
    renderCalendarioMes();
    renderNotasDia();
    renderListaPendientes();
  }

  function cerrarCalendario() {
    document.getElementById('calendario-view').hidden = true;
  }

  function renderCalendarioMes() {
    const vista = state.calVista;
    const año = vista.getFullYear();
    const mes = vista.getMonth();

    const titulo = vista.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    document.getElementById('cal-mes-actual').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

    const primerDiaMes = new Date(año, mes, 1);
    // Lunes = 0 ... Domingo = 6
    const offset = (primerDiaMes.getDay() + 6) % 7;
    const inicioGrilla = new Date(año, mes, 1 - offset);

    const hoyClave = claveFecha(new Date());
    const cont = document.getElementById('calendario-dias');
    cont.innerHTML = '';

    for (let i = 0; i < 42; i++) {
      const dia = new Date(inicioGrilla);
      dia.setDate(inicioGrilla.getDate() + i);
      const clave = claveFecha(dia);

      const celda = document.createElement('div');
      celda.className = 'calendario-dia';
      if (dia.getMonth() !== mes) celda.classList.add('fuera-de-mes');
      if (clave === hoyClave) celda.classList.add('hoy');
      if (clave === state.calDiaSeleccionado) celda.classList.add('seleccionado');

      celda.textContent = String(dia.getDate());

      if ((state.calendario[clave] || []).length) {
        const punto = document.createElement('span');
        punto.className = 'punto-nota';
        celda.appendChild(punto);
      }

      celda.addEventListener('click', () => {
        state.calDiaSeleccionado = clave;
        renderCalendarioMes();
        renderNotasDia();
      });

      cont.appendChild(celda);
    }
  }

  function renderNotasDia() {
    const titulo = document.getElementById('calendario-dia-titulo');
    const cont = document.getElementById('calendario-lista-notas');

    if (!state.calDiaSeleccionado) {
      titulo.textContent = 'Seleccioná un día';
      cont.innerHTML = '<p class="empty-msg">Elegí un día del calendario para ver o agregar anotaciones.</p>';
      return;
    }

    const [y, m, d] = state.calDiaSeleccionado.split('-');
    titulo.textContent = `${d}/${m}/${y}`;

    const notas = state.calendario[state.calDiaSeleccionado] || [];
    cont.innerHTML = '';

    if (!notas.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no hay anotaciones para este día.</p>';
      return;
    }

    notas.forEach((nota) => {
      const row = document.createElement('div');
      row.className = 'nota-row' + (nota.hecho ? ' hecha' : '');
      row.innerHTML = `
        <input type="checkbox" ${nota.hecho ? 'checked' : ''} data-id="${nota.id}" />
        <span>${nota.texto}</span>
        <button type="button" data-id="${nota.id}" aria-label="Eliminar">×</button>
      `;
      row.querySelector('input').addEventListener('change', (e) => onToggleNota(nota.id, e.target.checked));
      row.querySelector('button').addEventListener('click', () => onEliminarNota(nota.id));
      cont.appendChild(row);
    });
  }

  function renderListaPendientes() {
    const cont = document.getElementById('calendario-lista-pendientes');
    if (!cont) return;

    const pendientes = [];
    Object.keys(state.calendario).forEach((clave) => {
      (state.calendario[clave] || []).forEach((nota) => {
        if (!nota.hecho) pendientes.push({ clave, nota });
      });
    });
    pendientes.sort((a, b) => a.clave.localeCompare(b.clave));

    cont.innerHTML = '';

    if (!pendientes.length) {
      cont.innerHTML = '<p class="empty-msg">No hay anotaciones pendientes.</p>';
      return;
    }

    pendientes.forEach(({ clave, nota }) => {
      const [y, m, d] = clave.split('-');
      const row = document.createElement('div');
      row.className = 'nota-row';
      row.innerHTML = `
        <input type="checkbox" data-id="${nota.id}" data-clave="${clave}" />
        <span class="pendiente-fecha">${d}/${m}/${y}</span>
        <span>${nota.texto}</span>
      `;
      row.querySelector('input').addEventListener('change', (e) => onTogglePendiente(clave, nota.id, e.target.checked));
      row.querySelector('span:last-child').addEventListener('click', () => {
        state.calDiaSeleccionado = clave;
        renderCalendarioMes();
        renderNotasDia();
      });
      cont.appendChild(row);
    });
  }

  async function onTogglePendiente(clave, id, hecho) {
    const notas = state.calendario[clave] || [];
    const nota = notas.find((n) => n.id === id);
    if (!nota) return;
    nota.hecho = hecho;
    try {
      await guardarCalendarioRemoto(state.calendario);
    } catch (e) {
      alert('No se pudo guardar el cambio. Probá nuevamente.');
    }
    renderListaPendientes();
    if (clave === state.calDiaSeleccionado) renderNotasDia();
    renderCalendarioMes();
  }

  async function onAgregarNota() {
    if (!state.calDiaSeleccionado) return;
    const input = document.getElementById('calendario-nueva-nota');
    const texto = input.value.trim();
    if (!texto) return;

    if (!state.calendario[state.calDiaSeleccionado]) state.calendario[state.calDiaSeleccionado] = [];
    state.calendario[state.calDiaSeleccionado].push({ id: uid(), texto, hecho: false });

    try {
      await guardarCalendarioRemoto(state.calendario);
    } catch (e) {
      alert('No se pudo guardar la anotación. Probá nuevamente.');
      return;
    }

    input.value = '';
    renderNotasDia();
    renderCalendarioMes();
    renderListaPendientes();
  }

  async function onToggleNota(id, hecho) {
    const notas = state.calendario[state.calDiaSeleccionado] || [];
    const nota = notas.find((n) => n.id === id);
    if (!nota) return;
    nota.hecho = hecho;
    try {
      await guardarCalendarioRemoto(state.calendario);
    } catch (e) {
      alert('No se pudo guardar el cambio. Probá nuevamente.');
    }
    renderNotasDia();
    renderListaPendientes();
  }

  async function onEliminarNota(id) {
    if (!confirm('¿Eliminar esta anotación?')) return;
    state.calendario[state.calDiaSeleccionado] = (state.calendario[state.calDiaSeleccionado] || []).filter(
      (n) => n.id !== id
    );
    try {
      await guardarCalendarioRemoto(state.calendario);
    } catch (e) {
      alert('No se pudo eliminar la anotación. Probá nuevamente.');
    }
    renderNotasDia();
    renderListaPendientes();
    renderCalendarioMes();
  }

  function initCalendarioEvents() {
    document.getElementById('cal-mes-anterior').addEventListener('click', () => {
      state.calVista.setMonth(state.calVista.getMonth() - 1);
      renderCalendarioMes();
    });
    document.getElementById('cal-mes-siguiente').addEventListener('click', () => {
      state.calVista.setMonth(state.calVista.getMonth() + 1);
      renderCalendarioMes();
    });
    document.getElementById('btn-add-nota').addEventListener('click', onAgregarNota);
    document.getElementById('calendario-nueva-nota').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onAgregarNota();
    });
  }

  // ---------------------------------------------------------------------
  // Configuración: tipos, colores, líneas, imágenes
  // ---------------------------------------------------------------------
  function abrirConfig() {
    renderConfig();
    ocultarTodasLasVistas();
    document.getElementById('config-view').hidden = false;
  }

  function cerrarConfig() {
    document.getElementById('config-view').hidden = true;
    refrescarSelectsPanel2();
    actualizarPreviewImagenes();
    renderListaItems();
  }

  const COLLATOR_ES = new Intl.Collator('es', { sensitivity: 'base' });

  function ordenarListasConfig(c) {
    ['tiposAbertura', 'colores', 'lineas', 'perfiles', 'tiposManija', 'tiposVidrio'].forEach((clave) => {
      if (Array.isArray(c[clave])) c[clave].sort(COLLATOR_ES.compare);
    });
  }

  async function guardarYRenderConfig() {
    ordenarListasConfig(state.config);
    try {
      await guardarConfigRemota(state.config);
    } catch (e) {
      alert('No se pudo guardar la configuración. Probá nuevamente.');
    }
    renderConfig();
  }

  function renderListaChips(contId, valores, onEliminar) {
    const cont = document.getElementById(contId);
    cont.innerHTML = '';
    if (!valores.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no agregaste ninguno.</p>';
      return;
    }
    valores.forEach((valor) => {
      const chip = document.createElement('span');
      chip.className = 'config-chip';
      chip.innerHTML = `${valor} <button type="button" aria-label="Eliminar">×</button>`;
      chip.querySelector('button').addEventListener('click', () => onEliminar(valor));
      cont.appendChild(chip);
    });
  }

  function agregarSimple(lista, valor) {
    const limpio = (valor || '').trim();
    if (!limpio || lista.includes(limpio)) return false;
    lista.push(limpio);
    return true;
  }

  function actualizarLogoSidebar() {
    const logo = document.getElementById('sidebar-logo');
    if (state.config.empresaLogo) {
      logo.src = state.config.empresaLogo;
      logo.hidden = false;
    } else {
      logo.hidden = true;
    }
  }

  function renderConfig() {
    const c = state.config;
    actualizarLogoSidebar();

    document.getElementById('config-empresa-nombre').value = c.empresaNombre || '';
    document.getElementById('config-empresa-handle').value = c.empresaHandle || '';
    document.getElementById('config-empresa-email').value = c.empresaEmail || '';
    document.getElementById('config-empresa-telefonos').value = c.empresaTelefonos || '';
    document.getElementById('config-empresa-mensaje-final').value = c.empresaMensajeFinal || '';
    renderPreviewImg('config-empresa-logo-preview', c.empresaLogo || null);

    renderListaChips('config-lista-colores', c.colores, (v) => {
      c.colores = c.colores.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-lineas', c.lineas, (v) => {
      c.lineas = c.lineas.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-perfiles', c.perfiles, (v) => {
      c.perfiles = c.perfiles.filter((x) => x !== v);
      delete c.valores.perfil[v];
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-aberturas', c.tiposAbertura, (v) => {
      c.tiposAbertura = c.tiposAbertura.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-manijas', c.tiposManija, (v) => {
      c.tiposManija = c.tiposManija.filter((x) => x !== v);
      delete c.valores.cierre[v];
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-vidrios', c.tiposVidrio, (v) => {
      c.tiposVidrio = c.tiposVidrio.filter((x) => x !== v);
      delete c.valores.vidrio[v];
      guardarYRenderConfig();
    });

    populateSelect('config-img-manija', c.tiposManija);
    populateSelect('config-img-color-manija', c.colores);
    renderChecksVidrio(c.tiposVidrio);
    renderGruposAbertura();

    renderPreviewImg('config-preview-manija', c.tiposManija.length && c.colores.length
      ? imagenManija(c, document.getElementById('config-img-manija').value, document.getElementById('config-img-color-manija').value)
      : null);

    renderGaleriaAsignadas('config-galeria-manija', c.imagenesManija, (clave) => {
      delete c.imagenesManija[clave];
      guardarYRenderConfig();
    });
    renderGaleriaAsignadas('config-galeria-vidrio', c.imagenesVidrio, (clave) => {
      delete c.imagenesVidrio[clave];
      guardarYRenderConfig();
    });

    populateSelect('base-tipo', c.tiposAbertura);
    populateSelect('base-linea', ['TODAS', ...c.lineas]);
    populateSelect('base-cierre', c.tiposManija);
    renderListaBasesEjemplo();
    renderValores();
  }

  function renderListaBasesEjemplo() {
    const c = state.config;
    if (!c.basesEjemplo) c.basesEjemplo = [];
    const cont = document.getElementById('lista-bases-ejemplo');
    cont.innerHTML = '';

    if (!c.basesEjemplo.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no agregaste bases de ejemplo.</p>';
      return;
    }

    c.basesEjemplo.forEach((base, idx) => {
      const row = document.createElement('div');
      row.className = 'nota-row';
      row.innerHTML = `
        <span>${base.tipo} · ${base.linea} → <strong>${base.cierre}</strong></span>
        <button type="button" data-idx="${idx}" aria-label="Eliminar">×</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        c.basesEjemplo.splice(idx, 1);
        guardarYRenderConfig();
      });
      cont.appendChild(row);
    });
  }

  function renderTablaValores(bodyId, nombres, mapaPrecios) {
    const body = document.getElementById(bodyId);
    body.innerHTML = '';

    if (!nombres.length) {
      body.innerHTML = '<tr><td colspan="2" class="empty-msg">Todavía no agregaste ninguno.</td></tr>';
      return;
    }

    nombres.forEach((nombre) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${nombre}</td>
        <td><input type="number" min="0" step="0.01" value="${mapaPrecios[nombre] || ''}" placeholder="0.00" /></td>
      `;
      row.querySelector('input').addEventListener('blur', (e) => {
        const precio = parseFloat(e.target.value) || 0;
        if (precio === (mapaPrecios[nombre] || 0)) return;
        mapaPrecios[nombre] = precio;
        guardarYRenderConfig();
      });
      body.appendChild(row);
    });
  }

  function renderValores() {
    const c = state.config;
    if (!c.valores) c.valores = { cierre: {}, vidrio: {}, perfil: {} };
    renderTablaValores('tabla-valores-cierre-body', c.tiposManija, c.valores.cierre);
    renderTablaValores('tabla-valores-vidrio-body', c.tiposVidrio, c.valores.vidrio);
    renderTablaValores('tabla-valores-perfil-body', c.perfiles, c.valores.perfil);
  }

  function renderPreviewImg(contId, src) {
    const cont = document.getElementById(contId);
    cont.innerHTML = src ? `<img src="${src}" alt="preview" />` : '';
  }

  function renderChecksVidrio(tiposVidrio) {
    const cont = document.getElementById('config-img-vidrio-checks');
    cont.innerHTML = '';

    if (!tiposVidrio.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no agregaste tipos de vidrio.</p>';
      return;
    }

    tiposVidrio.forEach((nombre) => {
      const label = document.createElement('label');
      label.className = 'config-check-item';
      label.innerHTML = `<input type="checkbox" value="${nombre}" /> ${nombre}`;
      cont.appendChild(label);
    });
  }

  function renderGruposAbertura() {
    const c = state.config;
    const cont = document.getElementById('config-aberturas-grupos');
    cont.innerHTML = '';

    if (!c.tiposAbertura.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no agregaste tipos de abertura.</p>';
      return;
    }

    const colorOptions = c.colores.map((col) => `<option value="${col}">${col}</option>`).join('');

    c.tiposAbertura.forEach((tipo) => {
      const details = document.createElement('details');
      details.className = 'config-checks-detalle';
      details.innerHTML = `
        <summary>${tipo}</summary>
        <div class="config-img-form">
          <select class="grupo-color">${colorOptions}</select>
          <select class="grupo-mosquitero">
            <option value="no">Sin mosquitero</option>
            <option value="si">Con mosquitero</option>
          </select>
          <select class="grupo-cajon">
            <option value="no">Sin cajón</option>
            <option value="si">Con cajón</option>
          </select>
          <input type="file" class="grupo-file" accept="image/*" />
          <button type="button" class="btn btn-primary grupo-guardar">Guardar imagen</button>
        </div>
        <div class="config-galeria-asignadas grupo-galeria"></div>
      `;

      const galeria = details.querySelector('.grupo-galeria');
      const clavesTipo = Object.keys(c.imagenesAbertura).filter((clave) => clave.split('||')[0] === tipo);
      if (!clavesTipo.length) {
        galeria.innerHTML = '<p class="empty-msg">Todavía no asignaste imágenes para este tipo.</p>';
      } else {
        clavesTipo.forEach((clave) => {
          const partes = clave.split('||');
          const etiqueta = [
            partes[1],
            partes[2] === 'si' ? 'Con mosquitero' : 'Sin mosquitero',
            partes[3] === 'si' ? 'Con cajón' : 'Sin cajón',
          ].join(' · ');
          const item = document.createElement('div');
          item.className = 'config-galeria-item';
          item.innerHTML = `
            <button type="button" aria-label="Eliminar">×</button>
            <img src="${c.imagenesAbertura[clave]}" alt="${etiqueta}" />
            <span>${etiqueta}</span>
          `;
          item.querySelector('button').addEventListener('click', () => {
            delete c.imagenesAbertura[clave];
            guardarYRenderConfig();
          });
          galeria.appendChild(item);
        });
      }

      details.querySelector('.grupo-guardar').addEventListener('click', async () => {
        const color = details.querySelector('.grupo-color').value;
        const mosquitero = details.querySelector('.grupo-mosquitero').value;
        const cajon = details.querySelector('.grupo-cajon').value;
        const file = details.querySelector('.grupo-file').files[0];
        if (!color || !file) {
          alert('Elegí color y un archivo de imagen.');
          return;
        }
        try {
          const url = await subirImagen(file);
          c.imagenesAbertura[claveAbertura(tipo, color, mosquitero, cajon)] = url;
        } catch (e) {
          alert('No se pudo subir la imagen. Probá nuevamente.');
          return;
        }
        guardarYRenderConfig();
      });

      cont.appendChild(details);
    });
  }

  function renderGaleriaAsignadas(contId, mapa, onEliminar) {
    const cont = document.getElementById(contId);
    cont.innerHTML = '';
    const claves = Object.keys(mapa);
    if (!claves.length) {
      cont.innerHTML = '<p class="empty-msg">Todavía no asignaste imágenes.</p>';
      return;
    }
    claves.forEach((clave) => {
      const div = document.createElement('div');
      div.className = 'config-galeria-item';
      const partes = clave.split('||');
      if (partes.length === 4) {
        partes[2] = partes[2] === 'si' ? 'Con mosquitero' : 'Sin mosquitero';
        partes[3] = partes[3] === 'si' ? 'Con cajón' : 'Sin cajón';
      } else if (partes.length === 3) {
        partes[2] = partes[2] === 'si' ? 'Con mosquitero' : 'Sin mosquitero';
      }
      const etiqueta = partes.join(' · ');
      div.innerHTML = `
        <button type="button" aria-label="Eliminar">×</button>
        <img src="${mapa[clave]}" alt="${etiqueta}" />
        <span>${etiqueta}</span>
      `;
      div.querySelector('button').addEventListener('click', () => onEliminar(clave));
      cont.appendChild(div);
    });
  }


  function initConfigEvents() {
    document.getElementById('btn-guardar-empresa').addEventListener('click', () => {
      state.config.empresaNombre = document.getElementById('config-empresa-nombre').value.trim();
      state.config.empresaHandle = document.getElementById('config-empresa-handle').value.trim();
      state.config.empresaEmail = document.getElementById('config-empresa-email').value.trim();
      state.config.empresaTelefonos = document.getElementById('config-empresa-telefonos').value;
      state.config.empresaMensajeFinal = document.getElementById('config-empresa-mensaje-final').value;
      guardarYRenderConfig();
    });

    document.getElementById('btn-guardar-logo').addEventListener('click', async () => {
      const file = document.getElementById('config-empresa-logo-file').files[0];
      if (!file) {
        alert('Elegí un archivo de imagen.');
        return;
      }
      try {
        state.config.empresaLogo = await subirImagen(file);
        document.getElementById('config-empresa-logo-file').value = '';
      } catch (e) {
        alert('No se pudo subir el logo. Probá nuevamente.');
        return;
      }
      guardarYRenderConfig();
    });

    document.getElementById('btn-add-color').addEventListener('click', () => {
      const input = document.getElementById('config-nuevo-color');
      if (agregarSimple(state.config.colores, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });
    document.getElementById('btn-add-linea').addEventListener('click', () => {
      const input = document.getElementById('config-nueva-linea');
      if (agregarSimple(state.config.lineas, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });
    document.getElementById('btn-add-perfil').addEventListener('click', () => {
      const input = document.getElementById('config-nuevo-perfil');
      if (agregarSimple(state.config.perfiles, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });
    document.getElementById('btn-add-tipo').addEventListener('click', () => {
      const input = document.getElementById('config-nuevo-tipo');
      if (agregarSimple(state.config.tiposAbertura, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });
    document.getElementById('btn-add-manija').addEventListener('click', () => {
      const input = document.getElementById('config-nueva-manija');
      if (agregarSimple(state.config.tiposManija, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });
    document.getElementById('btn-add-vidrio').addEventListener('click', () => {
      const input = document.getElementById('config-nuevo-vidrio');
      if (agregarSimple(state.config.tiposVidrio, input.value)) {
        input.value = '';
        guardarYRenderConfig();
      }
    });

    document.getElementById('btn-add-base').addEventListener('click', () => {
      const tipo = document.getElementById('base-tipo').value;
      const linea = document.getElementById('base-linea').value;
      const cierre = document.getElementById('base-cierre').value;
      if (!tipo || !linea || !cierre) {
        alert('Elegí tipo, línea y cierre.');
        return;
      }
      if (!state.config.basesEjemplo) state.config.basesEjemplo = [];
      state.config.basesEjemplo = state.config.basesEjemplo.filter(
        (b) => !(b.tipo === tipo && b.linea === linea)
      );
      state.config.basesEjemplo.push({ tipo, linea, cierre });
      guardarYRenderConfig();
    });

    ['config-img-manija', 'config-img-color-manija'].forEach((id) =>
      document.getElementById(id).addEventListener('change', () => {
        const manija = document.getElementById('config-img-manija').value;
        const color = document.getElementById('config-img-color-manija').value;
        renderPreviewImg('config-preview-manija', manija ? imagenManija(state.config, manija, color) : null);
      })
    );

    document.getElementById('btn-guardar-img-manija').addEventListener('click', async () => {
      const manija = document.getElementById('config-img-manija').value;
      const color = document.getElementById('config-img-color-manija').value;
      const file = document.getElementById('config-img-file-manija').files[0];
      if (!manija || !color || !file) {
        alert('Elegí cierre, color y un archivo de imagen.');
        return;
      }
      try {
        state.config.imagenesManija[claveManija(manija, color)] = await subirImagen(file);
      } catch (e) {
        alert('No se pudo subir la imagen. Probá nuevamente.');
        return;
      }
      document.getElementById('config-img-file-manija').value = '';
      guardarYRenderConfig();
    });

    document.getElementById('btn-guardar-img-vidrio').addEventListener('click', async () => {
      const vidrios = Array.from(
        document.querySelectorAll('#config-img-vidrio-checks input[type="checkbox"]:checked')
      ).map((input) => input.value);
      const file = document.getElementById('config-img-file-vidrio').files[0];
      if (!vidrios.length || !file) {
        alert('Elegí al menos un tipo de vidrio y un archivo de imagen.');
        return;
      }
      try {
        const url = await subirImagen(file);
        vidrios.forEach((vidrio) => {
          state.config.imagenesVidrio[vidrio] = url;
        });
      } catch (e) {
        alert('No se pudo subir la imagen. Probá nuevamente.');
        return;
      }
      document.getElementById('config-img-file-vidrio').value = '';
      guardarYRenderConfig();
    });
  }

  // ---------------------------------------------------------------------
  checkSession();
})();
