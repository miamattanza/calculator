// views/settings.js — настройки: язык, базовая валюта, тема, категории,
// экспорт/импорт данных, полный сброс.

import * as store from '../store.js';
import { t, availableLangs, LANG_NAMES } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog, toggle, catIcon, rowCols, swipeDeleteRow } from '../dom.js';
import { CURRENCIES, roundRate } from '../format.js';
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

  // Основная валюта (в ней считается статистика). Смена не «переклеивает»
  // прошлые операции — они остаются в своих валютах.
  const curSelect = el('select.row-control', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === s.baseCurrency }, `${code} · ${CURRENCIES[code].symbol}`)));
  curSelect.addEventListener('change', async () => {
    await store.changeBaseCurrency(curSelect.value);
    rerenderApp();
  });

  // Текущая («ходовая») валюта — в ней записываются новые операции (напр. в
  // поездке). Если у выбранной валюты нет курса к основной — сразу предлагаем
  // ввести курс (иначе суммы считались бы 1:1). По умолчанию — основная.
  const isRated = (code) => code === s.baseCurrency || store.rateToBase(code) != null;
  const curNow = store.currentCurrency(); // эффективная текущая валюта (устойчивая)
  const curNowSelect = el('select.row-control', {}, Object.keys(CURRENCIES).map((code) =>
    el('option', { value: code, selected: code === curNow }, `${code} · ${CURRENCIES[code].symbol}`)));
  curNowSelect.addEventListener('change', async () => {
    const code = curNowSelect.value;
    if (isRated(code)) { await store.setSetting('currentCurrency', code); rerenderApp(); return; }
    // Курса нет — открываем ввод курса прямо здесь.
    openRateDialog(code, async (ok) => {
      if (ok) { await store.setSetting('currentCurrency', code); rerenderApp(); }
      else { curNowSelect.value = curNow; }
    });
  });

  // Переключатель сценария отображения истории при валюте, отличной от основной.
  const convToggle = toggle(!!s.convertAll, async (checked) => {
    await store.setSetting('convertAll', checked);
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
  ]);
  if (s.theme === 'manual') {
    themeGroup.appendChild(navRow('🎨', t('theme_color'), () => openThemeColorPicker(rerenderApp)));
  }
  root.appendChild(themeGroup);

  // Валюты: основная + текущая + сценарий отображения.
  root.appendChild(el('.group-caption', { text: t('currency') }));
  const curGroup = el('.settings-group', {}, [
    settingRow(t('base_currency'), curSelect),
    settingRow(t('current_currency'), curNowSelect),
    el('.setting-hint', { text: t('current_currency_hint') }),
    navRow('💱', t('converter'), () => openConverter()),
    settingRow(t('convert_all'), convToggle),
    el('.setting-hint', { text: t('convert_all_hint') }),
  ]);
  root.appendChild(curGroup);

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
  root.appendChild(el('.setting-hint', { text: t('data_local_note') }));

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

export async function exportJSON() {
  const dump = await store.exportAll();
  download(`fintracker-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump, null, 2), 'application/json');
  await store.setSetting('lastBackupAt', Date.now()); // отметка резервной копии
  toast(t('backup_done'));
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
      const cats = store.categoriesByType(type);
      listWrap.appendChild(el('.cat-manage-head', {}, [
        el('span', { text: type === 'expense' ? t('expense') : t('income') }),
        el('span.cat-manage-count', { text: String(cats.length) }),
      ]));
      const group = el('.settings-group.cat-manage-group');
      for (const c of cats) {
        group.appendChild(el('button.cat-manage-row', { type: 'button', onClick: () => openCategoryEditor(c, refresh) }, [
          catIcon(c, 'cat-manage-icon'),
          el('.cat-manage-name', { text: store.categoryName(c) }),
          el('.nav-chevron', { text: '›' }),
        ]));
      }
      group.appendChild(el('button.cat-manage-add', { type: 'button', onClick: () => openCategoryEditor(null, refresh, type) }, [
        el('.cat-manage-add-plus', { text: '＋' }),
        el('span', { text: t('add_category') }),
      ]));
      listWrap.appendChild(group);
    }
  }
  refresh();

  body.append(
    el('.setting-hint', { text: t('reorder_hint') }),
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

  // Иконки-эмодзи. Занятые другими категориями — в группе «уже используются»
  // (заблокированы, нельзя две одинаковые). Своя текущая иконка всегда доступна.
  const usedIcons = new Set(
    store.getState().categories
      .filter((c) => !existing || c.id !== existing.id)
      .map((c) => c.icon).filter(Boolean)
  );
  if (existing && existing.icon) usedIcons.delete(existing.icon);
  const emojiGrid = el('.emoji-grid');
  const usedGrid = el('.emoji-grid');
  const markIcon = (b) => {
    [emojiGrid, usedGrid].forEach((g) => g.querySelectorAll('.emoji-pick').forEach((x) => x.classList.remove('active')));
    if (b) b.classList.add('active');
  };
  const makePick = (em, disabled) => el('button.emoji-pick', {
    type: 'button',
    class: ((!model.image && em === model.icon) ? 'active' : '') + (disabled ? ' disabled' : ''),
    text: em,
    onClick: function () {
      if (disabled) { toast(t('icon_used_already')); return; }
      model.icon = em; model.image = null; markIcon(this); updatePreview();
    },
  });
  EMOJI_CHOICES.filter((em) => !usedIcons.has(em)).forEach((em) => emojiGrid.appendChild(makePick(em, false)));
  const usedList = EMOJI_CHOICES.filter((em) => usedIcons.has(em));
  usedList.forEach((em) => usedGrid.appendChild(makePick(em, true)));
  const usedBlock = usedList.length
    ? el('.emoji-used-block', {}, [el('.emoji-used-caption', { text: t('icons_used') }), usedGrid])
    : null;

  // Загрузка своей иконки из галереи. Безопасно: принимаем только изображение,
  // проверяем формат и размер, затем обрезаем и уменьшаем до 64×64 через canvas
  // и пере-кодируем в PNG — это удаляет метаданные и любой посторонний контент.
  const uploadInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files && uploadInput.files[0];
    uploadInput.value = '';
    if (!file) return;
    processIconFile(file,
      (dataUrl) => { model.image = dataUrl; error.textContent = ''; markIcon(null); updatePreview(); },
      () => { error.textContent = t('icon_rules'); });
  });
  const uploadBtn = el('button.btn-upload', { type: 'button', text: '📷 ' + t('upload_icon'), onClick: () => uploadInput.click() });

  updatePreview();

  // Валюта категории (из прежней версии) — теперь её нельзя назначать, но
  // оставшуюся у некоторых категорий можно убрать.
  let catCurrency = existing ? (existing.currency || null) : null;
  let currencyBtn = null;
  if (catCurrency) {
    currencyBtn = el('button.btn-danger', {
      type: 'button', text: `${t('reset_cat_currency')} (${catCurrency})`,
      onClick: () => { catCurrency = null; if (currencyBtn) { currencyBtn.remove(); currencyBtn = null; } },
    });
  }

  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });

  body.append(
    field(t('category_name'), nameInput).row,
    field(t('type'), typeSeg).row,
    field(t('icon'), el('.icon-field', {}, [iconPreview, emojiGrid, usedBlock, uploadBtn, uploadInput])).row,
    el('.icon-rules', { text: t('icon_rules') }),
    ...(currencyBtn ? [currencyBtn] : []),
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
    await store.saveCategory({ id: existing ? existing.id : undefined, name: model.name.trim(), type: model.type, icon: model.icon, color: model.color, image: model.image || null, currency: catCurrency });
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
  // Свой рисунок из галереи. Тап — выбрать/сменить рисунок; долгое нажатие на
  // загруженный рисунок — всплывающая кнопка удаления.
  const custom = store.getState().settings.bgCustom;
  const customCell = el('button.bg-swatch.bg-custom', { type: 'button' }, [el('.bg-plus', { text: custom ? '' : '+' })]);
  if (custom) customCell.style.backgroundImage = `url("${custom}")`;
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const hasCustom = () => !!store.getState().settings.bgCustom;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    processBgFile(f, async (durl) => {
      await store.setSetting('bgCustom', durl);
      await store.setSetting('background', 'custom');
      customCell.style.backgroundImage = `url("${durl}")`;
      customCell.querySelector('.bg-plus').textContent = '';
      applyBackground('custom'); highlight();
    }, () => toast(t('icon_rules')));
  });
  const removeBg = () => {
    store.setSetting('bgCustom', null);
    store.setSetting('background', 'none').then(() => {
      customCell.style.backgroundImage = '';
      customCell.querySelector('.bg-plus').textContent = '+';
      applyBackground('none'); highlight();
    });
  };
  // Всплывающая кнопка удаления рядом с плиткой.
  let pop = null;
  const onDoc = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
  const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', onDoc, true); } };
  const openPop = () => {
    if (!hasCustom()) return; closePop();
    const btn = el('button.bg-del-btn', { type: 'button', text: '🗑 ' + t('delete'), onClick: (e) => { e.stopPropagation(); removeBg(); closePop(); } });
    pop = el('.bg-del-pop', {}, [btn]);
    document.body.appendChild(pop);
    const r = customCell.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
    requestAnimationFrame(() => { pop && pop.classList.add('open'); document.addEventListener('pointerdown', onDoc, true); });
  };
  // Долгое нажатие → всплывающая кнопка; короткий тап → выбор файла.
  let lpTimer = null, lpFired = false, lsx = 0, lsy = 0, lpMoved = false;
  const lpBegin = (x, y) => { lsx = x; lsy = y; lpMoved = false; lpFired = false; lpTimer = setTimeout(() => { lpFired = true; openPop(); }, 500); };
  const lpTrack = (x, y) => { if (Math.abs(x - lsx) > 10 || Math.abs(y - lsy) > 10) { lpMoved = true; clearTimeout(lpTimer); } };
  const lpEnd = () => clearTimeout(lpTimer);
  customCell.addEventListener('touchstart', (e) => { const p = e.changedTouches[0]; lpBegin(p.clientX, p.clientY); }, { passive: true });
  customCell.addEventListener('touchmove', (e) => { const p = e.changedTouches[0]; lpTrack(p.clientX, p.clientY); }, { passive: true });
  customCell.addEventListener('touchend', lpEnd, { passive: true });
  customCell.addEventListener('mousedown', (e) => lpBegin(e.clientX, e.clientY));
  customCell.addEventListener('mouseup', lpEnd);
  customCell.addEventListener('mouseleave', lpEnd);
  customCell.addEventListener('click', (e) => {
    if (lpFired) { e.preventDefault(); e.stopPropagation(); lpFired = false; return; }
    if (lpMoved) return;
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

// ---- Конвертер валют ----

// Обновление курсов онлайн. Основной источник — open.er-api.com (рыночные
// курсы). Резерв — официальные курсы ЦБ РФ (JSON-зеркало cbr-xml-daily.ru),
// на случай если основной сервис недоступен. Возвращённые курсы объединяются с
// уже заданными вручную (их не затираем, если источник валюту не отдал).
async function fetchRates(base, onOk, onErr) {
  const apply = async (fetched) => {
    if (!fetched || !Object.keys(fetched).length) throw new Error('empty');
    const rates = { ...(store.getState().settings.rates || {}), ...fetched };
    rates[base] = 1;
    await store.setSetting('rates', rates);
    onOk();
  };
  try { await apply(await fetchFromErApi(base)); return; } catch (e) { /* пробуем резерв */ }
  try { await apply(await fetchFromCBR(base)); return; } catch (e) { /* оба источника недоступны */ }
  onErr();
}

// Основной источник: open.er-api.com (1 base = j.rates[code] code).
async function fetchFromErApi(base) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  const j = await res.json();
  if (!j || j.result !== 'success' || !j.rates) throw new Error('bad');
  const out = {};
  for (const code of Object.keys(CURRENCIES)) {
    if (code === base) { out[code] = 1; continue; }
    const perBase = j.rates[code];
    if (perBase) out[code] = roundRate(1 / perBase); // 1 <code> = 1/perBase базовой (до десятых)
  }
  return out;
}

// Резерв: официальные курсы ЦБ РФ. Valute[code] = { Value, Nominal } — сколько
// рублей за Nominal единиц валюты. Пересчитываем к нужной базе через рубль.
async function fetchFromCBR(base) {
  const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
  const j = await res.json();
  if (!j || !j.Valute) throw new Error('bad');
  const rubPer = (code) => {
    if (code === 'RUB') return 1;
    const v = j.Valute[code];
    return v && v.Value > 0 && v.Nominal > 0 ? v.Value / v.Nominal : null;
  };
  const baseRub = rubPer(base);
  if (!baseRub) throw new Error('no base rate');
  const out = {};
  for (const code of Object.keys(CURRENCIES)) {
    if (code === base) { out[code] = 1; continue; }
    const cr = rubPer(code);
    if (cr) out[code] = roundRate(cr / baseRub); // 1 code = cr руб = cr/baseRub базовой
  }
  return out;
}

// Быстрый ввод курса валюты к основной — когда выбирают валюту без курса.
function openRateDialog(code, onDone) {
  const base = store.baseCurrency();
  let saved = false;
  const input = el('input.select', { type: 'text', inputmode: 'decimal', placeholder: '0' });
  const err = el('.form-error');
  const saveBtn = el('button.btn-primary', { type: 'button', text: t('save') });
  const body = el('.form', {}, [
    el('.rate-dialog-q', { text: `1 ${code} = ? ${base}` }),
    input, err, saveBtn,
  ]);
  const modal = sheet(t('rate_to_base', { base }), body, { onClose: () => { if (!saved) onDone(false); } });
  input.addEventListener('input', () => { input.value = input.value.replace(/[^\d.,]/g, ''); });
  saveBtn.addEventListener('click', async () => {
    const v = parseFloat((input.value || '').replace(',', '.'));
    if (!(v > 0)) { err.textContent = t('invalid_amount'); return; }
    const next = { ...(store.getState().settings.rates || {}) };
    next[code] = roundRate(v);
    await store.setSetting('rates', next);
    saved = true; modal.close(); onDone(true);
  });
  setTimeout(() => input.focus(), 250);
}

function openConverter() {
  const base = store.baseCurrency();
  const codes = Object.keys(CURRENCIES);
  const rates = () => { const r = { ...(store.getState().settings.rates || {}) }; r[base] = 1; return r; };
  const rateFor = (c) => (c === base ? 1 : (Number(rates()[c]) || null));

  // Список валют конвертера (пользователь добавляет/удаляет). По умолчанию —
  // только валюты с уже заданным курсом (на новом устройстве список пуст, и
  // валюты добавляются кнопкой «Добавить валюту»).
  const getList = () => {
    const s = store.getState().settings;
    if (Array.isArray(s.convCurrencies)) return s.convCurrencies.filter((c) => c !== base && CURRENCIES[c]);
    return Object.keys(s.rates || {}).filter((c) => c !== base && CURRENCIES[c] && Number(s.rates[c]) > 0);
  };
  const setList = (arr) => store.setSetting('convCurrencies', arr);

  const body = el('.form');
  const amountInput = el('input.select', { type: 'text', inputmode: 'decimal', value: '1' });
  amountInput.addEventListener('input', () => { amountInput.value = amountInput.value.replace(/[^\d.,]/g, ''); calc(); });
  const fromSel = el('select.select');
  const toSel = el('select.select');
  const result = el('.conv-result');
  const calc = () => {
    const a = parseFloat(amountInput.value.replace(',', '.')) || 0;
    const rf = rateFor(fromSel.value), rt = rateFor(toSel.value);
    if (rf == null || rt == null) { result.textContent = t('rate_unknown'); return; }
    const out = a * rf / rt;
    result.textContent = `${a} ${fromSel.value} = ${out.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${toSel.value}`;
  };
  fromSel.addEventListener('change', calc); toSel.addEventListener('change', calc);

  const fillOptions = (sel) => {
    const prev = sel.value;
    const opts = [base, ...getList()];
    clear(sel);
    for (const c of opts) sel.appendChild(el('option', { value: c }, `${c} · ${CURRENCIES[c].symbol}`));
    sel.value = opts.includes(prev) ? prev : opts[0];
  };

  // Курсы к основной валюте (правятся вручную). Каждую валюту можно удалить
  // свайпом влево, как строку истории.
  const ratesWrap = el('.trx-group');
  const drawRates = () => {
    clear(ratesWrap);
    const r = rates();
    const list = getList();
    if (!list.length) { ratesWrap.appendChild(el('.mini-empty', { text: '—' })); return; }
    for (const c of list) {
      const inp = el('input.conv-rate-input', { type: 'text', inputmode: 'decimal', value: r[c] != null ? roundRate(r[c]) : '', placeholder: '—' });
      inp.addEventListener('change', async () => {
        const next = { ...(store.getState().settings.rates || {}) };
        const v = parseFloat(inp.value.replace(',', '.'));
        if (v > 0) { const rr = roundRate(v); next[c] = rr; inp.value = rr; } else delete next[c];
        await store.setSetting('rates', next); calc();
      });
      const content = el('.conv-rate-row', {}, [
        el('.conv-rate-cur', { text: `${c} · ${CURRENCIES[c].symbol}` }),
        inp,
      ]);
      ratesWrap.appendChild(swipeDeleteRow(content, async () => {
        await setList(list.filter((x) => x !== c));
        redraw();
      }));
    }
  };

  const redraw = () => { fillOptions(fromSel); fillOptions(toSel); drawRates(); calc(); };

  // Добавление валюты — выбор из ещё не добавленных.
  const openAdd = () => {
    const remaining = codes.filter((c) => c !== base && !getList().includes(c));
    if (!remaining.length) { toast('—'); return; }
    const listEl = el('.trx-group');
    for (const c of remaining) {
      listEl.appendChild(el('button.conv-add-row', {
        type: 'button', text: `${c} · ${CURRENCIES[c].symbol} — ${CURRENCIES[c].name || ''}`.trim(),
        onClick: async () => { await setList([...getList(), c]); redraw(); pickerModal.close(); },
      }));
    }
    const pickerModal = sheet(t('add_currency'), el('.form', {}, [listEl]));
  };
  const addBtn = el('button.btn-upload', { type: 'button', text: '＋ ' + t('add_currency'), onClick: openAdd });

  const updateBtn = el('button.btn-upload', {
    type: 'button', text: '🔄 ' + t('update_rates'),
    onClick: () => fetchRates(base, () => { drawRates(); calc(); toast(t('rates_updated')); }, () => toast(t('rates_error'))),
  });

  body.append(
    field(t('amount'), amountInput).row,
    rowCols(field('', fromSel).row, field('', toSel).row),
    result,
    el('.group-caption', { text: t('base_currency') }),
    ratesWrap,
    addBtn,
    updateBtn,
  );
  redraw();
  sheet(t('converter'), body, { full: true });
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
