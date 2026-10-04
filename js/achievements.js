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

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtAchText(t) {
  var h = escHtml(t);
  // __подчёркнутый__ → <u>, **жирный** → <b>, *курсив* → <i> (после экранирования безопасно)
  h = h.replace(/__([^_]+?)__/g, '<u>$1</u>');
  h = h.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
  return h;
}

var achImageFile = null;

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

  var img = '';
  if (ach.image) {
    img = '<img class="ach-card-img" src="' + escHtml(ach.image) + '" alt="img" onclick="window.open(this.src)" style="cursor:pointer">';
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
    img +
    '<div class="ach-card-text">' + fmtAchText(ach.text) + '</div>' +
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
    .select('id, user_id, text, image, status, created_at, reviewed_at, user:profiles!achievements_user_id_fkey(id, nick, avatar, role)')
    .order('created_at', { ascending: false });
  achData = (res.data && !res.error) ? res.data : [];
  renderAll();
}

async function submitAch() {
  if (!currentUser) { openAuthModal('login'); return; }
  var input = document.getElementById('achInput');
  var text = input.value.trim();
  var err = document.getElementById('achFormError');
  if (!text && !achImageFile) { err.textContent = 'Напиши достижение или добавь картинку'; err.style.display = 'block'; return; }
  err.style.display = 'none';

  var imageUrl = null;
  if (achImageFile) {
    var ext = (achImageFile.name.split('.').pop() || 'png').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    var fname = currentUser.id + '_' + Date.now() + '.' + (ext || 'png');
    var up = await SB.storage.from('achievements').upload(fname, achImageFile);
    if (up.error) {
      err.textContent = 'Ошибка загрузки картинки';
      err.style.display = 'block';
      return;
    }
    var pub = SB.storage.from('achievements').getPublicUrl(fname);
    imageUrl = pub.data ? pub.data.publicUrl : null;
  }

  var res = await rpc('submit_achievement', { p_token: currentUser.token, p_text: text, p_image: imageUrl });
  var d = res.data;
  console.log('submit_achievement result:', JSON.stringify(res));
  if (res.error || (d && d.error)) {
    var msg = d && d.error ? d.error : (res.error && res.error.message ? res.error.message : 'Ошибка');
    console.error('submit_achievement error:', msg, 'full:', JSON.stringify(res));
    err.textContent = msg;
    err.style.display = 'block';
    return;
  }
  input.value = '';
  err.style.display = 'none';
  achImageFile = null;
  document.getElementById('achImgPreview').style.display = 'none';
  document.getElementById('achImgName').textContent = '';
  document.getElementById('achImgClear').style.display = 'none';
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

// ─── форматирование ───
document.querySelectorAll('.ach-fmt').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var ta = document.getElementById('achInput');
    var wrap = btn.getAttribute('data-fmt');
    var s = ta.selectionStart, e = ta.selectionEnd;
    var val = ta.value;
    var sel = val.substring(s, e);
    var before = val.substring(0, s);
    var after = val.substring(e);
    var selClean = sel.replace(/^\*{1,2}|^\*{1,2}$/g, '').replace(/^__|^__$/g, '');
    ta.value = before + wrap + (selClean || '...') + wrap + after;
    ta.focus();
    var newSel = selClean ? s + wrap.length + selClean.length + wrap.length : s + wrap.length;
    ta.setSelectionRange(newSel, newSel);
  });
});

// ─── картинка ───
var achImgBtn = document.getElementById('achImgBtn');
var achImgInput = document.getElementById('achImage');
var achImgPreview = document.getElementById('achImgPreview');
var achImgName = document.getElementById('achImgName');
var achImgClear = document.getElementById('achImgClear');

achImgBtn.addEventListener('click', function () { achImgInput.click(); });

achImgInput.addEventListener('change', function () {
  var file = achImgInput.files && achImgInput.files[0];
  if (!file) return;
  if (!file.type.match(/^image\/(png|jpe?g|gif|webp)$/)) {
    alert('Только PNG, JPG, GIF или WebP');
    achImgInput.value = '';
    return;
  }
  achImageFile = file;
  achImgName.textContent = file.name;
  achImgClear.style.display = '';
  var reader = new FileReader();
  reader.onload = function (ev) {
    achImgPreview.src = ev.target.result;
    achImgPreview.style.display = '';
  };
  reader.readAsDataURL(file);
});

achImgClear.addEventListener('click', function () {
  achImageFile = null;
  achImgInput.value = '';
  achImgName.textContent = '';
  achImgPreview.style.display = 'none';
  achImgClear.style.display = 'none';
});

initAuth().then(function () { loadAch(); });
