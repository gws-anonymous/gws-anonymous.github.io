/* GWS project page v4 - vanilla JS: lightbox, nav highlighting + progress, entrance fades, lazy in-view
   autoplay, video timers, and the side rails of looping rollouts. No dependencies. */
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

  /* ---------- Sticky nav: highlight the section in view + scroll-progress hairline ---------- */
  var links = document.querySelectorAll('.nav a[href^="#"]');
  var targets = [];
  each(links, function (a) {
    var el = document.querySelector(a.getAttribute('href'));
    if (el) targets.push({ el: el, a: a });
  });
  if ('IntersectionObserver' in window && targets.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) targets.forEach(function (t) { t.a.classList.toggle('active', t.el === en.target); });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t.el); });
  }
  var bar = document.querySelector('.progress span');
  var barQueued = false;
  function drawBar() {
    barQueued = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }
  if (bar) {
    window.addEventListener('scroll', function () { if (!barQueued) { barQueued = true; requestAnimationFrame(drawBar); } }, { passive: true });
    window.addEventListener('resize', drawBar);
    drawBar();
  }

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

  /* ---------- Lazy in-view autoplay for short, silent animations (video[data-autoplay]) ----------
     Sources are attached only when the video approaches the viewport (keeps the page light), playback
     starts muted when in view and pauses when scrolled away. Phone variants via data-src-mobile /
     data-poster-mobile. With prefers-reduced-motion a video with data-static is swapped for its static
     figure (zoomable); other videos show controls and do not autoplay. */
  if (reduceMotion) {
    each(document.querySelectorAll('video[data-autoplay][data-static]'), function (v) {
      var img = document.createElement('img');
      img.className = 'zoom';
      var mobile = phone() && v.getAttribute('data-static-mobile');
      img.src = mobile || v.getAttribute('data-static');
      img.alt = v.getAttribute('data-static-alt') || v.getAttribute('aria-label') || '';
      var wh = ((mobile && v.getAttribute('data-static-size-mobile')) || v.getAttribute('data-static-size') || '').split('x');
      if (wh.length === 2) { img.width = +wh[0]; img.height = +wh[1]; }
      v.parentNode.replaceChild(img, v);
      wireZoom(img);
    });
  }
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
    v.load();
  }
  each(autos, function (v) {
    v.muted = true; v.loop = true; v.setAttribute('playsinline', '');
    var pm = phone() && v.getAttribute('data-poster-mobile');
    if (pm) v.poster = pm;
    var sm = phone() && v.getAttribute('data-size-mobile'); /* "WxH": reserve the phone variant's box before it loads */
    if (sm) { var wh = sm.split('x'); v.setAttribute('width', wh[0]); v.setAttribute('height', wh[1]); }
    if (reduceMotion) { v.controls = true; attachSources(v); }
  });
  if (!reduceMotion && autos.length) {
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) {
            attachSources(v);
            if (v.getAttribute('data-user-paused')) return; /* respect an explicit click-pause across scrolls */
            var p = v.play(); if (p && p.catch) p.catch(function () { v.controls = true; });
          } else if (!v.paused) { v.pause(); }
        });
      }, { rootMargin: '200px 0px', threshold: 0.1 });
      each(autos, function (v) { vio.observe(v); });
    } else {
      each(autos, function (v) { attachSources(v); v.play(); });
    }
  }
  /* Click toggles play/pause on controls-less animations (keyboard: Enter/Space); the .frame wrapper shows a play glyph while paused */
  each(autos, function (v) {
    var frame = v.parentNode && v.parentNode.classList.contains('frame') ? v.parentNode : null;
    function toggle() {
      if (v.controls) return;
      var pause = !v.paused;
      if (pause) { v.setAttribute('data-user-paused', '1'); v.pause(); }
      else { v.removeAttribute('data-user-paused'); v.play(); }
      if (frame) frame.classList.toggle('paused', pause);
      v.setAttribute('aria-label', (v.getAttribute('aria-label') || '').replace(/ \(paused\)$/, '') + (pause ? ' (paused)' : ''));
    }
    v.addEventListener('click', toggle);
    v.setAttribute('tabindex', '0');
    v.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  /* ---------- Comparison card: rollout timer + pause the other cards when one plays ---------- */
  var videos = document.querySelectorAll('.video-card video');
  each(videos, function (v) {
    var card = v.closest('.video-card');
    var timer = card ? card.querySelector('.timer') : null;
    var total = parseFloat(v.getAttribute('data-duration') || '60');
    function fmt(t) { return 'rollout t = ' + t.toFixed(1) + ' s / ' + total.toFixed(0) + ' s' + (v.getAttribute('data-user-paused') ? ' (paused)' : ''); }
    if (timer) timer.textContent = fmt(0);
    v.addEventListener('timeupdate', function () { if (timer) timer.textContent = fmt(v.currentTime); });
    v.addEventListener('pause', function () { if (timer) timer.textContent = fmt(v.currentTime); });
    v.addEventListener('play', function () { each(videos, function (o) { if (o !== v && !o.paused) o.pause(); }); });
  });

  /* ---------- 3.1 stage: 15 rollout cells -> right-hand rail ----------
     Desktop (>= 1180px, "flip" mode): the 5x3 grid scrolls normally until its top reaches the nav (S0). From there,
     over SCRUB px of scrolling (0.9 viewport heights), progress p goes 0 -> 1 and every cell is moved by a transform
     (translate + scale, GPU only) from its grid slot - which keeps sliding up with the page - to a slot of a single
     rail column on the right, with a per-cell stagger (top row first) and an ease-in-out curve; the content below
     rises under the flight as usual, so there is no dead scroll zone. At p = 1 the cells layer (position:fixed since
     p > 0) gets a top/bottom fade mask and the column drifts (slow constant drift + scroll parallax); cells leaving one
     end are re-slotted N positions further so the 15 clips cycle without any source change. A nav button pauses the
     drift and the videos (localStorage). Reduced motion / data saver: the grid is poster images and stays in the flow;
     a second, fixed set of 15 posters becomes the rail (no scrub, no drift) once the grid has scrolled past.
     Below 1180px (or without JS): a plain responsive grid with in-view autoplay. */
  (function stage() {
    var fig = document.getElementById('diverse-media');
    var stage = document.getElementById('stage'), outer = document.getElementById('stage-outer'), layer = document.getElementById('cells');
    if (!fig || !stage || !outer || !layer) return;
    var cellEls = layer.querySelectorAll('.cell');
    var N = cellEls.length; if (!N) return;
    var cap = stage.querySelector('.stage-cap'), label = stage.querySelector('.rail-label');
    var toggleBtn = document.querySelector('.rail-toggle');
    var wrap = fig.closest('.wrap') || fig;
    var wide = window.matchMedia('(min-width: 1180px)');
    var staticOnly = reduceMotion || saveData;
    var probe = document.createElement('video');
    var useWebm = !!(probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9"'));
    var COLS = 5, GAP = 14, RAIL_GAP = 16, START_TOP = 70, Y0 = 72, PARALLAX = 0.14, MAX_PLAYING = 8, SPEED = 9, STAGGER = 0.45, STORE = 'gws-rails-paused';
    var cells = [], railCells = [], layer2 = null;
    each(cellEls, function (el, i) {
      var v = el.querySelector('video');
      var c = { el: el, i: i, slot: i, playing: false, attached: false, media: v,
                poster: v.getAttribute('poster'), webm: v.getAttribute('data-webm'), mp4: v.getAttribute('data-src') };
      if (staticOnly) { /* posters only: no video element at all */
        var img = document.createElement('img'); img.src = c.poster; img.alt = ''; img.width = 256; img.height = 386; img.loading = 'lazy';
        el.replaceChild(img, v); c.media = img; c.attached = true;
      } else { v.muted = true; v.loop = true; v.setAttribute('playsinline', ''); }
      cells.push(c);
    });
    railCells = cells;
    if (staticOnly) { /* reduced motion: a separate fixed set of posters becomes the rail; the grid stays in the flow */
      layer2 = document.createElement('div'); layer2.className = 'rail-clone'; layer2.setAttribute('aria-hidden', 'true');
      railCells = cells.map(function (c) {
        var d = document.createElement('div'); d.className = 'cell';
        var img = document.createElement('img'); img.src = c.poster; img.alt = ''; img.width = 256; img.height = 386; img.loading = 'lazy';
        d.appendChild(img); layer2.appendChild(d);
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
    try { paused = window.localStorage.getItem(STORE) === '1'; } catch (e) { /* session only */ }

    function measure() {
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var r = outer.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      var stageW = r.width;
      var cw = (stageW - (COLS - 1) * GAP) / COLS, ch = cw * 386 / 256;
      var gridH = 3 * ch + 2 * GAP;
      stage.style.setProperty('--cw', cw.toFixed(2) + 'px'); stage.style.setProperty('--ch', ch.toFixed(2) + 'px'); stage.style.setProperty('--g', GAP + 'px');
      var capH = cap ? cap.offsetHeight : 0;
      var stageH = gridH + 12 + capH;
      fig.style.setProperty('--stage-h', stageH.toFixed(2) + 'px');
      /* rail column: 40px off the content box, never closer than 12px to the window edge, 132-256px wide */
      var contentRight = wr.right;
      var railW = Math.min(256, Math.max(132, vw - 12 - 40 - contentRight));
      var railX = Math.max(contentRight + 40, vw - 12 - railW);
      var railH = railW * 386 / 256;
      var scrub = Math.round(vh * 0.9);
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
      if (label) label.classList.toggle('on', on);
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
        var tx = g.railX, ty = Math.min(Y0 + c.slot * g.pitch, belowFold);
        /* quadratic Bezier via (tx, fy): sweep right into the column first, then settle along it (less time over the text) */
        var u = 1 - e, x = u * u * fx + 2 * u * e * tx + e * e * tx, y = u * u * fy + 2 * u * e * fy + e * e * ty, sc = 1 + (g.scale - 1) * e;
        c.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
      }
    }
    function placeRail(off) {
      for (var k = 0; k < railCells.length; k++) {
        var c = railCells[k], y = Y0 + c.slot * g.pitch + off;
        c.el.style.transform = 'translate3d(' + g.railX.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)' + (layer2 ? '' : ' scale(' + g.scale.toFixed(4) + ')');
      }
    }
    function placeGrid() {
      cells.forEach(function (c) { var gp = gridXY(c.i); c.el.style.transform = 'translate3d(' + gp.x.toFixed(2) + 'px,' + gp.y.toFixed(2) + 'px,0)'; });
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
        cells.forEach(function (c) { c.want = !hidden && !userPaused && inView; });
      }
      cells.forEach(function (c) { if (c.want) { play(c); playing++; } else pause(c); });
      document.body.setAttribute('data-rail-playing', String(playing));
    }
    var lastCapOpacity = -1;
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
      if (cap) {
        var o = Math.round((1 - pp) * 20) / 20;
        if (o !== lastCapOpacity) { lastCapOpacity = o; cap.style.opacity = o; }
      }
    }
    /* Scroll drives the transforms directly (passive listener, one scrollY read, 15 transform writes); a rAF loop runs
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
      try { window.localStorage.setItem(STORE, v ? '1' : '0'); } catch (e) { /* ignore */ }
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
        toggleBtn.querySelector('.rail-toggle-text').textContent = v ? 'Resume side clips' : 'Pause side clips';
      }
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
        cells.forEach(function (c) { c.el.style.transform = ''; pause(c); });
        if (cap) cap.style.opacity = '';
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
