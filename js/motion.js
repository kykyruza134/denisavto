// Анимации сайта 888: появление блоков, слайдер-баннер, счётчики, полоса прогресса прокрутки.
// Всё отключается, если в системе включено «уменьшить движение».
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  // ===== Появление блоков =====
  var els = document.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(els, function (el) { el.classList.add('is-visible'); });
  } else {
    root.classList.add('motion');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  // ===== Счётчики =====
  var counters = document.querySelectorAll('[data-count]');
  function runCounter(el) {
    var target = parseFloat(el.dataset.count), dec = (el.dataset.count.split('.')[1] || '').length;
    if (reduce) { el.textContent = target.toFixed(dec); return; }
    var start = null, dur = 1200;
    function tick(t) {
      if (!start) start = t;
      var k = Math.min(1, (t - start) / dur), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (target * eased).toFixed(dec);
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { runCounter(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(counters, function (el) { co.observe(el); });
  } else Array.prototype.forEach.call(counters, runCounter);

  // ===== Прогресс прокрутки =====
  var bar = document.querySelector('.progress span');
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? window.scrollY / h : 0) + ')';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ===== Слайдер-баннер =====
  var slider = document.querySelector('[data-slider]');
  if (!slider) return;
  var slides = slider.querySelectorAll('.slide');
  var dotsEl = slider.querySelector('.slider__dots');
  var live = slider.querySelector('.slider__live');
  var current = 0, timer = null, paused = false, INTERVAL = 6000;

  dotsEl.innerHTML = Array.prototype.map.call(slides, function (s, i) {
    return '<button type="button" class="slider__dot" aria-label="Баннер ' + (i + 1) + ' из ' + slides.length + '"></button>';
  }).join('');
  var dots = dotsEl.querySelectorAll('.slider__dot');

  function show(i, announce) {
    current = (i + slides.length) % slides.length;
    Array.prototype.forEach.call(slides, function (s, k) {
      var on = k === current;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
      Array.prototype.forEach.call(s.querySelectorAll('a, button'), function (x) { x.tabIndex = on ? 0 : -1; });
    });
    Array.prototype.forEach.call(dots, function (d, k) { d.setAttribute('aria-current', k === current ? 'true' : 'false'); });
    if (announce && live) live.textContent = 'Баннер ' + (current + 1) + ' из ' + slides.length + ': ' + slides[current].querySelector('h2, h1').textContent;
  }
  function schedule() {
    clearTimeout(timer);
    if (reduce || paused) return;
    slider.style.setProperty('--interval', INTERVAL + 'ms');
    slider.classList.remove('is-timing'); void slider.offsetWidth; slider.classList.add('is-timing');
    timer = setTimeout(function () { show(current + 1); schedule(); }, INTERVAL);
  }
  slider.querySelector('[data-prev]').addEventListener('click', function () { show(current - 1, true); schedule(); });
  slider.querySelector('[data-next]').addEventListener('click', function () { show(current + 1, true); schedule(); });
  dotsEl.addEventListener('click', function (e) {
    var i = Array.prototype.indexOf.call(dots, e.target.closest('.slider__dot'));
    if (i >= 0) { show(i, true); schedule(); }
  });
  var toggle = slider.querySelector('[data-toggle]');
  toggle.addEventListener('click', function () {
    paused = !paused;
    toggle.setAttribute('aria-pressed', paused);
    toggle.setAttribute('aria-label', paused ? 'Продолжить показ баннеров' : 'Остановить показ баннеров');
    toggle.textContent = paused ? '▶' : '❚❚';
    slider.classList.toggle('is-paused', paused);
    if (paused) clearTimeout(timer); else schedule();
  });
  ['mouseenter', 'focusin'].forEach(function (ev) { slider.addEventListener(ev, function () { clearTimeout(timer); slider.classList.add('is-hover'); }); });
  ['mouseleave', 'focusout'].forEach(function (ev) { slider.addEventListener(ev, function () { slider.classList.remove('is-hover'); schedule(); }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearTimeout(timer); else schedule(); });

  // Свайп на телефоне
  var x0 = null;
  slider.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { show(current + (dx < 0 ? 1 : -1), true); schedule(); }
    x0 = null;
  });

  if (reduce) { toggle.hidden = true; }
  show(0);
  schedule();
})();
