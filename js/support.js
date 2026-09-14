var LS_KEY = 'stflood_requests';
var LS_LAST = 'stflood_last_seen';
var closeTargetId = null;

function touchPresence() {
  localStorage.setItem(LS_LAST, String(Date.now()));
}

function isOnline() {
  var t = Number(localStorage.getItem(LS_LAST)) || 0;
  return Date.now() - t < 60000;
}

setInterval(function () { touchPresence(); }, 10000);
touchPresence();

function applyStatus(node) {
  var who = node.getAttribute('data-status');
  var online = isOnline();
  if (who === 'admin') online = true;
  node.className = 'sup-msg-status ' + (online ? 'status-on' : 'status-off');
  node.innerHTML = '<i class="dot"></i>' + (online ? 'Online' : 'Offline');
}

function refreshStatuses() {
  var nodes = document.querySelectorAll('.sup-msg-status');
  for (var i = 0; i < nodes.length; i++) applyStatus(nodes[i]);
}

setInterval(refreshStatuses, 5000);

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

    var date = document.createElement('div');
    date.className = 'sup-req-date';
    date.textContent = 'ОБРАЩЕНИЕ · ' + fmtFull(r.created);
    req.appendChild(date);

    (r.messages || []).forEach(function (m) {
      var msg = document.createElement('div');
      msg.className = 'sup-msg ' + (m.author === 'вопрос' ? 'msg-q' : 'msg-a');

      var meta = document.createElement('div');
      meta.className = 'sup-msg-meta';
      var tag = document.createElement('span');
      tag.className = 'sup-msg-tag';
      tag.textContent = m.author === 'вопрос' ? 'Ник игрока' : 'Админ';
      var status = document.createElement('span');
      status.className = 'sup-msg-status';
      status.setAttribute('data-status', m.author === 'вопрос' ? 'player' : 'admin');
      applyStatus(status);
      if (m.author === 'вопрос') {
        meta.appendChild(status);
        meta.appendChild(tag);
      } else {
        meta.appendChild(tag);
        meta.appendChild(status);
      }
      msg.appendChild(meta);

      var bubble = document.createElement('div');
      bubble.className = 'sup-msg-bubble';
      bubble.textContent = m.text || '(пусто)';
      msg.appendChild(bubble);

      req.appendChild(msg);
    });

    if (r.status === 'closed') {
      var closed = document.createElement('div');
      closed.className = 'sup-req-closed';
      var lbl = document.createElement('div');
      lbl.className = 'sup-closed-label';
      lbl.textContent = 'ЗАКРЫТО';
      var reason = document.createElement('div');
      reason.className = 'sup-closed-reason';
      reason.textContent = r.closedReason || '(без причины)';
      closed.appendChild(lbl);
      closed.appendChild(reason);
      req.appendChild(closed);
    } else {
      var actions = document.createElement('div');
      actions.className = 'sup-req-actions';
      var btn = document.createElement('button');
      btn.className = 'sup-btn-danger';
      btn.textContent = 'ЗАКРЫТЬ ОБРАЩЕНИЕ';
      btn.addEventListener('click', function () { openCloseModal(r.id); });
      actions.appendChild(btn);
      req.appendChild(actions);
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