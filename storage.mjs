export const STORAGE_KEY = 'nikki.entries.v1';

export function loadEntries(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.some(entry =>
    !entry || ['id', 'date', 'title', 'body'].some(key => typeof entry[key] !== 'string') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) ||
    new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new Error('Invalid diary data');
  }
  return entries;
}

export function saveEntries(storage, entries) {
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function findEntries(entries, query = '') {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(entry => `${entry.title}\n${entry.body}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => b.date.localeCompare(a.date));
}
