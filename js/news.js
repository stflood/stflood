/* ─── Новости: загрузка из БД, рендер, редактор (creator) ─── */

var newsData = [];
var editingNewsId = null;

function newsAuthorInfo(n) {
  var a = n.author;
  if (Array.isArray(a)) a = a[0];
  if (!a || typeof a !== 'object' || !a.nick) return { nick: 'Unknown', role: 'user', avatar: '' };
  return { nick: a.nick, role: a.role, avatar: a.avatar || '' };
}

function fmtNewsDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch (e) { return ''; }
}

function newsContentHtml(content) {
  if (!content) return '';
  return content.split('\n').filter(function (l) { return l.trim(); })
    .map(function (l) { return '<p>' + l + '</p>'; }).join('');
}

/* ─── загрузка из БД ─── */
async function loadNews() {
  if (!initSupabase()) { renderNewsIndex(); return; }
  var res = await SB.from('news')
    .select('id, title, excerpt, content, author_id, created_at, author:profiles!news_author_fk(id, nick, avatar, role)')
    .order('created_at', { ascending: false });
  newsData = (res.data && !res.error) ? res.data : [];
  renderNewsIndex();
}

/* ─── список новостей ─── */
function renderNewsIndex() {
  var idx = document.getElementById('newsIndex');
  var post = document.getElementById('newsPost');
  if (idx) idx.classList.remove('hidden');
  if (post) post.style.display = 'none';
  if (!idx) return;
  var empty = !newsData.length;
  var html = '';
  if (currentUser && currentUser.role === 'creator') {
    html += '<div class="news-admin-bar"><button type="button" class="support-btn support-btn-primary" id="newsAddBtn">＋ Добавить новость</button></div>';
  }
  if (empty) {
    html += '<div class="ach-empty">Пока нет новостей</div>';
    return showNewsIndex(html);
  }
  newsData.forEach(function (n, i) {
    var info = newsAuthorInfo(n);
    var canEdit = currentUser && currentUser.role === 'creator';
    html += '<a class="news-card' + (i === 0 ? ' news-card-new' : '') + '" href="#post-' + n.id + '" data-nid="' + n.id + '">' +
      '<div class="news-card-top">' +
        (i === 0 ? '<span class="news-badge-new">Новая</span>' : '<span></span>') +
        '<span class="news-card-date">' + fmtNewsDate(n.created_at) + '</span>' +
      '</div>' +
      '<div class="news-card-title">' + esc(n.title) + '</div>' +
      '<div class="news-card-excerpt">' + esc(n.excerpt || '') + '</div>' +
      (canEdit ?
        '<div class="news-card-actions">' +
          '<button type="button" class="support-btn news-edit-btn" data-nid="' + n.id + '">✎</button>' +
          '<button type="button" class="support-btn-danger news-del-btn" data-nid="' + n.id + '">✕</button>' +
        '</div>' : '') +
      '</a>';
  });
  idx.innerHTML = html;

  var addBtn = byId('newsAddBtn');
  if (addBtn) addBtn.addEventListener('click', function () { openNewsEditor(null); });

  idx.querySelectorAll('.news-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.news-card-actions')) return false;
      var fnd = newsData.find(function (x) { return x.id === card.getAttribute('data-nid'); });
      if (fnd) renderNewsPost(fnd);
      return false;
    });
  });
  idx.querySelectorAll('.news-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var n = newsData.find(function (x) { return x.id === btn.getAttribute('data-nid'); });
      if (n) openNewsEditor(n);
    });
  });
  idx.querySelectorAll('.news-del-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteNews(btn.getAttribute('data-nid'));
    });
  });
}

function showNewsIndex(html) {
  var idx = document.getElementById('newsIndex');
  idx.innerHTML = html;
  var addBtn = byId('newsAddBtn');
  if (addBtn) addBtn.addEventListener('click', function () { openNewsEditor(null); });
}

/* ─── страница новости ─── */
function renderNewsPost(n) {
  var post = document.getElementById('newsPost');
  var idx = document.getElementById('newsIndex');
  if (post) post.style.display = 'block';
  if (idx) idx.classList.add('hidden');
  if (!post) return;
  post.innerHTML = '';
  var back = document.createElement('a');
  back.className = 'news-back';
  back.href = '#';
  back.textContent = '← Все новости';
  back.addEventListener('click', function () { renderNewsIndex(); return false; });
  post.appendChild(back);

  var box = document.createElement('div');
  box.className = 'news-post';
  var info = newsAuthorInfo(n);
  box.innerHTML =
    '<div class="news-post-head">' +
      '<div class="news-post-author">' +
        avatarHtml(info.avatar, 40) +
        '<div class="news-post-meta">' +
          '<span class="news-post-nick">' + esc(info.nick) + '</span>' +
          '<span class="news-post-role">' + roleLabel(info.role) + '</span>' +
        '</div>' +
        '<span class="news-post-date">' + fmtNewsDate(n.created_at) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="news-post-body">' +
      '<div class="news-post-title">' + esc(n.title) + '</div>' +
      newsContentHtml(n.content) +
    '</div>';
  post.appendChild(box);

  if (currentUser && currentUser.role === 'creator') {
    var edBar = document.createElement('div');
    edBar.className = 'news-admin-bar';
    edBar.style.marginTop = '12px';
    edBar.innerHTML =
      '<button type="button" class="support-btn news-edit-btn" data-nid="' + n.id + '">✎ Редактировать</button>' +
      '<button type="button" class="support-btn-danger news-del-btn" data-nid="' + n.id + '">✕ Удалить</button>';
    post.appendChild(edBar);
    edBar.querySelector('.news-edit-btn').addEventListener('click', function () { openNewsEditor(n); });
    edBar.querySelector('.news-del-btn').addEventListener('click', function () { deleteNews(n.id); });
  }
  post.scrollIntoView();
}

/* ─── модал редактора ─── */
function buildNewsModal() {
  if (document.getElementById('newsModal')) return;
  var m = document.createElement('div');
  m.className = 'support-modal';
  m.id = 'newsModal';
  m.innerHTML =
    '<div class="support-modal-box">' +
      '<div class="support-modal-title" id="newsModalTitle">Новая новость</div>' +
      '<div class="support-modal-label">Заголовок</div>' +
      '<input id="newsInputTitle" type="text" placeholder="Короткий заголовок новости">' +
      '<div class="support-modal-label">Анонс (показывается в списке)</div>' +
      '<input id="newsInputExcerpt" type="text" placeholder="О чём эта новость...">' +
      '<div class="support-modal-label">Текст новости (каждый абзац — с новой строки)</div>' +
      '<textarea id="newsInputContent" rows="10" placeholder="Привет! Вот что нового..."></textarea>' +
      '<div class="sup-close-error" id="newsError"></div>' +
      '<div class="support-modal-btns">' +
        '<button class="support-btn support-btn-ghost" id="newsCancelBtn">Отмена</button>' +
        '<button class="support-btn support-btn-primary" id="newsSaveBtn">Опубликовать</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function (e) { if (e.target === m) closeNewsModal(); });
  document.getElementById('newsCancelBtn').addEventListener('click', closeNewsModal);
  document.getElementById('newsSaveBtn').addEventListener('click', saveNews);
}

function openNewsEditor(n) {
  if (!currentUser || currentUser.role !== 'creator') return;
  buildNewsModal();
  editingNewsId = n ? n.id : null;
  document.getElementById('newsModalTitle').textContent = n ? 'Редактировать новость' : 'Новая новость';
  document.getElementById('newsSaveBtn').textContent = n ? 'Сохранить' : 'Опубликовать';
  document.getElementById('newsInputTitle').value = n ? n.title : '';
  document.getElementById('newsInputExcerpt').value = n ? (n.excerpt || '') : '';
  document.getElementById('newsInputContent').value = n ? (n.content || '') : '';
  document.getElementById('newsError').style.display = 'none';
  document.getElementById('newsModal').classList.add('open');
  setTimeout(function () { document.getElementById('newsInputTitle').focus(); }, 60);
}

function closeNewsModal() {
  var m = document.getElementById('newsModal');
  if (m) m.classList.remove('open');
  editingNewsId = null;
}

async function saveNews() {
  var title = document.getElementById('newsInputTitle').value.trim();
  var excerpt = document.getElementById('newsInputExcerpt').value.trim();
  var content = document.getElementById('newsInputContent').value.trim();
  var err = document.getElementById('newsError');
  err.style.display = 'none';
  if (!title) { err.textContent = 'Заголовок не может быть пустым'; err.style.display = 'block'; return; }
  if (!content) { err.textContent = 'Текст новости не может быть пустым'; err.style.display = 'block'; return; }
  if (!currentUser || !currentUser.token) { err.textContent = 'Не авторизован'; err.style.display = 'block'; return; }

  var res;
  if (editingNewsId) {
    res = await rpc('update_news', {
      p_token: currentUser.token, p_news_id: editingNewsId,
      p_title: title, p_excerpt: excerpt, p_content: content
    });
  } else {
    res = await rpc('publish_news', {
      p_token: currentUser.token, p_title: title, p_excerpt: excerpt, p_content: content
    });
  }
  var d = res.data;
  if (res.error || (d && d.error)) {
    err.textContent = d && d.error ? d.error : 'Ошибка';
    err.style.display = 'block';
    return;
  }
  closeNewsModal();
  await loadNews();
}

async function deleteNews(nid) {
  if (!currentUser || !currentUser.token) return;
  if (!confirm('Удалить эту новость?')) return;
  var res = await rpc('delete_news', { p_token: currentUser.token, p_news_id: nid });
  var d = res.data;
  if (res.error || (d && d.error)) { alert(d && d.error ? d.error : 'Ошибка удаления'); return; }
  await loadNews();
}

/* ─── хэш-роутинг ─── */
function initNewsFromHash() {
  var hash = location.hash;
  var m = hash && hash.match(/^#post-(.+)$/);
  if (m) {
    var found = newsData.find(function (n) { return n.id === m[1]; });
    if (found) { renderNewsPost(found); return; }
  }
  renderNewsIndex();
}

function onAuthChange() { loadNews(); }

document.addEventListener('DOMContentLoaded', function () { loadNews(); });
window.addEventListener('hashchange', initNewsFromHash);
