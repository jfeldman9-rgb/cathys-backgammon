/* Cathy's Backgammon — soft (Cathy-friendly) AI. No dependencies. */
(function (root) {
  'use strict';

  function getEngine() {
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./engine.js'); } catch (e) { return root.Backgammon; }
    }
    return root.Backgammon;
  }

  // Heuristic value of a state for `player` (higher = better).
  function evaluate(BG, st, player) {
    const me = player, op = 1 - player;
    let s = 0;
    // pip race: fewer pips is better
    s += (BG.pipCount(st, op) - BG.pipCount(st, me)) * 2;
    // borne off is great
    s += (st.off[me] - st.off[op]) * 25;
    // sitting on the bar is bad
    s -= st.bar[me] * 30;
    s += st.bar[op] * 12;
    // blots bad, made points good, anchors extra good
    for (let i = 0; i < 24; i++) {
      const pt = st.points[i];
      if (pt.c === me) {
        if (pt.n === 1) s -= 7;
        else if (pt.n >= 2) s += 5 + Math.min(pt.n, 4);
      } else if (pt.c === op) {
        if (pt.n === 1) s += 3;
        else if (pt.n >= 2) s -= 4;
      }
    }
    // home-board strength late game
    let homeMade = 0;
    const lo = me === 0 ? 0 : 18, hi = me === 0 ? 6 : 24;
    for (let i = lo; i < hi; i++) {
      if (st.points[i].c === me && st.points[i].n >= 2) homeMade++;
    }
    s += homeMade * 4;
    return s;
  }

  // Pick one move from current legal options. Soft: noisy + occasionally random.
  function chooseMove(BG, st, player, remaining, rand) {
    const r = rand || Math.random;
    const opts = BG.legalOptions(st, player, remaining);
    if (!opts.length) return null;
    if (r() < 0.12) return opts[Math.floor(r() * opts.length)]; // friendly wobble
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < opts.length; i++) {
      const after = BG.applyMoveClone(st, player, opts[i]);
      let score = evaluate(BG, after, player);
      // small nudge: prefer using the bigger die first (natural play)
      score += opts[i].die * 0.4;
      score += (r() * 2 - 1) * 7;
      if (score > bestScore) { bestScore = score; best = opts[i]; }
    }
    return best;
  }

  // Order dice: try the order that yields more usable dice (handles doubles trivially).
  function orderDice(BG, st, player, dice) {
    if (dice.length <= 2) {
      const a = dice.slice(), b = dice.slice().reverse();
      const ua = BG.maxUsable(st, player, a), ub = BG.maxUsable(st, player, b);
      return ub > ua ? b : a;
    }
    return dice.slice().sort(function (x, y) { return y - x; });
  }

  const api = { evaluate: evaluate, chooseMove: chooseMove, orderDice: orderDice };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CathyAI = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
