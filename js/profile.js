var selectedAvatar = '';
var viewingNick = null; // если смотрим чужой профиль (?nick=...)
var uploadedAvatarUrl = null;
var origAvatar = '';

function onAuthChange() {
  renderProfilePage();
}

function getViewNick() {
  var p = new URLSearchParams(window.location.search);
  return p.get('nick');
}

/* ─── profile render ─── */
async function renderProfilePage() {
  viewingNick = getViewNick();
  var loginMsg = document.getElementById('profileLoginMsg');
  var cols = document.getElementById('profileCols');

  var data = null;
  var isOwn = false;

  if (!currentUser) {
    if (viewingNick) {
      var r = await rpc('get_public_profile', { p_nick: viewingNick });
      if (r.data && !r.data.error) {
        data = r.data;
        // аноним смотрим чужой профиль
      }
    }
  } else if (viewingNick && viewingNick !== currentUser.nick) {
    var r2 = await rpc('get_public_profile', { p_nick: viewingNick });
    if (r2.data && !r2.data.error) data = r2.data;
  } else {
    isOwn = true;
    data = currentUser;
  }

  if (!data) {
    if (loginMsg) loginMsg.style.display = 'flex';
    if (cols) cols.style.display = 'none';
    var b = document.getElementById('plogin');
    if (b) b.onclick = function () { openAuthModal('login'); };
    return;
  }

  if (loginMsg) loginMsg.style.display = 'none';
  if (cols) cols.style.display = '';

  if (isOwn) {
    document.getElementById('profileAvatar').innerHTML = avatarHtml(currentUser.avatar, 120);
    document.getElementById('profileNick').textContent = currentUser.nick;
    document.getElementById('profileRole').textContent = roleLabel(currentUser.role);
    document.getElementById('profileRole').className = 'profile-role' + (isStaff(currentUser.role) ? ' profile-role-admin' : '');
    document.getElementById('profileCreated').textContent = currentUser.created_at ? fmtDateTime(currentUser.created_at) : '—';
    document.getElementById('profileSeen').textContent = currentUser.last_seen ? fmtDateTime(currentUser.last_seen) : '—';
    document.getElementById('profileDescription').textContent =
      (currentUser.description && currentUser.description.trim()) ? currentUser.description : 'Пока пусто...';
    document.getElementById('profileEdit').style.display = '';
    document.getElementById('profileChangePass').style.display = '';
  } else {
    document.getElementById('profileAvatar').innerHTML = avatarHtml(data.avatar, 120);
    document.getElementById('profileNick').textContent = data.nick;
    document.getElementById('profileRole').textContent = roleLabel(data.role);
    document.getElementById('profileRole').className = 'profile-role' + (isStaff(data.role) ? ' profile-role-admin' : '');
    document.getElementById('profileCreated').textContent = data.created_at ? fmtDateTime(data.created_at) : '—';
    document.getElementById('profileSeen').textContent = data.last_seen ? fmtDateTime(data.last_seen) : '—';
    document.getElementById('profileDescription').textContent =
      (data.description && data.description.trim()) ? data.description : 'Пока пусто...';
    document.getElementById('profileEdit').style.display = 'none';
    document.getElementById('profileChangePass').style.display = 'none';
  }
}

function fmtDateTime(t) {
  return new Date(t).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/* ─── avatars gallery ─── */
function buildGallery() {
  var gallery = document.getElementById('avatarGallery');
  gallery.innerHTML = '';
  AVATAR_EMOJIS.forEach(function (emoji, idx) {
    var cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'avatar-cell';
    cell.textContent = emoji;
    cell.style.background = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    if (emoji === selectedAvatar) cell.classList.add('avatar-cell-active');
    cell.addEventListener('click', function () {
      selectedAvatar = emoji;
      uploadedAvatarUrl = null;
      document.getElementById('editAvatarFile').value = '';
      gallery.querySelectorAll('.avatar-cell').forEach(function (c) { c.classList.remove('avatar-cell-active'); });
      cell.classList.add('avatar-cell-active');
    });
    gallery.appendChild(cell);
  });
}

/* ─── save profile ─── */
function showEditError(msg) {
  var e = document.getElementById('editError');
  e.textContent = msg;
  e.style.display = 'block';
}

function openEditModal() {
  if (!currentUser) return;
  origAvatar = currentUser.avatar || '';
  selectedAvatar = currentUser.avatar || '';
  uploadedAvatarUrl = null;
  if (selectedAvatar.indexOf('http') !== 0 && AVATAR_EMOJIS.indexOf(selectedAvatar) < 0) selectedAvatar = '';
  buildGallery();
  document.getElementById('editAvatarFile').value = '';
  document.getElementById('editNick').value = currentUser.nick;
  document.getElementById('editDescription').value = currentUser.description || '';
  document.getElementById('editError').style.display = 'none';
  openModalById('editModal');
}

async function onFilePicked(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var url = await uploadAvatar(file);
  if (!url) {
    showEditError('Не удалось загрузить фото');
    return;
  }
  uploadedAvatarUrl = url;
  var cellActive = document.getElementById('avatarGallery').querySelector('.avatar-cell-active');
  if (cellActive) { selectedAvatar = ''; cellActive.classList.remove('avatar-cell-active'); }
  document.getElementById('editError').style.display = 'none';
}

async function saveEdit() {
  var nick = document.getElementById('editNick').value.trim();
  var description = document.getElementById('editDescription').value.trim();
  var avatar = uploadedAvatarUrl || selectedAvatar || origAvatar || '';

  if (nick.length < 2) { showEditError('Ник минимум 2 символа'); return; }

  if (nick !== currentUser.nick) {
    var rn = await rpc('update_nick', { p_token: currentUser.token, p_new_nick: nick });
    if (rn.error || (rn.data && rn.data.error)) {
      showEditError(rn.data && rn.data.error ? rn.data.error : 'Ошибка');
      return;
    }
  }

  var rp = await rpc('update_profile', {
    p_token: currentUser.token,
    p_avatar: avatar,
    p_description: description
  });
  if (rp.error || (rp.data && rp.data.error)) {
    showEditError(rp.data && rp.data.error ? rp.data.error : 'Ошибка');
    return;
  }

  currentUser.nick = nick;
  currentUser.avatar = avatar;
  currentUser.description = description;
  currentUser.must_change_nick = false;
  saveSession();
  closeModalById('editModal');
  renderHdrAuth();
  renderMustChangeBanner();
  renderProfilePage();
  alert('Профиль сохранён');
}

/* ─── change password ─── */
function showPassError(msg) {
  var e = document.getElementById('passError');
  e.textContent = msg;
  e.style.display = 'block';
}

function openPassModal() {
  document.getElementById('passOld').value = '';
  document.getElementById('passNew').value = '';
  document.getElementById('passError').style.display = 'none';
  openModalById('passModal');
}

async function savePass() {
  var oldPass = document.getElementById('passOld').value;
  var newPass = document.getElementById('passNew').value;
  if (!oldPass) { showPassError('Введи старый пароль'); return; }
  if (newPass.length < 4) { showPassError('Новый пароль минимум 4 символа'); return; }
  var res = await rpc('change_password', {
    p_token: currentUser.token,
    p_old_password: oldPass,
    p_new_password: newPass
  });
  var d = res.data;
  if (res.error || (d && d.error)) { showPassError(d && d.error ? d.error : 'Ошибка'); return; }
  closeModalById('passModal');
  alert('Пароль изменён');
}

/* ─── listeners ─── */
document.getElementById('profileEdit').addEventListener('click', openEditModal);
document.getElementById('profileChangePass').addEventListener('click', openPassModal);
document.getElementById('editAvatarFile').addEventListener('change', onFilePicked);
document.getElementById('editCancel').addEventListener('click', function () { closeModalById('editModal'); });
document.getElementById('editSave').addEventListener('click', saveEdit);
document.getElementById('passCancel').addEventListener('click', function () { closeModalById('passModal'); });
document.getElementById('passSave').addEventListener('click', savePass);

initAuth();
renderProfilePage();