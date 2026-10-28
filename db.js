// Stockage local (IndexedDB) : projets + images (Blob).
const NAME = 'studio-visite';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('images', { keyPath: 'id' }).createIndex('project', 'project');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export const put = (store, v) => run(store, 'readwrite', s => s.put(v));
export const get = (store, k) => run(store, 'readonly', s => s.get(k));
export const all = store => run(store, 'readonly', s => s.getAll());
export const del = (store, k) => run(store, 'readwrite', s => s.delete(k));
export const imagesOf = pid => run('images', 'readonly', s => s.index('project').getAll(pid));
