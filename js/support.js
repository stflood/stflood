var LS_KEY = 'stflood_requests';
var currentId = null;

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

function fmtDate(t) {
  var d = new Date(t);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderList() {
  var list = getRequests();
  var el = document.getElementById('supList');
  el.innerHTML = '';
  list.slice().reverse().forEach(function (r) {
    var li = document.createElement('div');
    li.className = 'support-item';
    if (r.status === 'closed') li.classList.add('closed');

    var head = document.createElement('div');
    head.className = 'support-item-head';
    var title = document.createElement('div');
    title.className = 'support-item-title';
    title.textContent = r.title || 'Без темы';
    var badge = document.createElement('span');
    badge.className = 'support-item-badge' + (r.status === 'closed' ? ' badge-closed' : ' badge-open');
    badge.textContent = r.status === 'closed' ? 'Закрыто' : 'Открыто';
    head.appendChild(title);
    head.appendChild(badge);

    var date = document.createElement('div');
    date.className = 'support-item-date';
    date.textContent = fmtDate(r.created);

    var preview = document.createElement('div');
    preview.className = 'support-item-preview';
    preview.textContent = (r.messages && r.messages[0] ? r.messages[0].text : '');

    li.appendChild(head);
    li.appendChild(date);
    if (r.status !== 'closed') li.appendChild(preview);
    li.addEventListener('click', function () { showThread(r.id); });
    el.appendChild(li);
  });
  document.getElementById('supEmpty').style.display = list.length ? 'none' : 'block';
}

function createRequest() {
  var title = document.getElementById('supInputTitle').value.trim();
  var text = document.getElementById('supInputText').value.trim();
  if (!title && !text) return;
  var list = getRequests();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || 'Без темы',
    status: 'open',
    created: Date.now(),
    closedReason: '',
    closedDate: null,
    messages: [{ author: 'вопрос', text: text || '', date: Date.now() }]
  });
  saveRequests(list);
  document.getElementById('supInputTitle').value = '';
  document.getElementById('supInputText').value = '';
  closeModal('supCreateModal');
  renderList();
}

function find(id) {
  var list = getRequests();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
  return -1;
}

function showThread(id) {
  var i = find(id);
  if (i < 0) return;
  var r = getRequests()[i];
  currentId = id;

  document.getElementById('supListView').style.display = 'none';
  document.getElementById('supThreadView').style.display = 'block';

  document.getElementById('supThreadTitle').textContent = r.title || 'Без темы';
  var st = document.getElementById('supThreadStatus');
  st.textContent = r.status === 'closed' ? 'Закрыто' : 'Открыто';
  st.className = 'sup-thread-status ' + (r.status === 'closed' ? 'status-closed' : 'status-open');

  document.getElementById('supThreadMeta').textContent = fmtDate(r.created);

  var msgs = document.getElementById('supThreadMsgs');
  msgs.innerHTML = '';
  r.messages.forEach(function (m) {
    var bubble = document.createElement('div');
    bubble.className = 'sup-msg ' + (m.author === 'вопрос' ? 'msg-q' : 'msg-a');
    var who = document.createElement('div');
    who.className = 'sup-msg-who';
    who.textContent = m.author === 'вопрос' ? 'Вопрос' : 'Ответ';
    var text = document.createElement('div');
    text.className = 'sup-msg-text';
    text.textContent = m.text || '(пусто)';
    var date = document.createElement('div');
    date.className = 'sup-msg-date';
    date.textContent = fmtDate(m.date);
    bubble.appendChild(who);
    bubble.appendChild(text);
    bubble.appendChild(date);
    msgs.appendChild(bubble);
  });

  var closed = document.getElementById('supClosedBox');
  if (r.status === 'closed') {
    closed.style.display = 'block';
    document.getElementById('supClosedReason').textContent = r.closedReason;
    document.getElementById('supReplyText').value = '';
    document.getElementById('supReplyText').disabled = true;
    document.getElementById('supReplyBtn').disabled = true;
    document.getElementById('supCloseBtn').style.display = 'none';
  } else {
    closed.style.display = 'none';
    document.getElementById('supReplyText').disabled = false;
    document.getElementById('supReplyBtn').disabled = false;
    document.getElementById('supCloseBtn').style.display = 'inline-block';
  }
}

function backToList() {
  currentId = null;
  document.getElementById('supThreadView').style.display = 'none';
  document.getElementById('supListView').style.display = 'block';
  renderList();
}

function addReply() {
  var input = document.getElementById('supReplyText');
  var text = input.value.trim();
  if (!text) return;
  var i = find(currentId);
  if (i < 0) return;
  var list = getRequests();
  list[i].messages.push({ author: 'ответ', text: text, date: Date.now() });
  saveUpdates(list, i);
  input.value = '';
}

function openCloseModal() {
  document.getElementById('supCloseReason').value = '';
  document.getElementById('supCloseError').style.display = 'none';
  openModal('supCloseModal');
}

function submitClose() {
  var reason = document.getElementById('supCloseReason').value.trim();
  var err = document.getElementById('supCloseError');
  if (!reason) {
    err.textContent = 'Напишите причину закрытия — пустое поле нельзя!';
    err.style.display = 'block';
    return;
  }
  var i = find(currentId);
  if (i < 0) return;
  var list = getRequests();
  list[i].status = 'closed';
  list[i].closedReason = reason;
  list[i].closedDate = Date.now();
  saveUpdates(list, i);
  closeModal('supCloseModal');
  showThread(currentId);
  renderList();
}

function saveUpdates(list, i) {
  saveRequests(list);
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
document.getElementById('supBack').addEventListener('click', backToList);
document.getElementById('supReplyBtn').addEventListener('click', addReply);
document.getElementById('supReplyText').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') addReply();
});
document.getElementById('supCloseBtn').addEventListener('click', openCloseModal);
document.getElementById('supCloseCancel').addEventListener('click', function () {
  closeModal('supCloseModal');
});
document.getElementById('supCloseConfirm').addEventListener('click', submitClose);

renderList();