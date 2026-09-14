var adminUsers = [];

async function initAdmin() {
  if (!initSupabase()) {
    document.getElementById('adminBody').innerHTML = '<p class="empty">Настрой Supabase в js/config.js</p>';
    return;
  }
  await initAuth();
  if (!currentUser) {
    document.getElementById('adminBody').innerHTML =
      '<p class="empty">Ты не вошёл. <button type="button" class="sup-btn-primary" id="adminLogin">Войти</button></p>';
    var b = document.getElementById('adminLogin');
    if (b) b.onclick = function () { openAuthModal('login'); };
    return;
  }
  if (!isStaff(currentUser.role)) {
    document.getElementById('adminBody').innerHTML = '<p class="empty">Нет доступа — ты не админ.</p>';
    return;
  }
  await loadAll();
}

document.addEventListener('click', function (e) {
  var el = e.target;
  while (el && el !== document) {
    if (el.getAttribute && el.getAttribute('data-card')) {
      showUserActions(el.getAttribute('data-card'));
      return;
    }
    if (el.getAttribute && el.getAttribute('data-act')) {
      onAdminAction(el);
      return;
    }
    if (el.getAttribute && el.getAttribute('data-back')) {
      renderCards();
      return;
    }
    el = el.parentNode;
  }
});

async function loadAll() {
  await refreshPresence();
  adminUsers = await adminListUsers();
  if (!adminUsers || !adminUsers.length) adminUsers = [];
  renderCards();
}

function onlineOf(u) {
  var p = presenceMap[u.id];
  return p ? p.online : ((Date.now() - new Date(u.last_seen).getTime()) < 60000);
}

/* ─── CARDS (Игроки) ─── */
function renderCards() {
  var body = document.getElementById('adminBody');
  if (!adminUsers.length) {
    body.innerHTML = '<p class="empty">Нет аккаунтов.</p>';
    return;
  }
  var html = '<div class="admin-cards">';
  adminUsers.forEach(function (u) {
    html +=
      '<div class="admin-card" data-card="' + u.id + '">' +
        '<div class="admin-card-avatar">' + avatarHtml(u.avatar, 64) + '</div>' +
        '<div class="admin-card-nick">' + esc(u.nick) + '</div>' +
        '<div class="admin-card-meta">' +
          '<span class="' + (onlineOf(u) ? 'stat-on' : 'stat-off') + '">' + (onlineOf(u) ? 'В сети' : 'Не в сети') + '</span>' +
          '<span class="admin-card-role">' + roleLabel(u.role) + (u.blocked ? ' · Заблокирован' : '') + '</span>' +
        '</div>' +
      '</div>';
  });
  html += '</div>';
  body.innerHTML = html;
}

/* ─── USER ACTIONS ─── */
function showUserActions(id) {
  var u = adminUsers.find(function (x) { return x.id === id; });
  if (!u) return;
  var body = document.getElementById('adminBody');
  var online = onlineOf(u);
  body.innerHTML =
    '<div class="admin-user">' +
      '<button type="button" class="hdr-btn" data-back>&#8592; Назад</button>' +
      '<div class="admin-user-head">' +
        avatarHtml(u.avatar, 88) +
        '<div class="admin-user-info">' +
          '<div class="admin-user-nick">' + esc(u.nick) + '</div>' +
          '<div class="admin-user-role">' + roleLabel(u.role) + '</div>' +
          '<div class="admin-user-meta">' +
            '<span class="' + (online ? 'stat-on' : 'stat-off') + '">' + (online ? 'В сети' : 'Не в сети') + '</span>' +
            '<span>Рег: ' + fmtDT(u.created_at) + '</span>' +
          '</div>' +
          (u.must_change_nick ? '<div class="admin-user-warn">Смена ника принудительная</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="admin-user-actions">' +
        '<button type="button" class="sup-btn-danger" data-act="del" data-id="' + u.id + '">Удалить</button>' +
        '<button type="button" class="support-btn" data-act="block" data-id="' + u.id + '">' +
          (u.blocked ? 'Разблокировать' : 'Заблокировать') + '</button>' +
        (u.id !== currentUser.id
          ? '<span class="adm-role-box">Роль: ' +
            '<select class="adm-role-select" id="roleSel">' + roleOptions(u.role) + '</select>' +
            '<button type="button" class="support-btn" data-act="setrole" data-id="' + u.id + '">Применить</button>' +
            '</span>'
          : '') +
        '<button type="button" class="support-btn" data-act="fnick" data-id="' + u.id + '">' +
          (u.must_change_nick ? 'Отменить смену ника' : 'Отправить на смену ника') + '</button>' +
        '<a class="hdr-btn" href="profile.html?nick=' + encodeURIComponent(u.nick) + '">Открыть профиль</a>' +
      '</div>' +
    '</div>';
}

function roleOptions(sel) {
  var order = ['user', 'tester', 'admin', 'co-owner', 'owner', 'creator'];
  return order.map(function (r) {
    return '<option value="' + r + '"' + (r === sel ? ' selected' : '') + '>' + roleLabel(r) + '</option>';
  }).join('');
}

function fmtDT(t) {
  if (!t) return '—';
  return new Date(t).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function onAdminAction(btn) {
  var act = btn.getAttribute('data-act');
  var id = btn.getAttribute('data-id');
  var r;

  if (act === 'del') {
    if (!confirm('Точно удалить аккаунт?')) return;
    r = await adminDeleteUser(id);
  } else if (act === 'block') {
    var u = adminUsers.find(function (x) { return x.id === id; });
    var blockNow = !u.blocked;
    if (!confirm(blockNow ? 'Заблокировать пользователя?' : 'Разблокировать?')) return;
    r = await adminSetBlock(id, blockNow);
  } else if (act === 'setrole') {
    var selEl = document.getElementById('roleSel');
    if (!selEl) return;
    var newRole = selEl.value;
    var u2 = adminUsers.find(function (x) { return x.id === id; });
    if (!confirm('Выдать роль «' + roleLabel(newRole) + '» для ' + u2.nick + '?')) return;
    r = await adminSetRole(id, newRole);
  } else if (act === 'fnick') {
    var u3 = adminUsers.find(function (x) { return x.id === id; });
    var force = !u3.must_change_nick;
    if (force) {
      if (!confirm('Отправить на смену ника? Этот игрок не сможет писать, пока не сменит ник.')) return;
    } else {
      if (!confirm('Отменить принудительную смену ника?')) return;
    }
    r = await adminForceNick(id, force);
  }

  if (r && (r.error || (r.data && r.data.error))) {
    alert(r.data && r.data.error ? r.data.error : 'Ошибка');
    return;
  }
  await loadAll();
  showUserActions(id);
}

initAdmin();