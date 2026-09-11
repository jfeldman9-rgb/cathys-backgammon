/* Cathy's Backgammon — UI + game flow. Needs engine.js (Backgammon) + ai.js (CathyAI). */
(function () {
  'use strict';

  var BG = window.Backgammon;
  var AI = window.CathyAI;

  var FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  var $ = function (id) { return document.getElementById(id); };

  // ---------- photo fallback: real PNGs if Jason drops them in, else bundled SVG art
  Array.prototype.forEach.call(document.querySelectorAll('img'), function (img) {
    img.addEventListener('error', function handler() {
      img.removeEventListener('error', handler);
      if (/\.png$/.test(img.src)) img.src = img.src.replace(/\.png$/, '.svg');
    });
  });

  // ---------- tiny sound kit (WebAudio, no assets) ----------
  var soundOn = true, actx = null;
  function beep(freq, dur, when) {
    if (!soundOn) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      var t = actx.currentTime + (when || 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* silent */ }
  }
  var sfx = {
    move: function () { beep(520, 0.09); },
    hit: function () { beep(180, 0.18); beep(320, 0.12, 0.08); },
    roll: function () { beep(300, 0.06); beep(420, 0.06, 0.07); beep(540, 0.08, 0.14); },
    select: function () { beep(660, 0.05); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.22, i * 0.16); }); },
    bad: function () { beep(140, 0.15); },
  };

  // ---------- game state ----------
  var S = {
    mode: 'ai',           // 'ai' | 'hotseat'
    names: ['Cathy 🧀', 'Computer 🍇'],
    st: null,
    history: [],          // snapshots for undo (this turn only)
    selected: null,       // idx | 'bar' | null
    options: [],
    busy: false,          // AI animating / transitions
    over: false,
    rand: Math.random,
  };

  function me() { return S.st.turn; }
  function isAIturn() { return S.mode === 'ai' && me() === 1 && !S.over; }
  function isHumanTurn() { return !S.over && !S.busy && (S.mode === 'hotseat' || me() === 0); }

  function ptName(f) { return f === 'bar' ? 'the Bar' : 'point ' + (f + 1); }

  // ---------- board construction ----------
  var pointEls = {}; // idx -> element
  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    pointEls = {};
    function quad(ids, row, col, cls) {
      var q = document.createElement('div');
      q.className = 'quad'; q.style.gridRow = row; q.style.gridColumn = col;
      ids.forEach(function (idx) {
        var p = document.createElement('div');
        p.className = 'point ' + cls + (((idx + 1) % 2 === 0) ? ' alt-a' : ' alt-b');
        p.dataset.idx = idx;
        var tri = document.createElement('div'); tri.className = 'tri';
        var num = document.createElement('div'); num.className = 'pnum'; num.textContent = idx + 1;
        var ck = document.createElement('div'); ck.className = 'checkers';
        p.appendChild(tri); p.appendChild(num); p.appendChild(ck);
        p.addEventListener('click', function () { onPointTap(idx); });
        q.appendChild(p);
        pointEls[idx] = p;
      });
      board.appendChild(q);
    }
    quad([12, 13, 14, 15, 16, 17], 1, 1, 'top');     // 13..18
    quad([18, 19, 20, 21, 22, 23], 1, 3, 'top');     // 19..24
    quad([11, 10, 9, 8, 7, 6], 2, 1, 'bottom');      // 12..7
    quad([5, 4, 3, 2, 1, 0], 2, 3, 'bottom');        // 6..1
    var bar = document.createElement('div');
    bar.id = 'bar-col';
    bar.innerHTML = '<div class="bar-label">BAR</div>' +
      '<div class="bar-stack" id="bar-stack-0"></div>' +
      '<div class="bar-stack" id="bar-stack-1"></div>';
    bar.addEventListener('click', onBarTap);
    board.appendChild(bar);
  }

  function checkerEl(color) {
    var d = document.createElement('div');
    d.className = 'checker ' + (color === 0 ? 'cheese' : 'grape');
    return d;
  }

  // ---------- rendering ----------
  function render() {
    var st = S.st;
    for (var i = 0; i < 24; i++) {
      var el = pointEls[i], box = el.querySelector('.checkers');
      box.innerHTML = '';
      var pt = st.points[i];
      if (pt.c !== -1) {
        var show = Math.min(pt.n, 5);
        for (var k = 0; k < show; k++) box.appendChild(checkerEl(pt.c));
        if (pt.n > 5) {
          var badge = document.createElement('div');
          badge.className = 'checker-count'; badge.textContent = '×' + pt.n;
          box.appendChild(badge);
        }
      }
      el.classList.remove('src-ok', 'dest-ok', 'selected');
    }
    renderBar();
    renderOff();
    renderDice();
    renderBanner();

    if (isHumanTurn() && S.st.rolled) {
      var srcs = {};
      S.options.forEach(function (o) { srcs[o.from] = true; });
      Object.keys(srcs).forEach(function (f) {
        if (f === 'bar') { $('bar-col').classList.add('selectable'); return; }
        pointEls[+f].classList.add('src-ok');
      });
      $('bar-col').classList.toggle('selectable', !!srcs.bar);
      if (S.selected !== null) {
        var selEl = S.selected === 'bar' ? $('bar-col') : pointEls[S.selected];
        selEl.classList.add('selected');
        S.options.forEach(function (o) {
          if (String(o.from) === String(S.selected)) {
            if (o.to === 'off') {
              var mine = $('off-box-' + me()) || offBox(me());
              if (mine) mine.classList.add('dest-ready');
            } else pointEls[o.to].classList.add('dest-ok');
          }
        });
      }
    } else {
      var bc = $('bar-col'); if (bc) bc.classList.remove('selectable');
    }
    refreshButtons();
  }

  function offBox(p) {
    var boxes = document.querySelectorAll('.off-box');
    return boxes[p];
  }

  function renderBar() {
    [0, 1].forEach(function (p) {
      var s = $('bar-stack-' + p);
      s.innerHTML = '';
      var n = S.st.bar[p], show = Math.min(n, 3);
      for (var k = 0; k < show; k++) s.appendChild(checkerEl(p));
      if (n > 3) {
        var b = document.createElement('div');
        b.className = 'checker-count'; b.textContent = '×' + n;
        s.appendChild(b);
      }
    });
  }

  function renderOff() {
    [0, 1].forEach(function (p) {
      $('off-fill-' + p).style.width = (S.st.off[p] / 15 * 100) + '%';
      $('off-count-' + p).textContent = S.st.off[p] + '/15';
    });
    document.querySelectorAll('.off-box').forEach(function (b) { b.classList.remove('dest-ready'); });
  }

  function renderDice() {
    var row = $('dice-row');
    row.innerHTML = '';
    var st = S.st;
    if (!st.rolled) {
      [0, 1].forEach(function () {
        var d = document.createElement('div');
        d.className = 'die'; d.textContent = '?';
        row.appendChild(d);
      });
      return;
    }
    var rem = st.remaining.slice();
    st.dice.forEach(function (v) {
      var d = document.createElement('div');
      d.className = 'die';
      d.textContent = FACES[v - 1];
      var ix = rem.indexOf(v);
      if (ix === -1) d.classList.add('used');
      else rem.splice(ix, 1);
      row.appendChild(d);
    });
  }

  function renderBanner() {
    var b = $('turn-banner');
    if (S.over) { b.textContent = '🏁 Game over!'; return; }
    var name = S.names[me()];
    b.textContent = S.st.rolled ? (name + ' — your move! 👇') : (name + ' — tap ROLL! 🎲');
    b.className = me() === 0 ? 'cheese' : 'grape';
    b.id = 'turn-banner';
  }

  function msg(t) { $('board-msg').textContent = t || ''; }

  function refreshButtons() {
    $('btn-roll').disabled = !(isHumanTurn() && !S.st.rolled);
    $('btn-undo').disabled = !(isHumanTurn() && S.history.length > 0);
    $('btn-hint').disabled = !(isHumanTurn() && S.st.rolled && S.options.length > 0);
    var needDone = isHumanTurn() && S.st.rolled && S.options.length === 0 && !S.over;
    $('btn-pass').classList.toggle('hidden', !needDone);
  }

  // ---------- flow ----------
  function newGame(mode) {
    S.mode = mode;
    S.names = mode === 'ai' ? ['Cathy 🧀', 'Computer 🍇'] : ['Cathy 🧀', 'Jason 🍇'];
    $('off-name-1').textContent = mode === 'ai' ? 'Computer' : 'Jason';
    S.st = BG.newGame();
    S.st.turn = 0; // Cathy always opens — she's the birthday star
    S.history = []; S.selected = null; S.options = [];
    S.busy = false; S.over = false;
    $('overlay-win').classList.add('hidden');
    msg('Cathy starts! Tap ROLL 🎲');
    render();
  }

  function refreshOptions() {
    if (!S.st.rolled || S.over) { S.options = []; return; }
    S.options = BG.legalOptions(S.st, me(), S.st.remaining);
  }

  function doRoll() {
    if (!isHumanTurn() || S.st.rolled) return;
    sfx.roll();
    var d0 = document.querySelectorAll('#dice-row .die');
    Array.prototype.forEach.call(d0, function (d) { d.classList.add('rolling'); });
    S.busy = true; refreshButtons();
    setTimeout(function () {
      S.busy = false;
      var dice = BG.rollDice(S.rand);
      S.st.dice = AI.orderDice(BG, S.st, me(), dice);
      S.st.remaining = S.st.dice.slice();
      S.st.rolled = true;
      S.history = []; S.selected = null;
      refreshOptions();
      if (!S.options.length) {
        msg('No moves possible — tap Done ⏭');
        sfx.bad();
      } else if (S.st.bar[me()] > 0) {
        msg('Bring one in from the BAR! 👆');
      } else {
        msg(S.st.dice.length === 4 ? 'Doubles! FOUR moves! 🎉' : 'Tap a glowing checker ✨');
      }
      render();
    }, 450);
  }

  function pipDist(from, to, player) {
    if (from === 'bar') return 99;
    if (to === 'off') return player === 0 ? from + 1 : 24 - from;
    return Math.abs(from - to);
  }

  function bestOption(from, to) {
    var cands = S.options.filter(function (o) {
      return String(o.from) === String(from) && String(o.to) === String(to);
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) {
      return (a.die - pipDist(a.from, a.to, me())) - (b.die - pipDist(b.from, b.to, me()));
    });
    return cands[0];
  }

  function doMove(m) {
    var st = S.st, player = me();
    if (isHumanTurn()) S.history.push(BG.clone(st));
    // hit detection for sound
    var hit = m.to !== 'off' && st.points[m.to].c === (1 - player) && st.points[m.to].n === 1;
    BG.applyMoveTo(st, player, m);
    st.remaining.splice(st.remaining.indexOf(m.die), 1);
    st.movesThisTurn++;
    S.selected = null;
    if (hit) sfx.hit(); else sfx.move();
    // flash landing
    if (st.winner !== -1) { onWin(player); render(); return; }
    refreshOptions();
    if (!S.options.length && st.remaining.length) {
      msg('No more moves — tap Done ⏭');
    } else if (!S.options.length) {
      msg('Nice! Tap Done ⏭');
    } else if (st.bar[player] > 0) {
      msg('More from the BAR! 👆');
    } else {
      msg('');
    }
    render();
  }

  function endTurn() {
    if (S.over || S.busy) return;
    if (me() === 0 || S.mode === 'hotseat') { /* humans pass explicitly */ }
    S.st.turn = 1 - S.st.turn;
    S.st.dice = []; S.st.remaining = []; S.st.rolled = false;
    S.st.movesThisTurn = 0;
    S.history = []; S.selected = null; S.options = [];
    msg('');
    render();
    if (isAIturn()) {
      S.busy = true; refreshButtons();
      msg('Computer is thinking… 🤔');
      setTimeout(aiRoll, 900);
    }
  }

  function aiRoll() {
    if (S.over) { S.busy = false; return; }
    var dice = BG.rollDice(S.rand);
    S.st.dice = AI.orderDice(BG, S.st, me(), dice);
    S.st.remaining = S.st.dice.slice();
    S.st.rolled = true;
    sfx.roll();
    render();
    setTimeout(aiStep, 800);
  }

  function aiStep() {
    if (S.over) { S.busy = false; return; }
    refreshOptions();
    if (!S.options.length) {
      msg('Computer is done.');
      setTimeout(function () { S.busy = false; endTurn(); }, 700);
      return;
    }
    var m = AI.chooseMove(BG, S.st, me(), S.st.remaining, S.rand);
    if (!m) {
      setTimeout(function () { S.busy = false; endTurn(); }, 700);
      return;
    }
    var hit = m.to !== 'off' && S.st.points[m.to].c === 0 && S.st.points[m.to].n === 1;
    BG.applyMoveTo(S.st, me(), m);
    S.st.remaining.splice(S.st.remaining.indexOf(m.die), 1);
    if (hit) sfx.hit(); else sfx.move();
    if (S.st.winner !== -1) { S.busy = false; onWin(me()); render(); return; }
    render();
    setTimeout(aiStep, 750);
  }

  // ---------- input ----------
  function onPointTap(idx) {
    if (!isHumanTurn() || !S.st.rolled) {
      if (isHumanTurn() && !S.st.rolled) msg('Tap ROLL first! 🎲');
      return;
    }
    var st = S.st, player = me();
    if (S.selected === null) {
      var isSrc = S.options.some(function (o) { return o.from === idx; });
      if (st.points[idx].c === player && isSrc) {
        S.selected = idx; sfx.select(); render();
      }
      return;
    }
    if (S.selected === idx) { S.selected = null; render(); return; }
    var m = bestOption(S.selected, idx);
    if (m) { doMove(m); return; }
    // reselect?
    var isSrc = S.options.some(function (o) { return o.from === idx; });
    if (st.points[idx].c === player && isSrc) { S.selected = idx; sfx.select(); render(); }
    else { S.selected = null; render(); }
  }

  function onBarTap() {
    if (!isHumanTurn() || !S.st.rolled) return;
    if (S.selected === 'bar') { S.selected = null; render(); return; }
    if (S.options.some(function (o) { return o.from === 'bar'; })) {
      S.selected = 'bar'; sfx.select(); render();
    }
  }

  function onUndo() {
    if (!isHumanTurn() || !S.history.length) return;
    S.st = S.history.pop();
    S.selected = null;
    refreshOptions();
    msg('Undone! ↩️');
    render();
  }

  function onHint() {
    if (!isHumanTurn() || !S.options.length) return;
    var m = AI.chooseMove(BG, S.st, me(), S.st.remaining, S.rand);
    if (!m) return;
    var txt = (m.from === 'bar' ? 'the Bar' : (m.from + 1)) + ' → ' +
      (m.to === 'off' ? 'OFF 🏁' : (m.to + 1));
    msg('💡 Try: ' + txt);
    var fromEl = m.from === 'bar' ? $('bar-col') : pointEls[m.from];
    fromEl.classList.add('flash');
    if (m.to !== 'off') pointEls[m.to].classList.add('flash');
    setTimeout(render, 1800);
  }

  // ---------- win ----------
  var WIN_LINES = [
    'Bama 2026: It was worth it. 🏆',
    'Cheese Cathy does it again! 🧀🎉',
    'Somebody wants cake. And bragging rights. 🎂',
    'The cheese stands alone. On top. 🏁',
  ];
  function onWin(player) {
    S.over = true; S.busy = false;
    var kind = BG.winKind(S.st, player);
    var kindTxt = kind === 2 ? 'BACKGAMMON! Triple! 🤯' : kind === 1 ? 'GAMMON! Double! ✨' : 'a win!';
    sfx.win();
    var title = $('win-title'), sub = $('win-sub'), photo = $('win-photo');
    var ext = (typeof shot !== 'undefined' && shot) ? '.svg' : '.png';
    // arm fallback BEFORE swapping src (no race)
    photo.onerror = function () {
      photo.onerror = null;
      photo.src = photo.src.replace(/\.png$/, '.svg');
    };
    if (player === 0) {
      title.textContent = '🧀 Cathy wins — ' + kindTxt;
      sub.textContent = WIN_LINES[Math.floor(S.rand() * WIN_LINES.length)];
      photo.src = 'assets/photos/03-bama-2026' + ext;
    } else {
      title.textContent = (S.mode === 'ai' ? 'Computer' : 'Jason') + ' wins — ' + kindTxt;
      sub.textContent = 'Good game, Cathy! Demand a rematch. 😄';
      photo.src = 'assets/photos/01-mom-dog-hybrid' + ext;
    }
    // reveal (fallback-safe: inline onerror already armed in markup)
    setTimeout(function () { $('overlay-win').classList.remove('hidden'); }, 900);
  }

  // ---------- wiring ----------
  function show(screen) {
    $('screen-title').classList.toggle('hidden', screen !== 'title');
    $('screen-game').classList.toggle('hidden', screen !== 'game');
  }

  function start(mode) {
    show('game');
    newGame(mode);
  }

  $('btn-vs-ai').addEventListener('click', function () { start('ai'); });
  $('btn-hotseat').addEventListener('click', function () { start('hotseat'); });
  $('btn-how').addEventListener('click', function () { $('overlay-help').classList.remove('hidden'); });
  $('btn-close-help').addEventListener('click', function () { $('overlay-help').classList.add('hidden'); });
  $('btn-roll').addEventListener('click', doRoll);
  $('btn-undo').addEventListener('click', onUndo);
  $('btn-hint').addEventListener('click', onHint);
  $('btn-pass').addEventListener('click', function () { msg(''); endTurn(); });
  $('btn-new').addEventListener('click', function () { newGame(S.mode); });
  $('btn-menu').addEventListener('click', function () { show('title'); });
  $('btn-again').addEventListener('click', function () { newGame(S.mode); });
  $('btn-win-menu').addEventListener('click', function () {
    $('overlay-win').classList.add('hidden');
    show('title');
  });
  $('btn-sound').addEventListener('click', function () {
    soundOn = !soundOn;
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  });
  document.querySelectorAll('.off-box').forEach(function (box, ix) {
    box.style.cursor = 'pointer';
    box.addEventListener('click', function () {
      if (!isHumanTurn() || S.selected === null || ix !== me()) return;
      var m = bestOption(S.selected, 'off');
      if (m) doMove(m);
      else { sfx.bad(); msg('That checker cannot bear off yet. 🏁'); }
    });
  });
  // dice tap = roll too (huge target)
  $('dice-row').addEventListener('click', function () {
    if (isHumanTurn() && !S.st.rolled) doRoll();
  });

  // ---------- screenshot / smoke hooks (?shot=title|mid|win|smoke) ----------
  function seededRand(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function autoHalfMoves(n, rand) {
    var guard = 0;
    var played = 0;
    while (played < n && guard++ < n * 12 && S.st.winner === -1) {
      var dice = BG.rollDice(rand);
      S.st.dice = AI.orderDice(BG, S.st, me(), dice);
      var rem = S.st.dice.slice();
      var moved = false;
      var g2 = 0;
      while (rem.length && S.st.winner === -1 && g2++ < 8) {
        var m = AI.chooseMove(BG, S.st, me(), rem, rand);
        if (!m) break;
        BG.applyMoveTo(S.st, me(), m);
        rem.splice(rem.indexOf(m.die), 1);
        moved = true;
      }
      if (S.st.winner === -1) S.st.turn = 1 - S.st.turn;
      if (moved) played++;
    }
    S.st.dice = []; S.st.remaining = []; S.st.rolled = false;
    S.history = []; S.selected = null; S.options = [];
  }

  function smokeResult(txt) {
    var el = $('smoke-result');
    el.classList.remove('hidden');
    el.textContent = txt;
    document.title = txt;
  }
  window.addEventListener('error', function (e) {
    if (new URLSearchParams(location.search).get('shot') === 'smoke') {
      smokeResult('SMOKE-FAIL: ' + (e.message || 'unknown error'));
    }
  });

  // ---------- boot ----------
  buildBoard();
  var params = new URLSearchParams(location.search);
  var shot = params.get('shot');
  if (shot) {
    // screenshot/smoke runs: skip the PNG 404 round-trip, use bundled art directly
    Array.prototype.forEach.call(document.querySelectorAll('img'), function (img) {
      img.onerror = null;
      img.src = img.src.replace(/\.png$/, '.svg');
    });
  }
  var seed = parseInt(params.get('seed') || '2026', 10);
  if (shot === 'smoke') {
    window.__cathy = {
      S: S, doRoll: doRoll, onPointTap: onPointTap, onBarTap: onBarTap,
      onUndo: onUndo, endTurn: endTurn, newGame: newGame, offBox: offBox,
    };
    (function () {
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function assert(c, m) { if (!c) throw new Error(m); }
      (async function () {
        try {
          show('game');
          // --- UI-driven hotseat turn through the REAL tap handlers ---
          newGame('hotseat');
          S.rand = seededRand(seed + 7);
          var rolled = false;
          for (var t = 0; t < 4 && !rolled; t++) {
            doRoll();
            await wait(700);
            if (S.st.rolled && S.options.length) rolled = true;
            else if (S.st.rolled) endTurn();
          }
          assert(rolled, 'human roll produced moves');
          assert(document.querySelectorAll('#dice-row .die').length === S.st.dice.length,
            'dice rendered');
          var m = S.options[0];
          if (m.from === 'bar') onBarTap(); else onPointTap(m.from);
          assert(S.selected !== null && String(S.selected) === String(m.from), 'select works');
          if (m.to === 'off') offBox(me()).click(); else onPointTap(m.to);
          assert(S.st.movesThisTurn === 1, 'tap-to-move works');
          onUndo();
          assert(S.st.movesThisTurn === 0, 'undo works');
          // --- full AI-vs-AI game in-page (catches engine+AI errors live) ---
          newGame('ai');
          S.rand = seededRand(seed);
          autoHalfMoves(400, S.rand);
          assert(S.st.winner !== -1, 'game did not finish');
          render();
          for (var i = 0; i < 10; i++) { await wait(50); render(); }
          smokeResult('SMOKE-OK winner=' + S.st.winner + ' off=' + S.st.off.join('/'));
        } catch (e) {
          smokeResult('SMOKE-FAIL: ' + (e && e.message));
        }
      })();
    })();
  } else if (shot === 'mid') {
    S.rand = seededRand(seed);
    show('game');
    newGame('ai');
    autoHalfMoves(16, S.rand);
    S.st.turn = 0;
    S.rand = Math.random;
    msg('Cathy to play — tap ROLL! 🎲');
    render();
  } else if (shot === 'win') {
    show('game');
    newGame('ai');
    S.st.off = [14, 7];
    S.st.points = S.st.points.map(function () { return { c: -1, n: 0 }; });
    S.st.points[0] = { c: 0, n: 1 };
    render();
    onWin(0);
    $('overlay-win').classList.remove('hidden');
  } else {
    show('title');
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline opt-in */ });
    });
  }
})();
