// views/settings.js — настройки: язык, базовая валюта, тема, категории,
// экспорт/импорт данных, полный сброс.

import * as store from '../store.js';
import { t, availableLangs, LANG_NAMES } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog, toggle } from '../dom.js';
import { CURRENCIES } from '../format.js';
import { APP_VERSION } from '../models.js';


export function renderSettings(root, rerenderApp) {
  clear(root);
  const s = store.getState().settings;
  root.appendChild(el('.screen-title', { text: t('settings_title') }));

  // Язык
  const langSelect = el('select.row-control', {}, availableLangs().map((l) =>
    el('option', { value: l, selected: l === s.language }, LANG_NAMES[l] || l)));
  langSelect.addEventListener('change', async () => {
    await store.setSetting('language', langSelect.value);
    rerenderApp();
  });

  // Валюта
  const curSelect = el('select.row-control', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === s.baseCurrency }, `${code} · ${CURRENCIES[code].symbol}`)));
  curSelect.addEventListener('change', async () => {
    await store.setSetting('baseCurrency', curSelect.value);
    rerenderApp();
  });

  // Тема
  const themeSelect = el('select.row-control', {}, [
    ['system', t('theme_system')], ['light', t('theme_light')], ['dark', t('theme_dark')],
  ].map(([v, l]) => el('option', { value: v, selected: v === s.theme }, l)));
  themeSelect.addEventListener('change', async () => {
    await store.setSetting('theme', themeSelect.value);
    applyTheme(themeSelect.value);
  });

  root.appendChild(el('.settings-group', {}, [
    settingRow(t('language'), langSelect),
    settingRow(t('base_currency'), curSelect),
    settingRow(t('theme'), themeSelect),
  ]));

  // Отображение: раздельная / общая история; подгонка истории под экран.
  const splitToggle = toggle(s.splitHistory !== false, async (checked) => {
    await store.setSetting('splitHistory', checked);
  });
  const fitToggle = toggle(s.fitHistory !== false, async (checked) => {
    await store.setSetting('fitHistory', checked);
  });

  const displayGroup = el('.settings-group', {}, [
    settingRow(t('split_history'), splitToggle),
    el('.setting-hint', { text: t('split_history_hint') }),
    settingRow(t('fit_history'), fitToggle),
    el('.setting-hint', { text: t('fit_history_hint') }),
  ]);

  // Поле «Максимум строк» — только когда подгонка под экран выключена.
  if (s.fitHistory === false) {
    const maxInput = el('input.row-control.num-input', {
      type: 'number', inputmode: 'numeric', min: '1', value: s.maxRows || 10,
    });
    maxInput.addEventListener('change', async () => {
      let v = parseInt(maxInput.value, 10);
      if (!v || v < 1) v = 10;
      maxInput.value = v;
      await store.setSetting('maxRows', v);
    });
    displayGroup.appendChild(settingRow(t('max_rows'), maxInput));
  }

  root.appendChild(el('.group-caption', { text: t('display') }));
  root.appendChild(displayGroup);

  // Категории
  root.appendChild(el('.settings-group', {}, [
    navRow('🏷', t('categories_manage'), () => openCategoriesManager()),
  ]));

  // Данные
  root.appendChild(el('.group-caption', { text: t('data') }));
  root.appendChild(el('.settings-group', {}, [
    navRow('📤', t('export_json'), exportJSON),
    navRow('🧾', t('export_csv'), exportCSV),
    navRow('📥', t('import_json'), importJSON),
  ]));

  root.appendChild(el('.settings-group', {}, [
    navRow('🗑', t('reset_all'), async () => {
      if (await confirmDialog(t('reset_confirm'))) { await store.resetAll(); rerenderApp(); toast(t('delete')); }
    }, true),
  ]));

  // О приложении
  root.appendChild(el('.group-caption', { text: t('about') }));
  root.appendChild(el('.settings-group', {}, [
    el('.about-row', {}, [el('p', { text: t('about_text') })]),
  ]));
  root.appendChild(el('.install-note', { text: t('install_hint') }));

  // Версия — внизу экрана настроек.
  root.appendChild(el('.version-footer', { text: `${t('app_name')} · ${t('version')} ${APP_VERSION}` }));
}

function settingRow(label, control) {
  return el('.setting-row', {}, [el('.setting-label', { text: label }), control]);
}

function navRow(icon, label, onClick, danger) {
  return el('.nav-row', { class: danger ? 'danger' : '', onClick }, [
    el('.nav-icon', { text: icon }),
    el('.nav-label', { text: label }),
    danger ? null : el('.nav-chevron', { text: '›' }),
  ]);
}

// ---- Экспорт / импорт ----

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJSON() {
  const dump = await store.exportAll();
  download(`fintracker-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump, null, 2), 'application/json');
}

function exportCSV() {
  download(`fintracker-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + store.transactionsToCSV(), 'text/csv');
}

function importJSON() {
  const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await store.importAll(JSON.parse(text));
      toast(t('import_done'));
    } catch {
      toast(t('import_error'));
    }
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}

// ---- Управление категориями ----

const EMOJI_CHOICES = ['🛒','☕️','🚕','🏠','💊','🎬','🛍','📱','💼','🧾','🎁','📈','💰','⛽️','✈️','🎓','🐾','👕','🍔','🏋️','🎵','💡','🔖','❤️'];
const COLOR_CHOICES = ['#34C759','#FF9500','#5AC8FA','#AF52DE','#FF2D55','#FF375F','#BF5AF2','#64D2FF','#0A84FF','#30D158','#FF9F0A','#8E8E93'];

function openCategoriesManager() {
  const body = el('.form');
  const listWrap = el('.cat-manage-list');

  function refresh() {
    clear(listWrap);
    for (const type of ['expense', 'income']) {
      listWrap.appendChild(el('.group-caption', { text: type === 'expense' ? t('expense') : t('income') }));
      const group = el('.settings-group');
      for (const c of store.categoriesByType(type)) {
        group.appendChild(el('.cat-manage-row', { onClick: () => openCategoryEditor(c, refresh) }, [
          el('.trx-icon', { style: { '--chip': c.color }, text: c.icon }),
          el('.cat-manage-name', { text: store.categoryName(c) }),
          el('.nav-chevron', { text: '›' }),
        ]));
      }
      listWrap.appendChild(group);
    }
  }
  refresh();

  body.append(
    el('button.btn-primary', { type: 'button', text: t('add_category'), onClick: () => openCategoryEditor(null, refresh) }),
    listWrap,
  );
  sheet(t('manage_categories'), body);
}

function openCategoryEditor(existing, onDone) {
  const model = existing ? { ...existing, name: store.categoryName(existing) } : { name: '', type: 'expense', icon: '🔖', color: '#8E8E93' };
  const body = el('.form');

  const nameInput = el('input.select', { type: 'text', placeholder: t('category_name'), value: model.name });
  nameInput.addEventListener('input', () => { model.name = nameInput.value; });

  const typeSeg = el('.segmented', {}, [
    typeBtn('expense', t('expense')), typeBtn('income', t('income')),
  ]);
  function typeBtn(v, label) {
    return el('button.seg', {
      type: 'button', class: model.type === v ? 'active' : '', text: label,
      onClick: (e) => {
        model.type = v;
        typeSeg.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
      },
    });
  }

  const emojiGrid = el('.emoji-grid');
  EMOJI_CHOICES.forEach((em) => {
    const b = el('button.emoji-pick', {
      type: 'button', class: em === model.icon ? 'active' : '', text: em,
      onClick: () => { model.icon = em; emojiGrid.querySelectorAll('.emoji-pick').forEach((x) => x.classList.remove('active')); b.classList.add('active'); },
    });
    emojiGrid.appendChild(b);
  });

  const colorGrid = el('.color-grid');
  COLOR_CHOICES.forEach((col) => {
    const b = el('button.color-pick', {
      type: 'button', class: col === model.color ? 'active' : '', style: { background: col },
      onClick: () => { model.color = col; colorGrid.querySelectorAll('.color-pick').forEach((x) => x.classList.remove('active')); b.classList.add('active'); },
    });
    colorGrid.appendChild(b);
  });

  const error = el('.form-error');
  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    field(t('category_name'), nameInput).row,
    field(t('type'), typeSeg).row,
    field(t('icon'), emojiGrid).row,
    field(t('color'), colorGrid).row,
    error, saveBtn,
  );

  if (existing) {
    body.appendChild(el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => {
        if (store.categoryInUse(existing.id)) { error.textContent = t('category_in_use'); return; }
        if (await confirmDialog(t('confirm_delete'))) { await store.deleteCategory(existing.id); modal.close(); onDone(); }
      },
    }));
  }

  const modal = sheet(existing ? t('category_name') : t('add_category'), body);

  saveBtn.addEventListener('click', async () => {
    if (!model.name.trim()) { error.textContent = t('required'); return; }
    await store.saveCategory({ id: existing ? existing.id : undefined, name: model.name.trim(), type: model.type, icon: model.icon, color: model.color });
    modal.close(); onDone();
  });
}

// ---- Тема ----

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
