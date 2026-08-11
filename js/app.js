// app.js — точка входа: инициализация store, переключение разделов,
// всплывающее меню (гамбургер ☰) вверху, плавающая кнопка «+»,
// регистрация Service Worker.

import * as store from './store.js';
import { t, dir, availableLangs, LANG_NAMES } from './i18n.js';
import { el, clear } from './dom.js';
import { renderHome } from './views/transactions.js';
import { renderAnalytics } from './views/analytics.js';
import { renderForecast } from './views/forecast.js';
import { renderPlanning } from './views/planning.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings, applyTheme, applyBackground, exportJSON } from './views/settings.js';
import { maybeOnboard } from './onboarding.js';

// Иконка «Настройки» — та же схематичная шестерёнка, что и в шапке (см. index.html),
// чтобы в меню и на главном экране значок совпадал.
const GEAR_SVG = '<svg class="gear-icon" viewBox="276 517 193.5 193.5" fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M460.49,627.63V600H446.41a5.77,5.77,0,0,1-5.59-4.27,70,70,0,0,0-7.22-17.38,5.5,5.5,0,0,1,.82-6.69l10.14-10.13L425,542l-10,10a5.85,5.85,0,0,1-7.09.88,70.09,70.09,0,0,0-17.22-7.11,5.69,5.69,0,0,1-4.2-5.51V526.05H358.91v14.18a5.64,5.64,0,0,1-4.17,5.47,70,70,0,0,0-17.34,7.17,5.71,5.71,0,0,1-6.93-.85l-10-10L300.9,561.53l10,10a5.75,5.75,0,0,1,.85,7,70,70,0,0,0-7.16,17.34,5.61,5.61,0,0,1-5.44,4.15H285v27.63h13.87a6.06,6.06,0,0,1,5.85,4.48,70.17,70.17,0,0,0,7.14,17.11A5.59,5.59,0,0,1,311,656L300.9,666.1l19.54,19.54,10.15-10.14a5.48,5.48,0,0,1,6.67-.82,70.2,70.2,0,0,0,17.49,7.26,5.6,5.6,0,0,1,4.16,5.45v14.19h27.64v-14a5.85,5.85,0,0,1,4.32-5.66,70.08,70.08,0,0,0,17.1-7.07,5.85,5.85,0,0,1,7.1.87l9.95,9.95,19.54-19.54-9.95-9.94a5.87,5.87,0,0,1-.87-7.12,69.91,69.91,0,0,0,7.11-17.24,5.63,5.63,0,0,1,5.46-4.17Zm-85.28,33.8a47.68,47.68,0,1,1,45.13-45.13A47.68,47.68,0,0,1,375.21,661.43Z"/></svg>';

// Разделы приложения. Обзор — главный экран, остальные открываются из меню.
const SECTIONS = [
  { id: 'home',      icon: '🏠', labelKey: 'tab_home',      render: (r) => renderHome(r) },
  { id: 'analytics', icon: '📊', labelKey: 'tab_analytics', render: (r) => renderAnalytics(r) },
  { id: 'forecast',  icon: '📈', labelKey: 'tab_forecast',  render: (r) => renderForecast(r) },
  { id: 'planning',  icon: '🧮', labelKey: 'tab_planning',  render: (r) => renderPlanning(r) },
  { id: 'budgets',   icon: '🎯', labelKey: 'tab_budgets',   render: (r) => renderBudgets(r) },
  { id: 'settings',  icon: '⚙️', labelKey: 'settings_title', render: (r) => renderSettings(r, rerenderAll) },
];

let activeSection = 'home';
const content = document.getElementById('content');
const menuBtn = document.getElementById('menu-btn');
const backBtn = document.getElementById('back-btn');
const modeLabel = document.getElementById('mode-label');
const headBalance = document.getElementById('head-balance');
const settingsBtn = document.getElementById('settings-btn');
const budgetRing = document.getElementById('budget-ring');

export function goSection(id) { activeSection = id; renderSection(); }

let lastRenderedSection = null;
function renderSection() {
  // Сохраняем прокрутку при перерисовке того же раздела (например, после
  // удаления операции из истории по подписке store) — иначе экран «прыгал»
  // наверх. При переходе в другой раздел прокрутку сбрасываем.
  const sameSection = lastRenderedSection === activeSection;
  const prevScroll = content.scrollTop;
  clear(content);
  const onHome = activeSection === 'home';
  // Шапка с балансом/меткой окна, сигнал лимита и иконка Аналитики — на «Обзоре».
  if (!onHome) {
    content.classList.remove('fit-mode');
    if (modeLabel) { modeLabel.textContent = ''; modeLabel.className = ''; }
    if (headBalance) { headBalance.textContent = ''; headBalance.style.display = 'none'; }
    if (budgetRing) { clear(budgetRing); budgetRing.style.display = 'none'; }
  }
  if (settingsBtn) settingsBtn.style.display = onHome ? '' : 'none';
  // Кнопка «Назад» — только в разделах (не на «Главной»): один тап → на главную.
  if (backBtn) backBtn.style.display = onHome ? 'none' : '';
  const section = SECTIONS.find((x) => x.id === activeSection);
  section.render(content);
  content.scrollTop = sameSection ? prevScroll : 0;
  lastRenderedSection = activeSection;
  if (onHome) maybeBackupBanner();
}

// Мягкое напоминание о резервной копии: данные хранятся только на устройстве,
// и некоторые браузеры (особенно iOS Safari без установки на экран «Домой»)
// могут их удалить. Ненавязчиво: только на «Обзоре», при накопленных данных,
// не чаще раза в снуз-период, с кнопкой «Позже».
function maybeBackupBanner() {
  const s = store.getState().settings;
  if (store.getState().transactions.length < 5) return;
  const now = Date.now();
  if (s.backupSnoozeUntil && now < s.backupSnoozeUntil) return;
  const last = s.lastBackupAt || 0;
  const MONTH = 30 * 24 * 3600 * 1000;
  if (last && now - last < MONTH) return;
  const banner = el('.backup-banner', {}, [
    el('.backup-banner-text', { text: t('backup_reminder') }),
    el('.backup-banner-actions', {}, [
      el('button.backup-btn.primary', { type: 'button', text: t('backup_now'), onClick: () => { banner.remove(); exportJSON(); } }),
      el('button.backup-btn', { type: 'button', text: t('later'), onClick: async () => { banner.remove(); await store.setSetting('backupSnoozeUntil', Date.now() + 21 * 24 * 3600 * 1000); } }),
    ]),
  ]);
  content.insertBefore(banner, content.firstChild);
}

// Всплывающее меню со всеми пятью разделами.
function openMenu() {
  const backdrop = el('.menu-backdrop', { role: 'dialog', 'aria-modal': 'true' });
  const panel = el('.menu-panel');
  for (const s of SECTIONS) {
    panel.appendChild(el('button.menu-item', {
      type: 'button',
      class: s.id === activeSection ? 'active' : '',
      onClick: () => { activeSection = s.id; renderSection(); close(); },
    }, [
      s.id === 'settings' ? el('.menu-item-icon', { html: GEAR_SVG }) : el('.menu-item-icon', { text: s.icon }),
      el('.menu-item-label', { text: t(s.labelKey) }),
      s.id === activeSection ? el('.menu-item-check', { text: '✓' }) : null,
    ]));
  }
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => backdrop.classList.add('open'));

  function close() {
    backdrop.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => backdrop.remove(), 220);
  }
}

// Направление письма (для арабского — справа налево) и язык документа.
function applyDir() {
  document.documentElement.lang = store.getState().settings.language || 'ru';
  document.documentElement.dir = dir();
}

function rerenderAll() {
  document.title = t('app_name');
  applyDir();
  renderSection();
}

// Экран выбора языка при первом запуске.
function openLanguageOnboarding(onDone) {
  const backdrop = el('.onboard-backdrop', {}, [
    el('.onboard-card', {}, [
      el('.onboard-emoji', { text: '🌍' }),
      el('.onboard-title', { text: 'Выберите язык · Choose language' }),
      el('.onboard-langs', {}, availableLangs().map((code) =>
        el('button.onboard-lang', {
          type: 'button',
          onClick: async () => {
            await store.setSetting('language', code);
            await store.setSetting('langChosen', true);
            backdrop.remove();
            document.body.classList.remove('modal-open');
            onDone();
          },
        }, [
          el('span.onboard-lang-native', { text: LANG_NAMES[code] }),
          el('span.onboard-lang-code', { text: code.toUpperCase() }),
        ]))),
    ]),
  ]);
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
}

// Встраиваем SVG-спрайт иконок категорий в документ, чтобы <use href="#..">
// работал как ссылка внутри документа (надёжно на всех браузерах, в т.ч. iOS).
async function injectIconSprite() {
  if (document.getElementById('cat-icon-sprite')) return;
  try {
    const txt = await fetch('icons/ui-icons.svg').then((r) => r.text());
    const holder = document.createElement('div');
    holder.id = 'cat-icon-sprite';
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    holder.innerHTML = txt;
    document.body.insertBefore(holder, document.body.firstChild);
  } catch (e) { /* офлайн без кэша — иконки появятся при следующей загрузке */ }
}

async function main() {
  await store.init();
  await injectIconSprite();
  applyTheme(store.getState().settings.theme);
  applyBackground();

  menuBtn.addEventListener('click', openMenu);
  if (backBtn) backBtn.addEventListener('click', () => goSection('home'));
  if (settingsBtn) settingsBtn.addEventListener('click', () => { activeSection = 'settings'; renderSection(); });
  document.addEventListener('go-section', (e) => goSection(e.detail));

  // Перерисовка при изменении данных (только активный раздел).
  store.subscribe(() => renderSection());

  // При смене размера/ориентации/видимой области пересчитываем, сколько строк
  // истории помещается на экране.
  let resizeTimer = null;
  const onViewportChange = () => {
    // Не перерисовываем, пока пользователь в поле ввода: открытие клавиатуры
    // меняет visualViewport и иначе рушит открытую строку (например поле
    // комментария в истории закрывалось при попытке поставить курсор).
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (activeSection === 'home') renderSection(); }, 120);
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange);
  }

  rerenderAll();
  // Повторный расчёт после первой раскладки — геометрия экрана к этому моменту
  // окончательная (важно для корректного числа строк на реальных устройствах).
  requestAnimationFrame(() => { if (activeSection === 'home') renderSection(); });

  // Первый запуск — предложить выбрать язык, затем показать вводный тур.
  if (!store.getState().settings.langChosen) {
    openLanguageOnboarding(() => { rerenderAll(); maybeOnboard(); });
  } else {
    maybeOnboard();   // язык уже выбран, но тур ещё не показывали
  }

  // Service Worker для офлайн-работы и установки на домашний экран.
  if ('serviceWorker' in navigator) {
    // Когда новая версия SW берёт управление — перезагружаем страницу, чтобы
    // подхватить свежий код (иначе номер версии/правки могли «зависать» на
    // старом кэше). Только если раньше уже был контроллер — на первом запуске
    // лишней перезагрузки не будет.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => { if (reg.update) reg.update(); })
      .catch(() => {});
  }
}

main();
