// ============================================================================
// Minimal IndexedDB helper — no dependencies.
// Everything the app stores lives only in this browser, on this device.
// ============================================================================

const DB_NAME = 'bookmarkLibraryDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bookmarks')) {
        const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
        store.createIndex('account', 'account', { unique: false });
        store.createIndex('canonicalUrl', 'canonicalUrl', { unique: false });
      }
      if (!db.objectStoreNames.contains('imports')) {
        db.createObjectStore('imports', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

async function idbGetAllByAccount(account) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readonly');
    const idx = tx.objectStore('bookmarks').index('account');
    const req = idx.getAll(IDBKeyRange.only(account));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbBulkPut(records) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readwrite');
    const store = tx.objectStore('bookmarks');
    records.forEach(r => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPut(record) {
  return idbBulkPut([record]);
}

async function idbDeleteAccount(account) {
  const all = await idbGetAllByAccount(account);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookmarks', 'readwrite');
    const store = tx.objectStore('bookmarks');
    all.forEach(r => store.delete(r.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAddImportRecord(entry) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('imports', 'readwrite');
    tx.objectStore('imports').add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetImports(account) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('imports', 'readonly');
    const req = tx.objectStore('imports').getAll();
    req.onsuccess = () => resolve((req.result || []).filter(r => r.account === account));
    req.onerror = () => reject(req.error);
  });
}
