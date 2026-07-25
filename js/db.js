// db.js — тонкая обёртка над IndexedDB.
// Вся работа с хранилищем идёт через промисы, чтобы бизнес-логику
// (store.js) можно было позже без переписывания перевести на iCloud/CloudKit:
// достаточно заменить реализацию get/getAll/put/remove на облачный слой.

const DB_NAME = 'FinTrackerDB';
const DB_VERSION = 1;

// Список хранилищ (object stores). keyPath = 'id' для всех сущностей,
// кроме settings, где ключ — это имя настройки.
const STORES = {
  transactions: { keyPath: 'id', indexes: [['date', 'date'], ['categoryId', 'categoryId'], ['type', 'type']] },
  categories:   { keyPath: 'id', indexes: [['type', 'type'], ['order', 'order']] },
  planned:      { keyPath: 'id', indexes: [['type', 'type'], ['startDate', 'startDate']] },
  budgets:      { keyPath: 'id', indexes: [['categoryId', 'categoryId']] },
  goals:        { keyPath: 'id', indexes: [] },
  accounts:     { keyPath: 'id', indexes: [] },
  settings:     { keyPath: 'key', indexes: [] },
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          for (const [idxName, idxKey] of cfg.indexes) {
            store.createIndex(idxName, idxKey, { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => {
    const t = db.transaction(storeName, mode);
    return { store: t.objectStore(storeName), done: txDone(t) };
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async getAll(storeName) {
    const { store } = await tx(storeName, 'readonly');
    return reqToPromise(store.getAll());
  },

  async get(storeName, key) {
    const { store } = await tx(storeName, 'readonly');
    return reqToPromise(store.get(key));
  },

  async put(storeName, value) {
    const { store, done } = await tx(storeName, 'readwrite');
    store.put(value);
    await done;
    return value;
  },

  async bulkPut(storeName, values) {
    const { store, done } = await tx(storeName, 'readwrite');
    for (const v of values) store.put(v);
    await done;
    return values;
  },

  async remove(storeName, key) {
    const { store, done } = await tx(storeName, 'readwrite');
    store.delete(key);
    await done;
  },

  async clear(storeName) {
    const { store, done } = await tx(storeName, 'readwrite');
    store.clear();
    await done;
  },

  // Полный экспорт всех хранилищ (для резервной копии / iCloud снапшота).
  async exportAll() {
    const dump = {};
    for (const name of Object.keys(STORES)) {
      dump[name] = await this.getAll(name);
    }
    return dump;
  },

  // Полное восстановление из снапшота (перезаписывает данные).
  async importAll(dump) {
    for (const name of Object.keys(STORES)) {
      if (!dump[name]) continue;
      await this.clear(name);
      await this.bulkPut(name, dump[name]);
    }
  },
};

export { STORES };
