/* GWS project page v5 - vanilla JS: lightbox, nav highlighting + progress, entrance fades, lazy in-view
   autoplay, the 2.2 playback controls + inline-SVG drift curves, and the side rails of looping rollouts. No dependencies. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  /* Evaluated at use time so a resize across 600px before a video attaches picks the right variant. */
  function phone() { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- Lightbox (click a figure to enlarge; Esc / backdrop / button closes) ---------- */
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  var lbCap = lb.querySelector('figcaption');
  var lbClose = lb.querySelector('.lb-close');
  var lastFocus = null;

  function openLightbox(src, alt, caption, wide) {
    lastFocus = document.activeElement;
    lbImg.src = src;
    lbImg.alt = alt || '';
    lbCap.textContent = caption || alt || '';
    lb.classList.toggle('wide', !!wide);
    lb.classList.add('open');
    lb.scrollTop = 0; lb.scrollLeft = 0; /* after 'open': a display:none box ignores scroll assignments */
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lb-lock');
    lbClose.focus();
  }
  function openFromImage(img) {
    var fig = img.closest('figure');
    var cap = fig ? fig.querySelector('figcaption') : null;
    openLightbox(img.currentSrc || img.src, img.alt, cap ? cap.textContent : img.alt, img.getAttribute('data-lb') === 'wide');
  }
  function closeLightbox() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lb-lock');
    lbImg.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function wireZoom(img) {
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge figure: ' + img.alt);
    img.addEventListener('click', function () { openFromImage(img); });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromImage(img); }
    });
  }
  each(document.querySelectorAll('img.zoom'), wireZoom);
  lbClose.addEventListener('click', closeLightbox);
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
    if (e.key === 'Tab') { e.preventDefault(); lbClose.focus(); } /* single focusable element: trap focus */
  });

  /* ---------- Sticky nav: highlight the section being read + scroll-progress hairline ----------
     A reference line sits 45% down the viewport; the link of the LAST heading above it is active - 2.1 and 2.3-2.5 belong to
     Results, 2.2 to Comparison, the "Try it live" section to Demo - and above the Demo heading (the hero) no link is active.
     Recomputed with the hairline. */
  var navLinks = {};
  each(document.querySelectorAll('.nav li a[href^="#"]'), function (a) { navLinks[a.getAttribute('href').slice(1)] = a; });
  var navTargets = []; /* document order */
  [['demo', 'demo'], ['method', 'method'], ['results', 'results'], ['comparison', 'comparison'], ['poleval', 'results'], ['cotrain', 'results'], ['ablation', 'results']]
    .forEach(function (pair) { var el = document.getElementById(pair[0]), a = navLinks[pair[1]]; if (el && a) navTargets.push({ el: el, a: a }); });
  function updateNav() {
    var line = window.innerHeight * 0.45, cur = null;
    navTargets.forEach(function (t) { if (t.el.getBoundingClientRect().top <= line) cur = t.a; });
    each(document.querySelectorAll('.nav li a[href^="#"]'), function (a) { a.classList.toggle('active', a === cur); });
  }
  var bar = document.querySelector('.progress span');
  var barQueued = false;
  function drawBar() {
    barQueued = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    updateNav();
  }
  window.addEventListener('scroll', function () { if (!barQueued) { barQueued = true; requestAnimationFrame(drawBar); } }, { passive: true });
  window.addEventListener('resize', drawBar);
  window.addEventListener('load', drawBar);
  drawBar();

  /* ---------- Entrance fades: .reveal gets .in once it scrolls into view (CSS no-ops under reduced motion) ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    each(reveals, function (el) { el.classList.add('in'); });
  } else {
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    each(reveals, function (el) { rio.observe(el); });
    /* Safety net: nothing stays hidden if an observer never fires (e.g. print, odd embeds). */
    setTimeout(function () { each(reveals, function (el) { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in'); }); }, 1500);
  }

  /* ---------- Live demo ("Try it live"): the embed iframe is injected ONLY when the reader clicks the poster - never on page load
     or on scroll. The demo host has one interactive slot and the embed opens its session socket as soon as its page loads, so an
     iframe created for a passing reader would take the slot (or queue in the lobby) for nobody; hand mode asks for the webcam, which
     must never happen before a click. Offline handling: the host's /healthz has no CORS headers, so it is probed with a no-cors
     fetch (an opaque response means the host answered; a rejection means it is down), and the iframe's load event gets a timeout;
     either failure removes the frame and the hint reads "The live demo is offline right now." with a retry button. ---------- */
  (function demo() {
    var box = document.getElementById('demo-box'); if (!box) return;
    var poster = box.querySelector('.demo-poster'), btn = box.querySelector('.demo-load'), hint = box.querySelector('.demo-hint');
    var src = box.getAttribute('data-src'), health = box.getAttribute('data-health'), idleHint = hint.textContent;
    var PROBE_MS = 8000, LOAD_MS = 20000;
    var frame = null, loadTimer = null, attempt = 0;
    function setState(state) { box.classList.remove('loading', 'live', 'offline'); if (state) box.classList.add(state); }
    function dropFrame() { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } if (frame && frame.parentNode) frame.parentNode.removeChild(frame); frame = null; }
    function offline() { dropFrame(); setState('offline'); hint.textContent = 'The live demo is offline right now.'; btn.textContent = 'Try again'; btn.disabled = false; }
    function live() { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } setState('live'); btn.disabled = false; poster.setAttribute('aria-hidden', 'true'); }
    function load() {
      if (box.classList.contains('loading') || box.classList.contains('live')) return;
      var my = ++attempt;
      setState('loading'); hint.textContent = idleHint; btn.textContent = 'Loading\u2026'; btn.disabled = true;
      /* reachability probe, in parallel with the frame; a slow probe never blocks a frame that loads */
      if (health && window.fetch) {
        var settled = false;
        var probe = fetch(health, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' });
        probe.then(function () { settled = true; }, function () { if (!settled && my === attempt) { settled = true; offline(); } });
        setTimeout(function () { settled = true; }, PROBE_MS);
      }
      frame = document.createElement('iframe');
      frame.src = src; frame.title = 'Live interactive demo'; frame.allow = 'camera; microphone; serial'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('allowfullscreen', ''); frame.setAttribute('loading', 'eager');
      frame.addEventListener('load', function () { if (my === attempt && frame) live(); });
      frame.addEventListener('error', function () { if (my === attempt) offline(); });
      loadTimer = setTimeout(function () { if (my === attempt && !box.classList.contains('live')) offline(); }, LOAD_MS);
      box.insertBefore(frame, poster);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); load(); });
    poster.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) return; load(); });
  })();

  /* ---------- Lazy in-view autoplay for short, silent animations (video[data-autoplay]) ----------
     Sources are attached only when the video approaches the viewport (keeps the page light), playback
     starts muted when in view and pauses when scrolled away. A video already in the first screen (the hero) is attached and
     played right away, without waiting for the observer's first callback. play() failures are retried (tryPlay): a refused
     play (NotAllowedError, the browser wants a gesture) shows the frame's paused glyph so a click on the video plays it (never
     the native controls, which would make our click handler step aside), anything else (an AbortError from a load() racing the
     play(), a stream not yet decodable) is retried on 'canplay'; a video paused while the tab was hidden is resumed when the tab
     becomes visible; a stream that fails to load or breaks gets one retry with cache-busting URLs (retryLoad). Phone variants via data-src-mobile /
     data-poster-mobile. With prefers-reduced-motion a video with data-static is swapped for its static figure (zoomable);
     other videos show controls (a video with its own controls bar, data-controls, keeps that bar instead) and do not autoplay. On phones a video marked
     data-phone-static is swapped the same way (a 16:9 chart animation at 348px wide is unreadable); when it has no stacked
     phone static, the lightbox opens the desktop figure wide (horizontally scrollable). */
  each(document.querySelectorAll('video[data-static]'), function (v) {
    var rm = reduceMotion && v.hasAttribute('data-autoplay');
    var ph = phone() && v.hasAttribute('data-phone-static');
    if (!rm && !ph) return;
    var img = document.createElement('img');
    img.className = 'zoom';
    var mobile = phone() && v.getAttribute('data-static-mobile');
    img.src = mobile || v.getAttribute('data-static');
    img.alt = v.getAttribute('data-static-alt') || v.getAttribute('aria-label') || '';
    var wh = ((mobile && v.getAttribute('data-static-size-mobile')) || v.getAttribute('data-static-size') || '').split('x');
    if (wh.length === 2) { img.width = +wh[0]; img.height = +wh[1]; }
    if (ph && !mobile) img.setAttribute('data-lb', 'wide');
    v.parentNode.replaceChild(img, v);
    wireZoom(img);
  });
  var autos = document.querySelectorAll('video[data-autoplay]');
  function attachSources(v) {
    if (v.getAttribute('data-attached')) return;
    v.setAttribute('data-attached', '1');
    var mp4 = (phone() && v.getAttribute('data-src-mobile')) || v.getAttribute('data-src');
    var webm = (phone() && v.getAttribute('data-webm-mobile')) || v.getAttribute('data-webm');
    var poster = (phone() && v.getAttribute('data-poster-mobile'));
    if (poster) v.poster = poster;
    if (webm) { var s1 = document.createElement('source'); s1.src = webm; s1.type = 'video/webm'; v.appendChild(s1); }
    if (mp4) { var s2 = document.createElement('source'); s2.src = mp4; s2.type = 'video/mp4'; v.appendChild(s2); }
    /* when every <source> failed the browser fires 'error' on the LAST one (not on the video): retry from there */
    var last = v.lastElementChild; if (last && last.tagName === 'SOURCE') last.addEventListener('error', function () { retryLoad(v); });
    v.load();
  }
  /* one retry for a stream that fails or breaks - a file swapped mid-download, a truncated copy the HTTP cache keeps serving -
     with fresh URLs (an extra r= query) so the cache is bypassed; after that the poster stays */
  function retryLoad(v) {
    if (v.retried || !v.getAttribute('data-attached')) return;
    v.retried = true;
    setTimeout(function () {
      each(v.querySelectorAll('source'), function (s) { s.src += (s.src.indexOf('?') >= 0 ? '&' : '?') + 'r=' + Date.now(); });
      v.load(); if (!reduceMotion && v.offscreen !== true) tryPlay(v);
    }, 1000);
  }
  function prepVideo(v) {
    v.muted = true; v.loop = !(v.getAttribute('data-hold-end') || v.hasAttribute('data-once')); v.setAttribute('playsinline', '');
    var pm = phone() && v.getAttribute('data-poster-mobile');
    if (pm) v.poster = pm;
    var sm = phone() && v.getAttribute('data-size-mobile'); /* "WxH": reserve the phone variant's box before it loads */
    if (sm) { var wh = sm.split('x'); v.setAttribute('width', wh[0]); v.setAttribute('height', wh[1]); }
  }
  /* play() with a retry (see the note above); data-user-paused (an explicit click-pause) is always respected */
  function tryPlay(v) {
    if (v.getAttribute('data-user-paused')) return;
    /* data-once (owner 2026-10-14): the animation plays a single time when it first comes into view and then holds its last
       frame; scrolling away and back, or a tab becoming visible again, must not restart it (play() on an ended video seeks to 0) */
    if (v.hasAttribute('data-once') && v.ended) return;
    var p = v.play();
    if (p && p.catch) p.catch(function (e) {
      if (e && e.name === 'NotAllowedError') { /* the browser wants a gesture: the frame's paused glyph (a click on the video plays it) */
        if (v.hasAttribute('data-controls')) return;
        var f = v.parentNode; if (f && f.classList && f.classList.contains('frame')) f.classList.add('paused'); else v.controls = true;
        return;
      }
      if (v.retryOn) return;
      v.retryOn = function () { v.removeEventListener('canplay', v.retryOn); v.retryOn = null; if (v.offscreen !== true) tryPlay(v); };
      v.addEventListener('canplay', v.retryOn);
    });
  }
  each(autos, function (v) {
    prepVideo(v);
    if (reduceMotion) { if (!v.hasAttribute('data-controls')) v.controls = true; attachSources(v); }
    v.addEventListener('error', function () { retryLoad(v); }); /* a decode error mid-stream */
    /* a refused autoplay showed the paused glyph; once something plays the video (a click, a later allowed play()) clear it */
    v.addEventListener('playing', function () { var f = v.parentNode; if (f && f.classList && f.classList.contains('frame') && !v.getAttribute('data-user-paused')) f.classList.remove('paused'); });
  });
  if (!reduceMotion && autos.length) {
    /* above the fold right now (the hero): do not wait for the observer */
    each(autos, function (v) { var r = v.getBoundingClientRect(); if (r.top < window.innerHeight && r.bottom > 0) { attachSources(v); tryPlay(v); } });
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          v.offscreen = !en.isIntersecting; /* read by the data-hold-end restart below */
          if (en.isIntersecting) { attachSources(v); tryPlay(v); }
          else if (!v.paused) { v.pause(); }
        });
      }, { rootMargin: '200px 0px', threshold: 0.1 });
      each(autos, function (v) { vio.observe(v); });
    } else {
      each(autos, function (v) { attachSources(v); tryPlay(v); });
    }
    /* a tab that loaded hidden (or a window that was occluded) defers autoplay: resume the in-view videos once it is visible */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      each(autos, function (v) { if (v.offscreen !== true && v.paused && v.getAttribute('data-attached')) tryPlay(v); });
    });
  }
  /* Click toggles play/pause on controls-less animations (keyboard: Enter/Space); the .frame wrapper shows a play glyph while paused.
     data-user-paused makes the in-view observer leave the video alone until the user resumes it. */
  function setUserPaused(v, pause) {
    if (pause) { v.setAttribute('data-user-paused', '1'); v.pause(); }
    else { v.removeAttribute('data-user-paused'); var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    var frame = v.parentNode && v.parentNode.classList.contains('frame') ? v.parentNode : null;
    if (frame) frame.classList.toggle('paused', pause);
    v.setAttribute('aria-label', (v.getAttribute('aria-label') || '').replace(/ \(paused\)$/, '') + (pause ? ' (paused)' : ''));
  }
  each(autos, function (v) {
    function toggle() { if (v.controls) return; setUserPaused(v, !v.paused); }
    v.addEventListener('click', toggle);
    v.setAttribute('tabindex', '0');
    v.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  /* data-sound: the video carries a soundtrack. Autoplay stays muted (browsers refuse autoplay with sound); the .snd button in the
     same .frame unmutes on a click (a user gesture, so play() with sound is allowed) and mutes again on the next click. */
  each(document.querySelectorAll('video[data-sound]'), function (v) {
    var frame = v.parentNode && v.parentNode.classList.contains('frame') ? v.parentNode : null;
    var btn = frame && frame.querySelector('.snd'); if (!btn) return;
    function setSound(on) {
      v.muted = !on; if (on) v.volume = 1;
      btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Mute the teaser soundtrack' : 'Unmute the teaser soundtrack');
      if (on && v.paused) { attachSources(v); setUserPaused(v, false); }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setSound(v.muted); });
    btn.addEventListener('keydown', function (e) { e.stopPropagation(); });
    v.addEventListener('volumechange', function () { if (btn.classList.contains('on') === v.muted) setSound(!v.muted); });
  });
  /* data-hold-end="S" (opt-in; such a video does not loop natively): after 'ended' the last frame holds for S seconds, then
     the clip restarts from 0 - unless it was click-paused or scrolled away meanwhile; then nothing happens until the observer
     above plays it again (play() on an ended video seeks to the start). 'play' / 'pause' clear a pending restart. */
  each(autos, function (v) {
    var hold = parseFloat(v.getAttribute('data-hold-end') || '');
    if (!(hold > 0)) return;
    var timer = null;
    function clear() { if (timer) { clearTimeout(timer); timer = null; } }
    v.addEventListener('ended', function () {
      clear();
      timer = setTimeout(function () {
        timer = null;
        if (v.getAttribute('data-user-paused') || v.offscreen) return;
        v.currentTime = 0;
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      }, hold * 1000);
    });
    v.addEventListener('play', clear);
    v.addEventListener('pause', clear);
  });

  /* ---------- 2.2 controls + drift curves ----------
     The comparison asset is a 60-s rollout re-timed to 15 s, so ROLLOUT time = video.currentTime * 4; every readout here is in
     rollout time ("0:30 / 1:00", the scrubber's 0-60 s, the curves' cursor). The controls bar (play/pause, scrubber, speed 1x | 4x =
     playbackRate 0.25 / 1, 4x selected by default) sits in the same panel; clicking the video still toggles play. The drift curves
     are inline SVG, one panel per metric, drawn once from assets/data/drift.json: a faint complete ("ghost") polyline per series, a
     coloured copy whose points are RECOMPUTED every frame up to the cursor (the bins left of it + the linear interpolation at it -
     no clipPath: WebKit does not reliably repaint a clipped group when the clipPath geometry changes, which left the coloured
     curves frozen in Safari), a marker per bin that pops in when the cursor passes its centre, an ink cursor and a "t = N s"
     readout. DRIVE: one requestAnimationFrame loop runs whenever the combo card is on screen (IntersectionObserver on the card;
     it stops off screen and while the tab is hidden) and every frame reads the video's clock directly - currentTime, paused,
     readyState - and redraws the reveal, the cursor, the readout and the controls from currentTime alone; nothing depends on
     play / playing / timeupdate having been observed. The curves are drawn COMPLETE only while the video has never started
     (paused and currentTime < 0.05 s), so a reader whose video does not start (autoplay refused, a server without byte ranges)
     still sees the result instead of empty axes with 22%-opacity ghosts; a scrub, a click or autoplay moves the clock and the
     reveal follows; a loop wrap takes it back to 0. Each frame's draw is wrapped in try/catch (the first error is logged once,
     the loop keeps running). ?debug=1 in the URL adds a small overlay to the card with ct / paused / rs / ns / src / drawn / err.
     If the data cannot be fetched the panel shows the static figure (data-static). Phones: tabs show one metric at a time.
     Reduced motion changes nothing here (the videos do not autoplay, so the curves stay complete until the reader presses play;
     only the markers' pop transition is dropped, in CSS). Plain ES5 throughout (no arrow functions, template literals, optional
     chaining, replaceChildren, structuredClone). */
  (function cmp() {
    var m = document.getElementById('cmp-video'), card = document.getElementById('cmp-card');
    if (!m || !card) return;
    var RATE = 4, DUR = 60; /* rollout seconds per video second; rollout length */
    var ctl = card.querySelector('.ctl'), timeEl = card.querySelector('.time .t'), scrub = card.querySelector('.scrub');
    var speedBtns = card.querySelectorAll('.seg button[data-rate]'), tabBtns = card.querySelectorAll('.tabs button[data-metric]');
    var curves = card.querySelector('.curves');
    function fmt(t) { t = Math.max(0, Math.min(DUR, t)); var mm = Math.floor(t / 60), ss = Math.floor(t - mm * 60); return mm + ':' + (ss < 10 ? '0' : '') + ss; }
    function rolloutT() { return Math.max(0, Math.min(DUR, m.currentTime * RATE)); }

    /* ---- controls ---- */
    var scrubbing = false;
    function drawControls(t) {
      timeEl.textContent = fmt(t);
      if (!scrubbing) { scrub.value = t.toFixed(1); scrub.style.setProperty('--p', (t / DUR * 100).toFixed(2) + '%'); }
      scrub.setAttribute('aria-valuetext', fmt(t));
    }
    var lastPaused = null;
    function drawButton() { var paused = m.paused; if (paused === lastPaused) return; lastPaused = paused; ctl.classList.toggle('paused', paused); ctl.setAttribute('aria-label', paused ? 'Play' : 'Pause'); }
    ctl.addEventListener('click', function () { attachSources(m); setUserPaused(m, !m.paused); });
    function seekTo(t) {
      attachSources(m);
      m.currentTime = t / RATE;
      scrub.style.setProperty('--p', (t / DUR * 100).toFixed(2) + '%');
      lastKey = null; start(); /* the loop redraws from the new clock on the next frame */
    }
    scrub.addEventListener('pointerdown', function () { scrubbing = true; });
    scrub.addEventListener('input', function () { scrubbing = true; seekTo(parseFloat(scrub.value) || 0); });
    scrub.addEventListener('change', function () { scrubbing = false; seekTo(parseFloat(scrub.value) || 0); });
    window.addEventListener('pointerup', function () { scrubbing = false; });
    each(speedBtns, function (b) {
      b.addEventListener('click', function () {
        var r = parseFloat(b.getAttribute('data-rate')) || 1;
        m.defaultPlaybackRate = r; m.playbackRate = r; /* default too: a later load() would reset playbackRate */
        each(speedBtns, function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      });
    });
    m.addEventListener('play', drawButton); m.addEventListener('pause', drawButton); drawButton();

    /* ---- curves ---- */
    var NS = 'http://www.w3.org/2000/svg';
    var panels = []; /* { lines: [{el, xs, ys, all}], cursor, readout, marks: [{el, t}] } */
    var W = 300, H = 212, L = 44, R = 292, T = 26, B = 172; /* viewBox + plot box (title above, x ticks + readout below) */
    function el(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
    function xOf(t) { return L + (R - L) * t / DUR; }
    function niceTicks(lo, hi, better) {
      if (better === 'down' && lo > 0 && lo < 0.3 * hi) lo = 0; /* FID: start the axis at 0 */
      var span = hi - lo, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), step = mag;
      [1, 2, 2.5, 5, 10].some(function (k) { if (k * mag >= raw) { step = k * mag; return true; } return false; });
      var pad = 0.07 * span, y0 = lo === 0 ? 0 : lo - pad, y1 = hi + pad, ticks = [];
      for (var v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) ticks.push(+v.toFixed(6));
      return { y0: y0, y1: y1, ticks: ticks };
    }
    function colourOf(name) { return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim() || '#888'; }
    function build(data) {
      curves.textContent = '';
      var bins = data.bins_s, keys = Object.keys(data.metrics);
      keys.forEach(function (met, pi) {
        var meta = data.metrics[met];
        var vals = []; data.series.forEach(function (sr) { vals = vals.concat(sr[met]); });
        var ax = niceTicks(Math.min.apply(null, vals), Math.max.apply(null, vals), meta.better);
        function yOf(v) { return B - (B - T) * (v - ax.y0) / (ax.y1 - ax.y0); }
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'cpanel' + (met === curves.getAttribute('data-metric') ? ' on' : ''), 'aria-hidden': 'true', 'data-metric': met }, curves);
        el('text', { x: L, y: 15, 'class': 'ttl' }, svg).textContent = meta.label + ' ' + (meta.better === 'up' ? '\u2191' : '\u2193');
        ax.ticks.forEach(function (v) {
          var y = yOf(v).toFixed(1);
          el('line', { x1: L, x2: R, y1: y, y2: y, 'class': 'grid' }, svg);
          el('text', { x: L - 6, y: (+y + 4).toFixed(1), 'class': 'tick', 'text-anchor': 'end' }, svg).textContent = String(v);
        });
        el('line', { x1: L, x2: R, y1: B, y2: B, 'class': 'axis-line' }, svg);
        bins.forEach(function (c) { el('text', { x: xOf(c).toFixed(1), y: B + 15, 'class': 'tick', 'text-anchor': 'middle' }, svg).textContent = String(Math.round(c)); });
        var lines = [], marks = [];
        data.series.forEach(function (sr) {
          var col = colourOf(sr.colour), lw = sr.ours ? 2.6 : 1.6;
          var xs = bins.map(xOf), ys = sr[met].map(yOf);
          var pts = xs.map(function (x, i) { return x.toFixed(1) + ',' + ys[i].toFixed(1); }).join(' ');
          el('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': lw, 'stroke-linejoin': 'round', 'class': 'ghost' }, svg);
          lines.push({ el: el('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': lw, 'stroke-linejoin': 'round' }, svg), xs: xs, ys: ys, all: pts });
          bins.forEach(function (c, i) {
            var mk = el('circle', { cx: xs[i].toFixed(1), cy: ys[i].toFixed(1), r: sr.ours ? 3.4 : 2.6, fill: sr.ours ? '#fff' : col, stroke: col, 'stroke-width': sr.ours ? 1.8 : 1.4, 'class': 'mk' }, svg);
            marks.push({ el: mk, t: c });
          });
        });
        var cursor = el('line', { x1: L, x2: L, y1: T - 4, y2: B, 'class': 'cursor' }, svg);
        var readout = el('text', { x: L, y: B + 34, 'class': 'readout', 'text-anchor': 'middle' }, svg);
        panels.push({ lines: lines, cursor: cursor, readout: readout, marks: marks });
      });
      lastKey = null; start(); /* the new panels get drawn on the next frame */
    }
    /* the points of one series up to cursor x: every bin centre left of it, then the linear interpolation at x (nothing before
       the first bin, everything past the last) */
    function partial(ln, x) {
      var out = [];
      for (var i = 0; i < ln.xs.length; i++) {
        if (ln.xs[i] <= x) { out.push(ln.xs[i].toFixed(1) + ',' + ln.ys[i].toFixed(1)); continue; }
        if (i > 0) { var f = (x - ln.xs[i - 1]) / (ln.xs[i] - ln.xs[i - 1]); out.push(x.toFixed(1) + ',' + (ln.ys[i - 1] + f * (ln.ys[i] - ln.ys[i - 1])).toFixed(1)); }
        break;
      }
      return out.join(' ');
    }
    function drawCurves(t, full) { /* full: the complete curves (video never started); else the reveal up to the cursor */
      var x = xOf(t), xs = x.toFixed(2), rx = Math.min(R - 26, Math.max(L + 26, x)).toFixed(2), label = 't = ' + Math.floor(t + 1e-6) + ' s';
      for (var i = 0; i < panels.length; i++) {
        var p = panels[i], j;
        for (j = 0; j < p.lines.length; j++) p.lines[j].el.setAttribute('points', full ? p.lines[j].all : partial(p.lines[j], x));
        p.cursor.setAttribute('x1', xs); p.cursor.setAttribute('x2', xs);
        p.readout.setAttribute('x', rx); p.readout.textContent = label;
        for (j = 0; j < p.marks.length; j++) p.marks[j].el.classList.toggle('on', full || t >= p.marks[j].t);
      }
    }
    /* ---- drive: the rAF loop (see the note above) ---- */
    var inView = true, raf = 0, frames = 0, lastKey = null, firstErr = null, dbg = null;
    if (/[?&]debug=1(&|$)/.test(window.location.search)) { dbg = document.createElement('div'); dbg.className = 'cmp-debug'; dbg.setAttribute('aria-hidden', 'true'); card.appendChild(dbg); }
    function frame() {
      raf = 0;
      if (!inView || document.hidden) return; /* stopped; start() is called again by the observer / visibilitychange */
      frames++; /* counted before the draw, so the overlay shows the loop alive even while a draw keeps failing */
      try {
        var t = rolloutT(), full = m.paused && m.currentTime < 0.05, key = t.toFixed(3) + (full ? 'F' : 'L');
        if (key !== lastKey) { lastKey = key; drawControls(t); drawCurves(t, full); }
        drawButton();
      } catch (e) {
        if (!firstErr) { firstErr = e || new Error('unknown'); if (window.console) console.error('drift curves: draw failed', e); }
      }
      if (dbg) {
        dbg.textContent = 'ct=' + m.currentTime.toFixed(2) + ' paused=' + m.paused + ' rs=' + m.readyState + ' ns=' + m.networkState +
          ' src=' + (((m.currentSrc || '').split('/').pop() || '-').split('?')[0]) + ' drawn=' + frames + ' panels=' + panels.length +
          ' err=' + (firstErr ? (firstErr.name || 'Error') + ': ' + firstErr.message : '-');
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(frame); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) inView = entries[i].isIntersecting;
        if (inView) start();
      }, { rootMargin: '100px 0px' }).observe(card);
    }
    document.addEventListener('visibilitychange', start);
    m.addEventListener('play', start); m.addEventListener('seeking', start); /* belt and braces: the loop is normally running already */
    start();
    /* phone metric tabs */
    each(tabBtns, function (b) {
      b.addEventListener('click', function () {
        var met = b.getAttribute('data-metric');
        curves.setAttribute('data-metric', met);
        each(tabBtns, function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        each(curves.querySelectorAll('.cpanel'), function (p) { p.classList.toggle('on', p.getAttribute('data-metric') === met); });
      });
    });
    /* no data (404, offline, file://, no fetch): the static figure instead of an empty panel */
    function fallback(e) {
      if (window.console && e) console.warn('drift curves: ' + e);
      var st = curves.getAttribute('data-static');
      if (!st) return;
      var img = document.createElement('img'), wh = (curves.getAttribute('data-static-size') || '').split('x');
      img.src = st; img.alt = ''; if (wh.length === 2) { img.width = +wh[0]; img.height = +wh[1]; }
      curves.textContent = ''; curves.appendChild(img);
    }
    var src = curves.getAttribute('data-src');
    if (src && window.fetch) {
      fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(build).catch(fallback);
    } else fallback();
  })();

  /* ---------- 2.1 stage: 12 rollout cells -> right-hand rail ----------
     Desktop (>= 1180px, "flip" mode): the 6x2 grid (on the wide, centred stage - CSS) scrolls normally until its top reaches the nav (S0). From there,
     over SCRUB px of scrolling (the stage height + 16px: the flight ends exactly when the emptied stage's bottom edge
     reaches the nav, so no hole opens above the next heading), progress p goes 0 -> 1 and every cell is moved by a
     transform (translate + scale, GPU only) from its grid slot - which keeps sliding up with the page - to a slot of a
     single rail column on the right, with a per-cell stagger (top row first) and an ease-in-out curve; the content below
     rises under the flight as usual, so there is no dead scroll zone. Cells whose rail slot is below the fold dissolve
     on the way (they re-enter later by the drift). At p = 1 the cells layer (position:fixed since
     p > 0) gets a top/bottom fade mask and the column drifts (slow constant drift + scroll parallax); cells leaving one
     end are re-slotted N positions further so the 12 clips cycle without any source change. A nav button pauses the
     drift and the videos (sessionStorage). Reduced motion / data saver: the grid is poster images and stays in the flow;
     a second, fixed set of 12 posters becomes the rail (no scrub, no drift) once the grid has scrolled past.
     Below 1180px (or without JS): a plain responsive grid with in-view autoplay. */
  (function stage() {
    var fig = document.getElementById('diverse-media');
    var stage = document.getElementById('stage'), outer = document.getElementById('stage-outer'), layer = document.getElementById('cells');
    if (!fig || !stage || !outer || !layer) return;
    var cellEls = layer.querySelectorAll('.cell');
    var N = cellEls.length; if (!N) return;
    var toggleBtn = document.querySelector('.rail-toggle');
    var wrap = fig.closest('.wrap') || fig;
    var wide = window.matchMedia('(min-width: 1180px)');
    var staticOnly = reduceMotion || saveData;
    var probe = document.createElement('video');
    var useWebm = !!(probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9"'));
    /* COLS/ROWS = the flip-mode grid (6x2; must match the >= 1180px .cells rule in style.css) */
    var COLS = 6, ROWS = Math.ceil(N / COLS), GAP = 14, RAIL_GAP = 16, START_TOP = 70, NAV_H = 54, Y0 = 72, PARALLAX = 0.14, MAX_PLAYING = 8, SPEED = 50, STAGGER = 0.45, STORE = 'gws-rails-paused';
    var cells = [], railCells = [], layer2 = null;
    each(cellEls, function (el, i) {
      var v = el.querySelector('video');
      var c = { el: el, i: i, slot: i, playing: false, attached: false, media: v,
                poster: v.getAttribute('poster'), webm: v.getAttribute('data-webm'), mp4: v.getAttribute('data-src') };
      if (staticOnly) { /* posters only: no video element at all */
        var img = document.createElement('img'); img.src = c.poster; img.alt = ''; img.width = 256; img.height = 386; img.loading = 'lazy';
        v.parentNode.replaceChild(img, v); c.media = img; c.attached = true;
      } else { v.muted = true; v.loop = true; v.setAttribute('playsinline', ''); }
      cells.push(c);
    });
    railCells = cells;
    if (staticOnly) { /* reduced motion: a separate fixed set of posters becomes the rail; the grid stays in the flow */
      layer2 = document.createElement('div'); layer2.className = 'rail-clone'; layer2.setAttribute('aria-hidden', 'true');
      railCells = cells.map(function (c) {
        var d = document.createElement('div'); d.className = 'cell'; /* same structure as the grid cells: .vbox (poster + badge) over a caption row */
        var box = document.createElement('div'); box.className = 'vbox'; d.appendChild(box);
        var img = document.createElement('img'); img.src = c.poster; img.alt = ''; img.width = 256; img.height = 386; img.loading = 'lazy';
        box.appendChild(img);
        var b = document.createElement('span'); b.className = 'tag tag--media gen'; b.textContent = 'generated'; box.appendChild(b);
        var capEl = c.el.querySelector('.cap');
        if (capEl) { var b2 = document.createElement('span'); b2.className = 'cap'; b2.textContent = capEl.textContent; d.appendChild(b2); }
        layer2.appendChild(d);
        return { el: d, i: c.i, slot: c.i, playing: false, attached: true, media: img };
      });
      stage.appendChild(layer2);
    }
    function attach(c) {
      if (c.attached) return;
      c.attached = true;
      var src = document.createElement('source');
      src.src = useWebm ? c.webm : c.mp4; src.type = useWebm ? 'video/webm' : 'video/mp4';
      c.media.appendChild(src); c.media.load();
    }
    function play(c) { if (c.playing || staticOnly) return; c.playing = true; attach(c); var pr = c.media.play(); if (pr && pr.catch) pr.catch(function () {}); }
    function pause(c) { if (!c.playing) return; c.playing = false; c.media.pause(); }
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

    /* ---- plain mode (phones/tablets, and the grid under reduced motion): in-view autoplay per cell ---- */
    var plainIO = null;
    function plainOn() {
      if (plainIO || staticOnly || !('IntersectionObserver' in window)) return;
      plainIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var c = cells[+en.target.getAttribute('data-i')];
          if (en.isIntersecting) { if (!userPaused) play(c); } else pause(c);
        });
        updatePlayback(); /* keeps body[data-rail-playing] current in plain mode */
      }, { rootMargin: '200px 0px', threshold: 0.05 });
      cells.forEach(function (c) { c.el.setAttribute('data-i', String(c.i)); plainIO.observe(c.el); });
    }
    function plainOff() { if (!plainIO) return; plainIO.disconnect(); plainIO = null; }

    /* ---- flip mode state ---- */
    var flip = false, fixed = false, railMode = false, p = -1, running = false, lastT = 0, tick = 0;
    var drift = 0, slow = 1, slowTarget = 1, paused = false, userPaused = false;
    var g = {}; /* geometry */
    try { paused = window.sessionStorage.getItem(STORE) === '1'; } catch (e) { /* session only */ }

    function measure() {
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var r = outer.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      var stageW = r.width;
      /* every cell = a 256:386 video box + the caption row (--cap-row, constant on screen: the caption counter-scales with --inv) */
      var capRow = parseFloat(window.getComputedStyle(stage).getPropertyValue('--cap-row')) || 0;
      var cw = (stageW - (COLS - 1) * GAP) / COLS, ch = cw * 386 / 256 + capRow;
      var gridH = ROWS * ch + (ROWS - 1) * GAP;
      stage.style.setProperty('--cw', cw.toFixed(2) + 'px'); stage.style.setProperty('--ch', ch.toFixed(2) + 'px'); stage.style.setProperty('--g', GAP + 'px'); stage.style.setProperty('--rows', String(ROWS));
      var stageH = gridH + 12;
      fig.style.setProperty('--stage-h', stageH.toFixed(2) + 'px');
      /* rail column: 40px off the content box, never closer than 12px to the window edge, 132-256px wide */
      var contentRight = wr.right;
      var railW = Math.min(256, Math.max(132, vw - 12 - 40 - contentRight));
      var railX = Math.max(contentRight + 40, vw - 12 - railW);
      var railH = railW * 386 / 256 + capRow;
      /* the flight spans exactly the scroll distance that carries the stage's bottom edge from its start to the nav's bottom
         edge (START_TOP - NAV_H = 16px below the top), so the emptied stage never shows as a hole above the 2.2 heading */
      var scrub = Math.round(stageH + START_TOP - NAV_H);
      var S0 = r.top + window.scrollY - START_TOP;
      g = { vw: vw, vh: vh, sx: r.left, cw: cw, ch: ch, gridH: gridH, stageH: stageH, scrub: scrub, S0: S0, S1: S0 + scrub,
            Sbottom: r.top + window.scrollY + stageH - START_TOP, /* reduced motion: rail appears once the grid has scrolled past */
            railW: railW, railX: railX, railH: railH, pitch: railH + RAIL_GAP, scale: railW / cw };
      stage.style.setProperty('--rail-x', railX.toFixed(1) + 'px'); stage.style.setProperty('--rail-w', railW.toFixed(1) + 'px');
    }
    function gridXY(i) { return { x: (i % COLS) * (g.cw + GAP), y: Math.floor(i / COLS) * (g.ch + GAP) }; }
    function setFixed(on) {
      if (fixed === on) return;
      fixed = on; layer.classList.toggle('fixed', on);
    }
    function setRailMode(on) {
      if (railMode === on) return;
      railMode = on;
      (layer2 || layer).classList.toggle('rail', on);
      if (layer2) layer2.classList.toggle('on', on);
      if (toggleBtn) toggleBtn.hidden = !on || staticOnly;
      if (!on) { drift = 0; slow = 1; railCells.forEach(function (c) { c.slot = c.i; }); stop(); } else start();
    }
    function recycle(off) {
      var guard = g.pitch * 0.6, top = null, bot = null;
      railCells.forEach(function (c) { if (!top || c.slot < top.slot) top = c; if (!bot || c.slot > bot.slot) bot = c; });
      var yTop = Y0 + top.slot * g.pitch + off, yBot = Y0 + bot.slot * g.pitch + off;
      if (yTop + g.railH < -guard) { top.slot += N; if (top.playing) pause(top); }
      else if (yBot > g.vh + guard) { bot.slot -= N; if (bot.playing) pause(bot); }
    }
    /* flight: grid slot (sliding up with the page) -> rail slot; targets below the fold are clamped to just below it */
    function place(pp, stageTopV) {
      var inv = 1 / (1 - STAGGER), belowFold = g.vh + g.railH * 0.6;
      for (var k = 0; k < cells.length; k++) {
        var c = cells[k], gp = gridXY(c.i);
        var fx = g.sx + gp.x, fy = stageTopV + gp.y;
        var e = ease(clamp01((pp - STAGGER * c.i / (N - 1)) * inv));
        var tx = g.railX, ty = Y0 + c.slot * g.pitch, below = ty > belowFold;
        if (below) ty = belowFold;
        /* quadratic Bezier via (tx, fy): sweep right into the column first, then settle along it (less time over the text) */
        var u = 1 - e, x = u * u * fx + 2 * u * e * tx + e * e * tx, y = u * u * fy + 2 * u * e * fy + e * e * ty, sc = 1 + (g.scale - 1) * e;
        c.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
        c.el.style.setProperty('--inv', (1 / sc).toFixed(4)); /* the .gen badge and the caption counter-scale */
        /* a cell whose rail slot is below the fold dissolves over the first part of its flight (it would only pile up over
           the 2.2 text rising underneath); it is invisible in the rail anyway until the drift brings it round */
        c.fading = below; c.el.style.opacity = below ? clamp01(1 - 3 * e).toFixed(3) : '';
      }
    }
    function placeRail(off) {
      for (var k = 0; k < railCells.length; k++) {
        var c = railCells[k], y = Y0 + c.slot * g.pitch + off;
        if (c.fading) { c.fading = false; c.el.style.opacity = ''; }
        c.el.style.transform = 'translate3d(' + g.railX.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' + (layer2 ? '' : ' scale(' + g.scale.toFixed(4) + ')');
        if (!layer2) c.el.style.setProperty('--inv', (1 / g.scale).toFixed(4));
      }
    }
    function placeGrid() {
      cells.forEach(function (c) { var gp = gridXY(c.i); c.el.style.transform = 'translate3d(' + gp.x.toFixed(2) + 'px,' + gp.y.toFixed(2) + 'px,0)'; c.el.style.removeProperty('--inv'); c.fading = false; c.el.style.opacity = ''; });
    }
    function updatePlayback() {
      if (staticOnly) return;
      var hidden = document.hidden, playing = 0;
      if (!flip) { cells.forEach(function (c) { if (c.playing) playing++; }); document.body.setAttribute('data-rail-playing', String(playing)); return; }
      if (railMode) {
        var off = drift - (window.scrollY - g.S1) * PARALLAX, cand = [];
        cells.forEach(function (c) {
          var y = Y0 + c.slot * g.pitch + off;
          c.want = !hidden && !paused && y < g.vh - 24 && y + g.railH > 24;
          if (c.want) cand.push({ c: c, d: Math.abs(y + g.railH / 2 - g.vh / 2) });
        });
        cand.sort(function (a, b) { return a.d - b.d; });
        cand.forEach(function (x, i) { if (i >= MAX_PLAYING) x.c.want = false; });
      } else {
        var r = outer.getBoundingClientRect();
        var inView = r.bottom > -300 && r.top < g.vh + 300;
        cells.forEach(function (c) { c.want = !hidden && !userPaused && inView && !(c.fading && +c.el.style.opacity < 0.5); });
      }
      cells.forEach(function (c) { if (c.want) { play(c); playing++; } else pause(c); });
      document.body.setAttribute('data-rail-playing', String(playing));
    }
    function update(force) {
      var sy = window.scrollY || 0;
      if (staticOnly) { /* reduced motion: no scrub; the poster rail appears once the grid has scrolled past */
        var on = sy >= g.Sbottom;
        setRailMode(on);
        if (on) { var off0 = -(sy - g.Sbottom) * PARALLAX; recycle(off0); placeRail(off0); }
        p = on ? 1 : 0;
        return;
      }
      var pp = clamp01((sy - g.S0) / g.scrub);
      var changed = force || pp !== p;
      if (pp <= 0) {
        if (changed) { setRailMode(false); setFixed(false); placeGrid(); p = pp; }
      } else {
        setFixed(true);
        if (pp < 1) {
          setRailMode(false);
          if (changed) { place(pp, START_TOP - (sy - g.S0)); p = pp; }
        } else {
          setRailMode(true);
          var off = drift - (sy - g.S1) * PARALLAX;
          recycle(off);
          placeRail(off); p = pp;
        }
      }
    }
    /* Scroll drives the transforms directly (passive listener, one scrollY read, 12 transform writes); a rAF loop runs
       only while the rail is drifting (rail mode, not paused, tab visible) and stops itself otherwise. */
    var pbTimer = null;
    function onScroll() {
      if (!flip) return;
      update(false);
      if (!pbTimer) pbTimer = setTimeout(function () { pbTimer = null; updatePlayback(); }, 80);
    }
    function loop(t) {
      if (!running) return;
      if (!railMode || paused || staticOnly || document.hidden) { running = false; return; }
      var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
      lastT = t;
      slow += (slowTarget - slow) * Math.min(1, dt * 4);
      drift -= SPEED * slow * dt;
      update(false);
      if ((tick++ % 15) === 0) updatePlayback();
      requestAnimationFrame(loop);
    }
    function start() { if (running || !flip || !railMode || paused || staticOnly || document.hidden) return; running = true; lastT = 0; requestAnimationFrame(loop); }
    function stop() { running = false; }
    function setPaused(v) {
      paused = v;
      try { window.sessionStorage.setItem(STORE, v ? '1' : '0'); } catch (e) { /* ignore */ }
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', v ? 'true' : 'false'); /* fixed label; the pressed state (and icon) says "paused" */
      updatePlayback();
      if (!v) start();
    }
    function setUserPaused(v) {
      userPaused = v; stage.classList.toggle('paused', v);
      updatePlayback();
    }
    function applyMode() {
      var want = wide.matches;
      if (want && !flip) {
        flip = true;
        if (!staticOnly) { plainOff(); fig.classList.add('flip'); }
        railCells.forEach(function (c) { c.el.addEventListener('pointerenter', onEnter); c.el.addEventListener('pointerleave', onLeave); });
        measure(); p = -1; update(true); updatePlayback();
      } else if (!want && flip) {
        flip = false; stop(); fig.classList.remove('flip');
        setRailMode(false); setFixed(false);
        railCells.forEach(function (c) { c.el.style.transform = ''; c.el.removeEventListener('pointerenter', onEnter); c.el.removeEventListener('pointerleave', onLeave); });
        cells.forEach(function (c) { c.el.style.transform = ''; c.el.style.removeProperty('--inv'); c.fading = false; c.el.style.opacity = ''; pause(c); });
        if (toggleBtn) toggleBtn.hidden = true;
        plainOn();
      } else if (flip) { measure(); p = -1; update(true); updatePlayback(); }
    }
    function onEnter() { slowTarget = 0; }
    function onLeave() { slowTarget = 1; }
    var resizeTimer = null;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyMode, 120); });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (wide.addEventListener) wide.addEventListener('change', applyMode); else if (wide.addListener) wide.addListener(applyMode);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); updatePlayback(); });
    if (toggleBtn) { toggleBtn.addEventListener('click', function () { setPaused(!paused); }); setPaused(paused); toggleBtn.hidden = true; }
    /* click / Enter / Space on the stage toggles the grid (not the rail, which has its own button) */
    stage.addEventListener('click', function (e) { if (railMode || staticOnly) return; if (e.target.closest && e.target.closest('.rail-toggle')) return; setUserPaused(!userPaused); });
    stage.addEventListener('keydown', function (e) { if (railMode || staticOnly) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserPaused(!userPaused); } });
    /* attach the sources (all modes) once the stage comes within 600px, so the grid starts instantly when reached */
    if (!staticOnly && 'IntersectionObserver' in window) {
      var aio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { cells.forEach(attach); aio.disconnect(); } });
      }, { rootMargin: '600px 0px' });
      aio.observe(outer);
    }
    if (!wide.matches) plainOn();
    /* layout may still be settling (fonts, images): apply after load too */
    applyMode();
    window.addEventListener('load', function () { setTimeout(applyMode, 50); });
  })();
})();
