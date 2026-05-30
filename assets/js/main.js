/* ═══════════════════════════════════════════════════════
   NOVA FUMIGACIONES — main.js
   Vanilla JS · sin dependencias
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Helper: safe init — un error en una sección no rompe las demás
  function safe(fn, name) {
    try { fn(); } catch (err) { console.warn('[main] init failed:', name, err); }
  }

  // ───── Año del footer ─────
  safe(function () {
    var y = document.getElementById('footer-year');
    if (y) y.textContent = new Date().getFullYear();
  }, 'footer-year');

  // ───── Nav: scroll state + mobile drawer ─────
  safe(function () {
    var nav = document.getElementById('nav');
    var toggle = document.querySelector('.nav-toggle');
    var mobile = document.getElementById('mobile-menu');

    function onScroll() {
      if (!nav) return;
      if (window.scrollY > 30) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toggle && mobile && nav) {
      toggle.addEventListener('click', function () {
        var isOpen = nav.classList.toggle('open');
        toggle.classList.toggle('open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) { mobile.hidden = false; }
        else { setTimeout(function () { mobile.hidden = true; }, 200); }
      });
      mobile.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          mobile.hidden = true;
        });
      });
    }
  }, 'nav');

  // ───── Smooth scroll para anchors internos (compensar nav fijo) ─────
  safe(function () {
    var NAV_OFFSET = 70;
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href === '#' || href.length < 2) return;
      a.addEventListener('click', function (e) {
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.pageYOffset - NAV_OFFSET;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }, 'smooth-scroll');

  // ───── Reveal on scroll ─────
  safe(function () {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });

    // Safety net: si algo queda oculto después de 6s, mostrarlo
    setTimeout(function () {
      els.forEach(function (el) {
        if (!el.classList.contains('visible')) {
          el.classList.add('safety-shown');
        }
      });
    }, 6000);
  }, 'reveal');

  // ───── FAQ accordion ─────
  safe(function () {
    document.querySelectorAll('.faq-item').forEach(function (item) {
      var btn = item.querySelector('.faq-q');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }, 'faq');

  // ───── FORM: submit con Airtable (fallback WhatsApp) ─────
  safe(function () {
    var form = document.getElementById('lead-form');
    if (!form) return;

    var submitBtn = form.querySelector('.form-submit');
    var statusEl  = form.querySelector('.form-status');
    var WA_NUMBER = '542212019320';
    var ENDPOINT  = '/.netlify/functions/lead';

    function setStatus(kind, msg) {
      statusEl.className = 'form-status ' + kind;
      statusEl.textContent = msg;
    }

    function buildWhatsAppFallback(data) {
      var lines = [
        'Hola, quiero consultar por un servicio de Nova Fumigaciones.',
        '',
        'Nombre: ' + (data.nombre || ''),
        'Teléfono: ' + (data.telefono || ''),
        'Email: ' + (data.email || ''),
        'Servicio: ' + (data.servicio || ''),
        'Zona: ' + (data.zona || ''),
        '',
        'Mensaje: ' + (data.mensaje || '')
      ];
      return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      statusEl.className = 'form-status';
      statusEl.textContent = '';

      // Validación nativa primero
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var data = Object.fromEntries(new FormData(form));
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      var oldText = submitBtn.querySelector('.fs-text').textContent;
      submitBtn.querySelector('.fs-text').textContent = 'Enviando...';

      try {
        var res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          var json = await res.json().catch(function () { return {}; });
          setStatus('ok', json.message || '¡Gracias! Tu consulta fue enviada. Te respondemos a la brevedad.');
          form.reset();
        } else if (res.status === 404) {
          // Backend no configurado: caer a WhatsApp
          throw new Error('NO_BACKEND');
        } else {
          var err = await res.json().catch(function () { return { message: '' }; });
          throw new Error(err.message || 'Error del servidor');
        }
      } catch (err) {
        console.warn('[form] submit failed, falling back to WhatsApp:', err.message);
        // Fallback: abrir WhatsApp con todos los datos
        var url = buildWhatsAppFallback(data);
        setStatus('ok', 'Te redirigimos a WhatsApp con tus datos. Si no se abre, escribinos al 221 201-9320.');
        window.open(url, '_blank', 'noopener');
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.querySelector('.fs-text').textContent = oldText;
      }
    });
  }, 'form');

  // ───── Detect reduce-motion solo para animaciones intrusivas ─────
  // (no aplicamos a micro-interactions porque Windows ships con reduce ON)
  // En este sitio no hay nada intrusivo, así que dejamos todo activo.

})();
