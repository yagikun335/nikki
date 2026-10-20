import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadEntries, saveEntries, findEntries } from './storage.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('日記の保存・再読み込み・更新・削除', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadEntries(storage), []);
  const entry = { id: '1', date: '2026-10-19', title: '今日', body: '散歩しました。\n<script>alert(1)</script>' };
  saveEntries(storage, [entry]);
  assert.deepEqual(loadEntries(storage), [entry]);
  saveEntries(storage, [{ ...entry, title: '更新' }]);
  assert.equal(loadEntries(storage)[0].title, '更新');
  saveEntries(storage, []);
  assert.deepEqual(loadEntries(storage), []);
});

test('不正な保存データを検出し、元のデータは保持する', () => {
  const storage = memoryStorage();
  for (const raw of ['broken', '{}', '[null]', '[{"id":"1"}]']) {
    storage.setItem(STORAGE_KEY, raw);
    assert.throws(() => loadEntries(storage));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});

test('検索は本文・タイトルに対応し、日付の新しい順に表示する', () => {
  const entries = [
    { id: '1', date: '2026-10-18', title: '散歩', body: 'Hello' },
    { id: '2', date: '2026-10-19', title: 'HELLO', body: '日記' },
  ];
  assert.deepEqual(findEntries(entries, ' hello ').map(e => e.id), ['2', '1']);
  assert.equal(findEntries(entries, '日記').length, 1);
  assert.equal(findEntries(entries, 'なし').length, 0);
  assert.equal(entries[0].id, '1');
});

test('ストレージの容量不足を成功扱いにしない', () => {
  assert.throws(() => saveEntries({ setItem() { throw new Error('QuotaExceededError'); } }, []));
});
