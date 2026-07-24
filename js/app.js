// app.js — точка входа: инициализация store, переключение разделов,
// всплывающее меню (гамбургер ☰) вверху, плавающая кнопка «+»,
// регистрация Service Worker.

import * as store from './store.js';
import { t } from './i18n.js';
import { el, clear } from './dom.js';
import { renderHome, openQuickAdd } from './views/transactions.js';
import { renderAnalytics } from './views/analytics.js';
import { renderForecast } from './views/forecast.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings, applyTheme } from './views/settings.js';

// Разделы приложения. Обзор — главный экран, остальные открываются из меню.
const SECTIONS = [
  { id: 'home',      icon: '🏠', labelKey: 'tab_home',      render: (r) => renderHome(r) },
  { id: 'analytics', icon: '📊', labelKey: 'tab_analytics', render: (r) => renderAnalytics(r) },
  { id: 'forecast',  icon: '📈', labelKey: 'tab_forecast',  render: (r) => renderForecast(r) },
  { id: 'budgets',   icon: '🎯', labelKey: 'tab_budgets',   render: (r) => renderBudgets(r) },
  { id: 'settings',  icon: '⚙️', labelKey: 'settings_title', render: (r) => renderSettings(r, rerenderAll) },
];

let activeSection = 'home';
const content = document.getElementById('content');
const menuBtn = document.getElementById('menu-btn');
const fab = document.getElementById('fab');

const modeLabel = document.getElementById('mode-label');

function renderSection() {
  clear(content);
  content.scrollTop = 0;
  if (activeSection !== 'home') {
    content.classList.remove('fit-mode');
    if (modeLabel) { modeLabel.textContent = ''; modeLabel.className = ''; }
  }
  const section = SECTIONS.find((x) => x.id === activeSection);
  section.render(content);
  fab.style.display = activeSection === 'settings' ? 'none' : '';
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

function rerenderAll() {
  document.title = t('app_name');
  renderSection();
}

async function main() {
  await store.init();
  applyTheme(store.getState().settings.theme);

  menuBtn.addEventListener('click', openMenu);
  fab.addEventListener('click', () => openQuickAdd());

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

  // Service Worker для офлайн-работы и установки на домашний экран.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

main();
