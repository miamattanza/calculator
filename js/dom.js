// dom.js — небольшие помощники для создания DOM и UI-компонентов
// (модальные листы в стиле iOS, тосты, диалог подтверждения).

import { t } from './i18n.js';

// el('div.class#id', {attrs}, [children | 'text'])
export function el(tag, attrs = {}, children = []) {
  let tagName = 'div', id = null;
  const classes = [];
  tag.replace(/([.#]?[\w-]+)/g, (m) => {
    if (m[0] === '.') classes.push(m.slice(1));
    else if (m[0] === '#') id = m.slice(1);
    else tagName = m;
    return m;
  });
  const node = document.createElement(tagName);
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += ' ' + v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Иконка категории: загруженное изображение (если есть) либо эмодзи.
export function catIcon(cat, cls) {
  const box = el('.' + (cls || 'cat-emoji'), { style: { '--chip': cat ? cat.color : '#8E8E93' } });
  if (cat && cat.image) box.appendChild(el('img.cat-img', { src: cat.image, alt: '' }));
  else box.textContent = cat ? cat.icon : '🔖';
  return box;
}

// Нижний модальный лист (iOS sheet). content — DOM-узел.
export function sheet(title, content, { onClose, full } = {}) {
  const backdrop = el('.sheet-backdrop', { role: 'dialog', 'aria-modal': 'true' });
  const panel = el('.sheet' + (full ? '.sheet-full' : ''), {}, [
    el('.sheet-grabber'),
    el('.sheet-header', {}, [
      el('button.sheet-cancel', { type: 'button', text: t('cancel'), onClick: close }),
      el('.sheet-title', { text: title }),
      el('.sheet-spacer'),
    ]),
    el('.sheet-body', {}, [content]),
  ]);
  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => backdrop.classList.add('open'));

  function close() {
    backdrop.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => { backdrop.remove(); if (onClose) onClose(); }, 250);
  }

  // Свайп вниз за «грабер»/шапку — закрыть лист (как в нативных iOS-листах).
  let sy = 0, dragging = false;
  const onStart = (y) => { sy = y; dragging = true; panel.style.transition = 'none'; };
  const onMove = (y) => { if (!dragging) return; const dy = Math.max(0, y - sy); panel.style.transform = `translateY(${dy}px)`; };
  const onEnd = (y) => {
    if (!dragging) return; dragging = false; panel.style.transition = '';
    if (Math.max(0, y - sy) > 110) close(); else panel.style.transform = '';
  };
  for (const z of [panel.querySelector('.sheet-grabber'), panel.querySelector('.sheet-header')]) {
    if (!z) continue;
    z.addEventListener('touchstart', (e) => onStart(e.changedTouches[0].clientY), { passive: true });
    z.addEventListener('touchmove', (e) => onMove(e.changedTouches[0].clientY), { passive: true });
    z.addEventListener('touchend', (e) => onEnd(e.changedTouches[0].clientY), { passive: true });
    z.addEventListener('mousedown', (e) => {
      onStart(e.clientY);
      const mm = (ev) => onMove(ev.clientY);
      const mu = (ev) => { onEnd(ev.clientY); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  }
  return { close, panel };
}

export function toast(message) {
  const node = el('.toast', { text: message });
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 2200);
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const backdrop = el('.alert-backdrop');
    const box = el('.alert', {}, [
      el('.alert-msg', { text: message }),
      el('.alert-actions', {}, [
        el('button.alert-btn', { type: 'button', text: t('cancel'), onClick: () => done(false) }),
        el('button.alert-btn.danger', { type: 'button', text: t('delete'), onClick: () => done(true) }),
      ]),
    ]);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    function done(v) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(v);
    }
  });
}

// Поле формы: label + input/select. Возвращает {row, input}.
export function field(labelText, inputNode) {
  const row = el('.field', {}, [
    el('label.field-label', { text: labelText }),
    inputNode,
  ]);
  return { row, input: inputNode };
}

// iOS-переключатель (switch). Возвращает готовый элемент.
export function toggle(checked, onChange) {
  const input = el('input.switch-input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label.switch', {}, [input, el('span.switch-track', {}, [el('span.switch-thumb')])]);
}

// Строка из двух полей в ряд.
export function rowCols(a, b) {
  return el('.row-2', {}, [a, b]);
}

export function segmented(options, value, onChange) {
  const wrap = el('.segmented');
  options.forEach((opt) => {
    const btn = el('button.seg', {
      type: 'button',
      class: opt.value === value ? 'active' : '',
      text: opt.label,
      onClick: () => {
        wrap.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(opt.value);
      },
    });
    wrap.appendChild(btn);
  });
  return wrap;
}
