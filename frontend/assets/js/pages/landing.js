/**
 * Soul and Body — Interacciones de la página principal.
 * (animaciones de aparición y comparador antes/después)
 */

function safe(fn) { try { fn(); } catch { /* nunca romper la página */ } }

// Año dinámico en el footer
safe(() => {
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
});

// Animaciones de aparición al hacer scroll
safe(() => {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((x) => {
      if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); }
    });
  }, { threshold: 0.05 });
  els.forEach((e) => io.observe(e));
  // Red de seguridad: si algo falla, mostrar todo tras 5s
  setTimeout(() => els.forEach((e) => e.classList.add('in')), 5000);
});

// Comparador antes/después (ratón y táctil) con ARIA slider.
safe(() => {
  const ba = document.getElementById('ba');
  if (!ba) return;
  const before = document.getElementById('beforeLayer');
  const handle = document.getElementById('handle');
  if (!before || !handle) return;
  let dragging = false;
  let pct = 50;

  function setPct(p) {
    pct = Math.max(4, Math.min(96, p));
    before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = `${pct}%`;
    ba.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function fromEvent(e) {
    const rect = ba.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setPct(((clientX - rect.left) / rect.width) * 100);
  }

  // Configurar ARIA slider en HTML
  ba.setAttribute('tabindex', '0');
  ba.setAttribute('role', 'slider');
  ba.setAttribute('aria-label', 'Comparador antes y después');
  ba.setAttribute('aria-valuemin', '0');
  ba.setAttribute('aria-valuemax', '100');
  ba.setAttribute('aria-valuenow', '50');

  ba.addEventListener('mousedown', (e) => { dragging = true; fromEvent(e); });
  window.addEventListener('mousemove', (e) => { if (dragging) fromEvent(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  ba.addEventListener('touchstart', (e) => { dragging = true; fromEvent(e); }, { passive: true });
  ba.addEventListener('touchmove', (e) => { if (dragging) fromEvent(e); }, { passive: true });
  ba.addEventListener('touchend', () => { dragging = false; });

  // Accesibilidad: mover con teclado.
  ba.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { setPct(pct - 4); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setPct(pct + 4); e.preventDefault(); }
    if (e.key === 'Home') { setPct(0); e.preventDefault(); }
    if (e.key === 'End') { setPct(100); e.preventDefault(); }
  });

  setPct(50);
});
