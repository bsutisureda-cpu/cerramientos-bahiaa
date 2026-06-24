(function () {
  const state = {
    items: [],
    editingItemId: null,
    editingClienteId: null,
    config: null,
    clientes: [],
    presupuestos: [],
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
      state.clientes = await cargarClientesRemoto();
      state.presupuestos = await cargarPresupuestosRemoto();
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
    document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModalGuardados);

    document.getElementById('nav-crear').addEventListener('click', () => {
      cerrarConfig();
      cerrarClientes();
      volverAEditar();
      activarNav('nav-crear');
    });
    document.getElementById('nav-guardados').addEventListener('click', abrirModalGuardados);
    document.getElementById('nav-clientes').addEventListener('click', () => {
      abrirClientes();
      activarNav('nav-clientes');
    });
    document.getElementById('nav-config').addEventListener('click', () => {
      cerrarClientes();
      abrirConfig();
      activarNav('nav-config');
    });
    initConfigEvents();
    initClientesEvents();
  }

  function activarNav(navId) {
    ['nav-crear', 'nav-guardados', 'nav-clientes', 'nav-config'].forEach((id) => {
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
    };
  }

  function validarFormularioItem(data) {
    if (!data.tipo) return 'Elegí el tipo de abertura.';
    if (!data.color) return 'Elegí un color.';
    if (!data.ancho || data.ancho <= 0) return 'Ingresá un ancho válido.';
    if (!data.alto || data.alto <= 0) return 'Ingresá un alto válido.';
    if (!data.cantidad || data.cantidad <= 0) return 'Ingresá una cantidad válida.';
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
    document.getElementById('p2-cajon').value = 'no';
    document.getElementById('p2-mosquitero').value = 'no';
    document.getElementById('p2-manija').value = '';
    document.getElementById('p2-vidrio').value = '';
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
    if (item.manija) partes.push(`Manija: ${item.manija}${item.colorManija ? ' (' + item.colorManija + ')' : ''}`);
    if (item.vidrio) partes.push(`Vidrio: ${item.vidrio}`);
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
    if (item.manija) lineas.push(`MANIJA: ${item.manija}${item.colorManija ? ' · ' + item.colorManija : ''}`);
    if (item.cajon === 'si') lineas.push('LLEVA CAJÓN');
    if (item.mosquitero === 'si') lineas.push('LLEVA MOSQUITERO');
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
    const precioTexto = document.getElementById('vp-precio-texto').value;

    const registro = {
      numero: datos.numero,
      clienteId: datos.clienteId,
      panel1: datos,
      items: state.items,
      precioTexto,
      guardadoEn: new Date().toISOString(),
    };

    const idx = state.presupuestos.findIndex((p) => p.numero === registro.numero);
    if (idx !== -1) state.presupuestos[idx] = registro;
    else state.presupuestos.push(registro);

    try {
      await guardarPresupuestosRemoto(state.presupuestos);
      alert('Presupuesto guardado.');
    } catch (e) {
      alert('No se pudo guardar el presupuesto. Probá nuevamente.');
    }
  }

  async function abrirModalGuardados() {
    try {
      state.presupuestos = await cargarPresupuestosRemoto();
    } catch (e) {
      /* usamos lo que ya tenemos en memoria */
    }

    const cont = document.getElementById('lista-guardados');
    cont.innerHTML = '';

    if (!state.presupuestos.length) {
      cont.innerHTML = '<p class="empty-msg">No hay presupuestos guardados.</p>';
    } else {
      state.presupuestos
        .slice()
        .reverse()
        .forEach((p) => {
          const row = document.createElement('div');
          row.className = 'guardado-row';
          row.innerHTML = `
            <div class="guardado-info">
              <strong>N.º ${p.numero}</strong> — ${p.panel1.nombre || 'Sin nombre'}<br/>
              <span>${formatFechaLegible(p.panel1.fecha)} · ${p.items.length} ítem(s)</span>
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
    }

    document.getElementById('modal-guardados').hidden = false;
  }

  function cerrarModalGuardados() {
    document.getElementById('modal-guardados').hidden = true;
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
    document.getElementById('p1-extra').value = registro.panel1.extra || '';

    state.items = registro.items || [];
    cancelarEdicion();
    renderListaItems();

    document.getElementById('vp-precio-texto').value = registro.precioTexto || '';

    volverAEditar();
    cerrarModalGuardados();
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
    abrirModalGuardados();
  }

  function ocultarTodasLasVistas() {
    document.getElementById('editor-view').hidden = true;
    document.getElementById('vista-presupuesto').hidden = true;
    document.getElementById('config-view').hidden = true;
    document.getElementById('clientes-view').hidden = true;
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

  async function guardarYRenderConfig() {
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
    renderPreviewImg('config-empresa-logo-preview', c.empresaLogo || null);

    renderListaChips('config-lista-colores', c.colores, (v) => {
      c.colores = c.colores.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-lineas', c.lineas, (v) => {
      c.lineas = c.lineas.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-aberturas', c.tiposAbertura, (v) => {
      c.tiposAbertura = c.tiposAbertura.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-manijas', c.tiposManija, (v) => {
      c.tiposManija = c.tiposManija.filter((x) => x !== v);
      guardarYRenderConfig();
    });
    renderListaChips('config-lista-vidrios', c.tiposVidrio, (v) => {
      c.tiposVidrio = c.tiposVidrio.filter((x) => x !== v);
      guardarYRenderConfig();
    });

    populateSelect('config-img-tipo', c.tiposAbertura);
    populateSelect('config-img-color', c.colores);
    populateSelect('config-img-manija', c.tiposManija);
    populateSelect('config-img-color-manija', c.colores);
    populateSelect('config-img-vidrio', c.tiposVidrio);

    renderPreviewImg('config-preview-abertura', c.tiposAbertura.length && c.colores.length
      ? imagenAbertura(
          c,
          document.getElementById('config-img-tipo').value,
          document.getElementById('config-img-color').value,
          document.getElementById('config-img-mosquitero').value,
          document.getElementById('config-img-cajon').value
        )
      : null);
    renderPreviewImg('config-preview-manija', c.tiposManija.length && c.colores.length
      ? imagenManija(c, document.getElementById('config-img-manija').value, document.getElementById('config-img-color-manija').value)
      : null);
    renderPreviewImg('config-preview-vidrio', c.tiposVidrio.length
      ? imagenVidrio(c, document.getElementById('config-img-vidrio').value)
      : null);

    renderGaleriaAsignadas('config-galeria-abertura', c.imagenesAbertura, (clave) => {
      delete c.imagenesAbertura[clave];
      guardarYRenderConfig();
    });
    renderGaleriaAsignadas('config-galeria-manija', c.imagenesManija, (clave) => {
      delete c.imagenesManija[clave];
      guardarYRenderConfig();
    });
    renderGaleriaAsignadas('config-galeria-vidrio', c.imagenesVidrio, (clave) => {
      delete c.imagenesVidrio[clave];
      guardarYRenderConfig();
    });
  }

  function renderPreviewImg(contId, src) {
    const cont = document.getElementById(contId);
    cont.innerHTML = src ? `<img src="${src}" alt="preview" />` : '';
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
    document.getElementById('btn-guardar-empresa').addEventListener('click', async () => {
      state.config.empresaNombre = document.getElementById('config-empresa-nombre').value.trim();
      state.config.empresaHandle = document.getElementById('config-empresa-handle').value.trim();
      state.config.empresaEmail = document.getElementById('config-empresa-email').value.trim();
      state.config.empresaTelefonos = document.getElementById('config-empresa-telefonos').value;
      const file = document.getElementById('config-empresa-logo-file').files[0];
      if (file) {
        try {
          state.config.empresaLogo = await subirImagen(file);
          document.getElementById('config-empresa-logo-file').value = '';
        } catch (e) {
          alert('No se pudo subir el logo. Probá nuevamente.');
          return;
        }
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

    ['config-img-tipo', 'config-img-color', 'config-img-mosquitero', 'config-img-cajon'].forEach((id) =>
      document.getElementById(id).addEventListener('change', () => {
        renderPreviewImg(
          'config-preview-abertura',
          imagenAbertura(
            state.config,
            document.getElementById('config-img-tipo').value,
            document.getElementById('config-img-color').value,
            document.getElementById('config-img-mosquitero').value,
            document.getElementById('config-img-cajon').value
          )
        );
      })
    );
    ['config-img-manija', 'config-img-color-manija'].forEach((id) =>
      document.getElementById(id).addEventListener('change', () => {
        const manija = document.getElementById('config-img-manija').value;
        const color = document.getElementById('config-img-color-manija').value;
        renderPreviewImg('config-preview-manija', manija ? imagenManija(state.config, manija, color) : null);
      })
    );
    document.getElementById('config-img-vidrio').addEventListener('change', () => {
      const vidrio = document.getElementById('config-img-vidrio').value;
      renderPreviewImg('config-preview-vidrio', vidrio ? imagenVidrio(state.config, vidrio) : null);
    });

    document.getElementById('btn-guardar-img-abertura').addEventListener('click', async () => {
      const tipo = document.getElementById('config-img-tipo').value;
      const color = document.getElementById('config-img-color').value;
      const mosquitero = document.getElementById('config-img-mosquitero').value;
      const cajon = document.getElementById('config-img-cajon').value;
      const file = document.getElementById('config-img-file').files[0];
      if (!tipo || !color || !file) {
        alert('Elegí tipo, color y un archivo de imagen.');
        return;
      }
      try {
        state.config.imagenesAbertura[claveAbertura(tipo, color, mosquitero, cajon)] = await subirImagen(file);
      } catch (e) {
        alert('No se pudo subir la imagen. Probá nuevamente.');
        return;
      }
      document.getElementById('config-img-file').value = '';
      guardarYRenderConfig();
    });

    document.getElementById('btn-guardar-img-manija').addEventListener('click', async () => {
      const manija = document.getElementById('config-img-manija').value;
      const color = document.getElementById('config-img-color-manija').value;
      const file = document.getElementById('config-img-file-manija').files[0];
      if (!manija || !color || !file) {
        alert('Elegí manija, color y un archivo de imagen.');
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
      const vidrio = document.getElementById('config-img-vidrio').value;
      const file = document.getElementById('config-img-file-vidrio').files[0];
      if (!vidrio || !file) {
        alert('Elegí un tipo de vidrio y un archivo de imagen.');
        return;
      }
      try {
        state.config.imagenesVidrio[vidrio] = await subirImagen(file);
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
