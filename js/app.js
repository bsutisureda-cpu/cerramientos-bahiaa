(function () {
  const STORAGE_KEY = 'cerr_presupuestos';
  const LAST_NUMERO_KEY = 'cerr_ultimo_numero';

  const state = {
    items: [],
    editingItemId: null,
  };

  // ---------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------
  async function checkSession() {
    try {
      const resp = await fetch('/api/check', { method: 'GET' });
      if (!resp.ok) throw new Error('no autorizado');
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
  // Helpers
  // ---------------------------------------------------------------------
  function uid() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nextNumero() {
    const last = parseInt(localStorage.getItem(LAST_NUMERO_KEY) || '0', 10);
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

  function getSavedList() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function setSavedList(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function initApp() {
    populateSelect('p2-tipo', TIPOS_ABERTURA);
    populateSelect('p2-cierre', TIPOS_CIERRE);

    document.getElementById('p1-numero').value = nextNumero();
    document.getElementById('p1-fecha').value = todayISO();

    renderGaleria();
    renderListaItems();

    document.getElementById('p2-tipo').addEventListener('change', () => renderGaleria());
    document.getElementById('btn-agregar-item').addEventListener('click', onAgregarOActualizarItem);
    document.getElementById('btn-cancelar-edicion').addEventListener('click', cancelarEdicion);
    document.getElementById('btn-generar').addEventListener('click', onGenerarPresupuesto);
    document.getElementById('btn-volver-editar').addEventListener('click', volverAEditar);
    document.getElementById('btn-guardar-presupuesto').addEventListener('click', onGuardarPresupuesto);
    document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
    document.getElementById('btn-guardados').addEventListener('click', abrirModalGuardados);
    document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModalGuardados);
  }

  function populateSelect(id, values) {
    const select = document.getElementById(id);
    select.innerHTML = '';
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  // ---------------------------------------------------------------------
  // Panel 2: galería de imágenes
  // ---------------------------------------------------------------------
  let imagenSeleccionadaId = null;

  function renderGaleria(preselectId) {
    const tipo = document.getElementById('p2-tipo').value;
    const contenedor = document.getElementById('p2-galeria');
    const imagenes = imagenesPorTipo(tipo);

    if (!preselectId || !imagenes.some((i) => i.id === preselectId)) {
      preselectId = imagenes.length ? imagenes[0].id : null;
    }
    imagenSeleccionadaId = preselectId;

    contenedor.innerHTML = '';
    imagenes.forEach((img) => {
      const div = document.createElement('div');
      div.className = 'galeria-item' + (img.id === imagenSeleccionadaId ? ' selected' : '');
      div.innerHTML = `<img src="${img.file}" alt="${img.label}" /><span>${img.label}</span>`;
      div.addEventListener('click', () => {
        imagenSeleccionadaId = img.id;
        contenedor.querySelectorAll('.galeria-item').forEach((el) => el.classList.remove('selected'));
        div.classList.add('selected');
      });
      contenedor.appendChild(div);
    });
  }

  // ---------------------------------------------------------------------
  // Panel 2 -> Panel 3 (agregar / editar ítem)
  // ---------------------------------------------------------------------
  function leerFormularioItem() {
    return {
      tipo: document.getElementById('p2-tipo').value,
      cierre: document.getElementById('p2-cierre').value,
      cajon: document.getElementById('p2-cajon').value,
      mosquitero: document.getElementById('p2-mosquitero').value,
      ancho: parseFloat(document.getElementById('p2-ancho').value),
      alto: parseFloat(document.getElementById('p2-alto').value),
      cantidad: parseInt(document.getElementById('p2-cantidad').value, 10),
      imagenId: imagenSeleccionadaId,
    };
  }

  function validarFormularioItem(data) {
    if (!data.tipo || !data.cierre) return 'Elegí tipo de abertura y de cierre.';
    if (!data.ancho || data.ancho <= 0) return 'Ingresá un ancho válido.';
    if (!data.alto || data.alto <= 0) return 'Ingresá un alto válido.';
    if (!data.cantidad || data.cantidad <= 0) return 'Ingresá una cantidad válida.';
    if (!data.imagenId) return 'Seleccioná una imagen.';
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
  }

  function cancelarEdicion() {
    state.editingItemId = null;
    document.getElementById('panel2-titulo').textContent = '2. Agregar abertura';
    document.getElementById('btn-agregar-item').textContent = 'Agregar al presupuesto';
    document.getElementById('btn-cancelar-edicion').hidden = true;
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
      const img = imagenPorId(item.imagenId);
      const div = document.createElement('div');
      div.className = 'item-card';
      div.innerHTML = `
        <img src="${img ? img.file : ''}" alt="${item.tipo}" />
        <div class="item-info">
          <strong>${item.tipo} · ${item.cierre}</strong>
          <span class="item-detalles">
            ${item.ancho}cm x ${item.alto}cm · Cant: ${item.cantidad} ·
            Cajón: ${item.cajon === 'si' ? 'Sí' : 'No'} ·
            Mosquitero: ${item.mosquitero === 'si' ? 'Sí' : 'No'}
          </span>
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
    document.getElementById('p2-cierre').value = item.cierre;
    document.getElementById('p2-cajon').value = item.cajon;
    document.getElementById('p2-mosquitero').value = item.mosquitero;
    document.getElementById('p2-ancho').value = item.ancho;
    document.getElementById('p2-alto').value = item.alto;
    document.getElementById('p2-cantidad').value = item.cantidad;
    renderGaleria(item.imagenId);

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

  function setFila(filaId, spanId, valor) {
    const fila = document.getElementById(filaId);
    document.getElementById(spanId).textContent = valor || '';
    fila.style.display = valor ? '' : 'none';
  }

  function renderVistaPresupuesto(datos) {
    document.getElementById('vp-numero').textContent = `N.º ${datos.numero}`;
    document.getElementById('vp-fecha').textContent = formatFechaLegible(datos.fecha);
    document.getElementById('vp-validez').textContent = datos.validez ? `${datos.validez} días` : '-';
    document.getElementById('vp-cliente').textContent = datos.nombre;

    setFila('vp-fila-telefono', 'vp-telefono', datos.telefono);
    setFila('vp-fila-direccion', 'vp-direccion', datos.direccion);
    setFila('vp-fila-localidad', 'vp-localidad', datos.localidad);
    setFila('vp-fila-arquitecto', 'vp-arquitecto', datos.arquitecto);
    setFila('vp-fila-extra', 'vp-extra', datos.extra);

    const cont = document.getElementById('vp-lista-items');
    cont.innerHTML = '';
    state.items.forEach((item) => {
      const img = imagenPorId(item.imagenId);
      const row = document.createElement('div');
      row.className = 'vp-item-row';
      row.innerHTML = `
        <img src="${img ? img.file : ''}" alt="${item.tipo}" />
        <div class="vp-item-info">
          <strong>${item.tipo} · Cierre: ${item.cierre}</strong>
          <span>Medidas: ${item.ancho}cm x ${item.alto}cm — Cantidad: ${item.cantidad}</span><br/>
          <span>Cajón: ${item.cajon === 'si' ? 'Sí' : 'No'} — Mosquitero: ${item.mosquitero === 'si' ? 'Sí' : 'No'}</span>
        </div>
      `;
      cont.appendChild(row);
    });
  }

  function volverAEditar() {
    document.getElementById('vista-presupuesto').hidden = true;
    document.getElementById('editor-view').hidden = false;
  }

  // ---------------------------------------------------------------------
  // Guardar / recuperar presupuestos en localStorage
  // ---------------------------------------------------------------------
  function onGuardarPresupuesto() {
    const datos = leerPanel1();
    const precioTexto = document.getElementById('vp-precio-texto').value;

    const registro = {
      numero: datos.numero,
      panel1: datos,
      items: state.items,
      precioTexto,
      guardadoEn: new Date().toISOString(),
    };

    const lista = getSavedList();
    const idx = lista.findIndex((p) => p.numero === registro.numero);
    if (idx !== -1) lista[idx] = registro;
    else lista.push(registro);
    setSavedList(lista);

    const numActual = parseInt(datos.numero, 10);
    if (!isNaN(numActual)) {
      const last = parseInt(localStorage.getItem(LAST_NUMERO_KEY) || '0', 10);
      if (numActual > last) localStorage.setItem(LAST_NUMERO_KEY, String(numActual));
    }

    alert('Presupuesto guardado.');
  }

  function abrirModalGuardados() {
    const lista = getSavedList();
    const cont = document.getElementById('lista-guardados');
    cont.innerHTML = '';

    if (!lista.length) {
      cont.innerHTML = '<p class="empty-msg">No hay presupuestos guardados.</p>';
    } else {
      lista
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
    const lista = getSavedList();
    const registro = lista.find((p) => p.numero === numero);
    if (!registro) return;

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
  }

  function eliminarGuardado(numero) {
    if (!confirm('¿Eliminar este presupuesto guardado?')) return;
    const lista = getSavedList().filter((p) => p.numero !== numero);
    setSavedList(lista);
    abrirModalGuardados();
  }

  // ---------------------------------------------------------------------
  checkSession();
})();
