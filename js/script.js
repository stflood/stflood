var cultBtn = document.querySelector('.cults-btn');
if (cultBtn) {
  cultBtn.addEventListener('click', function () {
    document.getElementById('cults').classList.toggle('open');
  });
}