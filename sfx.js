/* Cathy's Backgammon — arcade sound kit. Pure WebAudio synthesis, no assets, no deps.
   Exposes window.CathySfx: { roll, doubles, dance, pickup, place, stack, enter, hit, off,
   cheese, win, lose, tap, bad, setMuted, isMuted, unlock }.
   The AudioContext is created lazily on the first sound (which is always a user tap —
   ROLL / a checker / a button), so iOS's gesture rule is satisfied without any prompt. */
(function (root) {
  'use strict';

  var ctx = null, bus = null, noiseBuf = null, muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
      return ctx;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // master bus: gain -> tanh soft-clipper so stacked hits saturate warmly instead of clipping
    var shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (var c = 0; c < 1024; c++) { var x = (c / 1023) * 2 - 1; curve[c] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    shaper.curve = curve; shaper.oversample = '2x';
    bus = ctx.createGain(); bus.gain.value = 0.9;
    bus.connect(shaper); shaper.connect(ctx.destination);
    // 1.5 s of white noise, reused for every tumble / knock / whoosh
    var len = Math.floor(ctx.sampleRate * 1.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function now() { return ctx.currentTime; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Envelope helper: attack to `vol`, then decay to silence at t+dur.
  function env(g, t, vol, atk, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Pitched voice. o = { type, f0, f1, at, dur, vol, atk, lp (lowpass Hz), q }
  function tone(o) {
    var t = now() + (o.at || 0), dur = o.dur || 0.15;
    var osc = ctx.createOscillator(), g = ctx.createGain(), out = g;
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.slide || dur));
    env(g, t, o.vol == null ? 0.25 : o.vol, o.atk || 0.008, dur);
    if (o.lp) {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.8;
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    out.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // Noise burst. o = { at, dur, vol, type (bandpass|highpass|lowpass), f0, f1, q, atk }
  function noise(o) {
    var t = now() + (o.at || 0), dur = o.dur || 0.08;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.loop = true; src.loopStart = 0; src.loopEnd = noiseBuf.duration;
    var f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1800, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    env(g, t, o.vol == null ? 0.2 : o.vol, o.atk || 0.003, dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, rnd(0, 1)); src.stop(t + dur + 0.05);
  }

  // Wood/plastic knock: a click transient + a short low body.
  function knock(at, vol, body) {
    noise({ at: at, dur: 0.035, vol: vol, type: 'bandpass', f0: rnd(2200, 3200), q: 0.7 });
    tone({ at: at, type: 'sine', f0: body || 240, f1: (body || 240) * 0.55, dur: 0.07, vol: vol * 0.9, atk: 0.002 });
  }

  function guard(fn) {
    return function () {
      if (muted) return;
      try { if (!ensure()) return; fn.apply(null, arguments); } catch (e) { /* stay silent, never break play */ }
    };
  }

  var SFX = {
    // Dice: a fistful of knocks that speed up and get quieter, then two hard clacks as they land.
    roll: guard(function () {
      var t = 0;
      for (var i = 0; i < 9; i++) {
        knock(t, 0.09 + Math.random() * 0.06, rnd(300, 620));
        t += 0.028 + i * 0.006 + Math.random() * 0.02;
      }
      knock(t + 0.03, 0.22, 200); knock(t + 0.11, 0.18, 260);
      noise({ at: 0, dur: t + 0.15, vol: 0.05, type: 'highpass', f0: 4000, atk: 0.01 });
    }),
    // Doubles: bright 4-note arcade riff, one note per move you just earned.
    doubles: guard(function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ at: i * 0.075, type: 'square', f0: f, dur: 0.16, vol: 0.10, lp: 3200 });
        tone({ at: i * 0.075, type: 'triangle', f0: f / 2, dur: 0.16, vol: 0.10 });
      });
      tone({ at: 0.32, type: 'square', f0: 1047, dur: 0.35, vol: 0.10, lp: 3200 });
      tone({ at: 0.32, type: 'square', f0: 1319, dur: 0.35, vol: 0.08, lp: 3200 });
    }),
    // No legal move: a small deflating womp.
    dance: guard(function () {
      tone({ type: 'triangle', f0: 320, f1: 110, dur: 0.38, vol: 0.18 });
      tone({ at: 0.02, type: 'sine', f0: 160, f1: 55, dur: 0.38, vol: 0.14 });
    }),
    // Checker lifted: a quick upward chirp.
    pickup: guard(function () {
      tone({ type: 'triangle', f0: 620, f1: 980, dur: 0.07, vol: 0.14, atk: 0.003 });
      noise({ dur: 0.02, vol: 0.06, type: 'highpass', f0: 5000 });
    }),
    // Checker set down on the felt.
    place: guard(function () {
      knock(0, 0.22, 210);
      noise({ at: 0.005, dur: 0.05, vol: 0.06, type: 'lowpass', f0: 900 });
    }),
    // Checker set on top of others: knock plus a little ceramic tick.
    stack: guard(function () {
      knock(0, 0.2, 210);
      tone({ at: 0.03, type: 'sine', f0: 1500, f1: 1200, dur: 0.06, vol: 0.09, atk: 0.002 });
      tone({ at: 0.05, type: 'sine', f0: 1900, f1: 1500, dur: 0.05, vol: 0.06, atk: 0.002 });
    }),
    // Back in from the bar: a whoosh that lands with a knock.
    enter: guard(function () {
      noise({ dur: 0.22, vol: 0.12, type: 'bandpass', f0: 500, f1: 2600, q: 1.4, atk: 0.04 });
      knock(0.2, 0.22, 230);
    }),
    // HIT: kick-drum thump + smack, then a cartoon "boing" as the blot flies to the bar.
    hit: guard(function () {
      tone({ type: 'sine', f0: 170, f1: 38, dur: 0.24, vol: 0.5, atk: 0.002, slide: 0.12 });
      noise({ dur: 0.09, vol: 0.28, type: 'bandpass', f0: 1400, f1: 400, q: 0.6 });
      noise({ dur: 0.05, vol: 0.14, type: 'highpass', f0: 3500 });
      tone({ at: 0.09, type: 'square', f0: 900, f1: 260, dur: 0.30, vol: 0.09, lp: 2000, slide: 0.28 });
      tone({ at: 0.09, type: 'sawtooth', f0: 450, f1: 130, dur: 0.30, vol: 0.06, lp: 1600, slide: 0.28 });
      knock(0.42, 0.18, 190);
    }),
    // Bear-off: checker drops in the tray and rings like a coin.
    off: guard(function () {
      knock(0, 0.14, 260);
      tone({ at: 0.02, type: 'sine', f0: 1568, dur: 0.22, vol: 0.13, atk: 0.003 });
      tone({ at: 0.09, type: 'sine', f0: 2093, dur: 0.30, vol: 0.12, atk: 0.003 });
      tone({ at: 0.09, type: 'triangle', f0: 2637, dur: 0.24, vol: 0.05, atk: 0.003 });
    }),
    // Tiny cheese fanfare: three brassy notes with a sparkle on top.
    cheese: guard(function () {
      [[392, 0], [523, 0.11], [659, 0.22]].forEach(function (n) {
        tone({ at: n[1], type: 'sawtooth', f0: n[0], dur: 0.2, vol: 0.09, lp: 1800, q: 1.2 });
        tone({ at: n[1], type: 'square', f0: n[0] / 2, dur: 0.2, vol: 0.05, lp: 1200 });
      });
      tone({ at: 0.36, type: 'sawtooth', f0: 784, dur: 0.5, vol: 0.10, lp: 2200, q: 1.2 });
      tone({ at: 0.36, type: 'sawtooth', f0: 988, dur: 0.5, vol: 0.07, lp: 2200, q: 1.2 });
      [2093, 2637, 3136].forEach(function (f, i) { tone({ at: 0.42 + i * 0.06, type: 'sine', f0: f, dur: 0.25, vol: 0.05 }); });
    }),
    // Win stinger: rising arcade arpeggio, big major chord, glitter.
    win: guard(function () {
      var arp = [523, 659, 784, 1047, 1319, 1568];
      arp.forEach(function (f, i) {
        tone({ at: i * 0.085, type: 'square', f0: f, dur: 0.18, vol: 0.09, lp: 3000 });
        tone({ at: i * 0.085, type: 'triangle', f0: f / 2, dur: 0.18, vol: 0.09 });
      });
      var t0 = arp.length * 0.085 + 0.05;
      [523, 659, 784, 1047].forEach(function (f) {
        tone({ at: t0, type: 'sawtooth', f0: f, dur: 1.1, vol: 0.07, lp: 2400, q: 1.1, atk: 0.02 });
        tone({ at: t0, type: 'square', f0: f * 1.003, dur: 1.1, vol: 0.04, lp: 2400, atk: 0.02 });
      });
      tone({ at: t0, type: 'sine', f0: 131, dur: 1.1, vol: 0.18, atk: 0.02 });
      for (var i = 0; i < 8; i++) {
        tone({ at: t0 + 0.15 + i * 0.07, type: 'sine', f0: [2093, 2637, 3136, 4186][i % 4], dur: 0.2, vol: 0.05 });
      }
    }),
    // Lose stinger: sad trombone slide + a thud. Warm, not brutal.
    lose: guard(function () {
      var seq = [[330, 0], [311, 0.28], [294, 0.56], [277, 0.84]];
      seq.forEach(function (n, i) {
        var last = i === seq.length - 1;
        tone({ at: n[1], type: 'sawtooth', f0: n[0] * 1.04, f1: n[0], dur: last ? 0.9 : 0.27, vol: 0.10, lp: 1400, q: 1.5, slide: 0.12, atk: 0.03 });
        tone({ at: n[1], type: 'triangle', f0: n[0] / 2, dur: last ? 0.9 : 0.27, vol: 0.08, atk: 0.03 });
      });
      tone({ at: 0.86, type: 'sine', f0: 120, f1: 45, dur: 0.5, vol: 0.28, atk: 0.005 });
    }),
    // Soft console key tap (Undo / Ask Cathy / Menu / New / Done).
    tap: guard(function () {
      noise({ dur: 0.025, vol: 0.10, type: 'bandpass', f0: 2600, q: 1.2 });
      tone({ type: 'sine', f0: 880, f1: 660, dur: 0.06, vol: 0.10, atk: 0.002 });
    }),
    // Not allowed: a short buzzer.
    bad: guard(function () {
      tone({ type: 'square', f0: 140, dur: 0.14, vol: 0.12, lp: 900 });
      tone({ at: 0.0, type: 'square', f0: 148, dur: 0.14, vol: 0.08, lp: 900 });
    }),
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    // Call from any user gesture to (re)start the context, e.g. when iOS suspends it in the background.
    unlock: function () { try { ensure(); } catch (e) { /* no audio available */ } },
  };

  root.CathySfx = SFX;
})(typeof window !== 'undefined' ? window : globalThis);
