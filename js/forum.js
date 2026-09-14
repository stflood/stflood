var forumTopics = [];
var forumActiveTopic = null;
var forumProfiles = {};
var forumSearchTimer = null;

/* ─── helpers ─── */
function safeHTML(html) {
  var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  var allowed = ['B','I','U','STRONG','EM','BR','P','DIV','SPAN','FONT'];
  var walk = function (node) {
    if (!node.children) return;
    for (var i = node.children.length - 1; i >= 0; i--) {
      var c = node.children[i];
      var tag = (c.tagName || '').toUpperCase();
      if (tag === 'IMG') {
        var src = c.getAttribute('src') || '';
        if (!/^https?:\/\//i.test(src)) { c.remove(); continue; }
        while (c.attributes.length) c.removeAttribute(c.attributes[0].name);
        c.setAttribute('src', src);
        continue;
      }
      if (allowed.indexOf(tag) === -1) {
        while (c.firstChild) node.insertBefore(c.firstChild, c);
        c.remove();
        continue;
      }
      if (tag === 'SPAN' || tag === 'FONT') {
        var ff = (c.style && c.style.fontFamily) || c.getAttribute('face') || '';
        while (c.attributes.length) c.removeAttribute(c.attributes[0].name);
        if (ff) c.style.fontFamily = ff;
      } else {
        while (c.attributes.length) c.removeAttribute(c.attributes[0].name);
      }
      walk(c);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

var FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Comic Sans MS', 'Impact'];

function buildEditorToolbar(tbId, fileId, areaId) {
  var tb = document.getElementById(tbId);
  tb.innerHTML =
    '<button type="button" class="ed-btn" data-cmd="bold" title="Жирный"><b>B</b></button>' +
    '<button type="button" class="ed-btn" data-cmd="italic" title="Курсив"><i>I</i></button>' +
    '<button type="button" class="ed-btn" data-cmd="underline" title="Подчёркнутый"><u>U</u></button>' +
    '<select class="ed-font" data-cmd="fontName" title="Шрифт">' +
      '<option value="">Шрифт</option>' +
      FONTS.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('') +
    '</select>' +
    '<button type="button" class="ed-btn" data-cmd="image" title="Картинка">🖼</button>';
  tb.querySelectorAll('[data-cmd="bold"],[data-cmd="italic"],[data-cmd="underline"]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.execCommand(b.getAttribute('data-cmd'), false, null);
      var a = document.getElementById(areaId);
      if (a) a.focus();
    });
  });
  tb.querySelector('.ed-font').addEventListener('change', function (e) {
    document.execCommand('fontName', false, e.target.value);
    e.target.value = '';
    var a = document.getElementById(areaId);
    if (a) a.focus();
  });
  tb.querySelector('[data-cmd="image"]').addEventListener('click', function () {
    document.getElementById(fileId).click();
  });
  var file = document.getElementById(fileId);
  file.addEventListener('change', function () {
    if (file.files && file.files[0]) uploadForumImage(file.files[0], areaId);
    file.value = '';
  });
}

function uploadForumImage(file, areaId) {
  if (!initSupabase() || !currentUser) return;
  var ext = (file.name.split('.').pop() || 'png').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  var name = currentUser.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'png');
  SB.storage.from('forum').upload(name, file).then(function (res) {
    if (res.error) { alert('Не удалось загрузить картинку'); return; }
    var pub = SB.storage.from('forum').getPublicUrl(name);
    var url = pub.data ? pub.data.publicUrl : '';
    if (url) {
      var a = document.getElementById(areaId);
      if (a) {
        a.focus();
        document.execCommand('insertImage', false, url);
      }
    }
  });
}

function fmtForumTime(t) {
  if (!t) return '';
  return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function forumAuthor(topic) {
  var u = topic.creator;
  if (Array.isArray(u)) u = u[0];
  if (!u) return { nick: 'Игрок', avatar: '', role: 'user' };
  return { nick: u.nick, avatar: u.avatar, role: u.role };
}

function statusBadgeHtml(status) {
  if (status === 'solved') return '<span class="forum-status forum-status-solved">Решено</span>';
  if (status === 'closed') return '<span class="forum-status forum-status-closed">Закрыто</span>';
  return '<span class="forum-status forum-status-open">Открыто</span>';
}

/* ─── список тем ─── */
async function loadForum(search) {
  if (!initSupabase()) return;
  var q = SB.from('requests')
    .select('id, created_at, status, closed_reason, pinned, title, body, creator:profiles!requests_creator_id_fkey(nick, avatar, role), request_messages(id)');
  if (search && search.trim()) {
    var s = search.trim();
    q = q.or('title.ilike.%' + s + '%,body.ilike.%' + s + '%');
  } else {
    q = q.order('pinned', { ascending: false }).order('created_at', { ascending: false });
  }
  var res = await q;
  forumTopics = (res.data && !res.error) ? res.data : [];
  if (!search || !search.trim()) {
    forumTopics.sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  renderForumList();
}

function renderForumList() {
  var box = document.getElementById('forumTopics');
  if (!forumTopics.length) {
    box.innerHTML = '<div class="forum-empty">Пока нет тем. Создай первую!</div>';
    return;
  }
  box.innerHTML = '';
  forumTopics.forEach(function (t) {
    var info = forumAuthor(t);
    var el = document.createElement('div');
    el.className = 'forum-topic' + (t.pinned ? ' forum-topic-pinned' : '');
    el.innerHTML =
      '<div class="forum-topic-title">' +
        (t.pinned ? '<span class="forum-pin">📌</span>' : '') + esc(t.title) +
      '</div>' +
      '<div class="forum-topic-meta">' +
        avatarHtml(info.avatar, 22) +
        '<span class="forum-topic-nick">' + esc(info.nick) + '</span>' +
        '<span class="forum-topic-role">' + roleLabel(info.role) + '</span>' +
        statusBadgeHtml(t.status) +
        '<span class="forum-topic-replies">💬 ' + (t.request_messages ? t.request_messages.length : 0) + '</span>' +
        '<span class="forum-topic-date">' + fmtForumTime(t.created_at) + '</span>' +
      '</div>';
    el.addEventListener('click', function () { openTopic(t.id); });
    box.appendChild(el);
  });
}

/* ─── открыть тему ─── */
async function openTopic(id) {
  var res = await SB.from('requests')
    .select('*, creator:profiles!requests_creator_id_fkey(nick, avatar, role), request_messages(id, created_at, user_id, nick, text)')
    .eq('id', id)
    .single();
  if (res.error || !res.data) { alert('Тема не найдена'); return; }
  forumActiveTopic = res.data;
  renderTopic();
}

function renderTopic() {
  document.getElementById('forumList').style.display = 'none';
  document.getElementById('forumTopic').style.display = '';
  var t = forumActiveTopic;
  var info = forumAuthor(t);
  var staff = currentUser && isStaff(currentUser.role);
  var msgs = (t.request_messages || []).sort(function (a, b) { return a.created_at.localeCompare(b.created_at); });

  var staffPanel = '';
  if (staff) {
    var st = t.status === 'open' ? 'Открыто' : (t.status === 'solved' ? 'Решено' : 'Закрыто');
    staffPanel =
      '<div class="forum-staff">' +
        '<span class="forum-staff-label">Модерация:</span>' +
        '<select id="fStatusSel">' +
          '<option value="open"' + (t.status === 'open' ? ' selected' : '') + '>Открыто</option>' +
          '<option value="solved"' + (t.status === 'solved' ? ' selected' : '') + '>Решено</option>' +
          '<option value="closed"' + (t.status === 'closed' ? ' selected' : '') + '>Закрыто</option>' +
        '</select>' +
        '<button type="button" class="support-btn" data-fact="status">Применить</button>' +
        '<button type="button" class="support-btn" data-fact="pin">' +
          (t.pinned ? 'Открепить' : 'Закрепить') + '</button>' +
      '</div>';
  }

  var canReply = currentUser && t.status === 'open';

  var html =
    '<div class="forum-topic-title-big">' +
      (t.pinned ? '<span class="forum-pin">📌</span>' : '') + esc(t.title) + '</div>' +
    '<div class="forum-topic-meta">' +
      avatarHtml(info.avatar, 24) +
      '<span class="forum-topic-nick">' + esc(info.nick) + '</span>' +
      '<span class="forum-topic-role">' + roleLabel(info.role) + '</span>' +
      statusBadgeHtml(t.status) +
      '<span class="forum-topic-date">' + fmtForumTime(t.created_at) + '</span>' +
    '</div>' +
    staffPanel +
    '<div class="forum-body">' + safeHTML(t.body) + '</div>';

  var out = document.createElement('div');
  out.innerHTML = html;
  var stBtn = out.querySelector('[data-fact="status"]');
  if (stBtn) stBtn.addEventListener('click', function () {
    var sel = out.querySelector('#fStatusSel');
    setTopicStatus(sel ? sel.value : 'open');
  });
  var pinBtn = out.querySelector('[data-fact="pin"]');
  if (pinBtn) pinBtn.addEventListener('click', function () {
    toggleTopicPin(!t.pinned);
  });

  msgs.forEach(function (m) {
    var me = currentUser && m.user_id === currentUser.id;
    var p = forumProfiles[m.user_id] || {};
    var row = document.createElement('div');
    row.className = 'forum-msg' + (me ? ' forum-msg-me' : '');
    row.innerHTML =
      '<div class="forum-msg-head">' +
        avatarHtml(p.avatar || '', 26) +
        '<span class="forum-msg-nick">' + esc(m.nick || p.nick || 'Игрок') + '</span>' +
        '<span class="forum-msg-time">' + fmtForumTime(m.created_at) + '</span>' +
      '</div>' +
      '<div class="forum-msg-body">' + safeHTML(m.text) + '</div>';
    out.appendChild(row);
  });

  if (canReply) {
    var reply = document.createElement('div');
    reply.className = 'forum-reply';
    reply.innerHTML =
      '<div class="forum-editor">' +
        '<div class="forum-editor-toolbar" id="replyToolbar"></div>' +
        '<div class="forum-editor-area" id="replyBody" contenteditable="true" data-placeholder="Твой ответ..."></div>' +
      '</div>' +
      '<input type="file" id="replyFile" accept="image/*" style="display:none">' +
      '<div class="support-modal-btns" style="flex-direction:row;margin-top:8px">' +
        '<button type="button" class="support-btn support-btn-primary" id="replySend">Ответить</button>' +
      '</div>';
    out.appendChild(reply);
    buildEditorToolbar('replyToolbar', 'replyFile', 'replyBody');
    document.getElementById('replySend').addEventListener('click', sendReply);
  } else if (currentUser && t.status !== 'open') {
    var closed = document.createElement('div');
    closed.className = 'forum-closed-note';
    closed.textContent = t.status === 'solved' ? 'Тема решена — ответы закрыты.' : 'Тема закрыта.';
    out.appendChild(closed);
  }

  var view = document.getElementById('forumTopicView');
  view.innerHTML = '';
  view.appendChild(out);
  var replyBody = document.getElementById('replyBody');
  if (replyBody) replyBody.focus();
}

/* ─── действия ─── */
async function sendReply() {
  if (!currentUser) { openAuthModal('login'); return; }
  var body = document.getElementById('replyBody');
  var text = safeHTML(body.innerHTML);
  if (!text.replace(/&nbsp;|<br>/g, '').trim()) return;
  var res = await rpc('post_message', {
    p_token: currentUser.token, p_request_id: forumActiveTopic.id, p_text: text
  });
  var d = res.data;
  if (res.error || (d && d.error)) { alert(d && d.error ? d.error : 'Ошибка'); return; }
  openTopic(forumActiveTopic.id);
}

async function setTopicStatus(status) {
  var reason = status === 'open' ? '' : prompt(status === 'solved' ? 'Причина решения (необязательно):' : 'Причина закрытия (необязательно):') || '';
  var res = await rpc('set_topic_status', {
    p_token: currentUser.token, p_topic_id: forumActiveTopic.id, p_status: status, p_reason: reason
  });
  var d = res.data;
  if (res.error || (d && d.error)) { alert(d && d.error ? d.error : 'Ошибка'); return; }
  openTopic(forumActiveTopic.id);
}

async function toggleTopicPin(pin) {
  var res = await rpc('toggle_pin', {
    p_token: currentUser.token, p_topic_id: forumActiveTopic.id, p_pin: pin
  });
  var d = res.data;
  if (res.error || (d && d.error)) { alert(d && d.error ? d.error : 'Ошибка'); return; }
  openTopic(forumActiveTopic.id);
}

/* ─── новая тема ─── */
function openNewTopic() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('ntTitle').value = '';
  document.getElementById('ntBody').innerHTML = '';
  document.getElementById('ntError').style.display = 'none';
  if (!document.getElementById('ntToolbar').children.length) {
    buildEditorToolbar('ntToolbar', 'ntFile', 'ntBody');
  }
  openModalById('newTopicModal');
  setTimeout(function () { var t = document.getElementById('ntTitle'); if (t) t.focus(); }, 60);
}

async function submitNewTopic() {
  if (!currentUser) { openAuthModal('login'); return; }
  var title = document.getElementById('ntTitle').value.trim();
  var err = document.getElementById('ntError');
  var body = safeHTML(document.getElementById('ntBody').innerHTML);
  if (!title) { err.textContent = 'Придумай название темы'; err.style.display = 'block'; return; }
  var res = await rpc('create_topic', { p_token: currentUser.token, p_title: title, p_body: body });
  var d = res.data;
  if (res.error || (d && d.error)) { err.textContent = d && d.error ? d.error : 'Ошибка'; err.style.display = 'block'; return; }
  closeModalById('newTopicModal');
  await loadForum();
  openTopic(d.id);
}

/* ─── load profiles map (для аватарок в сообщениях) ─── */
async function loadForumProfiles() {
  if (!initSupabase()) return;
  var res = await SB.from('profiles').select('id, nick, role, avatar');
  forumProfiles = {};
  if (res.data) res.data.forEach(function (p) { forumProfiles[p.id] = p; });
}

function onAuthChange() { loadForum(); }

/* ─── listeners ─── */
document.getElementById('forumSearch').addEventListener('input', function (e) {
  clearTimeout(forumSearchTimer);
  var v = e.target.value;
  forumSearchTimer = setTimeout(function () { loadForum(v); }, 300);
});
document.getElementById('forumNewTopic').addEventListener('click', openNewTopic);
document.getElementById('forumBack').addEventListener('click', function () {
  document.getElementById('forumTopic').style.display = 'none';
  document.getElementById('forumList').style.display = '';
  loadForum(document.getElementById('forumSearch').value);
});
document.getElementById('ntCancel').addEventListener('click', function () { closeModalById('newTopicModal'); });
document.getElementById('ntSubmit').addEventListener('click', submitNewTopic);

loadForumProfiles();
initAuth().then(function () { loadForum(); });