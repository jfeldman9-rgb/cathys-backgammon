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

  // ---------- sound (sfx.js: synthesized arcade kit; every call is a no-op while muted) ----------
  var soundOn = true;
  var sfx = window.CathySfx || (function () {
    var noop = function () {}, stub = {};
    ['roll', 'doubles', 'dance', 'pickup', 'place', 'stack', 'enter', 'hit', 'off', 'cheese', 'win', 'lose', 'tap', 'bad', 'setMuted', 'unlock']
      .forEach(function (k) { stub[k] = noop; });
    return stub;
  })();
  // iOS suspends the AudioContext when the app is backgrounded; any tap brings it back.
  document.addEventListener('pointerdown', function () { if (soundOn) sfx.unlock(); }, { passive: true });

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
  // Random line, but never the same line twice in a row from the same list.
  var lastPick = typeof WeakMap === 'function' ? new WeakMap() : null;
  function pick(arr) {
    if (arr.length < 2) return arr[0];
    var prev = lastPick ? lastPick.get(arr) : -1;
    var i = Math.floor(S.rand() * arr.length);
    if (i === prev) i = (i + 1 + Math.floor(S.rand() * (arr.length - 1))) % arr.length;
    if (lastPick) lastPick.set(arr, i);
    return arr[i];
  }
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
      '{a} and {b}. PROGRAM: BAMA 2026. Resistance level: Jason. Pedal. 🚴',
      '{a}-{b}. The console says LEVEL UP. The console is never wrong.',
      'A {a} and a {b}. Sharp cheddar move or mild? Your call, Mom.',
      '{a}-{b}. Even the hound could play this one. No offense, hound. 🐾',
      '{a} and {b}. That\'s a "grab the purple bag, we\'re going places" roll.',
      '{a}-{b}. Jason just said "uh oh" under his breath. I heard it.',
      '{a} and {b}. Somewhere in Alabama a crowd goes wild.',
      'Rolled {a}-{b}. The dice respect the cheese.',
      '{a} and {b}. Move like you\'re late for the waterfall.',
      '{a}-{b}. Gouda roll. Get it? …Moving on.',
    ],
    cathyDoubles: [
      'DOUBLE {a}s! Four moves! The cheese stands TALL. 🧀🧀🧀🧀',
      'Double {a}s! That\'s a Cheese Cathy roll if I ever saw one.',
      'Double {a}s! Jason\'s going to say you\'re lucky. You are. Use it.',
      'Double {a}s — FOUR moves. Somebody light the tiki torches.',
      'DOUBLE {a}s! The console just flashed PROGRAM: BAMA 2026. 🏁',
      'Double {a}s! The hound is doing zoomies. Four moves, Mom! 🐾',
      'Double {a}s! Jason: "That\'s rigged." Cathy: "That\'s CHEESE." 🧀',
      'Double {a}s. Four moves. The purple bag just unzipped itself. 👜',
      'DOUBLE {a}s! Pop the lime water. Four moves, no waiting.',
      'Double {a}s! Mom, I have never been prouder, and I\'ve been you the whole time.',
    ],
    cathyHit: [
      'RELEASE THE HOUND! 🐾 Jason\'s on the bar.',
      'You HIT him! Mom energy: unmatched.',
      'Bonk. That\'s a grape on the bar. Sorry, Jason. (Not sorry.)',
      'Sent him packing. He can have snacks on the bar.',
      'Oh, that\'s a HIT. Somebody raised you right — oh wait, that\'s you.',
      'WHAM. Jason, go sit on the bar and think about what you did.',
      'HIT! The hound got a grape! Not a real grape, Jason, put the phone down. 🐾',
      'Bar time for Jason. He can hold the purple bag while he waits. 👜',
      'BOOM. That\'s the sound of Cheese Cathy landing on a grape. 🧀💥',
      'You hit him! Jason\'s doing the face he did when he lost at Uno in \'09.',
      'PROGRAM: BAMA 2026 — HIT REGISTERED. The bike console approves. 🚴',
      'Grape, meet bar. Bar, meet grape. You two have a lot to talk about.',
      'Hit! And she says "oops" like she didn\'t mean it. She meant it.',
      'That grape got sent to the bar like a kid sent to his room. 🐾',
    ],
    cathyGotHit: [
      'Ouch. He got you. Remember who taught him to count.',
      'On the bar. Deep breath, sip the lime water, come back in.',
      'He hit you. Rude. Jason, we TALKED about this.',
      'Bar time. Think of it as a scenic overlook. 🌴',
      'Hit. Fine. The cheese has been to the bar before. The cheese comes BACK.',
      'He hit his own mother. On Mother\'s Day. (It\'s not Mother\'s Day. Still.)',
      'On the bar. Grab the purple bag, we\'re only here a minute. 👜',
      'Jason hit you and said "sorry Mom" in the voice he uses for parking tickets.',
      'Bar. Whatever. You climbed to a WATERFALL. This is a speed bump.',
      'Okay, he got one. The hound remembers. The hound always remembers. 🐾',
    ],
    cathyEnter: [
      'Back in! The cheese cannot be contained.',
      'And she\'s BACK. Like she never left.',
      'Re-entered. The waterfall didn\'t stop you, neither does this.',
      'She\'s in! Cathy re-enters the room and everyone claps.',
      'Back on the board. Purple bag, sunglasses, no comment. 👜',
      'Cheese, re-entered. Somebody tell Jason the party\'s not over.',
      'And the hound is OFF the leash again. Welcome back, Mom. 🐾',
      'Re-entry! Bama 2026: STILL made it. 🏁',
    ],
    cathyDance: [
      'No moves this roll. Blocked solid. Not your fault — blame the dice.',
      'Nothing plays. Sit this one out like a champ. Tap Done.',
      'Stuck this turn. Even Cheese Cathy waits sometimes. Tap Done.',
      'No legal moves. Consider this a snack break. Tap Done. 🧀',
      'Blocked! Jason built a wall. Very un-Jason of him to finish something.',
      'Nothing plays. Fine. Stretch, sip, tap Done. Program resumes shortly.',
      'Zero moves. The hound is sitting. Good hound. Tap Done. 🐾',
      'Dance turn. Shimmy a little, then tap Done. Nobody\'s looking. (Jason is.)',
    ],
    cathyAllHome: [
      'Everybody\'s HOME! Bama 2026 vibes. Now bear \'em off. 🏁',
      'All 15 in the home stretch. I MADE IT energy. 🏁',
      'All home! The purple bag is by the door. Start bearing off. 👜',
      'FIFTEEN cheeses home. The console reads: COOLDOWN. Bear \'em off! 🚴',
      'Everyone\'s home! Even the hound. Now get them OFF the board. 🐾',
    ],
    cathyOffFirst: [
      '"I MADE IT!" — first checker off! 🏁',
      'FIRST ONE OFF! Frame it next to the Bama photo. 🏁',
      'First one off the board! Somebody hold up the "I MADE IT" sign. 🏁',
      'One off! That\'s the first slice. There are fourteen more slices, Cathy. 🧀',
    ],
    cathyOff: [
      'Another one off. {n} down, {left} to go.',
      '{n} home. {left} left. Keep melting, Cheese Cathy.',
      'Off! {left} to go. Jason is sweating.',
      '{n} of 15. The purple bag is basically packed.',
      'Ka-ching. {left} more and we\'re calling Bama.',
      '{n} off! The tray\'s filling up like a cheese board at a party. 🧀',
      '{left} to go. Jason just said "it\'s not over." It is a little over, Jason.',
      '{n} down. The hound is counting too. She\'s got {left}. 🐾',
      'Off! {n} in the tray. PROGRAM: BAMA 2026 — {left} intervals left. 🚴',
      '{n} off. Cheese Cathy doesn\'t rush. Cheese Cathy AGES gracefully. 🧀',
      '{left} left! Warm up the "I MADE IT" voice. 🏁',
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
      'Smooth. Like brie.',
      'Textbook. The textbook is called "Cathy."',
      'Jason blinked. Good sign.',
      'That\'s a purple-bag move. Classy, mobile, hard to argue with. 👜',
      'Sharp. Like a cheddar. 🧀',
      'The hound approves. 🐾',
      'Look at you. Bama 2026 didn\'t happen by accident.',
      'Steady. Waterfall pace.',
    ],
    cathyMoreFromBar: [
      'More from the BAR first, Mom. 👆',
      'Still one on the bar — bring her home. 👆',
      'One more cheese on the bar. Nobody leaves the bar behind. 👆🧀',
    ],
    cathyIdle: [
      'Take your time. The cheese isn\'t going anywhere.',
      'The glowing ones are your options. No wrong answers, just louder ones.',
      'Need a nudge? Tap "Ask Cathy". She\'s you. She knows.',
      'Psst — Jason gets nervous when you take your time.',
      'Waterfall energy. Slow, steady, unstoppable.',
      'No rush. Cheese gets better with age. So do you. 🧀',
      'Jason\'s pretending he isn\'t peeking. He\'s peeking.',
      'The console is holding. PROGRAM: BAMA 2026 waits for no one — except you. 🚴',
      'Tap a glowing checker, Mom. Then tap where it goes. Like pointing at cheese in a case.',
      'The hound has laid down. Take that as permission to think. 🐾',
      'Where\'s the purple bag? Just checking. Okay, your move. 👜',
    ],
    cathyTurnStart: [
      'Your turn, Mom. Tap ROLL. 🎲',
      'Cathy\'s up! Give those dice a tap.',
      'Back to you. Cheese time. 🎲',
      'You\'re up. Roll it like you mean it.',
      'Your turn. Roll like you\'re shaking out a beach towel. 🎲',
      'Cathy\'s turn. The console flashes: GO. 🚴🎲',
      'Dice are yours, Mom. The hound believes in you. 🐾',
      'Your roll. Jason says "no pressure." That means pressure. 🎲',
      'Up you go. Grab the purple bag, tap ROLL. 👜🎲',
    ],
    hint: [
      'Honey, I\'d move {from} to {to}. Mother knows.',
      'If it were me — and it is — {from} to {to}.',
      'Sweetie: {from} to {to}. Then we get a snack.',
      '{from} to {to}. Trust me, I\'ve been you for 70 years.',
      'Try {from} to {to}. It\'s what I\'d do at the waterfall.',
      '{from} to {to}, Mom. I\'d bet the purple bag on it. 👜',
      'Okay, cheese to cheese: {from} to {to}. {why}',
      '{from} to {to}. The hound sniffed it out. Trust the hound. 🐾',
      'Move {from} to {to}. Like picking the good cheddar off the top shelf. 🧀',
      'PROGRAM: BAMA 2026 recommends {from} to {to}. Resistance: light. 🚴',
      '{from} to {to}. Jason would never see it coming. He\'s looking at his phone.',
      'I asked myself. I said {from} to {to}. I agree with me.',
      '{from} to {to}. {why} And then maybe a snack.',
      'Mother\'s intuition says {from} to {to}. Mother\'s intuition also found your keys in 1998.',
      'Put on your glasses, Mom: {from} to {to}. {why}',
    ],
    hintWhy: {
      hit: 'It HITS Jason. Release the hound. 🐾',
      off: 'It bears one OFF. I MADE IT energy. 🏁',
      bar: 'It gets you off the bar, which is where Jason wants you.',
      point: 'It makes a point — two cheeses, Jason can\'t land there.',
      safe: 'Nice and safe. Cheese in numbers.',
      race: 'It moves the race along. Waterfall pace.',
    },
    jasonTurn: [
      'Jason: "My turn. Don\'t watch too closely, Mom."',
      'Jason: "Okay okay okay. I\'ve got a plan. Probably."',
      'Jason: "Rolling. If this is bad, the dice are broken."',
      'Jason: "Watch and learn." (Cathy, do not learn from this.)',
      'Jason rolls like he does dishes: reluctantly.',
      'Jason: "I\'m going easy on you." He is not.',
      'Jason: "Hang on, let me think." We wait. We wait some more.',
      'Jason\'s turn. He cracked his knuckles. That never helps.',
      'Jason: "I read a strategy article." He read the headline.',
      'Jason\'s up. He\'s squinting like it\'s a menu with no pictures.',
      'Jason: "Mom, is the hound allowed on the board?" No, Jason. Roll.',
    ],
    jasonRoll: [
      'Jason rolled {a}-{b}. He\'s squinting at it.',
      '{a} and {b} for Jason. He says "hmm" a lot.',
      'Jason: "{a} and {b}? Fine. FINE."',
      'Jason\'s {a}-{b}. He\'s pretending he meant that.',
      'Jason rolled {a}-{b} and said "interesting." It is not interesting.',
      '{a}-{b} for Jason. He asked if he could re-roll. He cannot.',
      'Jason: "{a} and {b}. Okay. I see it." He does not see it.',
      'Jason rolled {a}-{b} and looked at Mom for approval. Cute.',
    ],
    jasonDoubles: [
      'Jason rolled double {a}s. He\'s doing a little dance. Do not encourage him.',
      'Double {a}s for Jason. "SEE? SEE?" We see, Jason.',
      'Double {a}s for Jason. He says he "manifested" it. Sure.',
      'Jason: DOUBLE {a}s. He wants it noted for the record. Noted, Jason.',
      'Jason rolled double {a}s and is now insufferable. Temporarily.',
    ],
    jasonHit: [
      'Jason: "Sorry, Mom." He hit you. He is not sorry.',
      'Jason hit you and immediately looked guilty. Good.',
      'Jason: "It\'s just the game!" It\'s never just the game.',
      'Jason hit you and then asked if you needed anything. Deflection.',
      'Jason: "Nothing personal, Mom." Everything is personal, Jason.',
      'Jason hit a cheese. The hound has noted this in the ledger. 🐾',
      'Jason hit you. He\'s already apologizing in advance for Thanksgiving.',
    ],
    jasonGotHit: [
      'Jason: "MOM." He\'s on the bar. 🐾',
      'Jason: "Okay that was uncalled for." It was called for.',
      'Jason\'s on the bar. He\'s texting someone about it.',
      'Jason: "I was GOING to move that." Sure you were, sweetie.',
      'Jason\'s on the bar, rubbing his head like the grape actually hurt.',
      'Jason: "Is this because I didn\'t call Sunday?" Yes. Also it\'s the game.',
      'Jason\'s on the bar. He says the hound "looked at him funny." 🐾',
      'Jason: "Robo-Jason wouldn\'t have let that happen." Robo-Jason just did.',
    ],
    jasonDance: [
      'Jason can\'t move. He says the dice are "biased toward cheese."',
      'Jason\'s blocked! He\'s muttering. Let him.',
      'Jason has no moves. He\'s blaming the lighting.',
      'Jason\'s stuck. He is asking the hound for advice. The hound declines. 🐾',
      'No moves for Jason. He calls this "resting." Sure.',
    ],
    jasonOff: [
      'Jason bore one off. "{n} down!" Great, Jason. Great.',
      'Jason: "{left} to go, Mom." Not if Cheese Cathy has anything to say.',
      'Jason took one off. He counted it twice. Still {n}.',
      'Jason: "{n} off!" He said it like a touchdown. It was a checker.',
      'Jason\'s bearing off. {left} left. He\'s narrating it. Nobody asked.',
    ],
    jasonMove: [
      'Jason moved. Standard Jason.',
      'Jason: "Calculated." Uh huh.',
      'Jason made a move. He looks pleased. Suspicious.',
      'Jason: "Boom." It was not boom.',
      'Jason moved and then explained why. At length.',
      'Jason: "Chess move." Jason, this is backgammon.',
      'Jason slid one over like he was returning a shopping cart.',
      'Jason moved. He wants credit for it. Here: credit.',
      'Jason: "Trust the process." The process is vibes.',
    ],
    jasonAllHome: [
      'Jason\'s all home. He\'s hurrying. Hurry is how he loses.',
      'Jason got all 15 home and announced it to the room. The room is you.',
    ],
    jasonEnter: [
      'Jason\'s back in. Shrugging like it was the plan.',
      'Jason re-entered. He says he "needed a minute." On the bar.',
      'Jason\'s back on the board, looking around for the hound. 🐾',
    ],
    jasonBarRoll: [
      'Jason rolled {a}-{b}. He has to come in from the bar first.',
      'Jason\'s {a}-{b}. Bar first, buddy. Rules are rules.',
      '{a}-{b} for Jason. He\'d like to skip the bar. He may not.',
    ],
    cathyBarRoll: [
      'Rolled {a}-{b}. Bring one in from the BAR first, Mom. 👆',
      '{a}-{b}. First things first: the bar. Tap it. 👆',
      '{a} and {b}. Cheese on the bar comes home first. Tap the BAR. 👆🧀',
      '{a}-{b}. Bar first, then mischief. 👆',
    ],
    hotseatPass: [
      'Pass the iPad to {name}! No peeking, Cathy. 👀',
      '{name}\'s turn — hand it over. Gently.',
      'Hand it to {name}. Wipe the cheese off first. 🧀',
      '{name}\'s up. Pass it like a hot dish at Thanksgiving.',
    ],
    undo: [
      'Undone. Mulligans are a mom right. ↩️',
      'Take-backsies granted. ↩️',
      'Rewound. Nobody saw that. (Jason saw that.) ↩️',
      'Undo! The hound pretends it never happened. 🐾↩️',
      'Undone. Cheese Cathy edits her own history. ↩️',
    ],
    newGame: [
      'New game! You go first, Mom. Always. 🎲',
      'Fresh board, fresh cheese. Tap ROLL, Cathy. 🎲',
      'Board reset. PROGRAM: BAMA 2026 — begin warm-up. Tap ROLL. 🚴🎲',
      'New game! Purple bag on the hook, dice in hand. 👜🎲',
      'Clean slate. The hound has been let out. Tap ROLL. 🐾🎲',
    ],
    roboHello: [
      'Robo-Jason online. I\'ll be gentle. Probably.',
      'Beep boop. I was programmed by your son. Lower your expectations.',
      'Robo-Jason booting… loading "sorry Mom" module… ready.',
      'Robo-Jason here. I have read the rules. Once. Skimmed.',
    ],
    jasonHello: [
      'Jason: "Ready when you are, Mom."',
      'Jason: "Loser does the dishes."',
      'Jason: "Best of one. No wait — best of three."',
      'Jason: "I\'m warmed up. I stretched." He did not stretch.',
    ],
    rollFirst: [
      'Tap ROLL first, Mom! 🎲',
      'Dice first, cheese second. Tap ROLL. 🎲',
      'Roll first! Even the hound knows that. 🐾🎲',
    ],
    cantOff: [
      'That one can\'t bear off yet — all 15 have to be home first. 🏁',
      'Not yet! Everyone has to be home before the tray opens. 🏁',
      'The tray\'s locked until all 15 are home. House rules. Also actual rules. 🏁',
    ],
  };

  // ---------- speech bubbles ----------
  function say(who, text, alsoBoard) {
    var b = $('bubble-' + who);
    b.textContent = text;
    b.classList.remove('fresh');
    void b.offsetWidth;
    b.classList.add('fresh');
    fitBubble(b);
    if (alsoBoard !== false) msg(text);
    S.lastIdle = Date.now();
  }
  // The rail is narrow on a 1024-wide iPad; step the font down rather than overflow the card.
  function fitBubble(b) {
    b.classList.remove('tight', 'tighter');
    if (b.scrollHeight <= b.clientHeight + 1) return;
    b.classList.add('tight');
    if (b.scrollHeight <= b.clientHeight + 1) return;
    b.classList.replace('tight', 'tighter');
  }
  function fitBubbles() { fitBubble($('bubble-0')); fitBubble($('bubble-1')); }
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

  // ---------- console fit: checkers fill their points, five always stack in a half-board ----------
  // --ck drives checker diameter AND the bar column width, so measure -> set -> re-measure once.
  var fitRaf = 0;
  function fitBoardNow() {
    var p = pointEls[12], board = $('board');
    if (!p || $('screen-game').classList.contains('hidden')) return;
    var pw = p.offsetWidth, ph = p.offsetHeight;   // border box: checkers may kiss the 3px highlight ring
    if (!pw || !ph) return;
    var byW = pw - 4;
    var byH = (ph - 40) / 4.6;        // 5 checkers @ 16% overlap + point number + ×N badge
    var ck = Math.max(24, Math.min(byW, byH, 88));
    board.style.setProperty('--ck', Math.round(ck) + 'px');
  }
  // Home tray: 5×3 discs sized to whatever height the rail has left between dice and keypad.
  function fitTrayNow() {
    var tray = $('tray-0');
    if (!tray || $('screen-game').classList.contains('hidden')) return;
    var w = tray.clientWidth - 8, h = tray.clientHeight - 8;    // minus 4px padding each side
    if (w <= 0 || h <= 0) return;
    // pick the column count (5×3, 8×2 or 15×1) that gives the biggest discs for this rail
    var best = { cols: 5, slot: 0 };
    [5, 8, 15].forEach(function (cols) {
      var rows = Math.ceil(15 / cols);
      var s = Math.floor(Math.min((w - 3 * (cols - 1)) / cols, (h - 3 * (rows - 1)) / rows));
      if (s > best.slot) best = { cols: cols, slot: s };
    });
    var side = $('side');
    side.style.setProperty('--slot', Math.max(8, Math.min(best.slot, 60)) + 'px');
    side.style.setProperty('--cols', best.cols);
  }
  function fitBoard() {
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(function () {
      fitRaf = 0;
      fitBoardNow(); fitTrayNow();
      requestAnimationFrame(function () { fitBoardNow(); fitTrayNow(); fitBubbles(); });
    });
  }
  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', fitBoard);
  if (window.ResizeObserver) {
    new ResizeObserver(fitBoard).observe($('board-wrap'));
  }

  // ---------- keep the console still: no pinch zoom, no rubber-band scroll while playing ----------
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  // (double-tap zoom is handled by touch-action: manipulation / none in styles.css)
  document.addEventListener('touchmove', function (e) {
    if (e.target.closest && e.target.closest('.sheet, #screen-title')) return;   // help / win sheets may scroll
    if (getComputedStyle($('screen-game')).position !== 'fixed') return;         // phone-portrait layout scrolls
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

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
      d.dataset.v = v;                       // pips are drawn by CSS so they scale with the die
      d.textContent = FACES[v - 1];          // glyph stays for a11y / no-CSS fallback
      d.setAttribute('aria-label', 'die showing ' + v);
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
    say(0, pick(V.newGame));
    say(1, pick(mode === 'ai' ? V.roboHello : V.jasonHello), false);
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
        sfx.dance();
      } else if (S.st.dice.length === 4) {
        say(p, fmt(pick(isC ? V.cathyDoubles : V.jasonDoubles), vars));
        sfx.doubles();
      } else if (S.st.bar[p] > 0) {
        say(p, fmt(pick(isC ? V.cathyBarRoll : V.jasonBarRoll), vars));
      } else {
        say(p, fmt(pick(isC ? V.cathyRoll : V.jasonRoll), vars));
      }
      render();
    }, 450);
  }

  // Why the hint is a good idea — so "Ask Cathy" teaches a little between the jokes.
  function hintWhy(m) {
    var st = S.st, p = me();
    if (m.to === 'off') return V.hintWhy.off;
    if (st.points[m.to].c === (1 - p) && st.points[m.to].n === 1) return V.hintWhy.hit;
    if (m.from === 'bar') return V.hintWhy.bar;
    if (st.points[m.to].c === p && st.points[m.to].n === 1) return V.hintWhy.point;
    if (st.points[m.to].c === p) return V.hintWhy.safe;
    return V.hintWhy.race;
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
    var onOwn = m.to !== 'off' && st.points[m.to].c === player;   // landing on own checkers = stack
    BG.applyMoveTo(st, player, m);
    st.remaining.splice(st.remaining.indexOf(m.die), 1);
    st.movesThisTurn++;
    S.selected = null;

    if (m.to === 'off') {
      var n = st.off[player], left = 15 - n;
      if (st.winner === -1) sfx.off();
      if (isC) {
        if (!S.firstOff[0]) { S.firstOff[0] = true; say(0, pick(V.cathyOffFirst)); setAvatar(ART.bama, 4000); faceMood('face-bama', 4000); if (st.winner === -1) sfx.cheese(); }
        else if (st.winner === -1) say(0, fmt(pick(V.cathyOff), { n: n, left: left }));
      } else if (st.winner === -1) {
        say(1, fmt(pick(V.jasonOff), { n: n, left: left }));
      }
    } else if (hit) {
      sfx.hit();
      if (isC) { say(0, pick(V.cathyHit)); say(1, pick(V.jasonGotHit), false); setAvatar(ART.dog, 3500); faceMood('face-dog', 3500); }
      else { say(1, pick(V.jasonHit)); say(0, pick(V.cathyGotHit), false); }
    } else if (m.from === 'bar') {
      sfx.enter();
      say(player, pick(isC ? V.cathyEnter : V.jasonEnter));
    } else {
      if (onOwn) sfx.stack(); else sfx.place();
      if (!wasHome && BG.allInHome(st, player) && st.winner === -1) {
        say(player, pick(isC ? V.cathyAllHome : V.jasonAllHome));
        if (isC) { setAvatar(ART.bama, 3500); sfx.cheese(); }
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
    if (!S.options.length) { say(1, pick(V.jasonDance)); setTimeout(sfx.dance, 450); }
    else if (S.st.dice.length === 4) { say(1, fmt(pick(V.jasonDoubles), { a: a })); setTimeout(sfx.doubles, 450); }
    else if (S.st.bar[1] > 0) say(1, fmt(pick(V.jasonBarRoll), { a: a, b: b }));
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
      if (isHumanTurn() && !S.st.rolled) say(me(), me() === 0 ? pick(V.rollFirst) : 'Roll first, Jason. 🎲');
      return;
    }
    var st = S.st, player = me();
    var isSrc = S.options.some(function (o) { return o.from === idx; });
    if (S.selected === null) {
      if (st.points[idx].c === player && isSrc) { S.selected = idx; sfx.pickup(); render(); }
      return;
    }
    if (S.selected === idx) { S.selected = null; sfx.tap(); render(); return; }
    var m = bestOption(S.selected, idx);
    if (m) { doMove(m); return; }
    if (st.points[idx].c === player && isSrc) { S.selected = idx; sfx.pickup(); render(); }
    else { S.selected = null; sfx.tap(); render(); }
  }

  function onBarTap() {
    if (!isHumanTurn() || !S.st.rolled) return;
    if (S.selected === 'bar') { S.selected = null; sfx.tap(); render(); return; }
    if (S.options.some(function (o) { return o.from === 'bar'; })) {
      S.selected = 'bar'; sfx.pickup(); render();
    }
  }

  function onUndo() {
    if (!isHumanTurn() || !S.history.length) return;
    S.st = S.history.pop();
    S.selected = null;
    refreshOptions();
    say(me(), me() === 0 ? pick(V.undo) : 'Jason took it back. Typical. ↩️');
    render();
  }

  function onHint() {
    if (!isHumanTurn() || !S.options.length) return;
    var m = AI.chooseMove(BG, S.st, me(), S.st.remaining, S.rand);
    if (!m) return;
    var from = m.from === 'bar' ? 'the Bar' : 'point ' + (m.from + 1);
    var to = m.to === 'off' ? 'OFF the board 🏁' : 'point ' + (m.to + 1);
    say(0, fmt(pick(V.hint), { from: from, to: to, why: hintWhy(m) }));
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
    'PROGRAM: BAMA 2026 — COMPLETE. Great workout, Cathy. 🚴🏆',
    'The hound is doing a victory lap around the living room. 🐾🏆',
    'Purple bag, packed. Trophy, packed. Jason, humbled. 👜🏆',
    'Cheddar, brie, and Cathy: three things that only get better. 🧀🏆',
  ];
  var WIN_SAY = [
    'I MADE IT! 🏁🏆',
    'CHEESE CATHY WINS! Somebody call Bama. 🧀🏆',
    'Winner! Release the hound for a lap of honor. 🐾🏆',
    'PROGRAM COMPLETE. Cooldown: bragging. 🚴🏆',
  ];
  var LOSE_SUB = [
    'Good game, Cathy! Demand a rematch. 😄',
    'He got lucky. Everyone saw it. Rematch. 🐾',
    'The hound is displeased. Again? 🐾',
    'Jason won. He\'ll bring it up at every holiday. Rematch now. 🎲',
    'A moral victory for cheese. A regular victory for Jason. Rematch. 🧀',
    'The purple bag says: one more. 👜',
  ];
  var LOSE_SAY = [
    'Release the hound. Rematch. 🐾',
    'Fine. FINE. Rematch, Jason. Right now. 🎲',
    'Well played, sweetie. Now let me win one back. 🧀',
    'The console says TRY AGAIN. The console knows me. 🚴',
  ];
  var JASON_LOST = ['Robo-Jason: "…recalculating."', 'Robo-Jason: "This outcome was not in my training data."', 'Robo-Jason: "Rematch. For science."'];
  var JASON_LOST_HOTSEAT = ['Jason: "Best of three?"', 'Jason: "I let you win." He did not.', 'Jason: "The dice hate me." They do, Jason.'];
  var JASON_WON = ['{name}: "GG, Mom. Love you. Rematch?"', '{name}: "Don\'t be mad. Okay be a little mad."', '{name}: "I\'m putting this on the fridge."'];
  function onWin(player) {
    S.over = true; S.busy = false;
    var kind = BG.winKind(S.st, player);
    var kindTxt = kind === 2 ? 'BACKGAMMON! Triple! 🤯' : kind === 1 ? 'GAMMON! Double! ✨' : 'a win!';
    // Cathy is the star: her win gets the stinger; a Robo-Jason win gets the sad trombone.
    // In hotseat a Jason win is still a human win, so it keeps the win stinger.
    if (player === 0 || S.mode !== 'ai') sfx.win(); else sfx.lose();
    var title = $('win-title'), sub = $('win-sub'), photo = $('win-photo');
    photo.onerror = function () { photo.onerror = null; photo.src = photo.src.replace(/\.png$/, '.svg'); };
    if (player === 0) {
      title.textContent = '🧀 Cathy wins — ' + kindTxt;
      sub.textContent = pick(WIN_LINES);
      photo.src = ART.bama;
      say(0, pick(WIN_SAY)); say(1, pick(S.mode === 'ai' ? JASON_LOST : JASON_LOST_HOTSEAT), false);
      setAvatar(ART.bama);
    } else {
      title.textContent = S.names[1] + ' wins — ' + kindTxt;
      sub.textContent = pick(LOSE_SUB);
      photo.src = 'assets/photos/01-mom-dog-hybrid.png';
      say(1, fmt(pick(JASON_WON), { name: S.names[1] })); say(0, pick(LOSE_SAY), false);
      setAvatar(ART.dog);
    }
    setTimeout(function () { $('overlay-win').classList.remove('hidden'); }, 900);
  }

  // ---------- wiring ----------
  function show(screen) {
    $('screen-title').classList.toggle('hidden', screen !== 'title');
    $('screen-game').classList.toggle('hidden', screen !== 'game');
    if (screen === 'game') { fitBoardNow(); fitTrayNow(); fitBoard(); }
  }
  function start(mode) { show('game'); newGame(mode); }

  $('btn-vs-ai').addEventListener('click', function () { sfx.tap(); start('ai'); });
  $('btn-hotseat').addEventListener('click', function () { sfx.tap(); start('hotseat'); });
  $('btn-how').addEventListener('click', function () { sfx.tap(); $('overlay-help').classList.remove('hidden'); });
  $('btn-close-help').addEventListener('click', function () { sfx.tap(); $('overlay-help').classList.add('hidden'); });
  $('btn-roll').addEventListener('click', doRoll);
  $('btn-undo').addEventListener('click', function () { if (isHumanTurn() && S.history.length) sfx.tap(); onUndo(); });
  $('btn-hint').addEventListener('click', function () { if (isHumanTurn() && S.options.length) sfx.tap(); onHint(); });
  $('btn-pass').addEventListener('click', function () { sfx.tap(); msg(''); endTurn(); });
  $('btn-new').addEventListener('click', function () { sfx.tap(); newGame(S.mode); });
  $('btn-menu').addEventListener('click', function () { sfx.tap(); show('title'); });
  $('btn-again').addEventListener('click', function () { sfx.tap(); newGame(S.mode); });
  $('btn-win-menu').addEventListener('click', function () { sfx.tap(); $('overlay-win').classList.add('hidden'); show('title'); });
  $('btn-sound').addEventListener('click', function () {
    soundOn = !soundOn;
    sfx.setMuted(!soundOn);
    $('btn-sound').textContent = soundOn ? '🔊 Sound on' : '🔇 Sound off';
    if (soundOn) { sfx.unlock(); sfx.tap(); }   // audible confirmation that sound is back
  });
  [0, 1].forEach(function (ix) {
    offBox(ix).addEventListener('click', function () {
      if (!isHumanTurn() || S.selected === null || ix !== me()) return;
      var m = bestOption(S.selected, 'off');
      if (m) doMove(m);
      else { sfx.bad(); say(me(), pick(V.cantOff)); }
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
