/* ─── Новости: список и страничка новости ─── */

function newsPaper(title, contentHtml) {
  var box = document.createElement('div');
  box.className = 'news-post';
  var head = document.createElement('div');
  head.className = 'news-post-head';
  head.innerHTML =
    '<div class="news-post-date">' + title.date + '</div>' +
    '<div class="news-post-title">' + title.title + '</div>' +
    '<div class="news-post-author">Автор: The Second Coming · Создатель сайта</div>';
  box.appendChild(head);
  var body = document.createElement('div');
  body.className = 'news-post-body';
  body.innerHTML = contentHtml;
  box.appendChild(body);
  return box;
}

function renderNewsIndex() {
  var idx = document.getElementById('newsIndex');
  idx.classList.remove('hidden');
  document.getElementById('newsPost').style.display = 'none';
  idx.innerHTML = '';
  NEWS.forEach(function (n, i) {
    var card = document.createElement('a');
    card.className = 'news-card' + (i === 0 ? ' news-card-new' : '');
    card.href = '#post-' + n.id;
    card.innerHTML =
      '<div class="news-card-top">' +
        (i === 0 ? '<span class="news-badge-new">Новая</span>' : '<span></span>') +
        '<span class="news-card-date">' + n.date + '</span>' +
      '</div>' +
      '<div class="news-card-title">' + n.title + '</div>' +
      '<div class="news-card-excerpt">' + n.excerpt + '</div>';
    card.addEventListener('click', function () {
      renderNewsPost(n);
      return false;
    });
    idx.appendChild(card);
  });
}

function renderNewsPost(n) {
  var post = document.getElementById('newsPost');
  post.style.display = 'block';
  document.getElementById('newsIndex').classList.add('hidden');
  post.innerHTML = '';
  var back = document.createElement('a');
  back.className = 'news-back';
  back.href = '#';
  back.textContent = '← Все новости';
  back.addEventListener('click', function () {
    renderNewsIndex();
    return false;
  });
  post.appendChild(back);
  post.appendChild(newsPaper(n, n.content.map(function (p) { return '<p>' + p + '</p>'; }).join('')));
  post.scrollIntoView();
}

function initNews() {
  var hash = location.hash;
  var m = hash && hash.match(/^#post-(.+)$/);
  if (m) {
    var found = null;
    NEWS.forEach(function (n) { if (n.id === m[1]) found = n; });
    if (found) { renderNewsPost(found); return; }
  }
  renderNewsIndex();
}

document.addEventListener('DOMContentLoaded', initNews);
window.addEventListener('hashchange', initNews);