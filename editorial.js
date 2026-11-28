(() => {
  'use strict';
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  const mobile = window.matchMedia('(max-width: 600px)');
  function closeMenu(restore = false) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
    navigation.classList.remove('open');
    if (restore) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    const opened = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(opened));
    menuButton.setAttribute('aria-label', opened ? 'Закрыть меню' : 'Открыть меню');
    navigation.classList.toggle('open', opened);
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.header')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  mobile.addEventListener('change', () => closeMenu());

  const slides = [
    { title: 'Бобслейная трасса', image: 'assets/editorial/hero-wide.webp', mobileImage: 'assets/editorial/hero-mobile.webp', alt: 'Вид вперёд на бобслейную трассу', desktopFilm: 'bobsleigh-archive', mobileFilm: 'sanki-warm-pov' },
    { title: 'Квадротуры', image: 'assets/examples/atv-tour.webp', alt: 'Квадроциклы на лесном маршруте', desktopFilm: 'atv-tour', mobileFilm: 'atv-tour' },
    { title: 'Рафтинг', image: 'assets/examples/rafting.webp', alt: 'Вид из лодки на реку и горы', desktopFilm: 'rafting', mobileFilm: 'rafting' }
  ];
  let slide = 0;
  const source = document.querySelector('#hero-picture source');
  const image = document.querySelector('#hero-image');
  const slideButtons = [...document.querySelectorAll('[data-slide]')];
  function selectSlide(index, focus = false) {
    slide = (index + slides.length) % slides.length;
    const current = slides[slide];
    source.srcset = current.mobileImage || current.image;
    image.src = current.image;
    image.alt = current.alt;
    slideButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === slide)));
    document.querySelector('#slide-status').textContent = `${current.title}, ${slide + 1} из 3`;
    document.querySelector('.hero-play').setAttribute('aria-label', `Смотреть заезд: ${current.title}`);
    if (focus) slideButtons[slide].focus();
  }
  slideButtons.forEach((button, index) => button.addEventListener('click', () => selectSlide(index)));
  document.querySelector('.carousel-controls').addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = slide + 1;
    if (event.key === 'ArrowLeft') next = slide - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = slides.length - 1;
    if (next !== undefined) { event.preventDefault(); selectSlide(next, true); }
  });

  const films = [...document.querySelectorAll('[data-film]')];
  const viewer = document.querySelector('#viewer');
  const video = document.querySelector('#video');
  const retry = document.querySelector('.retry');
  const status = document.querySelector('.video-status');
  let filmIndex = 0;
  let trigger;
  let savedMuted = false;
  let savedVolume = 1;
  let generation = 0;
  function play() {
    const request = generation;
    status.textContent = '';
    retry.hidden = true;
    const promise = video.play();
    if (promise) promise.catch(error => {
      if (request !== generation || !viewer.open || error.name === 'AbortError') return;
      retry.hidden = false;
      status.textContent = 'Нажмите «Воспроизвести видео», чтобы начать просмотр.';
    });
  }
  function loadFilm(index) {
    generation += 1;
    video.pause();
    filmIndex = (index + films.length) % films.length;
    const link = films[filmIndex];
    video.src = link.getAttribute('href');
    video.poster = link.querySelector('img').getAttribute('src');
    video.style.aspectRatio = `${link.dataset.width}/${link.dataset.height}`;
    video.muted = savedMuted;
    video.volume = savedVolume;
    document.querySelector('#viewer-title').textContent = link.dataset.title;
    document.querySelector('#viewer-counter').textContent = `${filmIndex + 1} / ${films.length}`;
    video.load();
    play();
  }
  function openFilm(index, element) {
    trigger = element;
    closeMenu();
    if (!viewer.open) viewer.showModal();
    loadFilm(index);
  }
  function cleanup() {
    generation += 1;
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
    retry.hidden = true;
    status.textContent = '';
  }
  function closeViewer() {
    cleanup();
    if (viewer.open) viewer.close();
    trigger?.focus({ preventScroll: true });
  }
  films.forEach((link, index) => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openFilm(index, link);
  }));
  document.querySelector('.hero-play').addEventListener('click', event => {
    const id = mobile.matches ? slides[slide].mobileFilm : slides[slide].desktopFilm;
    openFilm(films.findIndex(link => link.dataset.film === id), event.currentTarget);
  });
  document.querySelector('.close').addEventListener('click', closeViewer);
  viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  viewer.addEventListener('close', () => { if (!viewer.open) cleanup(); });
  viewer.addEventListener('click', event => {
    if (event.target === viewer) {
      const box = viewer.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeViewer();
    }
  });
  document.querySelector('#previous').addEventListener('click', () => loadFilm(filmIndex - 1));
  document.querySelector('#next').addEventListener('click', () => loadFilm(filmIndex + 1));
  retry.addEventListener('click', play);
  video.addEventListener('volumechange', () => { savedMuted = video.muted; savedVolume = video.volume; });
  video.addEventListener('error', () => {
    if (!viewer.open || !video.hasAttribute('src')) return;
    retry.hidden = false;
    status.textContent = 'Не удалось загрузить видео. Проверьте соединение и попробуйте ещё раз.';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
})();
