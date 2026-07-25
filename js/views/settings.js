// views/settings.js — настройки: язык, базовая валюта, тема, категории,
// экспорт/импорт данных, полный сброс.

import * as store from '../store.js';
import { t, availableLangs, LANG_NAMES } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog, toggle, catIcon } from '../dom.js';
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

  // Тема (+ ручной цвет)
  const themeSelect = el('select.row-control', {}, [
    ['system', t('theme_system')], ['light', t('theme_light')], ['dark', t('theme_dark')], ['manual', t('theme_manual')],
  ].map(([v, l]) => el('option', { value: v, selected: v === s.theme }, l)));
  themeSelect.addEventListener('change', async () => {
    await store.setSetting('theme', themeSelect.value);
    applyTheme(themeSelect.value);
    rerenderApp();
    if (themeSelect.value === 'manual') openThemeColorPicker(rerenderApp);
  });

  const themeGroup = el('.settings-group', {}, [
    settingRow(t('language'), langSelect),
    settingRow(t('theme'), themeSelect),
    settingRow(t('base_currency'), curSelect),
  ]);
  if (s.theme === 'manual') {
    themeGroup.appendChild(navRow('🎨', t('theme_color'), () => openThemeColorPicker(rerenderApp)));
  }
  root.appendChild(themeGroup);

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

  // Фон — ненавязчивые паттерны + свой рисунок.
  root.appendChild(el('.group-caption', { text: t('background') }));
  root.appendChild(el('.settings-group', {}, [el('.bg-picker-wrap', {}, [buildBackgroundPicker(s)])]));

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
    navRow('🗑', t('reset_all'), () => openResetDialog(rerenderApp), true),
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
          catIcon(c, 'trx-icon'),
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

export function openCategoryEditor(existing, onDone = () => {}, presetType) {
  // Цвет назначается автоматически (выбор цвета из редактора убран).
  const autoColor = COLOR_CHOICES[store.getState().categories.length % COLOR_CHOICES.length];
  const model = existing
    ? { ...existing, name: store.categoryName(existing) }
    : { name: '', type: presetType || 'expense', icon: '🔖', color: autoColor, image: null };
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

  const error = el('.form-error');

  const iconPreview = el('.icon-preview');
  const updatePreview = () => { clear(iconPreview); iconPreview.appendChild(catIcon({ icon: model.icon, color: model.color, image: model.image }, 'trx-icon')); };

  const emojiGrid = el('.emoji-grid');
  const markEmoji = (b) => { emojiGrid.querySelectorAll('.emoji-pick').forEach((x) => x.classList.remove('active')); if (b) b.classList.add('active'); };
  EMOJI_CHOICES.forEach((em) => {
    const b = el('button.emoji-pick', {
      type: 'button', class: (!model.image && em === model.icon) ? 'active' : '', text: em,
      onClick: () => { model.icon = em; model.image = null; markEmoji(b); updatePreview(); },
    });
    emojiGrid.appendChild(b);
  });

  // Загрузка своей иконки из галереи. Безопасно: принимаем только изображение,
  // проверяем формат и размер, затем обрезаем и уменьшаем до 64×64 через canvas
  // и пере-кодируем в PNG — это удаляет метаданные и любой посторонний контент.
  const uploadInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files && uploadInput.files[0];
    uploadInput.value = '';
    if (!file) return;
    processIconFile(file,
      (dataUrl) => { model.image = dataUrl; error.textContent = ''; markEmoji(null); updatePreview(); },
      () => { error.textContent = t('icon_rules'); });
  });
  const uploadBtn = el('button.btn-upload', { type: 'button', text: '📷 ' + t('upload_icon'), onClick: () => uploadInput.click() });

  updatePreview();

  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    field(t('category_name'), nameInput).row,
    field(t('type'), typeSeg).row,
    field(t('icon'), el('.icon-field', {}, [iconPreview, emojiGrid, uploadBtn, uploadInput])).row,
    el('.icon-rules', { text: t('icon_rules') }),
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
    await store.saveCategory({ id: existing ? existing.id : undefined, name: model.name.trim(), type: model.type, icon: model.icon, color: model.color, image: model.image || null });
    modal.close(); onDone();
  });
}

// Безопасная обработка загружаемой иконки: проверка формата/размера, обрезка
// и уменьшение до 64×64 через canvas + перекодирование в PNG.
function processIconFile(file, onOk, onErr) {
  // Принимаем любое изображение (в т.ч. HEIC с iPhone — Safari его декодирует).
  // Безопасность обеспечивает перерисовка через canvas ниже. Ограничение — размер.
  if (!/^image\//.test(file.type || 'image/') || file.size > 12 * 1024 * 1024) { onErr(); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const S = 64, canvas = document.createElement('canvas');
      canvas.width = canvas.height = S;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
      onOk(canvas.toDataURL('image/png'));
    } catch { onErr(); }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { onErr(); URL.revokeObjectURL(url); };
  img.src = url;
}

// Обработка фонового изображения: уменьшение до 700px, JPEG.
function processBgFile(file, onOk, onErr) {
  if (!/^image\//.test(file.type || 'image/') || file.size > 12 * 1024 * 1024) { onErr(); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const max = 700; let w = img.width, h = img.height;
      const sc = Math.min(1, max / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      onOk(c.toDataURL('image/jpeg', 0.8));
    } catch { onErr(); }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { onErr(); URL.revokeObjectURL(url); };
  img.src = url;
}

// ---- Диалог удаления данных с выбором «Сохранить категории» ----

function openResetDialog(rerenderApp) {
  const body = el('.form');
  let keep = true;
  const keepToggle = toggle(true, (v) => { keep = v; });
  body.append(
    el('.reset-msg', { text: t('reset_confirm') }),
    el('.setting-row', {}, [el('.setting-label', { text: t('keep_categories') }), keepToggle]),
    el('button.btn-danger', {
      type: 'button', text: t('reset_all'),
      onClick: async () => { await store.resetAll({ keepCategories: keep }); modal.close(); rerenderApp(); toast(t('delete')); },
    }),
  );
  const modal = sheet(t('delete_data_q'), body);
}

// ---- Фон: паттерны + свой рисунок ----

const BG_PATTERNS = ['none', 'dots', 'grid', 'diag', 'cross', 'checker', 'zigzag', 'waves'];

function buildBackgroundPicker() {
  const wrap = el('.bg-grid');
  const cells = {};
  const highlight = () => {
    const cur = store.getState().settings.background || 'none';
    Object.values(cells).forEach((c) => c.classList.remove('active'));
    (cells[cur] || cells.none).classList.add('active');
  };
  const pick = async (id) => { await store.setSetting('background', id); applyBackground(id); highlight(); };
  for (const id of BG_PATTERNS) {
    const c = el('button.bg-swatch', { type: 'button', 'data-bg': id, onClick: () => pick(id) });
    if (id === 'none') c.appendChild(el('.bg-none-x', { text: '✕' }));
    cells[id] = c; wrap.appendChild(c);
  }
  // Свой рисунок из галереи (+ кнопка удаления загруженного).
  const custom = store.getState().settings.bgCustom;
  const customCell = el('button.bg-swatch.bg-custom', { type: 'button' }, [el('.bg-plus', { text: custom ? '' : '+' })]);
  if (custom) customCell.style.backgroundImage = `url("${custom}")`;
  const delBadge = el('.bg-del', { text: '✕', style: { display: custom ? '' : 'none' } });
  customCell.appendChild(delBadge);
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    processBgFile(f, async (durl) => {
      await store.setSetting('bgCustom', durl);
      await store.setSetting('background', 'custom');
      customCell.style.backgroundImage = `url("${durl}")`;
      customCell.querySelector('.bg-plus').textContent = '';
      delBadge.style.display = ''; applyBackground('custom'); highlight();
    }, () => toast(t('icon_rules')));
  });
  customCell.addEventListener('click', (e) => {
    if (e.target === delBadge) {
      e.stopPropagation();
      store.setSetting('bgCustom', null);
      store.setSetting('background', 'none').then(() => {
        customCell.style.backgroundImage = '';
        customCell.querySelector('.bg-plus').textContent = '+';
        delBadge.style.display = 'none';
        applyBackground('none'); highlight();
      });
      return;
    }
    fileInput.click();
  });
  cells.custom = customCell;
  wrap.append(customCell, fileInput);
  highlight();
  return wrap;
}

export function applyBackground(id) {
  const root = document.documentElement;
  const settings = store.getState().settings;
  const bg = id || settings.background || 'none';
  root.setAttribute('data-bg', bg);
  if (bg === 'custom' && settings.bgCustom) root.style.setProperty('--bg-custom', `url("${settings.bgCustom}")`);
  else root.style.removeProperty('--bg-custom');
}

// ---- Тема ----

const MANUAL_VARS = ['--bg', '--bg-elev', '--card', '--text', '--text-2', '--text-3', '--sep', '--sep-strong', '--fill', '--fill-2'];

export function applyTheme(theme) {
  const root = document.documentElement;
  MANUAL_VARS.forEach((v) => root.style.removeProperty(v));
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else if (theme === 'manual') { root.setAttribute('data-theme', 'dark'); applyManualColor(store.getState().settings.themeColor); }
  else root.removeAttribute('data-theme');
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Строим палитру интерфейса из одного базового цвета фона.
function applyManualColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const [r, g, b] = rgb;
  const root = document.documentElement;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = lum < 0.5;
  const mix = (amt) => rgbToHex(r + amt, g + amt, b + amt);
  root.style.setProperty('--bg', hex);
  root.style.setProperty('--bg-elev', mix(dark ? 20 : -14));
  root.style.setProperty('--card', mix(dark ? 20 : -14));
  root.style.setProperty('--text', dark ? '#F2ECE3' : '#1A1A1A');
  root.style.setProperty('--text-2', dark ? 'rgba(242,236,227,.82)' : 'rgba(0,0,0,.72)');
  root.style.setProperty('--text-3', dark ? 'rgba(242,236,227,.55)' : 'rgba(0,0,0,.45)');
  root.style.setProperty('--sep', dark ? 'rgba(255,240,220,.14)' : 'rgba(0,0,0,.12)');
  root.style.setProperty('--sep-strong', dark ? 'rgba(255,240,220,.30)' : 'rgba(0,0,0,.26)');
  root.style.setProperty('--fill', dark ? 'rgba(255,240,220,.10)' : 'rgba(0,0,0,.06)');
  root.style.setProperty('--fill-2', dark ? 'rgba(255,240,220,.18)' : 'rgba(0,0,0,.12)');
}

// Пикер цвета фона для ручной темы: пресеты + RGB + яркость.
function openThemeColorPicker(rerenderApp) {
  const s = store.getState().settings;
  const base = hexToRgb(s.themeColor) || [42, 32, 24];
  let bright = 100;
  const body = el('.form');
  const preview = el('.theme-preview');

  const presets = ['#241C15', '#2A2018', '#2B2A20', '#20242A', '#2A1F26', '#1E2622', '#302A24', '#232323'];
  const presetRow = el('.bg-grid');
  presets.forEach((hex) => presetRow.appendChild(el('button.bg-swatch', {
    type: 'button', style: { background: hex }, onClick: () => { const c = hexToRgb(hex); base[0] = c[0]; base[1] = c[1]; base[2] = c[2]; bright = 100; syncInputs(); apply(); },
  })));

  const curHex = () => { const f = bright / 100; return rgbToHex(base[0] * f, base[1] * f, base[2] * f); };
  const apply = () => { const hex = curHex(); preview.style.background = hex; applyManualColor(hex); };

  const mk = (label, min, max, get, set) => {
    const inp = el('input.range', { type: 'range', min, max, value: get() });
    inp.addEventListener('input', () => { set(+inp.value); apply(); });
    return { row: field(label, inp).row, inp };
  };
  const rS = mk('R', 0, 255, () => base[0], (v) => base[0] = v);
  const gS = mk('G', 0, 255, () => base[1], (v) => base[1] = v);
  const bS = mk('B', 0, 255, () => base[2], (v) => base[2] = v);
  const brS = mk(t('brightness'), 50, 150, () => bright, (v) => bright = v);
  const syncInputs = () => { rS.inp.value = base[0]; gS.inp.value = base[1]; bS.inp.value = base[2]; brS.inp.value = bright; };

  const saveBtn = el('button.btn-primary', {
    type: 'button', text: t('save'),
    onClick: async () => { await store.setSetting('themeColor', curHex()); await store.setSetting('theme', 'manual'); modal.close(); rerenderApp(); },
  });

  body.append(preview, presetRow, rS.row, gS.row, bS.row, brS.row, saveBtn);
  apply();
  const modal = sheet(t('theme_color'), body);
}
