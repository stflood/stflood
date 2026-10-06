/* ─── меню (только телефон) ─── */

var MENU_KEY = 'stflood_menu_open';
var sidebar = document.getElementById('sidebar');
var backdrop = document.getElementById('sidebarBackdrop');
var isMobile = function () { return window.innerWidth <= 900; };

function menuSave(on) {
  try {
    if (on) sessionStorage.setItem(MENU_KEY, '1');
    else sessionStorage.removeItem(MENU_KEY);
  } catch (e) { /* noop */ }
}

function openMenu() {
  if (!isMobile()) return;
  document.body.classList.remove('menu-close');
  document.body.classList.add('menu-open');
  if (sidebar) sidebar.classList.remove('closed');
  menuSave(true);
}

function closeMenu() {
  if (!isMobile()) return;
  document.body.classList.remove('menu-open');
  document.body.classList.add('menu-close');
  if (sidebar) sidebar.classList.add('closed');
  menuSave(false);
}

function toggleMenu() {
  if (document.body.classList.contains('menu-open')) closeMenu();
  else openMenu();
}

document.addEventListener('DOMContentLoaded', function () {
  var mt = document.getElementById('menuToggle');
  if (mt) mt.addEventListener('click', toggleMenu);

  var sc = document.getElementById('sidebarClose');
  if (sc) sc.addEventListener('click', closeMenu);

  if (backdrop) backdrop.addEventListener('click', closeMenu);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* пункты меню не закрывают панель — запоминаем, чтобы она осталась
     открытой на следующей странице */
  var sa = document.querySelectorAll('.sidebar .tabs a');
  for (var si = 0; si < sa.length; si++) {
    sa[si].addEventListener('click', function () { menuSave(true); });
  }

  /* восстанавливаем открытое меню после перехода */
  var saved = null;
  try { saved = sessionStorage.getItem(MENU_KEY); } catch (e) { }
  if (saved) openMenu();

  window.addEventListener('resize', function () {
    if (!isMobile()) {
      document.body.classList.remove('menu-open', 'menu-close');
      if (sidebar) sidebar.classList.remove('closed');
    }
  });
});