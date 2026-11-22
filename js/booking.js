/*
 * Онлайн-заявка без сервера: форма собирает текст и открывает мессенджер сервиса.
 * Настройки сервиса — в js/config.js (window.SITE). Этот файл одинаковый для всех сайтов.
 */
(function () {
  'use strict';
  var C = window.SITE;
  if (!C) return;

  var WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var WD_IN = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function fromMin(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowLocal() {
    var parts = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: C.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { date: new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day)), minutes: +parts.hour * 60 + +parts.minute };
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }
  function wd(d) { return (d.getUTCDay() + 6) % 7; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function human(d) { return WD[wd(d)] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  var now = nowLocal();

  // ===== «Открыто сейчас» =====
  (function () {
    var el = $('open-status');
    if (!el) return;
    var today = C.hours[wd(now.date)];
    var text, open = false;
    if (today && now.minutes >= toMin(today[0]) && now.minutes < toMin(today[1])) {
      open = true; text = 'Открыто до ' + today[1];
    } else {
      for (var i = 0; i < 8; i++) {
        var d = addDays(now.date, i), h = C.hours[wd(d)];
        if (!h || (i === 0 && toMin(h[0]) <= now.minutes)) continue;
        text = 'Закрыто, откроется ' + (i === 0 ? 'сегодня' : i === 1 ? 'завтра' : WD_IN[wd(d)]) + ' в ' + h[0];
        break;
      }
    }
    el.querySelector('[data-text]').textContent = text || 'Закрыто';
    el.classList.add(open ? 'is-open' : 'is-closed');
    el.hidden = false;
  })();

  var form = $('booking-form');
  if (!form) return;
  var state = { date: null, time: null };
  var itemsEl = $('items'), daysEl = $('days'), slotsEl = $('slots'), summaryEl = $('summary');
  var errorEl = $('form-error'), consent = $('consent'), submit = $('submit'), submitHint = $('submit-hint');
  var phone = $('phone'), sent = $('sent'), channelsEl = $('channels');

  // ===== Каналы отправки (только те, что есть у сервиса) =====
  var channels = [];
  if (C.whatsapp) channels.push({ id: 'whatsapp', name: 'WhatsApp', hint: 'откроется чат с готовым текстом — нажмите «Отправить»' });
  if (C.telegram) channels.push({ id: 'telegram', name: 'Telegram', hint: 'текст скопируется — вставьте его в открывшийся чат' });
  if (channelsEl) {
    if (channels.length > 1) {
      channelsEl.innerHTML = channels.map(function (c, i) {
        return '<label class="channel channel--' + c.id + '"><input type="radio" name="channel" value="' + c.id + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span class="channel__name">' + c.name + '</span><span class="channel__hint">' + c.hint + '</span></label>';
      }).join('');
    } else if (channels.length === 1) {
      channelsEl.innerHTML = '<p class="channel-single">Заявка уйдёт в <strong>' + channels[0].name + '</strong>: ' + channels[0].hint + '.</p>';
    }
  }
  function channel() {
    var r = form.querySelector('input[name=channel]:checked');
    return r ? r.value : (channels[0] && channels[0].id);
  }

  // ===== Услуги (из карточек .js-pick) =====
  var names = [];
  Array.prototype.forEach.call(document.querySelectorAll('.js-pick'), function (a) { if (names.indexOf(a.dataset.item) < 0) names.push(a.dataset.item); });
  itemsEl.innerHTML = names.map(function (n, i) {
    return '<label class="check"><input type="checkbox" name="items" value="' + i + '"><span>' + escapeHtml(n) + '</span></label>';
  }).join('');
  function selectedItems() {
    return Array.prototype.filter.call(itemsEl.querySelectorAll('input'), function (b) { return b.checked; }).map(function (b) { return names[+b.value]; });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.js-pick');
    if (!a) return;
    var box = itemsEl.querySelector('input[value="' + names.indexOf(a.dataset.item) + '"]');
    if (box) box.checked = true;
    updateSummary();
  });
  itemsEl.addEventListener('change', updateSummary);

  // ===== Дни и время =====
  function slotsFor(d) {
    var h = C.hours[wd(d)];
    if (!h) return [];
    var out = [], isToday = iso(d) === iso(now.date), step = C.slotMinutes || 60;
    for (var t = toMin(h[0]); t + step <= toMin(h[1]); t += step) {
      if (isToday && t <= now.minutes + 30) continue;
      out.push(fromMin(t));
    }
    return out;
  }
  var days = [];
  for (var i = 0; i < (C.daysAhead || 14); i++) days.push(addDays(now.date, i));
  daysEl.innerHTML = days.map(function (d) {
    var ok = slotsFor(d).length > 0;
    return '<button type="button" class="day" data-date="' + iso(d) + '"' + (ok ? '' : ' disabled') + ' aria-pressed="false" aria-label="' + human(d) + (ok ? '' : ', записи нет') + '">' +
      '<small>' + (iso(d) === iso(now.date) ? 'сегодня' : WD[wd(d)]) + '</small><b>' + d.getUTCDate() + '</b><small>' + MONTHS[d.getUTCMonth()].slice(0, 3) + '</small></button>';
  }).join('');
  daysEl.addEventListener('click', function (e) {
    var b = e.target.closest('.day');
    if (!b || b.disabled) return;
    state.date = days.filter(function (d) { return iso(d) === b.dataset.date; })[0];
    state.time = null;
    Array.prototype.forEach.call(daysEl.children, function (x) { var on = x === b; x.classList.toggle('is-selected', on); x.setAttribute('aria-pressed', on); });
    slotsEl.innerHTML = '<div class="slots__grid">' + slotsFor(state.date).map(function (t) {
      return '<button type="button" class="slot" data-time="' + t + '" aria-pressed="false">' + t + '</button>';
    }).join('') + '</div><p class="note">Это желаемое время — администратор подтвердит его или предложит другое.</p>';
    updateSummary();
  });
  slotsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.slot');
    if (!b) return;
    state.time = b.dataset.time;
    Array.prototype.forEach.call(slotsEl.querySelectorAll('.slot'), function (x) { var on = x === b; x.classList.toggle('is-selected', on); x.setAttribute('aria-pressed', on); });
    updateSummary();
  });

  function updateSummary() {
    var parts = [], items = selectedItems();
    if (items.length) parts.push('<strong>Услуги:</strong> ' + items.map(escapeHtml).join(', '));
    if (state.date) parts.push('<strong>День:</strong> ' + human(state.date));
    if (state.time) parts.push('<strong>Время:</strong> ' + state.time);
    summaryEl.innerHTML = parts.join('<br>');
    summaryEl.hidden = !parts.length;
  }
  function updateSubmit() { submit.disabled = !consent.checked; if (submitHint) submitHint.hidden = consent.checked; }
  consent.addEventListener('change', updateSubmit);
  updateSubmit();

  // ===== Маска телефона =====
  function maskPhone(v) {
    var d = v.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var r = '+7';
    if (d.length > 1) r += ' (' + d.slice(1, 4);
    if (d.length >= 4) r += ')';
    if (d.length > 4) r += ' ' + d.slice(4, 7);
    if (d.length > 7) r += '-' + d.slice(7, 9);
    if (d.length > 9) r += '-' + d.slice(9, 11);
    return r;
  }
  phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+7 ('; });
  phone.addEventListener('blur', function () { if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''; });
  phone.addEventListener('input', function () { phone.value = maskPhone(phone.value); });

  // ===== Отправка =====
  function val(id) { return $(id).value.trim(); }
  function buildMessage() {
    var lines = ['Здравствуйте! Заявка на запись с сайта «' + C.name + '».', ''];
    var items = selectedItems();
    if (items.length) lines.push('Услуги: ' + items.join(', '));
    lines.push('Желаемое время: ' + human(state.date) + ', ' + state.time);
    lines.push('ФИО: ' + val('full_name'));
    lines.push('Телефон: ' + val('phone'));
    lines.push('Автомобиль: ' + val('car') + (val('plate') ? ', госномер ' + val('plate').toUpperCase() : ''));
    lines.push('Проблема: ' + val('problem'));
    if (val('comment')) lines.push('Комментарий: ' + val('comment'));
    lines.push('', 'Согласие на обработку персональных данных дано.');
    return lines.join('\n');
  }
  function validate() {
    var p = [];
    var mark = function (id, bad) { if (bad) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid'); return bad; };
    if (!selectedItems().length) p.push('выберите услугу');
    if (!state.date) p.push('выберите день');
    if (!state.time) p.push('выберите время');
    if (mark('full_name', val('full_name').length < 2)) p.push('ФИО');
    if (mark('phone', val('phone').replace(/\D/g, '').length !== 11)) p.push('телефон полностью');
    if (mark('car', val('car').length < 2)) p.push('марку и модель');
    if (mark('problem', val('problem').length < 3)) p.push('описание проблемы');
    if (!consent.checked) p.push('согласие на обработку данных');
    return p;
  }

  var lastMessage = '';
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var problems = validate();
    if (problems.length) {
      errorEl.textContent = 'Заполните: ' + problems.join(', ') + '.';
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errorEl.hidden = true;
    lastMessage = buildMessage();
    var ch = channel(), url, text;
    if (ch === 'telegram') {
      url = C.telegram;
      copy(lastMessage);
      text = 'Текст заявки скопирован. В открывшемся чате Telegram вставьте его и отправьте. Если чат не открылся — нажмите кнопку ниже.';
    } else {
      url = 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent(lastMessage);
      text = 'Открываем WhatsApp с готовым текстом заявки — нажмите в чате «Отправить». Если WhatsApp не открылся, нажмите кнопку ниже.';
    }
    $('message').textContent = lastMessage;
    $('sent-text').textContent = text;
    var open = $('open-chat');
    open.href = url;
    open.textContent = ch === 'telegram' ? 'Открыть Telegram' : 'Открыть WhatsApp';
    form.hidden = true;
    sent.hidden = false;
    sent.focus();
    window.open(url, '_blank', 'noopener');
  });
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) { /* скопирует вручную */ }
    document.body.removeChild(ta);
  }
  $('copy').addEventListener('click', function () { copy(lastMessage); this.textContent = 'Скопировано'; });
  $('edit').addEventListener('click', function () { sent.hidden = true; form.hidden = false; form.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
})();
