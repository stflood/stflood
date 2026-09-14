var closeTargetId = null;

function fmtFull(t) {
  var d = new Date(t);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function onAuthChange() {
  loadFeed();
}

function showSetupHint() {
  var feed = document.getElementById('supFeed');
  feed.innerHTML = '';
  var empty = document.getElementById('supEmpty');
  empty.textContent = 'Настрой Supabase: создай проект на supabase.com, выполни supabase_setup.sql и вставь URL/ключ в js/config.js';
  empty.style.display = 'block';
}

function applyStatus(node, online) {
  node.className = 'sup-msg-status ' + (online ? 'status-on' : 'status-off');
  node.innerHTML = '<i class="dot"></i>' + (online ? 'Online' : 'Offline');
}

function refreshStatuses() {
  var nodes = document.querySelectorAll('.sup-msg-status');
  for (var i = 0; i < nodes.length; i++) {
    var uid = nodes[i].getAttribute('data-uid');
    var p = presenceMap[uid];
    var online = p ? p.online : true;
    applyStatus(nodes[i], online);
  }
}

setInterval(refreshStatuses, 5000);

async function loadFeed() {
  if (!initSupabase()) { showSetupHint(); return; }
  subscribeRealtime();
  var res = await SB.from('requests')
    .select('id, created_at, status, closed_reason, closed_at, creator_id, request_messages(id, created_at, user_id, nick, text)')
    .order('created_at', { ascending: true });
  if (res.error) return;
  var list = (res.data || []).map(function (r) {
    r.messages = (r.request_messages || []).sort(function (a, b) {
      return a.created_at.localeCompare(b.created_at);
    });
    return r;
  });
  await refreshPresence();
  render(list);
}

function render(list) {
  var feed = document.getElementById('supFeed');
  feed.innerHTML = '';

  var empty = document.getElementById('supEmpty');
  empty.style.display = list.length ? 'none' : 'block';

  var nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;

  list.forEach(function (r) {
    var req = document.createElement('div');
    req.className = 'sup-req';
    if (r.status === 'closed') req.classList.add('closed');

    var date = document.createElement('div');
    date.className = 'sup-req-date';
    date.textContent = 'ОБРАЩЕНИЕ · ' + fmtFull(r.created_at);
    req.appendChild(date);

    (r.messages || []).forEach(function (m) {
      var isCreator = m.user_id === r.creator_id;
      var msg = document.createElement('div');
      msg.className = 'sup-msg ' + (isCreator ? 'msg-q' : 'msg-a');

      var meta = document.createElement('div');
      meta.className = 'sup-msg-meta';
      var tag = document.createElement('span');
      tag.className = 'sup-msg-tag';
      var p = presenceMap[m.user_id];
      var tagText = m.nick || (p ? p.nick : (isCreator ? 'Ник игрока' : 'Пользователь'));
      tag.textContent = tagText;
      tag.title = tagText;
      var status = document.createElement('span');
      status.className = 'sup-msg-status';
      status.setAttribute('data-uid', m.user_id || '');
      var online = p ? p.online : true;
      applyStatus(status, online);
      if (isCreator) {
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
      reason.textContent = r.closed_reason || '(без причины)';
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

  if (nearBottom) feed.scrollTop = feed.scrollHeight;
}

async function sendDialog() {
  if (!initSupabase() || !currentUser) { openAuthModal('login'); return; }
  var input = document.getElementById('supDialogInput');
  var text = input.value.trim();
  if (!text) return;
  await ensureProfile();

  var openReq = null;
  var res = await SB.from('requests')
    .select('id')
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (!res.error && res.data && res.data.length) {
    openReq = res.data[res.data.length - 1];
  }

  if (!openReq) {
    var ins = await SB.from('requests').insert({ status: 'open', creator_id: currentUser.id }).select().single();
    if (ins.error) return;
    openReq = ins.data;
  }

  await SB.from('request_messages').insert({
    request_id: openReq.id,
    user_id: currentUser.id,
    nick: myNick,
    text: text
  });

  input.value = '';
  loadFeed();
}

function openCloseModal(id) {
  closeTargetId = id;
  document.getElementById('supCloseReason').value = '';
  document.getElementById('supCloseError').style.display = 'none';
  openModal('supCloseModal');
}

async function submitClose() {
  var reason = document.getElementById('supCloseReason').value.trim();
  var err = document.getElementById('supCloseError');
  if (!reason) {
    err.style.display = 'block';
    return;
  }
  await SB.from('requests').update({
    status: 'closed',
    closed_reason: reason,
    closed_at: new Date().toISOString()
  }).eq('id', closeTargetId);
  closeTargetId = null;
  closeModal('supCloseModal');
  loadFeed();
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

document.getElementById('authTabLogin').addEventListener('click', function () { switchAuthMode('login'); });
document.getElementById('authTabReg').addEventListener('click', function () { switchAuthMode('reg'); });
document.getElementById('authSubmit').addEventListener('click', submitAuth);
document.getElementById('authCancel').addEventListener('click', closeAuthModal);

initAuth();
loadFeed();