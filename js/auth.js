var SB = null;
var currentUser = null;
var presenceMap = {};
var realtimeSubscribed = false;
var SESSION_KEY = 'stflood_session';

var AVATAR_EMOJIS = [
  '😀','😎','🥳','🤖','👾','💀','🔥','⚡','🎮','🎯',
  '🚀','🌙','⭐','💎','🎸','🦊','🐱','🐉','👻','🎃'
];

var AVATAR_COLORS = [
  '#ff6a00','#ff8c00','#e74c3c','#e91e63','#9c27b0',
  '#673ab7','#3f51b5','#2196f3','#00bcd4','#009688',
  '#4caf50','#8bc34a','#cddc39','#ffc107','#ff5722',
  '#795548','#607d8b','#f44336','#673ab7','#ff9800'
];

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function byId(id) {
  return document.getElementById(id);
}

function avatarHtml(avatar, size) {
  size = size || 32;
  if (!avatar || avatar === '') {
    return '<div class="hdr-avatar-circle" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.5) + 'px;background:' + AVATAR_COLORS[0] + '">?</div>';
  }
  if (avatar.indexOf('http') === 0) {
    return '<img class="hdr-avatar-img" src="' + esc(avatar) + '" style="width:' + size + 'px;height:' + size + 'px" alt="avatar">';
  }
  var idx = AVATAR_EMOJIS.indexOf(avatar);
  var bg = idx >= 0 ? AVATAR_COLORS[idx % AVATAR_COLORS.length] : AVATAR_COLORS[0];
  return '<div class="hdr-avatar-circle" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.55) + 'px;background:' + bg + '">' + esc(avatar) + '</div>';
}

function initSupabase() {
  if (SB) return true;
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;
  SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return true;
}

async function rpc(name, args) {
  try {
    return await SB.rpc(name, args);
  } catch (e) {
    return { error: { message: 'Сеть недоступна' } };
  }
}

var ROLES = {
  'user': 'Игрок',
  'tester': 'Тестер',
  'admin': 'Админ',
  'co-owner': 'Совладелец',
  'owner': 'Владелец',
  'creator': 'Создатель сайта'
};

function roleLabel(r) {
  return ROLES[r] || 'Игрок';
}

function isStaff(role) {
  return role === 'admin' || role === 'co-owner' || role === 'owner' || role === 'creator';
}

/* ─── session ─── */
function saveSession() {
  if (!currentUser) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id: currentUser.id,
    nick: currentUser.nick,
    role: currentUser.role,
    avatar: currentUser.avatar || '',
    description: currentUser.description || '',
    must_change_nick: !!currentUser.must_change_nick,
    token: currentUser.token
  }));
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function applyAuthState() {
  renderHdrAuth();
  renderMustChangeBanner();
  if (typeof onAuthChange === 'function') onAuthChange();
}

function renderMustChangeBanner() {
  var existing = byId('mustChangeBar');
  if (existing) existing.remove();
  if (!currentUser || !currentUser.must_change_nick) return;
  var bar = document.createElement('div');
  bar.id = 'mustChangeBar';
  bar.className = 'mustchange-bar';
  bar.innerHTML =
    'Администрация просит сменить ник — без этого ты не сможешь писать в поддержку. ' +
    '<a href="profile.html">Сменить ник</a>';
  document.body.insertBefore(bar, document.body.firstChild);
}

function logout() {
  if (currentUser && currentUser.token) {
    rpc('logout_user', { p_token: currentUser.token });
  }
  currentUser = null;
  clearSession();
  applyAuthState();
}

/* ─── header UI ─── */
function renderHdrAuth() {
  var box = byId('hdrAuth');
  if (!box) return;
  if (!currentUser) {
    box.innerHTML =
      '<button type="button" class="hdr-btn" id="hdrLogin">Войти</button>' +
      '<button type="button" class="hdr-btn hdr-btn-prim" id="hdrReg">Регистрация</button>';
    var lb = byId('hdrLogin');
    var rb = byId('hdrReg');
    if (lb) lb.onclick = function () { openAuthModal('login'); };
    if (rb) rb.onclick = function () { openAuthModal('reg'); };
  } else {
    var adminLink = isStaff(currentUser.role)
      ? '<a class="hdr-btn" href="admin.html">Админка</a>'
      : '';
    var avatarEl = avatarHtml(currentUser.avatar, 28);
    box.innerHTML =
      '<a class="hdr-avatar-link" href="profile.html">' + avatarEl + '</a>' +
      '<a class="hdr-nick-link" href="profile.html"><span class="hdr-nick" title="' + esc(currentUser.nick) + '">' + esc(currentUser.nick) + '</span></a>' +
      adminLink +
      '<button type="button" class="hdr-btn" id="hdrLogout">Выйти</button>';
    var lo = byId('hdrLogout');
    if (lo) lo.onclick = function () { logout(); };
  }
}

/* ─── auth modal ─── */
function buildModals() {
  if (byId('authModal')) return;

  var auth = document.createElement('div');
  auth.className = 'support-modal';
  auth.id = 'authModal';
  auth.innerHTML =
    '<div class="support-modal-box">' +
      '<div class="support-modal-title" id="authTitle">Вход</div>' +
      '<div class="auth-switch">' +
        '<button type="button" class="auth-switch-btn auth-switch-active" id="authTabLogin">Вход</button>' +
        '<button type="button" class="auth-switch-btn" id="authTabReg">Регистрация</button>' +
      '</div>' +
      '<div class="support-modal-label">Ник</div>' +
      '<input id="authNickInput" type="text" placeholder="Придумай ник" autocomplete="off">' +
      '<div class="support-modal-label">Пароль</div>' +
      '<input id="authPassInput" type="password" placeholder="Минимум 4 символа" autocomplete="current-password">' +
      '<div class="sup-close-error" id="authError"></div>' +
      '<div class="support-modal-btns">' +
        '<button class="support-btn support-btn-ghost" id="authCancel">Отмена</button>' +
        '<button class="support-btn support-btn-primary" id="authSubmit">Войти</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(auth);

  byId('authTabLogin').onclick = function () { switchAuthMode('login'); };
  byId('authTabReg').onclick = function () { switchAuthMode('reg'); };
  byId('authSubmit').onclick = submitAuth;
  byId('authCancel').onclick = function () { closeModalById('authModal'); };
}

function showAuthError(msg) {
  var e = byId('authError');
  e.textContent = msg;
  e.style.display = 'block';
}

function hideAuthError() {
  if (byId('authError')) byId('authError').style.display = 'none';
}

function openAuthModal(mode) {
  if (!initSupabase()) {
    alert('Настрой Supabase в js/config.js');
    return;
  }
  buildModals();
  hideAuthError();
  switchAuthMode(mode || 'login');
  openModalById('authModal');
  setTimeout(function () { var i = byId('authNickInput'); if (i) i.focus(); }, 60);
}

function switchAuthMode(mode) {
  var isReg = mode === 'reg';
  byId('authTitle').textContent = isReg ? 'Регистрация' : 'Вход';
  byId('authSubmit').textContent = isReg ? 'Зарегистрироваться' : 'Войти';
  byId('authTabLogin').classList.toggle('auth-switch-active', !isReg);
  byId('authTabReg').classList.toggle('auth-switch-active', isReg);
  byId('authNickInput').placeholder = isReg ? 'Придумай ник' : 'Введи ник';
  byId('authPassInput').placeholder = isReg ? 'Минимум 4 символа' : 'Введи пароль';
  hideAuthError();
}

async function submitAuth() {
  var isReg = byId('authTabReg').classList.contains('auth-switch-active');
  var nick = byId('authNickInput').value.trim();
  var pass = byId('authPassInput').value;

  if (!nick) { showAuthError('Придумай ник'); return; }
  if (nick.length < 2) { showAuthError('Ник минимум 2 символа'); return; }
  if (!pass) { showAuthError('Введи пароль'); return; }
  if (pass.length < 4) { showAuthError('Пароль минимум 4 символа'); return; }

  var res = await rpc(isReg ? 'register_user' : 'login_user', { p_nick: nick, p_password: pass });
  if (res.error) { showAuthError('Ошибка сервера: ' + res.error.message); return; }
  var d = res.data;
  if (d.error) { showAuthError(d.error); return; }

  currentUser = {
    id: d.id, nick: d.nick, role: d.role || 'user',
    avatar: d.avatar || '', description: d.description || '',
    must_change_nick: !!d.must_change_nick,
    token: d.token
  };
  saveSession();
  closeModalById('authModal');
  applyAuthState();
}

/* ─── modal helpers ─── */
function openModalById(id) {
  var el = byId(id);
  if (el) el.classList.add('open');
}

function closeModalById(id) {
  var el = byId(id);
  if (el) el.classList.remove('open');
}

/* ─── presence ─── */
function heartbeatPresence() {
  if (!initSupabase() || !currentUser || !currentUser.token) return;
  rpc('heartbeat', { p_token: currentUser.token });
}

async function refreshPresence() {
  if (!initSupabase()) return;
  var res = await SB.from('profiles').select('id, nick, role, blocked, last_seen');
  presenceMap = {};
  var now = Date.now();
  if (res.data) {
    res.data.forEach(function (p) {
      presenceMap[p.id] = {
        nick: p.nick,
        role: p.role,
        blocked: p.blocked,
        online: (now - new Date(p.last_seen).getTime()) < 60000
      };
    });
  }
  if (typeof refreshStatuses === 'function') refreshStatuses();
}

function subscribeRealtime() {
  if (!SB || realtimeSubscribed) return;
  realtimeSubscribed = true;
  SB.channel('support-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'request_messages' }, function () { if (typeof loadFeed === 'function') loadFeed(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, function () { if (typeof loadFeed === 'function') loadFeed(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, function () { refreshPresence(); })
    .subscribe();
}

/* ─── admin api ─── */
async function adminListUsers() {
  if (!currentUser || !currentUser.token) return [];
  var res = await rpc('admin_list_users', { p_token: currentUser.token });
  return (res.data && !res.data.error) ? res.data : [];
}

async function adminDeleteUser(userId) {
  return rpc('admin_delete_user', { p_token: currentUser.token, p_user_id: userId });
}

async function adminSetBlock(userId, block) {
  return rpc('admin_set_status', { p_token: currentUser.token, p_user_id: userId, p_block: block });
}

async function adminSetRole(userId, role) {
  return rpc('admin_set_role', { p_token: currentUser.token, p_user_id: userId, p_role: role });
}

async function adminForceNick(userId, force) {
  return rpc('admin_force_nick', { p_token: currentUser.token, p_user_id: userId, p_force: force });
}

/* ─── avatar upload ─── */
async function uploadAvatar(file) {
  if (!initSupabase() || !file || !currentUser) return null;
  var ext = (file.name.split('.').pop() || 'png').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  var name = currentUser.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'png');
  var res = await SB.storage.from('avatars').upload(name, file);
  if (res.error) return null;
  var pub = SB.storage.from('avatars').getPublicUrl(name);
  return pub.data ? pub.data.publicUrl : null;
}

/* ─── init ─── */
async function initAuth() {
  if (!initSupabase()) { renderHdrAuth(); return; }
  buildModals();
  renderHdrAuth();
  var s = loadSession();
  if (s && s.token) {
    var res = await rpc('validate_token', { p_token: s.token });
    var d = res.data;
    if (!res.error && d && !d.error && !d.blocked) {
      currentUser = {
        id: d.id, nick: d.nick, role: d.role || 'user',
        avatar: d.avatar || '', description: d.description || '',
        must_change_nick: !!d.must_change_nick,
        token: s.token
      };
      saveSession();
    } else {
      clearSession();
    }
  }
  renderHdrAuth();
  renderMustChangeBanner();
  refreshPresence();
  subscribeRealtime();
  if (typeof onAuthChange === 'function') onAuthChange();
}

setInterval(heartbeatPresence, 10000);
setInterval(refreshPresence, 12000);