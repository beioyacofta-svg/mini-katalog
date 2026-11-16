/* Каталог сценариев «Дизайн процессов» — логика Mini App.
   Работает и внутри Telegram (WebApp SDK), и в обычном браузере. */

(() => {
  'use strict';

  const tg = window.Telegram?.WebApp;
  const D = window.DATA;
  const CONTACT = 'nadjat_29';           // личный Telegram для заявок
  const SITE = 'https://design-processov.ru/';

  const TYPE_LABEL = { request: 'Разовый запрос', assistant: 'AI-помощник', agent: 'AI-агент' };
  const START_LABEL = {
    quick: 'Быстрый тест',
    prepare: 'Подготовка данных',
    setup: 'Настройка системы',
  };

  const state = {
    tab: 'catalog',
    q: '',
    section: -1,
    type: '',
    current: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ── тема Telegram ─────────────────────────────────────── */
  function applyTheme() {
    if (!tg) return;
    const p = tg.themeParams || {};
    const root = document.documentElement;
    root.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';
    const map = {
      '--bg': p.bg_color,
      '--bg-2': p.secondary_bg_color,
      '--card': p.secondary_bg_color,
      '--text': p.text_color,
      '--hint': p.hint_color,
      '--tab': p.bg_color,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v) root.style.setProperty(k, v);
    }
  }

  /* ── переходы между экранами ───────────────────────────── */
  const TITLES = { catalog: 'Каталог', request: 'Заявка', about: 'О проекте' };

  function showTab(tab) {
    state.tab = tab;
    $$('.screen').forEach((s) => s.classList.remove('is-active'));
    $(`#screen-${tab}`).classList.add('is-active');
    $$('.tabbar button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    $('.tabbar').classList.remove('is-hidden');
    if (tg) {
      tg.BackButton.hide();
      tg.MainButton.hide();
      if (tab === 'request') armMainButtonRequest();
    }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function openDetail(n) {
    const item = D.items.find((x) => x.n === n);
    if (!item) return;
    state.current = item;
    const box = $('#screen-detail');
    box.querySelector('h1').textContent = item.title;
    box.querySelector('.badges').innerHTML = badges(item);
    const works = D.sections[item.s] || '';
    box.querySelector('[data-slot="works"]').textContent = works;
    box.querySelector('[data-slot="fit"]').textContent = item.fit || 'подойдёт под вашу задачу.';
    box.querySelector('[data-slot="in"]').textContent = item.in;
    box.querySelector('[data-slot="out"]').textContent = item.out;
    box.querySelector('[data-slot="chk"]').textContent = item.chk;
    const promptBox = box.querySelector('.prompt');
    promptBox.dataset.text = item.pr;
    promptBox.textContent = item.pr;   // текст показываем и копируем из одного места
    $('.copy-button', box).classList.remove('is-done');
    $('.copy-button', box).textContent = 'Скопировать промпт';

    $$('.screen').forEach((s) => s.classList.remove('is-active'));
    box.classList.add('is-active');
    $('.tabbar').classList.add('is-hidden');
    window.scrollTo(0, 0);

    if (tg) {
      tg.BackButton.show();
      tg.MainButton.setParams({ text: 'ОБСУДИТЬ СЦЕНАРИЙ', color: '#0B7A55', text_color: '#ffffff' });
      tg.MainButton.show();
      tg.HapticFeedback?.impactOccurred('light');
    }
  }

  function badges(item) {
    const out = item.t.map((t) => `<span class="badge badge--${t}">${TYPE_LABEL[t] || t}</span>`);
    if (item.g && START_LABEL[item.g]) out.push(`<span class="badge">${START_LABEL[item.g]}</span>`);
    return out.join('');
  }

  /* ── каталог ───────────────────────────────────────────── */
  function match(item) {
    if (state.section >= 0 && item.s !== state.section) return false;
    if (state.type && !item.t.includes(state.type)) return false;
    const q = state.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [item.title, item.fit, item.in, item.out, item.chk, item.pr].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  function renderList() {
    const items = D.items.filter(match);
    const list = $('#list');
    list.innerHTML = items.map((item) => `
      <button class="row" type="button" data-n="${item.n}">
        <span class="row__n">${String(item.n).padStart(2, '0')}</span>
        <span class="row__body">
          <span class="row__title">${escapeHtml(item.title)}</span>
          <span class="row__meta">${badges(item)}</span>
        </span>
      </button>`).join('');
    $('#counter').textContent = items.length
      ? `Найдено: ${items.length} из ${D.items.length}`
      : 'Ничего не нашлось';
    if (!items.length) {
      list.innerHTML = '<p class="empty">Попробуйте другой запрос или сбросьте фильтры.</p>';
    }
    $('#empty-hint').hidden = items.length > 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // короткие подписи направлений для чипов (порядок = порядок в DATA.sections)
  const SECTION_SHORT = ['Команда', 'Контент', 'Клиенты', 'Экспертиза', 'Продажи', 'Видео'];

  function renderSections() {
    $('#sections').innerHTML = D.sections.map((name, i) => `
      <button class="chip" type="button" data-section="${i}" aria-pressed="${state.section === i}"
              title="${escapeHtml(name)}">
        ${escapeHtml(SECTION_SHORT[i] || name)}
      </button>`).join('');
  }

  /* ── заявка ────────────────────────────────────────────── */
  function requestText() {
    const name = $('#f-name').value.trim();
    const task = $('#f-task').value.trim();
    const ctx = state.current ? `Сценарий из каталога: №${state.current.n} «${state.current.title}»` : '';
    return [name ? `Меня зовут ${name}.` : '', 'Хочу автоматизировать: ' + (task || '—'), ctx]
      .filter(Boolean).join('\n');
  }

  function sendRequest() {
    const task = $('#f-task').value.trim();
    if (task.length < 5) {
      toast('Опишите задачу хотя бы одной фразой');
      $('#f-task').focus();
      return;
    }
    const url = `https://t.me/${CONTACT}?text=${encodeURIComponent(requestText())}`;
    tg?.HapticFeedback?.notificationOccurred('success');
    if (tg) tg.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener');
    toast('Открываю чат с Надеждой');
  }

  function armMainButtonRequest() {
    if (!tg) return;
    tg.MainButton.setParams({ text: 'ОТПРАВИТЬ ЗАЯВКУ', color: '#0B7A55', text_color: '#ffffff' });
    tg.MainButton.show();
  }

  /* ── тост ──────────────────────────────────────────────── */
  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
  }

  /* ── события ───────────────────────────────────────────── */
  function bind() {
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) showTab(b.dataset.tab);
    });

    $('#back').addEventListener('click', () => showTab('catalog'));

    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('.row');
      if (b) openDetail(Number(b.dataset.n));
    });

    $('#sections').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const i = Number(b.dataset.section);
      state.section = state.section === i ? -1 : i;
      $$('#sections .chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.section) === state.section)));
      renderList();
      tg?.HapticFeedback?.selectionChanged();
    });

    $('#types').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const t = b.dataset.type;
      state.type = state.type === t ? '' : t;
      $$('#types .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === state.type)));
      renderList();
    });

    let qTimer;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(qTimer);
      const v = e.target.value;
      qTimer = setTimeout(() => { state.q = v; renderList(); }, 120);
    });

    $('.copy-button').addEventListener('click', async (e) => {
      const text = $('#screen-detail .prompt').dataset.text || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      e.currentTarget.classList.add('is-done');
      e.currentTarget.textContent = 'Скопировано';
      tg?.HapticFeedback?.notificationOccurred('success');
      toast('Промпт в буфере обмена');
    });

    $('#go-request').addEventListener('click', () => {
      showTab('request');
      if (state.current) $('#f-task').value = `Сценарий №${state.current.n}: ${state.current.title}`;
    });

    $('#send').addEventListener('click', sendRequest);
    $('#f-task').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendRequest();
    });

    if (tg) {
      tg.BackButton.onClick(() => showTab('catalog'));
      tg.MainButton.onClick(() => {
        if (state.tab === 'request') sendRequest();
        else if (state.current) { showTab('request'); $('#f-task').value = `Сценарий №${state.current.n}: ${state.current.title}`; }
      });
      tg.onEvent?.('themeChanged', applyTheme);
    }
  }

  /* ── старт ─────────────────────────────────────────────── */
  function boot() {
    if (!D || !Array.isArray(D.items)) {
      document.body.innerHTML = '<p style="padding:24px">Не загрузились данные каталога.</p>';
      return;
    }
    applyTheme();
    renderSections();
    renderList();
    bind();
    showTab('catalog');

    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor?.('secondary_bg_color');
      tg.setBackgroundColor?.('bg_color');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
