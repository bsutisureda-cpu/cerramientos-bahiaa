/* ============================================================
   Cerramientos Bahía — landing (IIFE, sin módulos ES)
   ============================================================ */
(function () {
  "use strict";

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  /* ---------- Header sólido al hacer scroll ---------- */
  function initHeader() {
    var header = document.getElementById("site-header");
    if (!header) return;
    function onScroll() {
      header.classList.toggle("scrolled", window.scrollY > 24);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Menú móvil ---------- */
  function initNav() {
    var toggle = document.getElementById("nav-toggle");
    var nav = document.getElementById("main-nav");
    var header = document.getElementById("site-header");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && header) header.classList.add("scrolled");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Aparición al hacer scroll ---------- */
  function initReveals() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });
    els.forEach(function (el) { io.observe(el); });

    // Red de seguridad: a los 6s, revelar lo que siga oculto
    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.visible)").forEach(function (el) {
        el.classList.add("visible");
      });
    }, 6000);
  }

  /* ---------- Halo que sigue el cursor en las cards ---------- */
  function initCardGlow() {
    if (window.matchMedia("(hover: none)").matches) return;
    document.querySelectorAll(".show-card").forEach(function (card) {
      if (card.dataset.glowBound) return;
      card.dataset.glowBound = "1";
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--hx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--hy", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
  }

  /* ---------- Showcase horizontal ----------
     Escritorio + GSAP disponibles → sección fijada con scroll horizontal.
     Si no, carrusel nativo con scroll-snap (clase .is-scroll).       */
  function initShowcase() {
    var track = document.getElementById("showcase-track");
    var pin = document.getElementById("showcase-pin");
    if (!track || !pin) return;

    var desktop = window.matchMedia("(min-width: 1024px)").matches;
    var hasGsap = window.gsap && window.ScrollTrigger;

    if (!desktop || !hasGsap) {
      track.classList.add("is-scroll");
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    var distance = function () {
      return Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
    };
    if (distance() <= 0) {
      track.classList.add("is-scroll");
      return;
    }
    gsap.to(track, {
      x: function () { return -distance(); },
      ease: "none",
      scrollTrigger: {
        trigger: pin,
        pin: true,
        scrub: 0.6,
        start: "top top",
        end: function () { return "+=" + distance(); },
        invalidateOnRefresh: true,
      },
    });
  }

  /* ---------- Formulario de contacto ---------- */
  function initContactForm() {
    var form = document.getElementById("contact-form");
    var status = document.getElementById("contact-status");
    var submit = document.getElementById("contact-submit");
    if (!form || !status || !submit) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var datos = {
        nombre: form.elements.nombre.value.trim(),
        email: form.elements.email.value.trim(),
        mensaje: form.elements.mensaje.value.trim(),
      };
      submit.disabled = true;
      status.className = "form-status";
      status.textContent = "Enviando…";

      fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function () {
          form.reset();
          status.className = "form-status ok";
          status.textContent = "¡Gracias por contactarte con Cerramientos Bahía!";
        })
        .catch(function () {
          status.className = "form-status error";
          status.textContent = "No pudimos enviar el mensaje. Probá de nuevo en unos minutos.";
        })
        .finally(function () {
          submit.disabled = false;
        });
    });
  }

  /* ---------- Año en el footer ---------- */
  function initYear() {
    var el = document.getElementById("anio");
    if (el) el.textContent = new Date().getFullYear();
  }

  function boot() {
    safe(initHeader, "initHeader");
    safe(initNav, "initNav");
    safe(initReveals, "initReveals");
    safe(initCardGlow, "initCardGlow");
    safe(initShowcase, "initShowcase");
    safe(initContactForm, "initContactForm");
    safe(initYear, "initYear");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
