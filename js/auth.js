var SB = null;
var currentUser = null;
var myNick = '';
var presenceMap = {};
var realtimeSubscribed = false;

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function initSupabase() {
  if (SB) return true;
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;
  SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return true;
}

function setAuthUI() {
  var box = document.getElementById('supAuth');
  if (!box) return;
  if (!initSupabase()) {
    box.innerHTML = '<span class="sup-auth-hint">Подключи Supabase в js/config.js</span>';
    return;
  }
  if (!currentUser) {
    box.innerHTML = '<button type="button" class="sup-login-btn" id="authOpenBtn">Войти</button>';
    var b = document.getElementById('authOpenBtn');
    if (b) b.onclick = function () { openAuthModal('login'); };
  } else {
    box.innerHTML =
      '<span class="sup-auth-nick" title="' + esc(myNick) + '">' + esc(myNick) + '</span>' +
      '<button type="button" class="sup-login-btn" id="authLogoutBtn">Выйти</button>';
    var lb = document.getElementById('authLogoutBtn');
    if (lb) lb.onclick = function () { SB.auth.signOut(); };
  }
}

function showAuthError(msg) {
  var e = document.getElementById('authError');
  e.textContent = msg;
  e.style.display = 'block';
}

function hideAuthError() {
  var e = document.getElementById('authError');
  e.style.display = 'none';
}

function openAuthModal(mode) {
  if (!initSupabase()) {
    alert('Сначала вставь ключи Supabase в js/config.js');
    return;
  }
  hideAuthError();
  switchAuthMode(mode || 'login');
  document.getElementById('authModal').classList.add('open');
  setTimeout(function () {
    var nick = document.getElementById('authNickInput');
    if (nick.style.display !== 'none') nick.focus();
    else document.getElementById('authEmailInput').focus();
  }, 50);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}

function switchAuthMode(mode) {
  var isReg = mode === 'reg';
  document.getElementById('authTitle').textContent = isReg ? 'Регистрация' : 'Вход';
  document.getElementById('authNickInput').style.display = isReg ? 'block' : 'none';
  document.getElementById('authLabelNick').style.display = isReg ? 'block' : 'none';
  document.getElementById('authSubmit').textContent = isReg ? 'Зарегистрироваться' : 'Войти';
  document.getElementById('authTabLogin').classList.toggle('auth-switch-active', !isReg);
  document.getElementById('authTabReg').classList.toggle('auth-switch-active', isReg);
  hideAuthError();
}

async function submitAuth() {
  var isReg = document.getElementById('authTabReg').classList.contains('auth-switch-active');
  var email = document.getElementById('authEmailInput').value.trim();
  var pass = document.getElementById('authPassInput').value;
  var nick = document.getElementById('authNickInput').value.trim();
  if (isReg && !nick) { showAuthError('Придумай ник'); return; }
  if (!email || !pass) { showAuthError('Заполни email и пароль'); return; }
  if (pass.length < 6) { showAuthError('Пароль минимум 6 символов'); return; }
  if (isReg) {
    var res = await SB.auth.signUp({
      email: email,
      password: pass,
      options: { data: { nick: nick } }
    });
    if (res.error) { showAuthError(res.error.message); return; }
    if (res.data && res.data.user && !res.data.session) {
      closeAuthModal();
      alert('Аккаунт создан! Подтверди email (или выключи подтверждение email в Supabase), затем войди.');
      document.getElementById('authPassInput').value = '';
      switchAuthMode('login');
      return;
    }
    closeAuthModal();
  } else {
    var lg = await SB.auth.signInWithPassword({ email: email, password: pass });
    if (lg.error) { showAuthError(lg.error.message); return; }
    closeAuthModal();
  }
}

async function ensureProfile() {
  if (!initSupabase() || !currentUser) return;
  await SB.from('profiles').upsert(
    { user_id: currentUser.id, nick: myNick, last_seen: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

function heartbeatPresence() {
  if (!initSupabase() || !currentUser) return;
  SB.from('profiles').upsert(
    { user_id: currentUser.id, nick: myNick, last_seen: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function refreshPresence() {
  if (!initSupabase()) return;
  var res = await SB.from('profiles').select('user_id, nick, last_seen');
  presenceMap = {};
  var now = Date.now();
  if (res.data) {
    res.data.forEach(function (p) {
      presenceMap[p.user_id] = {
        nick: p.nick,
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'request_messages' }, function () { loadFeed(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, function () { loadFeed(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, function () { refreshPresence(); })
    .subscribe();
}

function subscribeAuth() {
  if (!SB) return;
  SB.auth.onAuthStateChange(function (event, session) {
    currentUser = session ? session.user : null;
    var meta = currentUser && currentUser.user_metadata ? currentUser.user_metadata : {};
    myNick = (meta.nick || (currentUser ? currentUser.email : '') || 'Игрок');
    setAuthUI();
    if (currentUser) {
      ensureProfile();
      refreshPresence();
    }
    if (typeof onAuthChange === 'function') onAuthChange();
  });
}

function initAuth() {
  if (!initSupabase()) { setAuthUI(); return; }
  SB.auth.getSession().then(function (res) {
    var session = res && res.data ? res.data.session : null;
    currentUser = session ? session.user : null;
    var meta = currentUser && currentUser.user_metadata ? currentUser.user_metadata : {};
    myNick = (meta.nick || (currentUser ? currentUser.email : '') || 'Игрок');
    setAuthUI();
    if (currentUser) {
      ensureProfile();
      refreshPresence();
    }
    if (typeof onAuthChange === 'function') onAuthChange();
    subscribeAuth();
  });
}

setInterval(heartbeatPresence, 10000);
setInterval(refreshPresence, 12000);