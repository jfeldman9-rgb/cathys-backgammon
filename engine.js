/* Cathy's Backgammon — rules engine (no dependencies; browser + node).
 *
 * Conventions:
 *  - players: 0 = "Cheese" (Cathy, yellow), 1 = "Grape" (opponent, purple)
 *  - points: indices 0..23 (point number = index+1)
 *  - player 0 moves DOWN (23 -> 0) and bears off past point 1
 *  - player 1 moves UP   (0 -> 23) and bears off past point 24
 *  - points[i] = { c: -1 empty | 0 | 1, n: count }
 */
(function (root) {
  'use strict';

  function newPoint(c, n) { return { c: c, n: n }; }

  function initialPoints() {
    const p = [];
    for (let i = 0; i < 24; i++) p.push(newPoint(-1, 0));
    // Cheese (player 0): 2 on 24, 5 on 13, 3 on 8, 5 on 6
    p[23] = newPoint(0, 2);
    p[12] = newPoint(0, 5);
    p[7] = newPoint(0, 3);
    p[5] = newPoint(0, 5);
    // Grape (player 1): 2 on 1, 5 on 12, 3 on 17, 5 on 19
    p[0] = newPoint(1, 2);
    p[11] = newPoint(1, 5);
    p[16] = newPoint(1, 3);
    p[18] = newPoint(1, 5);
    return p;
  }

  function newGame() {
    return {
      points: initialPoints(),
      bar: [0, 0],
      off: [0, 0],
      turn: 0,
      dice: [],        // dice values rolled this turn, e.g. [6,3] or [4,4,4,4]
      remaining: [],   // dice values still unused
      rolled: false,
      winner: -1,
      movesThisTurn: 0,
    };
  }

  function clone(st) {
    return {
      points: st.points.map(function (p) { return { c: p.c, n: p.n }; }),
      bar: [st.bar[0], st.bar[1]],
      off: [st.off[0], st.off[1]],
      turn: st.turn,
      dice: st.dice.slice(),
      remaining: st.remaining.slice(),
      rolled: st.rolled,
      winner: st.winner,
      movesThisTurn: st.movesThisTurn,
    };
  }

  function opp(p) { return 1 - p; }

  function isBlocked(st, player, idx) {
    const pt = st.points[idx];
    return pt.c === opp(player) && pt.n >= 2;
  }

  function allInHome(st, player) {
    if (st.bar[player] > 0) return false;
    if (player === 0) {
      for (let i = 6; i < 24; i++) if (st.points[i].c === 0) return false;
    } else {
      for (let i = 0; i < 18; i++) if (st.points[i].c === 1) return false;
    }
    return true;
  }

  // Destination index for player moving `die` pips from `from` ('bar' or idx).
  // Returns { to: idx | 'off' } or null if illegal for that die.
  function destFor(st, player, from, die) {
    if (from === 'bar') {
      const idx = player === 0 ? 24 - die : die - 1;
      if (isBlocked(st, player, idx)) return null;
      return { to: idx };
    }
    const canBear = allInHome(st, player);
    if (player === 0) {
      const idx = from - die;
      if (idx > -1) {
        if (isBlocked(st, player, idx)) return null;
        return { to: idx };
      }
      // bearing off
      if (!canBear) return null;
      const exact = die - 1;
      if (from === exact) return { to: 'off' };
      if (from < exact) {
        // larger die: allowed only if no cheese checkers on higher home points
        for (let i = from + 1; i < 6; i++) {
          if (st.points[i].c === 0) return null;
        }
        return { to: 'off' };
      }
      return null;
    } else {
      const idx = from + die;
      if (idx < 24) {
        if (isBlocked(st, player, idx)) return null;
        return { to: idx };
      }
      if (!canBear) return null;
      const exact = 24 - die;
      if (from === exact) return { to: 'off' };
      if (from > exact) {
        for (let i = 18; i < from; i++) {
          if (st.points[i].c === 1) return null;
        }
        return { to: 'off' };
      }
      return null;
    }
  }

  // All (from,to) pairs playable with a single `die` (ignores multi-dice rules).
  function legalMovesForDie(st, player, die) {
    const moves = [];
    if (st.bar[player] > 0) {
      const d = destFor(st, player, 'bar', die);
      if (d) moves.push({ from: 'bar', to: d.to, die: die });
      return moves;
    }
    for (let i = 0; i < 24; i++) {
      if (st.points[i].c !== player) continue;
      const d = destFor(st, player, i, die);
      if (d) moves.push({ from: i, to: d.to, die: die });
    }
    return moves;
  }

  function applyMoveTo(st, player, m) {
    // remove from source
    if (m.from === 'bar') {
      st.bar[player]--;
    } else {
      const s = st.points[m.from];
      s.n--;
      if (s.n === 0) s.c = -1;
    }
    // place at destination
    if (m.to === 'off') {
      st.off[player]++;
      if (st.off[player] === 15) st.winner = player;
    } else {
      const d = st.points[m.to];
      if (d.c === opp(player) && d.n === 1) {
        // hit the blot!
        d.c = player; // stays n=1
        st.bar[opp(player)]++;
      } else if (d.c === player) {
        d.n++;
      } else {
        d.c = player; d.n = 1;
      }
    }
    return st;
  }

  function applyMoveClone(st, player, m) {
    return applyMoveTo(clone(st), player, m);
  }

  // Max number of dice from `dice` (array of remaining values) that can be played.
  function maxUsable(st, player, dice) {
    if (!dice.length) return 0;
    let best = 0;
    const tried = {};
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i];
      if (tried[d]) continue;
      tried[d] = true;
      const opts = legalMovesForDie(st, player, d);
      for (let k = 0; k < opts.length; k++) {
        const rest = dice.slice(0, i).concat(dice.slice(i + 1));
        const v = 1 + maxUsable(applyMoveClone(st, player, opts[k]), player, rest);
        if (v > best) {
          best = v;
          if (best === dice.length) return best;
        }
      }
    }
    return best;
  }

  // Legal options honouring the must-use-max-dice / higher-die rules.
  function legalOptions(st, player, remaining) {
    const out = [];
    if (!remaining.length) return out;
    const maxBefore = maxUsable(st, player, remaining);
    if (maxBefore === 0) return out;
    const seen = {};
    for (let i = 0; i < remaining.length; i++) {
      const d = remaining[i];
      const opts = legalMovesForDie(st, player, d);
      for (let k = 0; k < opts.length; k++) {
        const m = opts[k];
        const key = m.from + '>' + m.to + ':' + d;
        if (seen[key]) continue;
        const rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
        const after = applyMoveClone(st, player, m);
        if (1 + maxUsable(after, player, rest) === maxBefore) {
          seen[key] = true;
          out.push({ from: m.from, to: m.to, die: d });
        }
      }
    }
    return out;
  }

  function rollDice(rand) {
    const r = rand || Math.random;
    const d1 = 1 + Math.floor(r() * 6);
    const d2 = 1 + Math.floor(r() * 6);
    return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  }

  function pipCount(st, player) {
    let pips = st.bar[player] * 25;
    for (let i = 0; i < 24; i++) {
      const pt = st.points[i];
      if (pt.c !== player) continue;
      pips += (player === 0 ? (i + 1) : (24 - i)) * pt.n;
    }
    return pips;
  }

  // 0 normal, 1 gammon (double), 2 backgammon (triple)
  function winKind(st, winner) {
    const loser = opp(winner);
    if (st.off[loser] > 0) return 0;
    const inHome = playerInHomeCount(st, loser, winner);
    if (st.bar[loser] > 0 || inHome > 0) return 2;
    return 1;
  }

  function playerInHomeCount(st, player, ofHome) {
    // checkers of `player` inside `ofHome` player's home board
    let n = 0;
    if (ofHome === 0) {
      for (let i = 0; i < 6; i++) if (st.points[i].c === player) n += st.points[i].n;
    } else {
      for (let i = 18; i < 24; i++) if (st.points[i].c === player) n += st.points[i].n;
    }
    return n;
  }

  const api = {
    newGame: newGame,
    clone: clone,
    opp: opp,
    destFor: destFor,
    legalMovesForDie: legalMovesForDie,
    legalOptions: legalOptions,
    applyMoveTo: applyMoveTo,
    applyMoveClone: applyMoveClone,
    maxUsable: maxUsable,
    rollDice: rollDice,
    pipCount: pipCount,
    allInHome: allInHome,
    winKind: winKind,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Backgammon = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
