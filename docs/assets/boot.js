/* Выполняется до отрисовки страницы: помечает страницу классами js и no-intro.
   Вынесен из index.html в отдельный файл, чтобы можно было запретить встроенные скрипты (CSP). */
(function (d) {
  d.classList.add('js');
  try { if (sessionStorage.getItem('ls_intro')) d.classList.add('no-intro'); } catch (e) { /* без sessionStorage заставка покажется снова */ }
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('no-intro');
  if (window.LS_PRERENDER) d.classList.add('no-intro');
})(document.documentElement);
