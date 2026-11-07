/* html-slides: navigation, the black screen and the QR code. No network, no build step.
   Keys: → ↓ Space PageDown Enter next · ← ↑ PageUp Backspace back · Home End
         B or . black screen · F full screen.  A click or a swipe moves on as well.
   The deck keeps its place in the address (#3 is slide 3), so a reload stays put. */
(function () {
  'use strict';

  var root = document.querySelector('.deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
  var index = 0;

  function fromHash() {
    var n = parseInt(location.hash.slice(1), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  function go(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (slide, n) {
      var current = n === index;
      slide.classList.toggle('is-current', current);
      if (current) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    if (fromHash() !== index && history.replaceState) history.replaceState(null, '', '#' + (index + 1));
    return index;
  }

  function black(on) {
    root.classList.toggle('is-blacked', on === undefined ? !root.classList.contains('is-blacked') : on);
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
  }

  function renderQR(el) {
    if (typeof qrcode !== 'function' || el.querySelector('svg')) return;
    var qr = qrcode(0, 'M');
    qr.addData(el.getAttribute('data-qr'));
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    var svg = el.querySelector('svg');
    svg.setAttribute('aria-hidden', 'true');
  }

  var keys = {
    ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1,
    ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1,
  };

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (keys[e.key]) {
      black(false);
      go(index + keys[e.key]);
    } else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') black();
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else return;
    e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    black(false);
    go(index + (e.clientX < window.innerWidth / 4 ? -1 : 1));
  });

  var touchX = null;
  document.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  });

  window.addEventListener('hashchange', function () { go(fromHash()); });

  Array.prototype.forEach.call(document.querySelectorAll('.slide__qr[data-qr]'), renderQR);
  go(fromHash());

  window.deck = {
    go: go,
    black: black,
    get index() { return index; },
    get count() { return slides.length; },
    get blacked() { return root.classList.contains('is-blacked'); },
  };
})();
