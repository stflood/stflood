/* ─── Публичный список пользователей ─── */

function fmtDateShort(t) {
  if (!t) return '';
  var d = new Date(t);
  if (isNaN(d.getTime())) return '';
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

async function loadUsers() {
  var list = document.getElementById('usersList');
  list.innerHTML = '<div class="users-loading">Загрузка…</div>';
  if (!initSupabase()) {
    list.innerHTML = '<div class="users-loading">Нет соединения</div>';
    return;
  }
  var res = await rpc('list_users');
  var data = res.error ? null : res.data;
  if (!data || !Array.isArray(data)) {
    list.innerHTML = '<div class="users-loading">Не удалось загрузить список</div>';
    return;
  }
  if (!data.length) {
    list.innerHTML = '<div class="users-loading">Пока никто не зарегистрировался</div>';
    return;
  }
  var NOW = Date.now();
  list.innerHTML = '';
  data.forEach(function (u) {
    var row = document.createElement('a');
    row.className = 'users-row';
    row.href = 'profile.html?nick=' + encodeURIComponent(u.nick);

    var meta = [];
    if (u.role !== 'user') meta.push('<span class="users-row-admin">' + roleLabel(u.role) + '</span>');
    if (u.blocked) meta.push('<span class="users-row-blocked">Заблокирован</span>');
    var online = u.last_seen && (NOW - new Date(u.last_seen).getTime() < 5 * 60 * 1000);
    meta.push('<span class="users-row-' + (online ? 'online' : 'offline') + '">' + (online ? 'В сети' : 'Не в сети') + '</span>');
    meta.push('<span class="users-row-date">с ' + fmtDateShort(u.created_at) + '</span>');

    row.innerHTML =
      '<span class="users-row-av">' + avatarHtml(u.avatar, 38) + '</span>' +
      '<span class="users-row-name">' + esc(u.nick) + '</span>' +
      '<span class="users-row-meta">' + meta.join('') + '</span>';
    if (u.description) {
      row.innerHTML += '<span class="users-row-desc">' + esc(u.description) + '</span>';
    }
    list.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', loadUsers);