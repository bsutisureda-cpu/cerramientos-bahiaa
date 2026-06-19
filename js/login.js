(function () {
  const form = document.getElementById('login-form');
  const errorMsg = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    const usuario = document.getElementById('usuario').value.trim();
    const clave = document.getElementById('clave').value;

    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave }),
      });
      const data = await resp.json();

      if (resp.ok && data.ok) {
        window.location.href = 'app.html';
        return;
      }

      errorMsg.textContent = data.error || 'No se pudo iniciar sesión.';
      errorMsg.hidden = false;
    } catch (err) {
      errorMsg.textContent = 'Error de conexión. Intentá nuevamente.';
      errorMsg.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
})();
