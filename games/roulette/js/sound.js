/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Sound — local wheel and chip samples with restrained Web Audio
   cues. The rolling ball is synthesized live so its pitch and
   texture follow the ball's speed. Works directly from file://.
   ========================================================= */
(function (global) {
  "use strict";

  var ctx = null;
  var enabled = true;
  var master = null;     // dry+wet sum -> tone -> limiter -> out
  var reverbSend = null;
  var channelBuses = {};
  var built = false;
  var MASTER_OUTPUT = 0.9;
  var VOLUME_CHANNELS = ["master", "wheel", "chips", "table"];
  var DEFAULT_VOLUMES = { master: 1, wheel: 1, chips: 1, table: 1 };
  var volumes = { master: 1, wheel: 1, chips: 1, table: 1 };
  var SAMPLE_PATHS = {
    chip1: "assets/audio/chip-click-1.ogg",
    chip2: "assets/audio/chip-click-2.ogg",
    chipStack: "assets/audio/chip-stack.ogg",
    chipsPush: "assets/audio/chips-push.ogg",
    clack: "assets/audio/ball-clack.ogg",
    bounce1: "assets/audio/ball-bounce-1.ogg",
    bounce2: "assets/audio/ball-bounce-2.ogg",
    drop: "assets/audio/ball-drop.ogg"
  };
  // Each sample also ships as AAC (.m4a) for Safari versions that cannot play
  // Ogg. The browser's own canPlayType decides once, on first use.
  var sampleExtension = null;
  var sampleTemplates = {};
  var activeSamples = [];
  var sampleEpoch = 0;
  var bounceTurn = 0;
  var roll = null;

  function clampVolume(value, fallback) {
    value = Number(value);
    if (!isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  function normalizedVolumes(value) {
    value = value && typeof value === "object" ? value : {};
    var result = {};
    VOLUME_CHANNELS.forEach(function (channel) {
      result[channel] = clampVolume(value[channel], DEFAULT_VOLUMES[channel]);
    });
    return result;
  }

  function sampleFormat() {
    if (sampleExtension) return sampleExtension;
    sampleExtension = ".ogg";
    try {
      var probe = new global.Audio();
      if (typeof probe.canPlayType === "function" &&
          !probe.canPlayType('audio/ogg; codecs="vorbis"') &&
          probe.canPlayType('audio/mp4; codecs="mp4a.40.2"')) sampleExtension = ".m4a";
    } catch (e) {}
    return sampleExtension;
  }

  function preloadSamples() {
    if (typeof global.Audio !== "function") return;
    var extension = sampleFormat();
    Object.keys(SAMPLE_PATHS).forEach(function (name) {
      if (sampleTemplates[name]) return;
      try {
        var audio = new global.Audio(SAMPLE_PATHS[name].replace(/\.ogg$/, extension));
        audio.preload = "auto";
        sampleTemplates[name] = audio;
      } catch (e) {}
    });
  }

  function playSample(name, channel, gain, rate, fallback) {
    if (!enabled || volumes.master <= 0 || volumes[channel] <= 0 || typeof global.Audio !== "function") return false;
    preloadSamples();
    var template = sampleTemplates[name];
    if (!template || typeof template.cloneNode !== "function") return false;
    var audio;
    try {
      audio = template.cloneNode(true);
      audio._table37Channel = channel;
      audio._table37Gain = gain == null ? 1 : gain;
      audio.volume = Math.max(0, Math.min(1, MASTER_OUTPUT * volumes.master * volumes[channel] * audio._table37Gain));
      audio.playbackRate = Math.max(0.8, Math.min(1.2, rate || 1));
      activeSamples.push(audio);
      var epoch = sampleEpoch;
      var finished = false;
      var release = function () {
        var index = activeSamples.indexOf(audio);
        if (index !== -1) activeSamples.splice(index, 1);
      };
      var failed = function (error) {
        if (finished) return;
        finished = true;
        release();
        // Do not turn an explicit mute or autoplay denial into another sound.
        if (epoch !== sampleEpoch || !enabled || (error && (error.name === "AbortError" || error.name === "NotAllowedError"))) return;
        if (fallback) { try { fallback(); } catch (e) {} }
      };
      audio.addEventListener("ended", function () { finished = true; release(); }, { once: true });
      audio.addEventListener("error", failed, { once: true });
      var playback = audio.play();
      if (playback && typeof playback.catch === "function") playback.catch(failed);
      return true;
    } catch (e) {
      var index = activeSamples.indexOf(audio);
      if (index !== -1) activeSamples.splice(index, 1);
      return e.name === "NotAllowedError" || e.name === "AbortError";
    }
  }

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    buildBus();
    return ctx;
  }

  function makeImpulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function buildBus() {
    if (built) return;
    built = true;

    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 26;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    var tone = ctx.createBiquadFilter();
    tone.type = "highshelf";
    tone.frequency.value = 6500;
    tone.gain.value = -6;

    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_OUTPUT * volumes.master : 0;
    master.connect(tone);
    tone.connect(limiter);
    limiter.connect(ctx.destination);

    var convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(1.4, 3.4);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.14;
    reverbSend.connect(convolver);
    convolver.connect(master);

    // Category gains sit in front of the send, so lowering "Wheel" also
    // lowers its reverb tail.
    ["wheel", "chips", "table"].forEach(function (channel) {
      var dry = ctx.createGain();
      var wet = ctx.createGain();
      dry.gain.value = volumes[channel];
      wet.gain.value = volumes[channel];
      dry.connect(master);
      wet.connect(reverbSend);
      channelBuses[channel] = { dry: dry, wet: wet };
    });
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      var resumed = ctx.resume();
      if (resumed && resumed.catch) resumed.catch(function () {});
    }
  }

  function setGain(node, value) {
    if (!node || !ctx) return;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
  }

  function applyVolumes() {
    setGain(master, enabled ? MASTER_OUTPUT * volumes.master : 0);
    ["wheel", "chips", "table"].forEach(function (channel) {
      var bus = channelBuses[channel];
      if (!bus) return;
      setGain(bus.dry, volumes[channel]);
      setGain(bus.wet, volumes[channel]);
    });
    activeSamples.slice().forEach(function (audio) {
      var channelVolume = volumes[audio._table37Channel] == null ? 1 : volumes[audio._table37Channel];
      audio.volume = enabled
        ? Math.max(0, Math.min(1, MASTER_OUTPUT * volumes.master * channelVolume * audio._table37Gain))
        : 0;
    });
  }

  function stopActiveSamples() {
    sampleEpoch++;
    activeSamples.slice().forEach(function (audio) {
      try {
        audio.volume = 0;
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    activeSamples.length = 0;
  }

  function route(node, channel, send) {
    var bus = channelBuses[channel] || channelBuses.table;
    node.connect(bus.dry);
    if (send !== false) node.connect(bus.wet);
  }

  function audible(channel) {
    return enabled && volumes.master > 0 && volumes[channel] > 0;
  }

  // A single shaped voice routed to dry master + reverb send.
  function voice(opts) {
    var channel = opts.channel || "table";
    if (!audible(channel)) return;
    var ac = ensure(); if (!ac) return; resume();
    var t0 = ac.currentTime + (opts.when || 0);
    var osc = ac.createOscillator();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to != null) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.14, t0 + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    route(g, channel, opts.send);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  // Shaped, filtered noise for tactile textures.
  function noise(opts) {
    var channel = opts.channel || "table";
    if (!audible(channel)) return;
    var ac = ensure(); if (!ac) return; resume();
    var t0 = ac.currentTime + (opts.when || 0);
    var dur = opts.dur;
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource();
    src.buffer = buf;
    var filt = ac.createBiquadFilter();
    filt.type = opts.filter || "lowpass";
    filt.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.to != null) filt.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    filt.Q.value = opts.q || 0.7;
    var g = ac.createGain();
    g.gain.setValueAtTime(opts.gain || 0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); route(g, channel, opts.send === true);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  // A small metallic "tick" for when no sample is available.
  function tick(gain, pitch) {
    voice({ channel: "wheel", freq: 3100 * pitch, dur: 0.06, gain: 0.07 * gain, attack: 0.001, send: false });
    voice({ channel: "wheel", freq: 5200 * pitch, dur: 0.04, gain: 0.035 * gain, attack: 0.001, send: false });
    noise({ channel: "wheel", dur: 0.025, gain: 0.05 * gain, filter: "highpass", freq: 4500 });
  }

  /* ---- The rolling ball: looped brown noise shaped by the ball's speed ---- */
  function rollBuffer(ac) {
    var seconds = 2;
    var len = Math.floor(ac.sampleRate * seconds);
    var buffer = ac.createBuffer(1, len, ac.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      last = (last + 0.035 * (Math.random() * 2 - 1)) / 1.035;
      data[i] = last * 3.2;
    }
    // Cross-fade the loop point so the roll never clicks.
    var fade = Math.floor(ac.sampleRate * 0.05);
    for (var j = 0; j < fade; j++) {
      var w = j / fade;
      data[j] = data[j] * w + data[len - fade + j] * (1 - w);
    }
    return buffer;
  }

  function startRoll() {
    if (roll || !audible("wheel")) return;
    var ac = ensure(); if (!ac) return; resume();
    var source = ac.createBufferSource();
    source.buffer = rollBuffer(ac);
    source.loop = true;
    source.loopEnd = source.buffer.duration - 0.05;
    var band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 0.8;
    var air = ac.createBiquadFilter();
    air.type = "highpass";
    air.frequency.value = 180;
    var gain = ac.createGain();
    gain.gain.value = 0;
    var flutter = ac.createOscillator();
    flutter.type = "triangle";
    flutter.frequency.value = 22;
    var depth = ac.createGain();
    depth.gain.value = 0;
    flutter.connect(depth);
    depth.connect(gain.gain);
    source.connect(band);
    band.connect(air);
    air.connect(gain);
    route(gain, "wheel", true);
    source.start();
    flutter.start();
    roll = { source: source, band: band, gain: gain, flutter: flutter, depth: depth, stopping: 0 };
  }

  function stopRoll(fast) {
    if (!roll || !ctx) { roll = null; return; }
    var current = roll;
    roll = null;
    var t = ctx.currentTime;
    current.gain.gain.cancelScheduledValues(t);
    current.gain.gain.setTargetAtTime(0, t, fast ? 0.01 : 0.06);
    current.depth.gain.setTargetAtTime(0, t, 0.03);
    try {
      current.source.stop(t + (fast ? 0.1 : 0.4));
      current.flutter.stop(t + (fast ? 0.1 : 0.4));
    } catch (e) {}
  }

  var Sound = {
    setEnabled: function (v) {
      enabled = !!v;
      // The audio context starts on the first gesture (unlock); creating it
      // at load only earns an autoplay warning.
      if (enabled) preloadSamples();
      else { stopActiveSamples(); stopRoll(true); }
      applyVolumes();
    },
    isEnabled: function () { return enabled; },
    unlock: function () { if (enabled) { preloadSamples(); ensure(); resume(); } },
    setVolumes: function (value) {
      volumes = normalizedVolumes(value);
      applyVolumes();
      if (!audible("wheel")) stopRoll(true);
    },
    setVolume: function (channel, value) {
      if (VOLUME_CHANNELS.indexOf(channel) === -1) return;
      volumes[channel] = clampVolume(value, volumes[channel]);
      applyVolumes();
      if (!audible("wheel")) stopRoll(true);
    },
    getVolumes: function () {
      return { master: volumes.master, wheel: volumes.wheel, chips: volumes.chips, table: volumes.table };
    },

    // Crisp chip click with a slight pitch drift so piles sound natural.
    chip: function (i) {
      var k = 1 + ((i || 0) % 5) * 0.045;
      var fallback = function () {
        voice({ channel: "chips", freq: 2100 * k, dur: 0.07, gain: 0.08, attack: 0.002 });
        voice({ channel: "chips", freq: 3150 * k, dur: 0.05, gain: 0.045, attack: 0.002 });
        noise({ channel: "chips", dur: 0.04, gain: 0.06, filter: "highpass", freq: 4000 });
      };
      if (!playSample((i || 0) % 2 ? "chip2" : "chip1", "chips", 0.86, 0.96 + ((i || 0) % 5) * 0.018, fallback)) fallback();
    },

    // Several chips settling onto the felt.
    chipStack: function (n) {
      n = Math.min(n || 1, 5);
      var fallback = function () {
        for (var i = 0; i < n; i++) {
          voice({ channel: "chips", freq: 2000 * (1 + i * 0.05), dur: 0.06, gain: 0.07, when: i * 0.06 });
          noise({ channel: "chips", dur: 0.035, gain: 0.05, filter: "highpass", freq: 4200, when: i * 0.06 });
        }
      };
      if (!playSample("chipStack", "chips", 0.9, 0.98 + (n % 3) * 0.012, fallback)) fallback();
    },

    // Chips raked across the felt.
    chipsPush: function () {
      var fallback = function () {
        noise({ channel: "chips", dur: 0.3, gain: 0.07, filter: "lowpass", freq: 900, to: 300, send: true });
        Sound.chipStack(3);
      };
      if (!playSample("chipsPush", "chips", 0.86, 1, fallback)) fallback();
    },

    // The croupier's payment landing beside a winning bet.
    payout: function () {
      var fallback = function () { Sound.chipStack(3); };
      if (!playSample("chipStack", "chips", 0.96, 0.94, fallback)) fallback();
    },

    // The ball leaves the croupier's fingers and starts to roll.
    launch: function () {
      noise({ channel: "wheel", dur: 0.16, gain: 0.07, filter: "bandpass", freq: 1800, to: 900, q: 0.8 });
      startRoll();
    },

    // Called every frame with the ball's speed on the track (0 stops the roll).
    roll: function (intensity) {
      intensity = Math.max(0, Math.min(1, Number(intensity) || 0));
      if (intensity <= 0) { stopRoll(false); return; }
      if (!roll) startRoll();
      if (!roll || !ctx) return;
      var t = ctx.currentTime;
      var level = 0.15 * Math.pow(intensity, 1.15);
      roll.gain.gain.setTargetAtTime(level, t, 0.05);
      roll.depth.gain.setTargetAtTime(level * 0.4, t, 0.05);
      roll.band.frequency.setTargetAtTime(520 + 2100 * intensity, t, 0.08);
      roll.flutter.frequency.setTargetAtTime(7 + 30 * intensity, t, 0.08);
    },

    // The ball strikes a deflector diamond.
    deflector: function () {
      var fallback = function () { tick(1.4, 0.9); };
      if (!playSample("clack", "wheel", 0.95, 0.97 + Math.random() * 0.06, fallback)) fallback();
    },

    // The ball hops across a fret; strength 0..1.
    bounce: function (strength) {
      strength = Math.max(0.15, Math.min(1, strength == null ? 1 : strength));
      bounceTurn++;
      var fallback = function () { tick(strength, 1 + (bounceTurn % 3) * 0.04); };
      if (!playSample(bounceTurn % 2 ? "bounce1" : "bounce2", "wheel", 0.35 + 0.6 * strength, 0.94 + (bounceTurn % 4) * 0.035, fallback)) fallback();
    },

    // The ball drops into its pocket and rattles to rest.
    drop: function () {
      var fallback = function () {
        tick(0.9, 0.7);
        tick(0.45, 0.75);
      };
      if (!playSample("drop", "wheel", 0.9, 1, fallback)) fallback();
    },

    // Betting closes: a soft two-note chime.
    noMoreBets: function () {
      voice({ channel: "table", freq: 659.25, dur: 0.42, gain: 0.04, attack: 0.012 });
      voice({ channel: "table", freq: 523.25, dur: 0.5, gain: 0.036, when: 0.11, attack: 0.012 });
    },

    // Restrained settlement cues.
    win: function () {
      voice({ channel: "table", freq: 392, dur: 0.28, gain: 0.055, attack: 0.018 });
      voice({ channel: "table", freq: 523.25, dur: 0.34, gain: 0.045, when: 0.09, attack: 0.018 });
    },
    bigWin: function () {
      [392, 493.88, 587.33, 783.99].forEach(function (f, i) {
        voice({ channel: "table", freq: f, dur: 0.38, gain: 0.05, when: i * 0.085, attack: 0.016 });
      });
    },
    lose: function () {
      voice({ channel: "table", freq: 246.94, to: 220, dur: 0.38, gain: 0.05, attack: 0.025 });
    }
  };

  global.Sound = Sound;
})(window);
