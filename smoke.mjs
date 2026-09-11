/* Headless smoke test: rules + full AI-vs-AI game. Run: node smoke.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BG = require('./engine.js');
const AI = require('./ai.js');

let failures = 0;
function ok(cond, name) {
  if (cond) { console.log('  ok  - ' + name); }
  else { failures++; console.log('  FAIL- ' + name); }
}

// Seeded RNG (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 1. opening position sanity ----
(function () {
  const st = BG.newGame();
  let w = 0, b = 0;
  for (const p of st.points) { if (p.c === 0) w += p.n; if (p.c === 1) b += p.n; }
  ok(w === 15 && b === 15, 'opening: 15 checkers each');
  ok(st.points[23].c === 0 && st.points[23].n === 2, 'opening: 2 cheese on 24');
  ok(st.points[0].c === 1 && st.points[0].n === 2, 'opening: 2 grape on 1');
})();

// ---- 2. hitting sends blot to bar ----
(function () {
  const st = BG.newGame();
  st.points = Array.from({ length: 24 }, () => ({ c: -1, n: 0 }));
  st.points[10] = { c: 0, n: 1 };
  st.points[5] = { c: 1, n: 1 }; // blot 5 pips below
  const opts = BG.legalOptions(st, 0, [5]);
  ok(opts.length === 1 && opts[0].to === 5, 'hit: blot reachable');
  BG.applyMoveTo(st, 0, opts[0]);
  ok(st.bar[1] === 1 && st.points[5].c === 0, 'hit: blot sent to bar');
})();

// ---- 3. bar entry forced ----
(function () {
  const st = BG.newGame();
  st.points = Array.from({ length: 24 }, () => ({ c: -1, n: 0 }));
  st.bar[0] = 1;
  st.points[10] = { c: 0, n: 1 };
  const opts = BG.legalOptions(st, 0, [3]);
  ok(opts.length > 0 && opts.every((m) => m.from === 'bar'), 'bar: must enter from bar first');
})();

// ---- 4. bearing off (exact + higher die) ----
(function () {
  const st = BG.newGame();
  st.points = Array.from({ length: 24 }, () => ({ c: -1, n: 0 }));
  st.points[0] = { c: 0, n: 1 }; // point 1
  st.points[4] = { c: 0, n: 1 }; // point 5
  // exact die 1 from point 1
  let opts = BG.legalOptions(st, 0, [1]);
  ok(opts.some((m) => m.from === 0 && m.to === 'off'), 'bear off: exact die works');
  // die 6 with checker on point 5 only after removing point-1 checker => higher-die rule
  st.points[0] = { c: -1, n: 0 };
  opts = BG.legalOptions(st, 0, [6]);
  ok(opts.some((m) => m.from === 4 && m.to === 'off'), 'bear off: larger die from highest point works');
  // blocked: checker on point 6 (idx5) means die 6 must move it, not bear off point 5
  st.points[5] = { c: 0, n: 1 };
  opts = BG.legalOptions(st, 0, [6]);
  ok(!opts.some((m) => m.from === 4 && m.to === 'off'), 'bear off: cannot skip higher occupied point');
})();

// ---- 5. doubles give four moves ----
(function () {
  const dice = BG.rollDice(() => 0.0); // forces 1,1
  ok(dice.length === 4 && dice.every((d) => d === 1), 'doubles roll four dice');
  const st = BG.newGame();
  ok(BG.maxUsable(st, 0, [1, 1, 1, 1]) >= 2, 'doubles: multiple usable at start');
})();

// ---- 6. higher-die rule: only one playable => must use higher ----
(function () {
  const st = BG.newGame();
  st.points = Array.from({ length: 24 }, () => ({ c: -1, n: 0 }));
  // cheese checker on point 22 (idx21); grape blocks point 20 (idx19) and 16 (idx15)
  st.points[21] = { c: 0, n: 1 };
  st.points[19] = { c: 1, n: 2 };
  st.points[15] = { c: 1, n: 2 };
  // dice [6,2]: die 6 -> idx15 blocked; die 2 -> idx19 blocked. tweak: unblock idx19
  st.points[19] = { c: -1, n: 0 };
  // now die2 -> idx19 open, die6 -> idx15 blocked => only die 2 playable
  let opts = BG.legalOptions(st, 0, [6, 2]);
  ok(opts.length === 1 && opts[0].die === 2, 'higher-die rule setup sane (only small playable)');
  // now block idx19 too, open idx15: only die 6 playable
  st.points[19] = { c: 1, n: 2 };
  st.points[15] = { c: -1, n: 0 };
  opts = BG.legalOptions(st, 0, [6, 2]);
  ok(opts.length === 1 && opts[0].die === 6, 'higher-die rule: must use higher when only it plays');
})();

// ---- 7. full AI-vs-AI games complete ----
(function () {
  for (let g = 0; g < 5; g++) {
    const rand = seeded(1000 + g);
    const st = BG.newGame();
    let turns = 0;
    while (st.winner === -1 && turns < 800) {
      turns++;
      const dice = BG.rollDice(rand);
      const ordered = AI.orderDice(BG, st, st.turn, dice);
      let rem = ordered.slice();
      let guard = 0;
      while (rem.length && st.winner === -1 && guard++ < 8) {
        const m = AI.chooseMove(BG, st, st.turn, rem, rand);
        if (!m) break;
        BG.applyMoveTo(st, st.turn, m);
        rem.splice(rem.indexOf(m.die), 1);
      }
      if (st.winner === -1) st.turn = 1 - st.turn;
    }
    ok(st.winner !== -1, 'game ' + g + ' completes (winner=' + st.winner + ', turns=' + turns + ')');
    ok(st.off[st.winner] === 15, 'game ' + g + ': winner bore off all 15');
  }
})();

console.log(failures === 0 ? '\nSMOKE-OK: all tests passed' : '\nSMOKE-FAIL: ' + failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
