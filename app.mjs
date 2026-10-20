import { loadEntries, saveEntries, findEntries } from './storage.mjs';

const form = document.querySelector('#entry-form');
const date = document.querySelector('#date');
const title = document.querySelector('#title');
const body = document.querySelector('#body');
const cancel = document.querySelector('#cancel');
const search = document.querySelector('#search');
const status = document.querySelector('#status');
const list = document.querySelector('#entries');
let entries = [];
let editingId = null;
let storageAvailable = true;
let storage;

function confirmAction(message) {
  const dialog = document.querySelector('#confirmation');
  document.querySelector('#confirmation-message').textContent = message;
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function resetEditor() {
  form.reset();
  date.value = today();
  editingId = null;
  cancel.hidden = true;
  document.querySelector('#editor-heading').textContent = '日記を書く';
}

function persist(next) {
  try {
    saveEntries(storage, next);
    entries = next;
    return true;
  } catch {
    status.textContent = '保存できませんでした。ブラウザの保存設定や空き容量を確認してください。入力内容は残っています。';
    return false;
  }
}

function render() {
  list.replaceChildren();
  document.querySelector('#count').textContent = `${entries.length}件`;
  const matches = findEntries(entries, search.value);
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = entries.length ? '一致する日記はありません。' : '最初の日記を書いてみましょう。';
    list.append(empty);
  }
  for (const entry of matches) {
    const article = document.createElement('article');
    const time = document.createElement('time');
    time.dateTime = entry.date;
    time.textContent = entry.date.replaceAll('-', '/');
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    const content = document.createElement('p');
    content.textContent = entry.body;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.textContent = '編集';
    edit.setAttribute('aria-label', `${entry.title}を編集`);
    edit.addEventListener('click', async () => {
      if ((editingId !== null || title.value || body.value) && !await confirmAction('入力中の内容を破棄して、この日記を編集しますか？')) return;
      editingId = entry.id;
      date.value = entry.date;
      title.value = entry.title;
      body.value = entry.body;
      cancel.hidden = false;
      document.querySelector('#editor-heading').textContent = '日記を編集';
      title.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `${entry.title}を削除`);
    remove.addEventListener('click', async () => {
      if (!await confirmAction(`「${entry.title}」を削除しますか？この操作は取り消せません。`)) return;
      if (!persist(entries.filter(item => item.id !== entry.id))) return;
      if (editingId === entry.id) resetEditor();
      render();
      status.textContent = '日記を削除しました。';
    });
    actions.append(edit, remove);
    article.append(time, heading, content, actions);
    list.append(article);
  }
}

function saveEntry(event) {
  event.preventDefault();
  if (!storageAvailable) return;
  if (!form.reportValidity()) return;
  if (!title.value.trim() || !body.value.trim()) {
    status.textContent = 'タイトルと本文を入力してください。';
    return;
  }
  const id = editingId ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const entry = { id, date: date.value, title: title.value.trim(), body: body.value.trim() };
  const next = editingId ? entries.map(item => item.id === editingId ? entry : item) : [...entries, entry];
  if (!persist(next)) return;
  resetEditor();
  render();
  status.textContent = search.value ? '保存しました。検索条件によっては一覧に表示されません。' : '日記を保存しました。';
}
form.addEventListener('submit', saveEntry);
document.querySelector('#save').addEventListener('click', saveEntry);
document.querySelectorAll('[data-decision]').forEach(button => {
  button.addEventListener('click', () => document.querySelector('#confirmation').close(button.dataset.decision));
});
cancel.addEventListener('click', async () => {
  if (await confirmAction('編集をやめて入力内容を破棄しますか？')) resetEditor();
});
search.addEventListener('input', render);
try {
  storage = window.localStorage;
  // Reading also detects browsers that expose storage but deny its use.
  storage.getItem('nikki.entries.v1');
} catch {
  const data = new Map();
  storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const notice = document.querySelector('#storage-notice');
  notice.hidden = false;
  notice.textContent = '一時保存モード：このプレビューではブラウザへの保存が許可されていません。日記は画面を開いている間だけ保持され、再読み込みすると消えます。';
}
try {
  entries = loadEntries(storage);
} catch {
  storageAvailable = false;
  document.querySelector('#save').disabled = true;
  status.textContent = '保存済みの日記を読み込めませんでした。既存データの上書きを防ぐため保存を停止しています。ブラウザの保存設定を確認してください。';
}
resetEditor();
render();
