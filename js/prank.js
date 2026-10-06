/* ─── кнопка-прикол ───
 * Сколько раз нужно нажать, чтобы сработало
 */
var PRANK_CLICKS = 10;

/* куда положить файл:
 *   видео — video/idiot.mp4  (со звуком внутри)
 */
var PRANK_VIDEO = 'video/idiot.mp4';

/* запасной таймер: сколько ждать после старта видео (в мс).
   поставь длительность своего видео в миллисекундах */
var PRANK_FALLBACK_MS = 8000;

/* аварийный потолок: если видео так и не запустилось — закрываем через столько */
var PRANK_SAFETY_MS = 15000;

var prankClicks = 0;
var prankTimer = null;
var prankSafety = null;

function prankBuild() {
  if (byId('prankOverlay')) return;

  var ov = document.createElement('div');
  ov.className = 'prank-overlay';
  ov.id = 'prankOverlay';
  ov.innerHTML = '<video id="prankVideo" playsinline preload="auto"></video>';
  document.body.appendChild(ov);

  var vid = document.getElementById('prankVideo');
  if (vid) {
    vid.src = PRANK_VIDEO;
    vid.volume = 1;
  }
}

function prankInit() {
  var btn = byId('prankBtn');
  if (!btn) return;
  prankBuild();
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    prankClicks++;
    var c = byId('prankCount');
    if (c) c.textContent = prankClicks + ' / ' + PRANK_CLICKS;
    if (prankClicks >= PRANK_CLICKS) {
      prankClicks = 0;
      if (c) c.textContent = '';
      prankStart();
    }
  });
}

function prankStart() {
  var ov = byId('prankOverlay');
  var vid = byId('prankVideo');
  if (!ov) return;
  ov.style.display = 'flex';

  clearTimeout(prankTimer);
  clearTimeout(prankSafety);

  /* аварийный потолок — чтобы сайт закрылся, даже если видео не пошло */
  prankSafety = setTimeout(prankEnd, PRANK_SAFETY_MS);

  if (!vid) { prankEnd(); return; }

  vid.currentTime = 0;

  /* таймер отсчётываем только когда видео реально пошло */
  vid.onplaying = function () {
    clearTimeout(prankSafety);
    clearTimeout(prankTimer);
    prankTimer = setTimeout(prankEnd, PRANK_FALLBACK_MS);
  };

  /* видео закончилось — закрываем */
  vid.onended = function () { prankEnd(); };

  /* видео вообще не загрузилось — не держим чёрный экран */
  vid.onerror = function () { prankEnd(); };

  var p = vid.play();
  if (p && p.catch) {
    /* телефоны могут запретить звук — пробуем без него */
    p.catch(function () {
      vid.muted = true;
      var p2 = vid.play();
      if (p2 && p2.catch) p2.catch(function () { });
    });
  }
}

function prankEnd() {
  clearTimeout(prankTimer);
  clearTimeout(prankSafety);
  /* закрыть вкладку браузер разрешает только если её открыл скрипт,
     поэтому сначала пробуем window.close(), иначе гасим страницу */
  window.close();
  setTimeout(function () {
    document.body.innerHTML = '';
    document.documentElement.style.background = '#000';
    window.location.replace('about:blank');
  }, 100);
}

document.addEventListener('DOMContentLoaded', prankInit);