// app.js — точка входа: инициализация store, роутинг между экранами,
// нижний таб-бар в стиле iOS, плавающая кнопка «+», регистрация Service Worker.

import * as store from './store.js';
import { t } from './i18n.js';
import { el, clear } from './dom.js';
import { renderHome, openTransactionForm } from './views/transactions.js';
import { renderAnalytics } from './views/analytics.js';
import { renderForecast } from './views/forecast.js';
import { renderBudgets } from './views/budgets.js';
import { renderSettings, applyTheme } from './views/settings.js';

const TABS = [
  { id: 'home',      icon: '◎', render: (r) => renderHome(r) },
  { id: 'analytics', icon: '📊', render: (r) => renderAnalytics(r) },
  { id: 'forecast',  icon: '📈', render: (r) => renderForecast(r) },
  { id: 'budgets',   icon: '🎯', render: (r) => renderBudgets(r) },
  { id: 'settings',  icon: '⚙️', render: (r) => renderSettings(r, rerenderAll) },
];

const TAB_LABEL = {
  home: 'tab_home', analytics: 'tab_analytics', forecast: 'tab_forecast',
  budgets: 'tab_budgets', settings: 'tab_settings',
};

let activeTab = 'home';
const content = document.getElementById('content');
const tabbar = document.getElementById('tabbar');
const fab = document.getElementById('fab');

function renderTab() {
  clear(content);
  content.scrollTop = 0;
  const tab = TABS.find((x) => x.id === activeTab);
  tab.render(content);
  fab.style.display = activeTab === 'settings' ? 'none' : '';
}

function renderTabbar() {
  clear(tabbar);
  for (const tab of TABS) {
    const btn = el('button.tab', {
      type: 'button',
      class: tab.id === activeTab ? 'active' : '',
      onClick: () => { activeTab = tab.id; renderTabbar(); renderTab(); },
    }, [
      el('.tab-icon', { text: tab.icon }),
      el('.tab-label', { text: t(TAB_LABEL[tab.id]) }),
    ]);
    tabbar.appendChild(btn);
  }
}

function rerenderAll() {
  document.title = t('app_name');
  const titleEl = document.querySelector('#header .app-title');
  if (titleEl) titleEl.textContent = t('app_name');
  renderTabbar();
  renderTab();
}

async function main() {
  await store.init();
  applyTheme(store.getState().settings.theme);

  fab.addEventListener('click', () => openTransactionForm(null));

  // Перерисовка при изменении данных (только активная вкладка).
  store.subscribe(() => renderTab());

  rerenderAll();

  // Service Worker для офлайн-работы и установки на домашний экран.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

main();
