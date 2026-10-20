import { loadEntries, saveEntries, findEntries } from './storage.mjs';

// 操作を担当するファイル。保存データの読み書き・検索処理は storage.mjs を利用します。
// 編集後は npm run build で配布用の index.html に反映してください。
// querySelector('#名前') で page.html 内の同じ id の部品を取得します。
const form = document.querySelector('#entry-form');
const date = document.querySelector('#date');
const title = document.querySelector('#title');
const body = document.querySelector('#body');
const cancel = document.querySelector('#cancel');
const search = document.querySelector('#search');
const status = document.querySelector('#status');
const list = document.querySelector('#entries');
// entries: 日記の配列。各日記は { id, date, title, body } を持ちます。
// editingId: 編集対象のID（null なら新規作成）。storageAvailable: 保存を許可するか。
// storage: 通常は localStorage、制限付きプレビューではメモリ上の一時保存先です。
let entries = [];
let editingId = null;
let storageAvailable = true;
let storage;

// ブラウザ標準の confirm に頼らず、HTML内の確認画面を開きます。
// Promise は選択を待つための仕組み。呼び出し側は await で「続ける」かを受け取ります。
function confirmAction(message) {
  const dialog = document.querySelector('#confirmation');
  document.querySelector('#confirmation-message').textContent = message;
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    // 一度閉じたらこの処理を解除し、次回開いたときに重複して動くのを防ぎます。
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

// 利用者の端末の日付を YYYY-MM-DD 形式にします（UTCとの時差で日付がずれるのを回避）。
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 保存後・編集取消後の入力欄を初期化し、新規作成モードに戻します。
function resetEditor() {
  form.reset();
  date.value = today();
  editingId = null;
  cancel.hidden = true;
  document.querySelector('#editor-heading').textContent = '日記を書く';
}

// 保存成功時だけ画面側のデータも更新。容量不足などで失敗しても入力内容を残します。
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

// 一覧を描き直す処理。検索条件に合う日記を、日付の新しい順に表示します。
// 一覧の見た目は style.css の article、表示内容はこの関数で変更できます。
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
    // textContent で表示すると、日記にHTMLを書いてもプログラムとして実行されません。
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
    // 編集ボタン：入力中の文章があれば破棄を確認し、選んだ日記を入力欄へ戻します。
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
    // 削除ボタン：確認後、対象のIDだけを配列から除いて保存し、一覧を更新します。
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

// 保存操作：入力チェック → 日記データ作成 → 保存 → 入力欄と一覧の更新。
function saveEntry(event) {
  // 通常のフォーム送信（ページ移動）はせず、この画面内で処理します。
  event.preventDefault();
  if (!storageAvailable) return;
  // HTML側の required / maxlength などを検証し、空白だけの文章も次の条件で防ぎます。
  if (!form.reportValidity()) return;
  if (!title.value.trim() || !body.value.trim()) {
    status.textContent = 'タイトルと本文を入力してください。';
    return;
  }
  // 編集なら既存IDを再利用し、新規ならランダムなIDを発行します。
  // ?? は左側が null / undefined のときだけ右側を使う記法です。
  const id = editingId ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const entry = { id, date: date.value, title: title.value.trim(), body: body.value.trim() };
  // 編集時は対象を置き換え、新規作成時は配列の末尾に追加します。
  const next = editingId ? entries.map(item => item.id === editingId ? entry : item) : [...entries, entry];
  if (!persist(next)) return;
  resetEditor();
  render();
  status.textContent = search.value ? '保存しました。検索条件によっては一覧に表示されません。' : '日記を保存しました。';
}
// ここからは操作と処理の結び付け。addEventListener でクリックや入力を検知します。
// 保存ボタンから直接実行するため、フォーム送信禁止のプレビューでも動きます。
form.addEventListener('submit', saveEntry);
document.querySelector('#save').addEventListener('click', saveEntry);
// 確認画面のボタンが持つ data-decision の値を返して、確認画面を閉じます。
document.querySelectorAll('[data-decision]').forEach(button => {
  button.addEventListener('click', () => document.querySelector('#confirmation').close(button.dataset.decision));
});
cancel.addEventListener('click', async () => {
  if (await confirmAction('編集をやめて入力内容を破棄しますか？')) resetEditor();
});
// 検索欄の入力に合わせて一覧を更新します。
search.addEventListener('input', render);
// 起動時の保存先の準備。localStorage は同じブラウザ・オリジンにデータを残します。
try {
  storage = window.localStorage;
  // 保存領域が存在していても、読み取りを禁止されている場合があるため実際に確認します。
  storage.getItem('nikki.entries.v1');
} catch {
  // 禁止されていれば一時保存に切り替えます。Map の中身は再読み込みすると消えます。
  const data = new Map();
  storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const notice = document.querySelector('#storage-notice');
  notice.hidden = false;
  notice.textContent = '一時保存モード：このプレビューではブラウザへの保存が許可されていません。日記は画面を開いている間だけ保持され、再読み込みすると消えます。';
}
// 保存済みデータを読み込みます。壊れたデータを空の配列で上書きしないよう、
// 読み取り禁止への対処とは分けて、データ不正の場合は保存自体を停止します。
try {
  entries = loadEntries(storage);
} catch {
  storageAvailable = false;
  document.querySelector('#save').disabled = true;
  status.textContent = '保存済みの日記を読み込めませんでした。既存データの上書きを防ぐため保存を停止しています。ブラウザの保存設定を確認してください。';
}
// 最後に入力欄と一覧を初回表示します。
resetEditor();
render();
