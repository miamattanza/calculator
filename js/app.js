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
const modeLabel = document.getElementById('mode-label');
const headBalance = document.getElementById('head-balance');
const settingsBtn = document.getElementById('settings-btn');
const budgetRing = document.getElementById('budget-ring');

export function goSection(id) { activeSection = id; renderSection(); }

function renderSection() {
  clear(content);
  content.scrollTop = 0;
  const onHome = activeSection === 'home';
  // Шапка с балансом/меткой окна, сигнал лимита и иконка Аналитики — на «Обзоре».
  if (!onHome) {
    content.classList.remove('fit-mode');
    if (modeLabel) { modeLabel.textContent = ''; modeLabel.className = ''; }
    if (headBalance) { headBalance.textContent = ''; headBalance.style.display = 'none'; }
    if (budgetRing) { clear(budgetRing); budgetRing.style.display = 'none'; }
  }
  if (settingsBtn) settingsBtn.style.display = onHome ? '' : 'none';
  const section = SECTIONS.find((x) => x.id === activeSection);
  section.render(content);
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
      el('.menu-item-icon', { text: s.icon }),
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

  // Первый запуск — предложить выбрать язык.
  if (!store.getState().settings.langChosen) {
    openLanguageOnboarding(() => rerenderAll());
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
