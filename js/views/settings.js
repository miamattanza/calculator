// views/settings.js — настройки: язык, базовая валюта, тема, категории,
// экспорт/импорт данных, полный сброс.

import * as store from '../store.js';
import { t, availableLangs, LANG_NAMES } from '../i18n.js';
import { el, clear, sheet, field, toast, confirmDialog, choiceDialog, toggle, catIcon, rowCols, swipeDeleteRow } from '../dom.js';
import { CURRENCIES, roundRate, currencyFlag } from '../format.js';
import { APP_VERSION } from '../models.js';
import { iconByKey, iconsByType } from '../icons.js';


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

  // Тема — только светлая/тёмная.
  const curTheme = s.theme === 'dark' ? 'dark' : 'light';
  const themeSelect = el('select.row-control', {}, [
    ['light', t('theme_light')], ['dark', t('theme_dark')],
  ].map(([v, l]) => el('option', { value: v, selected: v === curTheme }, l)));
  themeSelect.addEventListener('change', async () => {
    await store.setSetting('theme', themeSelect.value);
    applyTheme(themeSelect.value);
    rerenderApp();
  });

  const themeGroup = el('.settings-group', {}, [
    settingRow(t('language'), langSelect),
    settingRow(t('theme'), themeSelect),
  ]);
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
  const plusLeftToggle = toggle(!!s.sumPlusLeft, async (checked) => {
    await store.setSetting('sumPlusLeft', checked);
    rerenderApp();
  });

  const displayGroup = el('.settings-group', {}, [
    settingRow(t('split_history'), splitToggle),
    el('.setting-hint', { text: t('split_history_hint') }),
    settingRow(t('fit_history'), fitToggle),
    el('.setting-hint', { text: t('fit_history_hint') }),
    settingRow(t('sum_plus_left'), plusLeftToggle),
    el('.setting-hint', { text: t('sum_plus_hint') }),
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

// Эмодзи-запас для дохода и как запасной вариант (у плиток-иконок все категории
// — расходные; для дохода эмодзи остаются уместны).
const EMOJI_CHOICES = ['💼','💰','🎁','📈','🧾','💵','🏦','💸','🪙','📊','🤝','⭐️','🎯','❤️'];
// Цвета — 14 групп из палитры проекта (G01–G14). Только они и их оттенки.
const COLOR_CHOICES = ['#84542A','#993229','#305A88','#2C775C','#8A3865','#43368C','#96782C','#3F7836','#2A2F51','#646D2C','#296670','#52396A','#726B65','#7A297A'];

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

export function openCategoryEditor(existing, onDone = () => {}, presetType, presetSlot) {
  // Цвет назначается автоматически (выбор цвета из редактора убран).
  const autoColor = COLOR_CHOICES[store.getState().categories.length % COLOR_CHOICES.length];
  const model = existing
    ? { ...existing, name: store.categoryName(existing) }
    : { name: '', type: presetType || 'expense', icon: '🔖', color: autoColor, image: null, iconKey: null };
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
        if (model.type === v) return;
        model.type = v;
        typeSeg.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        // Переключение типа НЕ меняет выбранную иконку (иконка резолвится по
        // ключу независимо от типа). Просто перестраиваем банк на нужный набор.
        renderTileBank();
        updatePreview();
      },
    });
  }

  const error = el('.form-error');

  const iconPreview = el('.icon-preview');
  const updatePreview = () => {
    clear(iconPreview);
    iconPreview.appendChild(catIcon(
      { icon: model.icon, color: model.color, image: model.image, iconKey: model.image ? null : model.iconKey },
      'trx-icon'));
  };

  const tileBank = el('.tile-bank');
  const emojiGrid = el('.emoji-grid');
  const clearActive = () => {
    tileBank.querySelectorAll('.tile-pick.active').forEach((x) => x.classList.remove('active'));
    emojiGrid.querySelectorAll('.emoji-pick.active').forEach((x) => x.classList.remove('active'));
  };

  // Банк плиток по типу: расходы — 54 иконки, доходы — 34, сгруппированы по
  // своим рубрикам. Выбор плитки задаёт и иконку, и цвет группы, поэтому новые
  // категории выглядят так же, как встроенные, а дизайн остаётся единым.
  // Перестраивается при переключении «Расходы»/«Доходы».
  const renderTileBank = () => {
    clear(tileBank);
    const groups = [];
    const gmap = new Map();
    for (const ic of iconsByType(model.type)) {
      let g = gmap.get(ic.group);
      if (!g) {
        // Заголовок рубрики — из перевода (catgrp_<group>), с откатом на
        // русский groupLabel из icons.js, если перевод почему-то отсутствует.
        const key = 'catgrp_' + ic.group;
        const tl = t(key);
        g = { label: tl && tl !== key ? tl : ic.groupLabel, items: [] };
        gmap.set(ic.group, g); groups.push(g);
      }
      g.items.push(ic);
    }
    for (const g of groups) {
      const grid = el('.tile-grid');
      for (const ic of g.items) {
        const btn = el('button.tile-pick', {
          type: 'button',
          class: (!model.image && model.iconKey === ic.key) ? 'active' : '',
          'aria-label': ic.label,
          onClick: function () {
            model.iconKey = ic.key; model.color = ic.color; model.image = null;
            clearActive(); this.classList.add('active'); updatePreview();
          },
        }, [catIcon({ iconKey: ic.key, color: ic.color }, 'tile-pick-art')]);
        grid.appendChild(btn);
      }
      tileBank.appendChild(el('.tile-group', {}, [
        el('.tile-group-label', { text: g.label }),
        grid,
      ]));
    }
  };
  renderTileBank();

  // Эмодзи — запасной вариант (для доходов, у которых нет плиток-иконок).
  const makeEmoji = (em) => el('button.emoji-pick', {
    type: 'button',
    class: (!model.image && !model.iconKey && em === model.icon) ? 'active' : '',
    text: em,
    onClick: function () {
      model.icon = em; model.iconKey = null; model.image = null;
      clearActive(); this.classList.add('active'); updatePreview();
    },
  });
  EMOJI_CHOICES.forEach((em) => emojiGrid.appendChild(makeEmoji(em)));
  const emojiBlock = el('.emoji-alt-block', {}, [
    el('.emoji-used-caption', { text: t('or_emoji') }), emojiGrid,
  ]);

  // Загрузка своей иконки из галереи. Безопасно: принимаем только изображение,
  // проверяем формат и размер, затем обрезаем и уменьшаем до 64×64 через canvas
  // и пере-кодируем в PNG — это удаляет метаданные и любой посторонний контент.
  const uploadInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files && uploadInput.files[0];
    uploadInput.value = '';
    if (!file) return;
    processIconFile(file,
      (dataUrl) => { model.image = dataUrl; model.iconKey = null; error.textContent = ''; clearActive(); updatePreview(); },
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
    field(t('used_icon'), el('.icon-field', {}, [iconPreview, tileBank, emojiBlock, uploadBtn, uploadInput])).row,
    el('.icon-rules', { text: t('icon_rules') }),
    ...(currencyBtn ? [currencyBtn] : []),
    error, saveBtn,
  );

  if (existing) {
    body.appendChild(el('button.btn-danger', {
      type: 'button', text: t('delete'),
      onClick: async () => {
        if (store.categoryInUse(existing.id)) {
          const choice = await choiceDialog(t('category_in_use'), [
            { label: t('delete_keep_history'), value: 'keep' },
            { label: t('delete_all'), value: 'all', danger: true },
            { label: t('cancel'), value: null },
          ]);
          if (choice === 'keep') { await store.archiveCategory(existing.id); modal.close(); onDone(); }
          else if (choice === 'all') { await store.deleteCategoryWithData(existing.id); modal.close(); onDone(); }
          return;
        }
        if (await confirmDialog(t('confirm_delete'))) { await store.deleteCategory(existing.id); modal.close(); onDone(); }
      },
    }));
  }

  const modal = sheet(existing ? t('category_name') : t('add_category'), body);

  saveBtn.addEventListener('click', async () => {
    if (!model.name.trim()) { error.textContent = t('required'); return; }
    const payload = { id: existing ? existing.id : undefined, name: model.name.trim(), type: model.type, icon: model.icon, color: model.color, image: model.image || null, currency: catCurrency, iconKey: model.image ? null : (model.iconKey || null) };
    if (!existing && presetSlot != null) payload.order = presetSlot;  // добавление в конкретную ячейку
    await store.saveCategory(payload);
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

export function openConverter() {
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
  // Последний выбор пары валют запоминается между открытиями конвертера.
  const savedFrom = store.getState().settings.convFrom;
  const savedTo = store.getState().settings.convTo;
  const result = el('.conv-result');
  const calc = () => {
    const a = parseFloat(amountInput.value.replace(',', '.')) || 0;
    const rf = rateFor(fromSel.value), rt = rateFor(toSel.value);
    if (rf == null || rt == null) { result.textContent = t('rate_unknown'); return; }
    const out = a * rf / rt;
    result.textContent = `${a} ${fromSel.value} = ${out.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${toSel.value}`;
  };
  fromSel.addEventListener('change', () => { store.setSetting('convFrom', fromSel.value); calc(); });
  toSel.addEventListener('change', () => { store.setSetting('convTo', toSel.value); calc(); });

  // Кнопка «⇄» между валютами: меняет местами выбранные валюты (и запоминает).
  const swapBtn = el('button.conv-swap', {
    type: 'button', 'aria-label': t('swap_currencies'), text: '⇄',
    onClick: () => {
      const a = fromSel.value, b = toSel.value;
      fromSel.value = b; toSel.value = a;
      store.setSetting('convFrom', fromSel.value);
      store.setSetting('convTo', toSel.value);
      calc();
    },
  });

  const fillOptions = (sel, preferred) => {
    const prev = sel.value || preferred;
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
        el('.conv-rate-cur', {}, [
          el('span.conv-flag', { text: currencyFlag(c) }),
          el('span', { text: `${c} · ${CURRENCIES[c].symbol}` }),
        ]),
        inp,
      ]);
      ratesWrap.appendChild(swipeDeleteRow(content, async () => {
        await setList(list.filter((x) => x !== c));
        redraw();
      }));
    }
  };

  const redraw = () => { fillOptions(fromSel, savedFrom); fillOptions(toSel, savedTo); drawRates(); calc(); };

  // Добавление валюты — выбор из ещё не добавленных.
  const openAdd = () => {
    const remaining = codes.filter((c) => c !== base && !getList().includes(c));
    if (!remaining.length) { toast('—'); return; }
    const listEl = el('.trx-group');
    for (const c of remaining) {
      listEl.appendChild(el('button.conv-add-row', {
        type: 'button',
        onClick: async () => { await setList([...getList(), c]); redraw(); pickerModal.close(); },
      }, [
        el('span.conv-flag', { text: currencyFlag(c) }),
        el('span', { text: `${c} · ${CURRENCIES[c].symbol} — ${CURRENCIES[c].name || ''}`.trim() }),
      ]));
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
    el('.conv-pair', {}, [fromSel, swapBtn, toSel]),
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

// Только светлая/тёмная. Любое иное значение (наследие: system/manual) трактуем
// как светлую — при инициализации store оно уже приводится к конкретной теме.
export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}
