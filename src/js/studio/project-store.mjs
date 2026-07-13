export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

export function isSupportedImage(file) {
  return Boolean(file) && (SUPPORTED_IMAGE_TYPES.has(file.type) || (!file.type && IMAGE_EXTENSION.test(file.name || '')));
}

export function normalizeProjectName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(IMAGE_EXTENSION, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '未命名项目';
}

export function sortProjectsNewestFirst(projects) {
  return [...projects].sort((left, right) => right.updatedAt - left.updatedAt);
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class LocalProjectStore {
  constructor() {
    this.databaseName = 'photo-studio';
    this.databaseVersion = 1;
    this.dbPromise = null;
  }

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, this.databaseVersion);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('handoff')) db.createObjectStore('handoff', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
    });
    return this.dbPromise;
  }

  async request(storeName, mode, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = action(store);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async stashFile(file) {
    const id = newId();
    await this.request('handoff', 'readwrite', (store) => store.put({ id, kind: 'file', file, createdAt: Date.now() }));
    sessionStorage.setItem('photo-studio-handoff', id);
    return id;
  }

  async stashProject(projectId) {
    const id = newId();
    await this.request('handoff', 'readwrite', (store) => store.put({ id, kind: 'project', projectId, createdAt: Date.now() }));
    sessionStorage.setItem('photo-studio-handoff', id);
    return id;
  }

  async takeHandoff() {
    const id = sessionStorage.getItem('photo-studio-handoff');
    if (!id) return null;
    sessionStorage.removeItem('photo-studio-handoff');
    const handoff = await this.request('handoff', 'readwrite', (store) => store.get(id));
    if (handoff) await this.request('handoff', 'readwrite', (store) => store.delete(id));
    return handoff || null;
  }

  async listProjects() {
    const projects = await this.request('projects', 'readonly', (store) => store.getAll());
    return sortProjectsNewestFirst(projects);
  }

  getProject(id) {
    return this.request('projects', 'readonly', (store) => store.get(id));
  }

  deleteProject(id) {
    return this.request('projects', 'readwrite', (store) => store.delete(id));
  }

  async saveProject({ id, name, document, thumbnail }) {
    const now = Date.now();
    const project = {
      id: id || newId(),
      name: normalizeProjectName(name),
      document,
      thumbnail: thumbnail || null,
      updatedAt: now,
    };
    await this.request('projects', 'readwrite', (store) => store.put(project));
    return project;
  }
}

export const projectStore = new LocalProjectStore();
