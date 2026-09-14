var achData = [];

function fmtAchTime(t) {
  if (!t) return '';
  return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function achAuthorInfo(ach) {
  var u = ach.user && ach.user.length ? ach.user[0] : null;
  if (!u) {
    var p = presenceMap[ach.user_id];
    return {
      nick: p ? p.nick : 'Игрок',
      avatar: '',
      role: p ? p.role : 'user'
    };
  }
  return { nick: u.nick, avatar: u.avatar, role: u.role };
}

function renderAchCard(ach, opts) {
  var info = achAuthorInfo(ach);
  var card = document.createElement('div');
  card.className = 'ach-card';

  var statusBadge = '';
  if (ach.status === 'pending') {
    statusBadge = '<span class="ach-status ach-pending">На проверке</span>';
  }

  var buttons = '';
  if (opts && opts.showReview) {
    buttons =
      '<div class="ach-actions">' +
        '<button class="support-btn" data-ach="' + ach.id + '" data-action="publish">Опубликовать</button>' +
        '<button class="sup-btn-danger" data-ach="' + ach.id + '" data-action="delete">Удалить</button>' +
      '</div>';
  }

  card.innerHTML =
    '<div class="ach-card-head">' +
      avatarHtml(info.avatar, 32) +
      '<div class="ach-card-meta">' +
        '<span class="ach-card-nick">' + esc(info.nick) + '</span>' +
        '<span class="ach-card-role">' + roleLabel(info.role) + '</span>' +
        '<span class="ach-card-date">' + fmtAchTime(ach.created_at) + '</span>' +
      '</div>' +
      statusBadge +
    '</div>' +
    '<div class="ach-card-text">' + esc(ach.text) + '</div>' +
    buttons;

  if (buttons) {
    var btns = card.querySelectorAll('[data-action]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-action');
        var id = b.getAttribute('data-ach');
        reviewAch(id, act === 'publish');
      });
    });
  }
  return card;
}

function renderAll() {
  var staff = currentUser && canManageUsers(currentUser.role);
  var pending = achData.filter(function (a) { return a.status === 'pending'; });
  var published = achData.filter(function (a) { return a.status === 'published'; });
  var myPending = currentUser
    ? pending.filter(function (a) { return a.user_id === currentUser.id; })
    : [];
  var pendingForReview = staff ? pending : [];

  // Staff pending
  var staffSec = document.getElementById('achStaffSection');
  var staffBox = document.getElementById('achPending');
  if (staff && pendingForReview.length) {
    staffSec.style.display = '';
    staffBox.innerHTML = '';
    pendingForReview.forEach(function (a) { staffBox.appendChild(renderAchCard(a, { showReview: true })); });
  } else {
    staffSec.style.display = 'none';
  }

  // My pending (non-staff: their own)
  var mySec = document.getElementById('achMyPending');
  var myBox = document.getElementById('achMyPendingList');
  if (!staff && myPending.length) {
    mySec.style.display = '';
    myBox.innerHTML = '';
    myPending.forEach(function (a) { myBox.appendChild(renderAchCard(a)); });
  } else {
    mySec.style.display = 'none';
  }

  // Published
  var pubBox = document.getElementById('achPublished');
  if (published.length) {
    pubBox.innerHTML = '';
    published.forEach(function (a) { pubBox.appendChild(renderAchCard(a)); });
  } else {
    pubBox.innerHTML = '<div class="ach-empty">Пока нет опубликованных достижений</div>';
  }

  // Submit form
  var form = document.getElementById('achForm');
  if (currentUser) form.style.display = '';
  else form.style.display = 'none';
}

async function loadAch() {
  if (!initSupabase()) return;
  var res = await SB.from('achievements')
    .select('id, user_id, text, status, created_at, reviewed_at, user:profiles!achievements_user_id_fkey(id, nick, avatar, role)')
    .order('created_at', { ascending: false });
  achData = (res.data && !res.error) ? res.data : [];
  renderAll();
}

async function submitAch() {
  if (!currentUser) { openAuthModal('login'); return; }
  var input = document.getElementById('achInput');
  var text = input.value.trim();
  var err = document.getElementById('achFormError');
  if (!text) { err.textContent = 'Напиши достижение'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  var res = await rpc('submit_achievement', { p_token: currentUser.token, p_text: text });
  var d = res.data;
  if (res.error || (d && d.error)) {
    err.textContent = d && d.error ? d.error : 'Ошибка';
    err.style.display = 'block';
    return;
  }
  input.value = '';
  err.style.display = 'none';
  alert('Достижение отправлено на проверку!');
  await loadAch();
}

async function reviewAch(id, publish) {
  if (!currentUser) return;
  var msg = publish ? 'Опубликовать достижение?' : 'Удалить достижение?';
  if (!confirm(msg)) return;
  var res = await rpc('review_achievement', { p_token: currentUser.token, p_ach_id: id, p_publish: publish });
  var d = res.data;
  if (res.error || (d && d.error)) { alert(d && d.error ? d.error : 'Ошибка'); return; }
  await loadAch();
}

function onAuthChange() { loadAch(); }

document.getElementById('achSubmit').addEventListener('click', submitAch);
document.getElementById('achInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAch(); }
});

initAuth().then(function () { loadAch(); });
