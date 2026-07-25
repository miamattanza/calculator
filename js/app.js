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
import { renderSettings, applyTheme, applyBackground } from './views/settings.js';

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
const analyticsBtn = document.getElementById('analytics-btn');

function renderSection() {
  clear(content);
  content.scrollTop = 0;
  const onHome = activeSection === 'home';
  // Шапка с балансом/меткой окна и иконка Аналитики — только на «Обзоре».
  if (!onHome) {
    content.classList.remove('fit-mode');
    if (modeLabel) { modeLabel.textContent = ''; modeLabel.className = ''; }
    if (headBalance) { headBalance.textContent = ''; headBalance.style.display = 'none'; }
  }
  if (analyticsBtn) analyticsBtn.style.display = onHome ? '' : 'none';
  const section = SECTIONS.find((x) => x.id === activeSection);
  section.render(content);
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

async function main() {
  await store.init();
  applyTheme(store.getState().settings.theme);
  applyBackground();

  menuBtn.addEventListener('click', openMenu);
  if (analyticsBtn) analyticsBtn.addEventListener('click', () => { activeSection = 'analytics'; renderSection(); });

  // Перерисовка при изменении данных (только активный раздел).
  store.subscribe(() => renderSection());

  // При смене размера/ориентации/видимой области пересчитываем, сколько строк
  // истории помещается на экране.
  let resizeTimer = null;
  const onViewportChange = () => {
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
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

main();
