var LS_KEY = 'stflood_requests';

function getRequests() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveRequests(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function renderList() {
  var list = getRequests();
  var ul = document.getElementById('supList');
  var empty = document.getElementById('supEmpty');
  ul.innerHTML = '';
  list.reverse().forEach(function (r) {
    var li = document.createElement('li');
    li.className = 'support-item';
    var d = new Date(r.date);
    var ds = d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    li.innerHTML = '<div class="support-item-title"></div><div class="support-item-date"></div>';
    li.querySelector('.support-item-title').textContent = r.title || 'Без темы';
    li.querySelector('.support-item-date').textContent = ds;
    li.addEventListener('click', function () { openView(r.id); });
    ul.appendChild(li);
  });
  empty.style.display = list.length ? 'none' : 'block';
}

function createRequest() {
  var title = document.getElementById('supInputTitle').value.trim();
  var text = document.getElementById('supInputText').value.trim();
  if (!title && !text) return;
  var list = getRequests();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || 'Без темы',
    text: text || '',
    date: Date.now()
  });
  saveRequests(list);
  document.getElementById('supInputTitle').value = '';
  document.getElementById('supInputText').value = '';
  closeModal('supCreateModal');
  renderList();
}

function openView(id) {
  var list = getRequests();
  var r = null;
  list.forEach(function (x) { if (x.id === id) r = x; });
  if (!r) return;
  document.getElementById('supViewId').value = r.id;
  document.getElementById('supViewTitle').textContent = r.title || 'Без темы';
  var d = new Date(r.date);
  document.getElementById('supViewDate').textContent = d.toLocaleString('ru-RU');
  document.getElementById('supViewText').textContent = r.text || '(пусто)';
  openModal('supViewModal');
}

function deleteCurrent() {
  var id = document.getElementById('supViewId').value;
  var list = getRequests();
  var rest = list.filter(function (x) { return x.id !== id; });
  saveRequests(rest);
  closeModal('supViewModal');
  renderList();
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.getElementById('supAdd').addEventListener('click', function () {
  openModal('supCreateModal');
});
document.getElementById('supSave').addEventListener('click', createRequest);
document.getElementById('supCancel').addEventListener('click', function () {
  closeModal('supCreateModal');
});
document.getElementById('supViewClose').addEventListener('click', function () {
  closeModal('supViewModal');
});
document.getElementById('supViewDelete').addEventListener('click', deleteCurrent);

renderList();