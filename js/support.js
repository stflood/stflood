var LS_KEY = 'stflood_requests';
var closeTargetId = null;

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

function fmtFull(t) {
  var d = new Date(t);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateOnly(t) {
  var d = new Date(t);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function render() {
  var list = getRequests();
  var feed = document.getElementById('supFeed');
  feed.innerHTML = '';

  if (!list.length) {
    document.getElementById('supEmpty').style.display = 'block';
  } else {
    document.getElementById('supEmpty').style.display = 'none';
  }

  list.forEach(function (r) {
    var req = document.createElement('div');
    req.className = 'sup-req';
    if (r.status === 'closed') req.classList.add('closed');

    var head = document.createElement('div');
    head.className = 'sup-req-head';
    var date = document.createElement('div');
    date.className = 'sup-req-date';
    date.textContent = 'Обращение · ' + fmtFull(r.created);
    var badge = document.createElement('span');
    badge.className = r.status === 'closed' ? 'sup-req-badge badge-closed' : 'sup-req-badge badge-open';
    badge.textContent = r.status === 'closed' ? 'Закрыто' : 'Открыто';
    head.appendChild(date);
    head.appendChild(badge);
    req.appendChild(head);

    (r.messages || []).forEach(function (m) {
      var bubble = document.createElement('div');
      bubble.className = 'sup-msg ' + (m.author === 'вопрос' ? 'msg-q' : 'msg-a');
      var who = document.createElement('div');
      who.className = 'sup-msg-who';
      who.textContent = m.author === 'вопрос' ? 'Вопрос' : 'Ответ';
      var text = document.createElement('div');
      text.className = 'sup-msg-text';
      text.textContent = m.text || '(пусто)';
      var md = document.createElement('div');
      md.className = 'sup-msg-date';
      md.textContent = fmtFull(m.date);
      bubble.appendChild(who);
      bubble.appendChild(text);
      bubble.appendChild(md);
      req.appendChild(bubble);
    });

    if (r.status === 'closed') {
      var closed = document.createElement('div');
      closed.className = 'sup-req-closed';
      closed.innerHTML = '';
      var lbl = document.createElement('div');
      lbl.className = 'sup-closed-label';
      lbl.textContent = 'Закрыто';
      var reason = document.createElement('div');
      reason.className = 'sup-closed-reason';
      reason.textContent = r.closedReason || '(без причины)';
      closed.appendChild(lbl);
      closed.appendChild(reason);
      req.appendChild(closed);
    } else {
      var btn = document.createElement('button');
      btn.className = 'sup-btn-danger';
      btn.textContent = 'Закрыть обращение';
      btn.addEventListener('click', function () { openCloseModal(r.id); });
      req.appendChild(btn);
    }

    feed.appendChild(req);

    var sep = document.createElement('div');
    sep.className = 'sup-req-sep';
    feed.appendChild(sep);
  });

  feed.scrollTop = feed.scrollHeight;
}

function createRequest(text) {
  var list = getRequests();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    status: 'open',
    created: Date.now(),
    closedReason: '',
    closedDate: null,
    messages: [{ author: 'вопрос', text: text, date: Date.now() }]
  });
  saveRequests(list);
}

function sendDialog() {
  var input = document.getElementById('supDialogInput');
  var text = input.value.trim();
  if (!text) return;
  var list = getRequests();
  var last = list[list.length - 1];
  if (last && last.status === 'open') {
    last.messages.push({ author: 'ответ', text: text, date: Date.now() });
    saveRequests(list);
  } else {
    createRequest(text);
  }
  input.value = '';
  render();
}

function openCloseModal(id) {
  closeTargetId = id;
  document.getElementById('supCloseReason').value = '';
  document.getElementById('supCloseError').style.display = 'none';
  openModal('supCloseModal');
}

function submitClose() {
  var reason = document.getElementById('supCloseReason').value.trim();
  var err = document.getElementById('supCloseError');
  if (!reason) {
    err.style.display = 'block';
    return;
  }
  var list = getRequests();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === closeTargetId) {
      list[i].status = 'closed';
      list[i].closedReason = reason;
      list[i].closedDate = Date.now();
      break;
    }
  }
  saveRequests(list);
  closeTargetId = null;
  closeModal('supCloseModal');
  render();
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.getElementById('supDialogSend').addEventListener('click', sendDialog);
document.getElementById('supDialogInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') sendDialog();
});
document.getElementById('supCloseCancel').addEventListener('click', function () {
  closeModal('supCloseModal');
});
document.getElementById('supCloseConfirm').addEventListener('click', submitClose);

render();