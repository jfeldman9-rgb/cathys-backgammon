/* Cathy's Backgammon — UI, presence, voice, and game flow.
   Needs engine.js (Backgammon) + ai.js (CathyAI). */
(function () {
  'use strict';

  var BG = window.Backgammon;
  var AI = window.CathyAI;
  var FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  var $ = function (id) { return document.getElementById(id); };

  var ART = {
    cathy: 'assets/chatgpt-art/avatar-cathy-cheese.png',
    dog: 'assets/chatgpt-art/avatar-cathy-momdog.png',
    bama: 'assets/photos/03-bama-2026.png',
    jason: 'assets/jason.svg',
  };

  // Optional skins from assets/chatgpt-art/ — used only if the file exists, otherwise
  // the CSS console board / SVG Jason stay. See assets/chatgpt-art/README.md.
  function probe(src, onOk) { var im = new Image(); im.onload = onOk; im.src = src; }
  probe('assets/chatgpt-art/board-table.png', function () { $('board-wrap').classList.add('has-table'); });
  probe('assets/chatgpt-art/avatar-jason.png', function () { ART.jason = 'assets/chatgpt-art/avatar-jason.png'; $('avatar-1').src = ART.jason; });

  // ---------- tiny sound kit ----------
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
    off: function () { beep(784, 0.1); beep(1047, 0.14, 0.1); },
  };

  // ---------- state ----------
  var S = {
    mode: 'ai',
    names: ['Cathy', 'Robo-Jason'],
    st: null,
    history: [],
    selected: null,
    options: [],
    busy: false,
    over: false,
    rand: Math.random,
    firstOff: [false, false],
    saidHome: false,
    lastIdle: 0,
    turnNo: 0,
  };
  function me() { return S.st.turn; }
  function isAIturn() { return S.mode === 'ai' && me() === 1 && !S.over; }
  function isHumanTurn() { return !S.over && !S.busy && (S.mode === 'hotseat' || me() === 0); }
  function pick(arr) { return arr[Math.floor(S.rand() * arr.length)]; }
  function fmt(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && k in vars ? vars[k] : ''; });
  }

  // =====================================================================
  //  VOICE — the game talks like someone who knows Cathy.
  // =====================================================================
  var V = {
    cathyRoll: [
      'A {a} and a {b}. Okay, Mom. Show him.',
      '{a}-{b}. Cheese Cathy has options.',
      'Rolled {a} and {b}. Take your time — the cheese isn\'t going anywhere.',
      '{a} and {b}. Somewhere a dog is wagging.',
      '{a}-{b}. Bama energy. Let\'s use it.',
      'Ooh, {a} and {b}. I\'d look at the glowing ones. 👀',
      '{a} and {b}. You hiked to a waterfall — you can handle this.',
      '{a}-{b}. Purple bag on, game face on.',
    ],
    cathyDoubles: [
      'DOUBLE {a}s! Four moves! The cheese stands TALL. 🧀🧀🧀🧀',
      'Double {a}s! That\'s a Cheese Cathy roll if I ever saw one.',
      'Double {a}s! Jason\'s going to say you\'re lucky. You are. Use it.',
      'Double {a}s — FOUR moves. Somebody light the tiki torches.',
    ],
    cathyHit: [
      'RELEASE THE HOUND! 🐾 Jason\'s on the bar.',
      'You HIT him! Mom energy: unmatched.',
      'Bonk. That\'s a grape on the bar. Sorry, Jason. (Not sorry.)',
      'Sent him packing. He can have snacks on the bar.',
      'Oh, that\'s a HIT. Somebody raised you right — oh wait, that\'s you.',
    ],
    cathyGotHit: [
      'Ouch. He got you. Remember who taught him to count.',
      'On the bar. Deep breath, sip the lime water, come back in.',
      'He hit you. Rude. Jason, we TALKED about this.',
      'Bar time. Think of it as a scenic overlook. 🌴',
    ],
    cathyEnter: [
      'Back in! The cheese cannot be contained.',
      'And she\'s BACK. Like she never left.',
      'Re-entered. The waterfall didn\'t stop you, neither does this.',
    ],
    cathyDance: [
      'No moves this roll. Blocked solid. Not your fault — blame the dice.',
      'Nothing plays. Sit this one out like a champ. Tap Done.',
      'Stuck this turn. Even Cheese Cathy waits sometimes. Tap Done.',
    ],
    cathyAllHome: [
      'Everybody\'s HOME! Bama 2026 vibes. Now bear \'em off. 🏁',
      'All 15 in the home stretch. I MADE IT energy. 🏁',
    ],
    cathyOffFirst: [
      '"I MADE IT!" — first checker off! 🏁',
      'FIRST ONE OFF! Frame it next to the Bama photo. 🏁',
    ],
    cathyOff: [
      'Another one off. {n} down, {left} to go.',
      '{n} home. {left} left. Keep melting, Cheese Cathy.',
      'Off! {left} to go. Jason is sweating.',
      '{n} of 15. The purple bag is basically packed.',
      'Ka-ching. {left} more and we\'re calling Bama.',
    ],
    cathyMove: [
      'Nice.',
      'Good one, Mom.',
      'Solid.',
      'That\'s the move.',
      'Ooh, sneaky.',
      'Love that for you.',
      'Made a point! Jason can\'t land there.',
      'Chef\'s kiss. 🧀',
    ],
    cathyMoreFromBar: ['More from the BAR first, Mom. 👆', 'Still one on the bar — bring her home. 👆'],
    cathyIdle: [
      'Take your time. The cheese isn\'t going anywhere.',
      'The glowing ones are your options. No wrong answers, just louder ones.',
      'Need a nudge? Tap "Ask Cathy". She\'s you. She knows.',
      'Psst — Jason gets nervous when you take your time.',
      'Waterfall energy. Slow, steady, unstoppable.',
    ],
    cathyTurnStart: [
      'Your turn, Mom. Tap ROLL. 🎲',
      'Cathy\'s up! Give those dice a tap.',
      'Back to you. Cheese time. 🎲',
      'You\'re up. Roll it like you mean it.',
    ],
    hint: [
      'Honey, I\'d move {from} to {to}. Mother knows.',
      'If it were me — and it is — {from} to {to}.',
      'Sweetie: {from} to {to}. Then we get a snack.',
      '{from} to {to}. Trust me, I\'ve been you for 70 years.',
      'Try {from} to {to}. It\'s what I\'d do at the waterfall.',
    ],
    jasonTurn: [
      'Jason: "My turn. Don\'t watch too closely, Mom."',
      'Jason: "Okay okay okay. I\'ve got a plan. Probably."',
      'Jason: "Rolling. If this is bad, the dice are broken."',
      'Jason: "Watch and learn." (Cathy, do not learn from this.)',
      'Jason rolls like he does dishes: reluctantly.',
      'Jason: "I\'m going easy on you." He is not.',
    ],
    jasonRoll: [
      'Jason rolled {a}-{b}. He\'s squinting at it.',
      '{a} and {b} for Jason. He says "hmm" a lot.',
      'Jason: "{a} and {b}? Fine. FINE."',
      'Jason\'s {a}-{b}. He\'s pretending he meant that.',
    ],
    jasonDoubles: [
      'Jason rolled double {a}s. He\'s doing a little dance. Do not encourage him.',
      'Double {a}s for Jason. "SEE? SEE?" We see, Jason.',
    ],
    jasonHit: [
      'Jason: "Sorry, Mom." He hit you. He is not sorry.',
      'Jason hit you and immediately looked guilty. Good.',
      'Jason: "It\'s just the game!" It\'s never just the game.',
    ],
    jasonGotHit: [
      'Jason: "MOM." He\'s on the bar. 🐾',
      'Jason: "Okay that was uncalled for." It was called for.',
      'Jason\'s on the bar. He\'s texting someone about it.',
    ],
    jasonDance: [
      'Jason can\'t move. He says the dice are "biased toward cheese."',
      'Jason\'s blocked! He\'s muttering. Let him.',
    ],
    jasonOff: [
      'Jason bore one off. "{n} down!" Great, Jason. Great.',
      'Jason: "{left} to go, Mom." Not if Cheese Cathy has anything to say.',
    ],
    jasonMove: [
      'Jason moved. Standard Jason.',
      'Jason: "Calculated." Uh huh.',
      'Jason made a move. He looks pleased. Suspicious.',
      'Jason: "Boom." It was not boom.',
    ],
    jasonAllHome: ['Jason\'s all home. He\'s hurrying. Hurry is how he loses.'],
    hotseatPass: [
      'Pass the iPad to {name}! No peeking, Cathy. 👀',
      '{name}\'s turn — hand it over. Gently.',
    ],
  };

  // ---------- speech bubbles ----------
  function say(who, text, alsoBoard) {
    var b = $('bubble-' + who);
    b.textContent = text;
    b.classList.remove('fresh');
    void b.offsetWidth;
    b.classList.add('fresh');
    if (alsoBoard !== false) msg(text);
    S.lastIdle = Date.now();
  }
  function msg(t) { $('board-msg').textContent = t || ''; }

  // ---------- avatar swaps (photos DURING play) ----------
  var avatarTimer = null;
  function setAvatar(src, ms) {
    var img = $('avatar-0');
    if (avatarTimer) { clearTimeout(avatarTimer); avatarTimer = null; }
    img.classList.remove('swap'); void img.offsetWidth;
    img.src = src; img.classList.add('swap');
    if (ms) {
      avatarTimer = setTimeout(function () {
        img.classList.remove('swap'); void img.offsetWidth;
        img.src = ART.cathy; img.classList.add('swap');
      }, ms);
    }
  }
  function faceMood(cls, ms) {
    var board = $('board');
    board.classList.remove('face-dog', 'face-bama');
    if (cls) board.classList.add(cls);
    if (ms) setTimeout(function () { board.classList.remove(cls); }, ms);
  }

  // ---------- board construction ----------
  var pointEls = {};
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
    quad([12, 13, 14, 15, 16, 17], 1, 1, 'top');
    quad([18, 19, 20, 21, 22, 23], 1, 3, 'top');
    quad([11, 10, 9, 8, 7, 6], 2, 1, 'bottom');
    quad([5, 4, 3, 2, 1, 0], 2, 3, 'bottom');
    var bar = document.createElement('div');
    bar.id = 'bar-col';
    bar.innerHTML = '<div class="bar-label">BAR</div>' +
      '<div class="bar-stack" id="bar-stack-0"></div>' +
      '<div class="bar-stack" id="bar-stack-1"></div>';
    bar.addEventListener('click', onBarTap);
    board.appendChild(bar);
    // trays: 15 slots each
    [0, 1].forEach(function (p) {
      var t = $('tray-' + p); t.innerHTML = '';
      for (var i = 0; i < 15; i++) { var s = document.createElement('div'); s.className = 'slot'; t.appendChild(s); }
    });
  }

  function checkerEl(color) {
    var d = document.createElement('div');
    d.className = 'checker ' + (color === 0 ? 'cheese' : 'grape');
    var b = $('board');
    if (color === 0 && b.classList.contains('face-dog')) d.classList.add('face-dog');
    if (color === 0 && b.classList.contains('face-bama')) d.classList.add('face-bama');
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
    renderPlayers();

    var bc = $('bar-col');
    bc.classList.remove('selectable', 'selected');
    if (isHumanTurn() && st.rolled) {
      var srcs = {};
      S.options.forEach(function (o) { srcs[o.from] = true; });
      Object.keys(srcs).forEach(function (f) {
        if (f === 'bar') bc.classList.add('selectable');
        else pointEls[+f].classList.add('src-ok');
      });
      if (S.selected !== null) {
        if (S.selected === 'bar') bc.classList.add('selected');
        else pointEls[S.selected].classList.add('selected');
        S.options.forEach(function (o) {
          if (String(o.from) !== String(S.selected)) return;
          if (o.to === 'off') offBox(me()).classList.add('dest-ready');
          else pointEls[o.to].classList.add('dest-ok');
        });
      }
    }
    refreshButtons();
  }

  function offBox(p) { return $('off-box-' + p); }

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
      $('off-count-' + p).textContent = S.st.off[p];
      var slots = $('tray-' + p).children;
      for (var i = 0; i < slots.length; i++) {
        slots[i].className = 'slot' + (i < S.st.off[p] ? (p === 0 ? ' cheese' : ' grape') : '');
      }
      offBox(p).classList.remove('dest-ready');
    });
  }

  function renderDice() {
    var row = $('dice-row');
    row.innerHTML = '';
    var st = S.st;
    row.classList.toggle('four', st.rolled && st.dice.length === 4);
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
    b.className = me() === 0 ? 'cheese' : 'grape';
    if (S.over) { b.textContent = 'GAME OVER'; return; }
    var name = S.names[me()].toUpperCase();
    if (isAIturn()) b.textContent = name + ' IS THINKING…';
    else b.textContent = S.st.rolled ? (name + ' — MOVE ▶') : (name + ' — ROLL 🎲');
  }

  function renderPlayers() {
    [0, 1].forEach(function (p) {
      $('card-' + p).classList.toggle('active', !S.over && me() === p);
      $('pips-' + p).textContent = BG.pipCount(S.st, p);
    });
  }

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
    S.names = ['Cathy', mode === 'ai' ? 'Robo-Jason' : 'Jason'];
    $('name-plate-1').textContent = mode === 'ai' ? '🤖 ROBO-JASON' : '🧑 JASON';
    $('off-name-1').textContent = S.names[1];
    S.st = BG.newGame();
    S.st.turn = 0;
    S.history = []; S.selected = null; S.options = [];
    S.busy = false; S.over = false;
    S.firstOff = [false, false]; S.saidHome = false; S.turnNo = 0;
    faceMood(null);
    setAvatar(ART.cathy);
    $('overlay-win').classList.add('hidden');
    say(0, pick(['New game! You go first, Mom. Always. 🎲', 'Fresh board, fresh cheese. Tap ROLL, Cathy. 🎲']));
    say(1, mode === 'ai' ? pick(['Robo-Jason online. I\'ll be gentle. Probably.', 'Beep boop. I was programmed by your son. Lower your expectations.'])
      : pick(['Jason: "Ready when you are, Mom."', 'Jason: "Loser does the dishes."']), false);
    render();
  }

  function refreshOptions() {
    if (!S.st.rolled || S.over) { S.options = []; return; }
    S.options = BG.legalOptions(S.st, me(), S.st.remaining);
  }

  function rollFor(player) {
    var dice = BG.rollDice(S.rand);
    S.st.dice = AI.orderDice(BG, S.st, player, dice);
    S.st.remaining = S.st.dice.slice();
    S.st.rolled = true;
    S.history = []; S.selected = null;
    refreshOptions();
  }

  function doRoll() {
    if (!isHumanTurn() || S.st.rolled) return;
    sfx.roll();
    Array.prototype.forEach.call(document.querySelectorAll('#dice-row .die'), function (d) { d.classList.add('rolling'); });
    S.busy = true; refreshButtons();
    setTimeout(function () {
      S.busy = false;
      var p = me();
      rollFor(p);
      var a = S.st.dice[0], b = S.st.dice[1];
      var vars = { a: a, b: b };
      var isC = p === 0;
      if (!S.options.length) {
        say(p, pick(isC ? V.cathyDance : V.jasonDance));
        sfx.bad();
      } else if (S.st.dice.length === 4) {
        say(p, fmt(pick(isC ? V.cathyDoubles : V.jasonDoubles), vars));
      } else if (S.st.bar[p] > 0) {
        say(p, isC ? 'Rolled ' + a + '-' + b + '. Bring one in from the BAR first, Mom. 👆' : 'Jason rolled ' + a + '-' + b + '. He has to come in from the bar first.');
      } else {
        say(p, fmt(pick(isC ? V.cathyRoll : V.jasonRoll), vars));
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

  // Apply a move for `player` with full commentary. Returns true if game ended.
  function commitMove(player, m) {
    var st = S.st, isC = player === 0;
    var hit = m.to !== 'off' && st.points[m.to].c === (1 - player) && st.points[m.to].n === 1;
    var wasHome = BG.allInHome(st, player);
    BG.applyMoveTo(st, player, m);
    st.remaining.splice(st.remaining.indexOf(m.die), 1);
    st.movesThisTurn++;
    S.selected = null;

    if (m.to === 'off') {
      sfx.off();
      var n = st.off[player], left = 15 - n;
      if (isC) {
        if (!S.firstOff[0]) { S.firstOff[0] = true; say(0, pick(V.cathyOffFirst)); setAvatar(ART.bama, 4000); faceMood('face-bama', 4000); }
        else if (st.winner === -1) say(0, fmt(pick(V.cathyOff), { n: n, left: left }));
      } else if (st.winner === -1) {
        say(1, fmt(pick(V.jasonOff), { n: n, left: left }));
      }
    } else if (hit) {
      sfx.hit();
      if (isC) { say(0, pick(V.cathyHit)); say(1, pick(V.jasonGotHit), false); setAvatar(ART.dog, 3500); faceMood('face-dog', 3500); }
      else { say(1, pick(V.jasonHit)); say(0, pick(V.cathyGotHit), false); }
    } else if (m.from === 'bar') {
      sfx.move();
      say(player, isC ? pick(V.cathyEnter) : 'Jason\'s back in. Shrugging like it was the plan.');
    } else {
      sfx.move();
      if (!wasHome && BG.allInHome(st, player) && st.winner === -1) {
        say(player, pick(isC ? V.cathyAllHome : V.jasonAllHome));
        if (isC) { setAvatar(ART.bama, 3500); }
      } else if (isC && st.bar[0] > 0) {
        say(0, pick(V.cathyMoreFromBar));
      } else if (S.rand() < (isC ? 0.55 : 0.4)) {
        say(player, pick(isC ? V.cathyMove : V.jasonMove), false);
      }
    }
    if (st.winner !== -1) { onWin(player); render(); return true; }
    return false;
  }

  function doMove(m) {
    if (isHumanTurn()) S.history.push(BG.clone(S.st));
    var p = me();
    if (commitMove(p, m)) return;
    refreshOptions();
    if (!S.options.length) msg(S.st.remaining.length ? 'No more moves — tap Done ⏭' : 'Done! Tap ⏭ Done to pass.');
    render();
  }

  function endTurn() {
    if (S.over || S.busy) return;
    S.st.turn = 1 - S.st.turn;
    S.st.dice = []; S.st.remaining = []; S.st.rolled = false;
    S.st.movesThisTurn = 0;
    S.history = []; S.selected = null; S.options = [];
    S.turnNo++;
    render();
    if (isAIturn()) {
      S.busy = true; refreshButtons(); renderBanner();
      say(1, pick(V.jasonTurn));
      setTimeout(aiRoll, 900);
    } else if (me() === 0) {
      say(0, pick(V.cathyTurnStart));
    } else {
      say(1, fmt(pick(V.hotseatPass), { name: S.names[1] }));
    }
  }

  function aiRoll() {
    if (S.over) { S.busy = false; return; }
    rollFor(1);
    sfx.roll();
    var a = S.st.dice[0], b = S.st.dice[1];
    if (!S.options.length) say(1, pick(V.jasonDance));
    else if (S.st.dice.length === 4) say(1, fmt(pick(V.jasonDoubles), { a: a }));
    else say(1, fmt(pick(V.jasonRoll), { a: a, b: b }));
    render();
    setTimeout(aiStep, 800);
  }

  function aiStep() {
    if (S.over) { S.busy = false; return; }
    refreshOptions();
    var m = S.options.length ? AI.chooseMove(BG, S.st, 1, S.st.remaining, S.rand) : null;
    if (!m) {
      setTimeout(function () { S.busy = false; endTurn(); }, 700);
      return;
    }
    if (commitMove(1, m)) { S.busy = false; return; }
    render();
    setTimeout(aiStep, 750);
  }

  // ---------- input ----------
  function onPointTap(idx) {
    if (!isHumanTurn() || !S.st.rolled) {
      if (isHumanTurn() && !S.st.rolled) say(me(), me() === 0 ? 'Tap ROLL first, Mom! 🎲' : 'Roll first, Jason. 🎲');
      return;
    }
    var st = S.st, player = me();
    var isSrc = S.options.some(function (o) { return o.from === idx; });
    if (S.selected === null) {
      if (st.points[idx].c === player && isSrc) { S.selected = idx; sfx.select(); render(); }
      return;
    }
    if (S.selected === idx) { S.selected = null; render(); return; }
    var m = bestOption(S.selected, idx);
    if (m) { doMove(m); return; }
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
    say(me(), me() === 0 ? pick(['Undone. Mulligans are a mom right. ↩️', 'Take-backsies granted. ↩️']) : 'Jason took it back. Typical. ↩️');
    render();
  }

  function onHint() {
    if (!isHumanTurn() || !S.options.length) return;
    var m = AI.chooseMove(BG, S.st, me(), S.st.remaining, S.rand);
    if (!m) return;
    var from = m.from === 'bar' ? 'the Bar' : 'point ' + (m.from + 1);
    var to = m.to === 'off' ? 'OFF the board 🏁' : 'point ' + (m.to + 1);
    say(0, fmt(pick(V.hint), { from: from, to: to }));
    var fromEl = m.from === 'bar' ? $('bar-col') : pointEls[m.from];
    fromEl.classList.add('flash');
    if (m.to !== 'off') pointEls[m.to].classList.add('flash');
    else offBox(me()).classList.add('dest-ready');
    setTimeout(render, 1800);
  }

  // idle nudges during Cathy's turn
  setInterval(function () {
    if (!S.st || S.over || !isHumanTurn() || me() !== 0) return;
    if (Date.now() - S.lastIdle > 22000) say(0, pick(V.cathyIdle), false);
  }, 4000);

  // ---------- win ----------
  var WIN_LINES = [
    'Bama 2026: It was worth it. 🏆',
    'Cheese Cathy does it again! 🧀🎉',
    'Somebody wants cake. And bragging rights. 🎂',
    'The cheese stands alone. On top. 🏁',
    'I MADE IT! (You made it.) 🏆',
  ];
  function onWin(player) {
    S.over = true; S.busy = false;
    var kind = BG.winKind(S.st, player);
    var kindTxt = kind === 2 ? 'BACKGAMMON! Triple! 🤯' : kind === 1 ? 'GAMMON! Double! ✨' : 'a win!';
    sfx.win();
    var title = $('win-title'), sub = $('win-sub'), photo = $('win-photo');
    photo.onerror = function () { photo.onerror = null; photo.src = photo.src.replace(/\.png$/, '.svg'); };
    if (player === 0) {
      title.textContent = '🧀 Cathy wins — ' + kindTxt;
      sub.textContent = pick(WIN_LINES);
      photo.src = ART.bama;
      say(0, 'I MADE IT! 🏁🏆'); say(1, S.mode === 'ai' ? 'Robo-Jason: "…recalculating."' : 'Jason: "Best of three?"', false);
      setAvatar(ART.bama);
    } else {
      title.textContent = S.names[1] + ' wins — ' + kindTxt;
      sub.textContent = pick(['Good game, Cathy! Demand a rematch. 😄', 'He got lucky. Everyone saw it. Rematch. 🐾', 'The hound is displeased. Again? 🐾']);
      photo.src = 'assets/photos/01-mom-dog-hybrid.png';
      say(1, S.names[1] + ': "GG, Mom. Love you. Rematch?"'); say(0, 'Release the hound. Rematch. 🐾', false);
      setAvatar(ART.dog);
    }
    setTimeout(function () { $('overlay-win').classList.remove('hidden'); }, 900);
  }

  // ---------- wiring ----------
  function show(screen) {
    $('screen-title').classList.toggle('hidden', screen !== 'title');
    $('screen-game').classList.toggle('hidden', screen !== 'game');
  }
  function start(mode) { show('game'); newGame(mode); }

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
  $('btn-win-menu').addEventListener('click', function () { $('overlay-win').classList.add('hidden'); show('title'); });
  $('btn-sound').addEventListener('click', function () {
    soundOn = !soundOn;
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  });
  [0, 1].forEach(function (ix) {
    offBox(ix).addEventListener('click', function () {
      if (!isHumanTurn() || S.selected === null || ix !== me()) return;
      var m = bestOption(S.selected, 'off');
      if (m) doMove(m);
      else { sfx.bad(); say(me(), 'That one can\'t bear off yet — all 15 have to be home first. 🏁'); }
    });
  });
  $('dice-row').addEventListener('click', function () { if (isHumanTurn() && !S.st.rolled) doRoll(); });

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
    var guard = 0, played = 0;
    while (played < n && guard++ < n * 12 && S.st.winner === -1) {
      var dice = BG.rollDice(rand);
      S.st.dice = AI.orderDice(BG, S.st, me(), dice);
      var rem = S.st.dice.slice(), moved = false, g2 = 0;
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
  var seed = parseInt(params.get('seed') || '2026', 10);

  if (shot === 'smoke') {
    (function () {
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function assert(c, m) { if (!c) throw new Error(m); }
      (async function () {
        try {
          show('game');
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
          assert(document.querySelectorAll('#dice-row .die').length === S.st.dice.length, 'dice rendered');
          var m = S.options[0];
          if (m.from === 'bar') onBarTap(); else onPointTap(m.from);
          assert(S.selected !== null && String(S.selected) === String(m.from), 'select works');
          if (m.to === 'off') offBox(me()).click(); else onPointTap(m.to);
          assert(S.st.movesThisTurn === 1, 'tap-to-move works');
          onUndo();
          assert(S.st.movesThisTurn === 0, 'undo works');
          assert($('bubble-0').textContent.length > 0, 'cathy bubble speaks');
          assert(document.querySelector('.checker.cheese') && document.querySelector('.checker.grape'), 'art checkers rendered');
          // AI mode: let Robo-Jason take a real, timed turn through the live path
          newGame('ai');
          S.rand = seededRand(seed + 11);
          endTurn(); // -> Jason's turn, AI schedules roll/moves
          await wait(6000);
          assert(me() === 0 && !S.busy, 'AI turn completed and handed back to Cathy');
          // full in-page AI-vs-AI game via engine (fast)
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
    autoHalfMoves(14, S.rand);
    S.st.turn = 0;
    rollFor(0);
    var srcs = S.options.map(function (o) { return o.from; }).filter(function (f) { return f !== 'bar'; });
    if (srcs.length) S.selected = srcs.sort(function (a, b) { return b - a; })[0];
    say(0, fmt(pick(V.cathyRoll), { a: S.st.dice[0], b: S.st.dice[1] }));
    say(1, pick(V.jasonTurn).replace('Jason:', S.names[1] + ':'), false);
    S.rand = Math.random;
    render();
  } else if (shot === 'hit') {
    // Cathy just hit a blot: hound avatar + hound checkers + banter, Jason on the bar
    S.rand = seededRand(seed);
    show('game');
    newGame('ai');
    autoHalfMoves(10, S.rand);
    S.st.turn = 0;
    if (S.st.bar[0] > 0) { S.st.points[23] = { c: 0, n: (S.st.points[23].c === 0 ? S.st.points[23].n : 0) + S.st.bar[0] }; S.st.bar[0] = 0; }
    S.st.bar[1] = 1;
    S.st.dice = [5, 3]; S.st.remaining = [3]; S.st.rolled = true;
    refreshOptions();
    say(0, V.cathyHit[0]); say(1, V.jasonGotHit[0], false);
    setAvatar(ART.dog); faceMood('face-dog');
    S.rand = Math.random;
    render();
  } else if (shot === 'win') {
    show('game');
    newGame('ai');
    S.st.off = [14, 7];
    S.st.points = S.st.points.map(function () { return { c: -1, n: 0 }; });
    S.st.points[0] = { c: 0, n: 1 };
    S.st.points[18] = { c: 1, n: 3 }; S.st.points[19] = { c: 1, n: 3 }; S.st.points[21] = { c: 1, n: 2 };
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
