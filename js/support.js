var closeTargetId = null;
var selectedRequestId = null;
var isAdmin = false;

function fmtTime(t) {
  if (!t) return '';
  var d = new Date(t);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(t) {
  if (!t) return '';
  var d = new Date(t);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

function onAuthChange() {
  loadFeed();
}

function showSetupHint() {
  document.getElementById('supFeed').innerHTML = '';
  var empty = document.getElementById('supEmpty');
  var noMsg = document.getElementById('supNoMessages');
  if (noMsg) {
    noMsg.textContent = 'Настрой Supabase: создай проект, выполни SQL и вставь ключи в js/config.js';
    noMsg.style.display = 'block';
  }
  if (empty) empty.style.display = 'flex';
}

async function loadFeed() {
  if (!initSupabase()) { showSetupHint(); return; }
  if (!currentUser) {
    renderNotLoggedIn();
    return;
  }
  isAdmin = isStaff(currentUser.role);
  refreshNotifBadge();
  subscribeRealtime();
  await refreshPresence();
  await loadRequests();
}

function renderNotLoggedIn() {
  document.getElementById('supRequests').style.display = 'flex';
  var box = document.getElementById('supRequests');
  box.innerHTML = '<div class="sup-reqs-title">Обращения</div>';
  var feed = document.getElementById('supFeed');
  feed.innerHTML = '';
  var empty = document.getElementById('supEmpty');
  var noMsg = document.getElementById('supNoMessages');
  var prompt = document.getElementById('supAuthPrompt');
  empty.style.display = 'flex';
  noMsg.style.display = 'none';
  prompt.style.display = 'block';
}

/* ═══════════════ REQUESTS LIST ═══════════════ */
async function loadRequests() {
  document.getElementById('supRequests').style.display = 'flex';

  var query = SB.from('requests')
    .select('id, created_at, status, closed_reason, closed_at, creator_id, creator:profiles!requests_creator_id_fkey(nick, role, avatar)')
    .order('created_at', { ascending: false });

  if (isAdmin) {
    // админ видит все обращения
  } else {
    // игрок видит только свои
    query = query.eq('creator_id', currentUser.id);
  }

  var res = await query;
  if (res.error) return;

  var requests = res.data || [];

  // придумать метку для вкладки
  requests.forEach(function (r) {
    var creatorRow = (r.creator && r.creator.length) ? r.creator[0] : null;
    r.creatorAvatar = creatorRow ? creatorRow.avatar : (r.creator_id === currentUser.id ? currentUser.avatar : '');
    if (isAdmin) {
      r.label = (r.creator_id === currentUser.id)
        ? 'Ты'
        : ((creatorRow && creatorRow.nick) ? creatorRow.nick : (getNick(r.creator_id) || 'Игрок'));
    } else {
      r.label = 'Обращение · ' + fmtTime(r.created_at);
    }
  });

  renderTabs(requests);

  if (!requests.length) {
    renderEmpty();
    return;
  }

  var target = requests.find(function (r) { return r.id === selectedRequestId; });
  if (!target) {
    selectedRequestId = null;
    var firstOpen = requests.find(function (r) { return r.status === 'open'; });
    target = firstOpen || requests[0];
    selectedRequestId = target.id;
  }
  await loadChatMessages(selectedRequestId);
  refreshTabs();
}

function renderTabs(requests) {
  var box = document.getElementById('supRequests');
  box.innerHTML = '<div class="sup-reqs-title">Обращения</div>';
  if (!requests.length) {
    box.innerHTML += '<div class="sup-reqs-empty">Пока нет обращений</div>';
    return;
  }
  requests.forEach(function (r) {
    var tab = document.createElement('div');
    tab.className = 'sup-req-tab' + (r.id === selectedRequestId ? ' sup-req-tab-active' : '');
    if (r.status === 'closed') tab.classList.add('sup-req-tab-closed');
    tab.innerHTML =
      '<div class="sup-req-tab-row">' +
        '<span class="sup-req-tab-av">' + avatarHtml(r.creatorAvatar, 24) + '</span>' +
        '<span class="sup-req-tab-nick">' + esc(r.label) + '</span>' +
      '</div>' +
      '<div class="sup-req-tab-meta">' +
        '<span class="sup-req-tab-status ' + (r.status === 'open' ? 'status-on' : 'status-off') + '">' +
          (r.status === 'open' ? 'Открыто' : 'Закрыто') +
        '</span>' +
        '<span class="sup-req-tab-date">' + fmtTime(r.created_at) + '</span>' +
      '</div>';
    tab.innerHTML +=
      ((r.status === 'closed' && r.closed_reason) ? '<div class="sup-req-tab-reason">' + esc(r.closed_reason) + '</div>' : '');
    tab.addEventListener('click', function () { selectRequest(r.id); });
    box.appendChild(tab);
  });
}

function refreshTabs() {
  var tabs = document.querySelectorAll('.sup-req-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('sup-req-tab-active', String(tabs[i].dataset.req) === String(selectedRequestId));
  }
}

function renderEmpty() {
  var feed = document.getElementById('supFeed');
  feed.innerHTML = '';
  var empty = document.getElementById('supEmpty');
  var noMsg = document.getElementById('supNoMessages');
  var prompt = document.getElementById('supAuthPrompt');
  empty.style.display = 'flex';
  prompt.style.display = 'none';
  noMsg.textContent = isAdmin ? 'Пока нет обращений' : 'Напиши сообщение — создастся обращение';
  noMsg.style.display = 'block';
}

async function selectRequest(reqId) {
  selectedRequestId = reqId;
  refreshTabs();
  await loadChatMessages(reqId);
}

/* ═══════════════ CHAT MESSAGES ═══════════════ */
async function loadChatMessages(reqId) {
  var feed = document.getElementById('supFeed');
  var empty = document.getElementById('supEmpty');

  var res = await SB.from('requests')
    .select('id, created_at, status, closed_reason, closed_at, creator_id, creator:profiles!requests_creator_id_fkey(nick, avatar), request_messages(id, created_at, user_id, nick, text)')
    .eq('id', reqId)
    .single();

  if (res.error || !res.data) {
    feed.innerHTML = '';
    empty.style.display = 'flex';
    document.getElementById('supNoMessages').textContent = 'Обращение не найдено';
    document.getElementById('supNoMessages').style.display = 'block';
    return;
  }

  var r = res.data;
  var messages = (r.request_messages || []).sort(function (a, b) {
    return a.created_at.localeCompare(b.created_at);
  });

  feed.innerHTML = '';
  empty.style.display = 'none';

  var reqHead = document.createElement('div');
  reqHead.className = 'sup-req-header';
  var creatorRow = (r.creator && r.creator.length) ? r.creator[0] : null;
  var otherNick = (r.creator_id === currentUser.id)
    ? 'Ты'
    : (creatorRow && creatorRow.nick ? creatorRow.nick : getNick(r.creator_id));
  var otherAvatar = (creatorRow && creatorRow.avatar)
    ? creatorRow.avatar
    : (r.creator_id === currentUser.id ? currentUser.avatar : '');
  reqHead.innerHTML =
    '<div class="sup-req-chatuser">' +
      avatarHtml(otherAvatar, 30) +
      '<span>' + esc(otherNick) + '</span>' +
    '</div>' +
    '<div class="sup-req-title">ОБРАЩЕНИЕ · ' + fmtDate(r.created_at) + '</div>';
  feed.appendChild(reqHead);

  var lastDate = '';
  messages.forEach(function (m) {
    var msgDate = fmtDate(m.created_at);
    if (msgDate !== lastDate) {
      var sep = document.createElement('div');
      sep.className = 'sup-date-sep';
      sep.textContent = msgDate;
      feed.appendChild(sep);
      lastDate = msgDate;
    }

    var isMe = m.user_id === currentUser.id;
    var msg = document.createElement('div');
    msg.className = 'sup-msg ' + (isMe ? 'msg-me' : 'msg-them');

    var meta = document.createElement('div');
    meta.className = 'sup-msg-meta';
    var tag = document.createElement('span');
    tag.className = 'sup-msg-tag';
    tag.textContent = m.nick || getNick(m.user_id);
    var time = document.createElement('span');
    time.className = 'sup-msg-time';
    time.textContent = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(tag);
    meta.appendChild(time);
    msg.appendChild(meta);

    var bubble = document.createElement('div');
    bubble.className = 'sup-msg-bubble';
    bubble.textContent = m.text || '(пусто)';
    msg.appendChild(bubble);

    feed.appendChild(msg);
  });

  if (r.status === 'closed') {
    var closedBlock = document.createElement('div');
    closedBlock.className = 'sup-req-closed';
    closedBlock.innerHTML =
      '<div class="sup-closed-label">ЗАКРЫТО</div>' +
      '<div class="sup-closed-reason">' + esc(r.closed_reason || '(без причины)') + '</div>';
    feed.appendChild(closedBlock);
  } else {
    var actions = document.createElement('div');
    actions.className = 'sup-req-actions';
    var btn = document.createElement('button');
    btn.className = 'sup-btn-danger';
    btn.textContent = 'ЗАКРЫТЬ ОБРАЩЕНИЕ';
    btn.addEventListener('click', function () { openCloseModal(r.id); });
    actions.appendChild(btn);
    feed.appendChild(actions);
  }

  feed.scrollTop = feed.scrollHeight;
}

function getNick(uid) {
  if (!uid) return 'Игрок';
  var p = presenceMap[uid];
  return p ? p.nick : 'Игрок';
}

/* ═══════════════ SEND ═══════════════ */
async function sendDialog() {
  if (!initSupabase() || !currentUser || !currentUser.token) { openAuthModal('login'); return; }
  var input = document.getElementById('supDialogInput');
  var text = input.value.trim();
  if (!text) return;

  var targetId = selectedRequestId;

  if (!isAdmin) {
    // всегда пишем в своё открытое обращение (создаётся, если нет)
    var cr = await rpc('create_request', { p_token: currentUser.token });
    if (cr.error || (cr.data && cr.data.error)) return;
    targetId = cr.data.id;
    if (targetId !== selectedRequestId) selectedRequestId = targetId;
  }

  if (!targetId) return;

  var pm = await rpc('post_message', {
    p_token: currentUser.token,
    p_request_id: targetId,
    p_text: text
  });
  if (pm.error || (pm.data && pm.data.error)) {
    loadFeed();
    return;
  }

  input.value = '';
  loadFeed();
}

function openCloseModal(id) {
  closeTargetId = id;
  document.getElementById('supCloseReason').value = '';
  document.getElementById('supCloseError').style.display = 'none';
  openModalById('supCloseModal');
}

async function submitClose() {
  var reason = document.getElementById('supCloseReason').value.trim();
  var err = document.getElementById('supCloseError');
  if (!reason) {
    err.style.display = 'block';
    return;
  }
  var cr = await rpc('close_request', {
    p_token: currentUser.token,
    p_request_id: closeTargetId,
    p_reason: reason
  });
  if (cr.error || (cr.data && cr.data.error)) { err.textContent = 'Не удалось закрыть'; err.style.display = 'block'; return; }
  closeTargetId = null;
  closeModalById('supCloseModal');
  loadFeed();
}

/* ─── event listeners ─── */
document.getElementById('supDialogSend').addEventListener('click', sendDialog);
document.getElementById('supDialogInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') sendDialog();
});
document.getElementById('supCloseCancel').addEventListener('click', function () {
  closeModalById('supCloseModal');
});
document.getElementById('supCloseConfirm').addEventListener('click', submitClose);

var supLoginBtn = document.getElementById('supLoginBtn');
var supRegBtn = document.getElementById('supRegBtn');
if (supLoginBtn) supLoginBtn.addEventListener('click', function () { openAuthModal('login'); });
if (supRegBtn) supRegBtn.addEventListener('click', function () { openAuthModal('reg'); });

initAuth().then(function () { loadFeed(); });