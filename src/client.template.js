window.__ModuleLoader__.load({
  id: '@local/dsh-pikachu-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const SOUND_KEY = 'dsh-pikachu-pet.sound';
    const LEGACY_MUTE_KEY = 'dsh-pikachu-pet.muted';

    /* Sound preference shared by the Settings row and the pet itself. */
    let memorySoundEnabled = true;
    let storageBroken = false;

    function readSoundEnabled() {
      if (storageBroken) return memorySoundEnabled;
      try {
        const stored = window.localStorage.getItem(SOUND_KEY);
        const legacy = window.localStorage.getItem(LEGACY_MUTE_KEY);
        if (stored === '1') memorySoundEnabled = true;
        else if (stored === '0') memorySoundEnabled = false;
        else memorySoundEnabled = legacy !== '1';
        return memorySoundEnabled;
      } catch (error) {
        storageBroken = true;
        return memorySoundEnabled;
      }
    }

    const soundListeners = new Set();

    function setSoundEnabled(enabled) {
      memorySoundEnabled = enabled;
      try {
        window.localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
      } catch (error) {
        storageBroken = true;
      }
      soundListeners.forEach(function (listener) { listener(); });
    }

    function subscribeSound(listener) {
      soundListeners.add(listener);
      return function () { soundListeners.delete(listener); };
    }

    function useSoundEnabled() {
      const [enabled, setEnabled] = useState(readSoundEnabled);
      useEffect(function () {
        return subscribeSound(function () { setEnabled(readSoundEnabled()); });
      }, []);
      useEffect(function () {
        function onStorage(event) {
          if (event.key === SOUND_KEY || event.key === LEGACY_MUTE_KEY) setEnabled(readSoundEnabled());
        }
        window.addEventListener('storage', onStorage);
        return function () { window.removeEventListener('storage', onStorage); };
      }, []);
      return enabled;
    }

    /* Pose artwork cropped from free Pikachu images found online
     * (Pokémon © Nintendo / Creatures / GAME FREAK), normalized to a square
     * transparent canvas and inlined as lossless WebP data URLs. */
    const POSE_IMAGES = {
      stand: '__POSE_STAND__',
      run: '__POSE_RUN__',
      'sleep-curl': '__POSE_SLEEPCURL__',
      call: '__POSE_CALL__',
      laugh: '__POSE_LAUGH__',
      jump: '__POSE_JUMP__',
      'sleep-side': '__POSE_SLEEPSIDE__',
      rest: '__POSE_REST__',
    };

    /* Each mood has one or more candidate poses; entering a mood picks one at
     * random, avoiding an immediate repeat when the previous pose qualifies. */
    const POSE_SETS = {
      idle: ['stand', 'rest'],
      working: ['run', 'jump'],
      waiting: ['call'],
      cheer: ['call', 'laugh', 'jump'],
      sleeping: ['sleep-curl', 'sleep-side'],
    };

    function pickPose(phase, previous) {
      const set = POSE_SETS[phase] || POSE_SETS.idle;
      if (set.length === 1) return set[0];
      const pool = previous && set.indexOf(previous) >= 0
        ? set.filter(function (key) { return key !== previous; })
        : set;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const CRY_CLIPS = [__PIKA_CLIPS__];

    const TEXT_EN = {
      idle: 'Pikachu is hanging out',
      working: 'Pikachu is cheering you on',
      waiting: 'Pikachu is waiting for you',
      cheer: 'Pika pika! Task complete',
      poke: 'Pika pika!',
      sleeping: 'Pikachu is asleep',
      bubbleWaiting: '!',
      bubbleCheer: 'Pika pika!',
      bubbleSleep: 'Zzz',
      mute: 'Mute',
      unmute: 'Unmute',
      petLabel: 'Pikachu',
      soundRowTitle: 'Pikachu Pet · Sound',
      soundRowDesc: 'Play a Pikachu cry when a task completes. You can also mute from the pet.',
      soundSwitch: 'Pikachu cry',
    };

    const TEXT_ZH = {
      idle: '皮卡丘在陪你',
      working: '皮卡丘在为你加油',
      waiting: '皮卡丘在等你确认',
      cheer: '皮卡皮卡！任务完成',
      poke: '皮卡皮卡！',
      sleeping: '皮卡丘睡着了',
      bubbleWaiting: '！',
      bubbleCheer: '皮卡皮卡！',
      bubbleSleep: 'Zzz',
      mute: '关闭声音',
      unmute: '开启声音',
      petLabel: '皮卡丘',
      soundRowTitle: '皮卡丘桌宠 · 声音',
      soundRowDesc: '任务完成时播放「皮卡皮卡」叫声；也可以悬停桌宠用按钮随时静音。',
      soundSwitch: '皮卡丘叫声',
    };

    let translate = function (key) { return TEXT_ZH[key] || key; };

    function installLocale(ctx) {
      try {
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        if (!locale || typeof locale.register !== 'function' || typeof locale.bind !== 'function') return;
        const dispose = locale.register('pikachu-pet', { en: TEXT_EN, zh: TEXT_ZH });
        if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(function () { return dispose; }, 'pikachu-pet: locale');
        }
        const bound = locale.bind('pikachu-pet');
        translate = function (key) {
          try {
            const value = bound(key);
            if (typeof value === 'string' && value.length > 0 && value !== key) return value;
          } catch (error) { /* noop */ }
          return TEXT_ZH[key] || key;
        };
      } catch (error) { /* keep the built-in Chinese fallback */ }
    }

    // Spark / star overlay aligned with the 260x260 pose canvas.
    const FX = '' +
      '<svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      '<g class="pkp-sparks">' +
      '<path class="pkp-spark pkp-spark-a" d="M34 152 L46 133 L41 131 L54 113 L41 120 L45 131 L36 137 Z" fill="#FFE45C" stroke="#E8A900" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path class="pkp-spark pkp-spark-b" d="M228 144 L218 125 L223 123 L210 105 L223 112 L219 123 L228 129 Z" fill="#FFE45C" stroke="#E8A900" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle class="pkp-spark pkp-spark-c" cx="48" cy="176" r="3.4" fill="#FFE45C"/>' +
      '<circle class="pkp-spark pkp-spark-d" cx="214" cy="168" r="3.4" fill="#FFE45C"/>' +
      '</g>' +
      '<g class="pkp-stars">' +
      '<path class="pkp-star pkp-star-a" d="M52 64 L56 75 L67 79 L56 83 L52 94 L48 83 L37 79 L48 75 Z" fill="#FFE45C" stroke="#E8A900" stroke-width="2" stroke-linejoin="round"/>' +
      '<path class="pkp-star pkp-star-b" d="M212 54 L216 65 L227 69 L216 73 L212 84 L208 73 L197 69 L208 65 Z" fill="#FFE45C" stroke="#E8A900" stroke-width="2" stroke-linejoin="round"/>' +
      '<path class="pkp-star pkp-star-c" d="M132 20 L135 29 L144 32 L135 35 L132 44 L129 35 L120 32 L129 29 Z" fill="#FFF2A8" stroke="#E8A900" stroke-width="2" stroke-linejoin="round"/>' +
      '</g>' +
      '</svg>';

    const CSS = '' +
      '.pkp-root{position:fixed;right:22px;bottom:14px;z-index:70;pointer-events:none;display:flex;flex-direction:column;align-items:center;--pkp-bubble-bg:var(--dsw-alias-bg-overlay,#ffffff);}' +
      '.pkp-root *{box-sizing:border-box;}' +
      '.pkp-pet{position:relative;pointer-events:auto;cursor:pointer;border:0;background:none;padding:0;line-height:0;border-radius:18px;-webkit-tap-highlight-color:transparent;}' +
      '.pkp-pet:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:4px;}' +
      '.pkp-stage{position:relative;width:184px;height:184px;filter:drop-shadow(0 10px 14px rgba(60,45,0,0.22));}' +
      '.pkp-sprite{display:block;width:184px;height:184px;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none;}' +
      '.pkp-fx{position:absolute;inset:0;pointer-events:none;overflow:visible;}' +
      '.pkp-fx svg{display:block;width:100%;height:100%;overflow:visible;}' +
      '.pkp-bubble{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);max-width:200px;padding:7px 12px;border-radius:14px;' +
      'background:var(--pkp-bubble-bg);color:var(--dsw-alias-label-primary,#1f2329);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));' +
      'box-shadow:0 10px 24px rgba(16,24,40,0.18);font:600 13px/1.35 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
      'text-align:center;white-space:nowrap;pointer-events:none;animation:pkp-bubble-in .34s cubic-bezier(.2,.9,.3,1.3) both;}' +
      '.pkp-bubble:after{content:"";position:absolute;left:50%;margin-left:-6px;bottom:-6px;width:12px;height:12px;background:var(--pkp-bubble-bg);' +
      'border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));transform:rotate(45deg);}' +
      '.pkp-bubble[data-kind="waiting"]{color:var(--dsw-alias-state-warn-primary,#b45309);font-size:19px;line-height:1;padding:5px 14px;}' +
      '.pkp-bubble[data-kind="sleep"]{font-size:12px;letter-spacing:1px;font-weight:600;color:var(--dsw-alias-label-secondary,#5b6472);padding:4px 11px;}' +
      '.pkp-mute{position:absolute;z-index:2;right:0;top:0;width:28px;height:28px;padding:0;border-radius:50%;display:grid;place-items:center;' +
      'font-size:13px;line-height:1;cursor:pointer;pointer-events:none;opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;' +
      'background:var(--pkp-bubble-bg);color:var(--dsw-alias-label-secondary,#5b6472);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));' +
      'box-shadow:0 4px 12px rgba(16,24,40,0.16);}' +
      '.pkp-mute:hover{border-color:var(--dsw-alias-border-l2,rgba(0,0,0,0.16));}' +
      '.pkp-root:hover .pkp-mute,.pkp-mute:focus-visible{opacity:1;transform:scale(1);pointer-events:auto;}' +
      '.pkp-root[data-sound="off"] .pkp-mute{opacity:.92;transform:scale(1);pointer-events:auto;}' +
      '@media (hover:none){.pkp-mute{opacity:.55;transform:scale(1);pointer-events:auto;}}' +
      '.pkp-root[data-phase="idle"] .pkp-sprite{animation:pkp-breathe 4s ease-in-out infinite;}' +
      '.pkp-root[data-phase="working"] .pkp-sprite{animation:pkp-bob .85s ease-in-out infinite;}' +
      '.pkp-root[data-phase="waiting"] .pkp-sprite{animation:pkp-hop 1.25s ease-in-out infinite;}' +
      '.pkp-root[data-phase="cheer"] .pkp-sprite{animation:pkp-cheer .8s cubic-bezier(.3,.7,.4,1) 2;}' +
      '.pkp-root[data-phase="sleeping"] .pkp-sprite{animation:pkp-doze 5.5s ease-in-out infinite;}' +
      '.pkp-sparks{opacity:0;transition:opacity .2s ease;}' +
      '.pkp-root[data-phase="working"] .pkp-sparks{opacity:1;}' +
      '.pkp-spark{transform-box:fill-box;transform-origin:center;animation:pkp-spark 1s ease-in-out infinite;animation-play-state:paused;}' +
      '.pkp-spark-b{animation-delay:.22s;}' +
      '.pkp-spark-c{animation-delay:.44s;}' +
      '.pkp-spark-d{animation-delay:.66s;}' +
      '.pkp-root[data-phase="working"] .pkp-spark{animation-play-state:running;}' +
      '.pkp-stars{opacity:0;}' +
      '.pkp-root[data-phase="cheer"] .pkp-stars{opacity:1;}' +
      '.pkp-star{transform-box:fill-box;transform-origin:center;animation:pkp-star .95s ease-out infinite;animation-play-state:paused;}' +
      '.pkp-star-b{animation-delay:.18s;}' +
      '.pkp-star-c{animation-delay:.36s;}' +
      '.pkp-root[data-phase="cheer"] .pkp-star{animation-play-state:running;}' +
      '@keyframes pkp-breathe{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-2.5px) scale(1.006);}}' +
      '@keyframes pkp-bob{0%,100%{transform:translateY(0) rotate(0deg);}30%{transform:translateY(-6px) rotate(-1.4deg);}60%{transform:translateY(-2px) rotate(1deg);}}' +
      '@keyframes pkp-hop{0%,100%{transform:translateY(0);}40%{transform:translateY(-13px) rotate(-2deg);}70%{transform:translateY(-3px);}}' +
      '@keyframes pkp-cheer{0%{transform:translateY(0) scale(1);}18%{transform:translateY(3px) scale(1.03,.96);}40%{transform:translateY(-22px) scale(.98,1.04) rotate(-3deg);}62%{transform:translateY(0) scale(1.02,.98);}80%{transform:translateY(-8px) rotate(2deg);}100%{transform:translateY(0) scale(1);}}' +
      '@keyframes pkp-doze{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(1.5px) scale(1.008,1.024);}}' +
      '@keyframes pkp-spark{0%,100%{opacity:0;transform:scale(.6);}50%{opacity:1;transform:scale(1.08);}}' +
      '@keyframes pkp-star{0%{opacity:0;transform:scale(.2) rotate(0deg);}40%{opacity:1;transform:scale(1.15) rotate(30deg);}100%{opacity:0;transform:scale(.4) rotate(60deg);}}' +
      '@keyframes pkp-bubble-in{0%{opacity:0;transform:translate(-50%,6px) scale(.8);}55%{opacity:1;transform:translate(-50%,-2px) scale(1.04);}100%{opacity:1;transform:translate(-50%,0) scale(1);}}' +
      '.pkp-pref-row{border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.14));justify-content:space-between;align-items:center;gap:24px;padding:16px 0;display:flex;}' +
      '.pkp-pref-title{color:var(--dsw-alias-label-primary,#1f2329);font-size:14px;line-height:20px;}' +
      '.pkp-pref-desc{color:var(--dsw-alias-label-secondary,#5b6472);margin-top:4px;font-size:12px;line-height:18px;}' +
      '.pkp-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border-radius:999px;cursor:pointer;' +
      'background:var(--dsw-alias-state-idle-primary,#c4c8cf);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,0.14));' +
      'transition:background .18s ease,border-color .18s ease;}' +
      '.pkp-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:var(--dsw-alias-brand-primary,#4d6bfe);}' +
      '.pkp-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px;}' +
      '.pkp-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#ffffff;' +
      'box-shadow:0 1px 2px rgba(0,0,0,0.22);transition:transform .18s cubic-bezier(.3,.7,.4,1);}' +
      '.pkp-switch[aria-checked="true"] .pkp-switch-thumb{transform:translateX(14px);}' +
      '@media (max-width:760px){.pkp-stage,.pkp-sprite{width:146px;height:146px;}.pkp-root{right:12px;bottom:10px;}}' +
      '@media (prefers-reduced-motion:reduce){.pkp-sprite,.pkp-fx svg *,.pkp-bubble{animation:none !important;}.pkp-mute,.pkp-switch,.pkp-switch-thumb{transition:none !important;}}';

    /* "Pika-pika" voice. The build script can embed a real cry clip
     * (assets/pika-cry.mp3|wav|ogg); otherwise a formant-synthesized
     * approximation is used so the plugin still works with no assets. */
    function createSoundEngine() {
      let audio = null;
      let closed = false;
      const removers = [];
      const clips = [];
      let lastClipIndex = -1;

      for (let index = 0; index < CRY_CLIPS.length; index += 1) {
        try {
          const clip = new Audio(CRY_CLIPS[index]);
          clip.preload = 'auto';
          clip.volume = 0.9;
          clip.addEventListener('error', function () {
            const at = clips.indexOf(clip);
            if (at >= 0) clips.splice(at, 1);
          });
          clips.push(clip);
        } catch (error) {
          /* skip unusable clip */
        }
      }

      function getAudio() {
        if (audio || closed) return audio;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
          audio = new Ctor();
        } catch (error) {
          audio = null;
        }
        return audio;
      }

      function unlock() {
        const current = getAudio();
        if (current && current.state === 'suspended') {
          current.resume().catch(function () {});
        }
      }

      function attachUnlock() {
        const handler = function () { unlock(); };
        window.addEventListener('pointerdown', handler, true);
        window.addEventListener('keydown', handler, true);
        removers.push(function () {
          window.removeEventListener('pointerdown', handler, true);
          window.removeEventListener('keydown', handler, true);
        });
      }

      function playClip() {
        if (clips.length === 0) return Promise.resolve(false);
        const pool = [];
        for (let index = 0; index < clips.length; index += 1) {
          if (index !== lastClipIndex) pool.push(index);
        }
        if (pool.length === 0) pool.push(0);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const clip = clips[pick];
        try {
          clip.currentTime = 0;
          const attempt = clip.play();
          return Promise.resolve(attempt).then(function () {
            lastClipIndex = pick;
            return true;
          }, function () {
            return false;
          });
        } catch (error) {
          return Promise.resolve(false);
        }
      }

      function noiseBuffer(context, seconds) {
        const length = Math.max(1, Math.floor(context.sampleRate * seconds));
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
        return buffer;
      }

      let master = null;

      function output(context) {
        if (!master) {
          master = context.createGain();
          master.gain.value = 0.8;
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.value = -18;
          compressor.ratio.value = 6;
          master.connect(compressor);
          compressor.connect(context.destination);
        }
        return master;
      }

      function burst(context, at, frequency, level) {
        const source = context.createBufferSource();
        source.buffer = noiseBuffer(context, 0.06);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(frequency, at);
        filter.Q.setValueAtTime(1.1, at);
        const gain = context.createGain();
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(output(context));
        source.start(at);
        source.stop(at + 0.06);
      }

      function syllable(context, at, shape) {
        const source = context.createOscillator();
        source.type = 'sawtooth';
        source.frequency.setValueAtTime(shape.from, at);
        source.frequency.linearRampToValueAtTime(shape.mid, at + shape.duration * 0.35);
        source.frequency.linearRampToValueAtTime(shape.to, at + shape.duration);

        const vibrato = context.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.setValueAtTime(5.5, at);
        const vibratoGain = context.createGain();
        vibratoGain.gain.setValueAtTime(7, at);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(source.frequency);

        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(shape.level, at + 0.02);
        envelope.gain.setValueAtTime(shape.level, at + shape.duration * 0.65);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + shape.duration);

        for (let index = 0; index < shape.formants.length; index += 1) {
          const formant = shape.formants[index];
          const filter = context.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(formant[0], at);
          filter.Q.setValueAtTime(formant[2], at);
          const gain = context.createGain();
          gain.gain.setValueAtTime(formant[1], at);
          source.connect(filter);
          filter.connect(gain);
          gain.connect(envelope);
        }

        envelope.connect(context.destination);
        source.start(at);
        source.stop(at + shape.duration + 0.02);
        vibrato.start(at);
        vibrato.stop(at + shape.duration + 0.02);
      }

      function schedule() {
        const current = audio;
        if (!current || closed) return;
        const start = current.currentTime + 0.02;
        const pi = [[330, 1.0, 10], [2250, 0.7, 12], [3000, 0.3, 14]];
        const ka = [[720, 1.0, 9], [1150, 0.7, 10], [2600, 0.28, 12]];
        // "pi-ka pi-ka"
        burst(current, start, 1500, 0.1);
        syllable(current, start + 0.015, { from: 350, mid: 430, to: 400, duration: 0.13, level: 0.16, formants: pi });
        burst(current, start + 0.16, 1900, 0.08);
        syllable(current, start + 0.175, { from: 430, mid: 390, to: 330, duration: 0.15, level: 0.16, formants: ka });
        burst(current, start + 0.38, 1500, 0.08);
        syllable(current, start + 0.395, { from: 380, mid: 450, to: 410, duration: 0.12, level: 0.15, formants: pi });
        burst(current, start + 0.53, 1900, 0.07);
        syllable(current, start + 0.545, { from: 450, mid: 400, to: 330, duration: 0.15, level: 0.15, formants: ka });
      }

      function playSynth() {
        const current = getAudio();
        if (!current) return;
        if (current.state === 'suspended') {
          current.resume().then(schedule).catch(function () {});
          return;
        }
        schedule();
      }

      function play() {
        if (closed) return;
        if (clips.length > 0) {
          unlock();
          playClip().then(function (started) {
            if (!started) playSynth();
          });
          return;
        }
        playSynth();
      }

      function dispose() {
        closed = true;
        removers.splice(0).forEach(function (remove) {
          try { remove(); } catch (error) { /* noop */ }
        });
        for (let index = 0; index < clips.length; index += 1) {
          try {
            clips[index].pause();
            clips[index].removeAttribute('src');
            clips[index].load();
          } catch (error) { /* noop */ }
        }
        clips.length = 0;
        master = null;
        if (audio) {
          try { audio.close().catch(function () {}); } catch (error) { /* noop */ }
          audio = null;
        }
      }

      return { attachUnlock: attachUnlock, unlock: unlock, play: play, dispose: dispose };
    }

    /* Derive one pet mood from the Session list + unified Session status. */
    function readMood(sessions, statuses) {
      const byId = (sessions && sessions.byId) || {};
      const ids = sessions && Array.isArray(sessions.ids) && sessions.ids.length
        ? sessions.ids
        : Object.keys(byId);
      let mainId = null;
      let runningId = null;
      let firstId = null;
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        const row = byId[id] || {};
        if (row.subagent || row.removed === true) continue;
        if (firstId === null) firstId = id;
        if (mainId === null && row.retainedBy && row.retainedBy.mainView > 0) mainId = id;
        if (runningId === null && row.running === true) runningId = id;
      }
      const targetId = mainId || runningId || firstId || null;
      const targetRow = targetId !== null ? (byId[targetId] || {}) : {};
      let status = null;
      if (targetId !== null && statuses && typeof statuses.get === 'function') {
        status = statuses.get(targetId) || null;
      }
      const running = status && typeof status.running === 'boolean'
        ? status.running
        : targetRow.running === true;
      return {
        targetId: targetId,
        running: running,
        waiting: Boolean(status && status.pendingInteraction),
      };
    }

    function PetIdleFallback() {
      return h('div', { className: 'pkp-root', 'data-phase': 'idle', 'aria-hidden': 'true' },
        h('style', null, CSS),
        h('div', { className: 'pkp-stage' },
          h('img', { className: 'pkp-sprite', src: POSE_IMAGES.stand, alt: '', draggable: false })));
    }

    function PetLive(props) {
      const useSessions = props.useSessions;
      const useSessionStatus = props.useSessionStatus;
      const sessions = useSessions(function (state) { return state; });
      const statuses = useSessionStatus(function (state) { return state; });
      const mood = readMood(sessions, statuses);

      const soundEnabled = useSoundEnabled();
      const [celebrating, setCelebrating] = useState(false);
      const [poked, setPoked] = useState(false);
      const [dozing, setDozing] = useState(false);
      const [poseKey, setPoseKey] = useState('stand');
      const phaseRef = useRef('idle');
      const soundOnRef = useRef(soundEnabled);
      const engineRef = useRef(null);
      const previousRunRef = useRef({ targetId: null, running: false });
      const lastChirpRef = useRef(0);
      const poseKeyRef = useRef(poseKey);

      useEffect(function () {
        soundOnRef.current = soundEnabled;
      }, [soundEnabled]);

      useEffect(function () {
        poseKeyRef.current = poseKey;
      }, [poseKey]);

      useEffect(function () {
        const engine = createSoundEngine();
        engineRef.current = engine;
        engine.attachUnlock();
        return function () {
          engine.dispose();
          engineRef.current = null;
        };
      }, []);

      useEffect(function () {
        const previous = previousRunRef.current;
        previousRunRef.current = { targetId: mood.targetId, running: mood.running };
        if (previous.targetId !== mood.targetId) return;
        if (previous.running === true && mood.running === false && !mood.waiting) {
          setCelebrating(true);
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            const engine = engineRef.current;
            if (engine && soundOnRef.current) engine.play();
          }
        }
      }, [mood.targetId, mood.running, mood.waiting]);

      useEffect(function () {
        if (mood.running) setCelebrating(false);
      }, [mood.running]);

      useEffect(function () {
        if (!celebrating) return undefined;
        const timer = setTimeout(function () { setCelebrating(false); }, 3000);
        return function () { clearTimeout(timer); };
      }, [celebrating]);

      useEffect(function () {
        if (!poked) return undefined;
        const timer = setTimeout(function () { setPoked(false); }, 1400);
        return function () { clearTimeout(timer); };
      }, [poked]);

      // Doze off after a long stretch without any Agent activity.
      useEffect(function () {
        if (mood.running || mood.waiting || celebrating || poked) {
          setDozing(false);
          return undefined;
        }
        const timer = setTimeout(function () { setDozing(true); }, 90000);
        return function () { clearTimeout(timer); };
      }, [mood.running, mood.waiting, celebrating, poked]);

      const phase = poked
        ? 'cheer'
        : mood.waiting
          ? 'waiting'
          : mood.running
            ? 'working'
            : celebrating
              ? 'cheer'
              : dozing
                ? 'sleeping'
                : 'idle';

      const statusKey = phase === 'cheer' && !celebrating ? 'poke' : phase;
      const statusText = translate(statusKey);

      // Re-roll the pose whenever the mood changes (one random pose per entry).
      useEffect(function () {
        if (phaseRef.current === phase) return;
        phaseRef.current = phase;
        setPoseKey(pickPose(phase, poseKeyRef.current));
      }, [phase]);

      function toggleSound() {
        const next = !soundEnabled;
        setSoundEnabled(next);
        if (next) {
          const engine = engineRef.current;
          if (engine) { engine.unlock(); engine.play(); }
        }
      }

      function chirp() {
        const engine = engineRef.current;
        setPoked(true);
        setDozing(false);
        if (!engine || !soundEnabled) return;
        const now = Date.now();
        if (now - lastChirpRef.current < 400) return;
        lastChirpRef.current = now;
        engine.unlock();
        engine.play();
      }

      const bubble = phase === 'waiting'
        ? h('div', { className: 'pkp-bubble', 'data-kind': 'waiting', role: 'status', 'aria-live': 'polite' }, translate('bubbleWaiting'))
        : phase === 'cheer'
          ? h('div', { className: 'pkp-bubble', 'data-kind': 'cheer', role: 'status', 'aria-live': 'polite' }, translate('bubbleCheer'))
          : phase === 'sleeping'
            ? h('div', { className: 'pkp-bubble', 'data-kind': 'sleep', role: 'status', 'aria-live': 'polite' }, translate('bubbleSleep'))
            : null;

      return h('div', { className: 'pkp-root', 'data-phase': phase, 'data-sound': soundEnabled ? 'on' : 'off' },
        h('style', null, CSS),
        bubble,
        h('button', {
          className: 'pkp-mute',
          type: 'button',
          'aria-label': translate(soundEnabled ? 'mute' : 'unmute'),
          title: translate(soundEnabled ? 'mute' : 'unmute'),
          onClick: function (event) {
            event.stopPropagation();
            event.preventDefault();
            toggleSound();
          },
        }, h('span', { 'aria-hidden': 'true' }, soundEnabled ? '🔊' : '🔇')),
        h('div', {
          className: 'pkp-pet',
          role: 'button',
          tabIndex: 0,
          title: statusText,
          'aria-label': statusText,
          onClick: chirp,
          onKeyDown: function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              chirp();
            }
          },
        },
        h('div', { className: 'pkp-stage' },
          h('img', { className: 'pkp-sprite', src: POSE_IMAGES[poseKey], alt: '', draggable: false }),
          h('div', { className: 'pkp-fx', dangerouslySetInnerHTML: { __html: FX } }))));
    }

    /* Settings → General row that owns the sound preference. */
    function SoundSettingsRow() {
      const enabled = useSoundEnabled();
      return h('div', { className: 'pkp-pref-row' },
        h('style', null, CSS),
        h('div', null,
          h('div', { className: 'pkp-pref-title' }, translate('soundRowTitle')),
          h('div', { className: 'pkp-pref-desc' }, translate('soundRowDesc'))),
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': enabled,
          'aria-label': translate('soundSwitch'),
          className: 'pkp-switch',
          onClick: function () { setSoundEnabled(!enabled); },
        }, h('span', { className: 'pkp-switch-thumb', 'aria-hidden': 'true' })));
    }

    function PikachuPet(props) {
      const live = typeof props.useSessions === 'function' && typeof props.useSessionStatus === 'function';
      return live ? h(PetLive, props) : h(PetIdleFallback, null);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        installLocale(ctx);
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'pikachu-pet',
            order: 100,
            label: '皮卡丘',
          }, PikachuPet);
        });
        ctx.slots.inject('settings.general.item', function () {
          return ctx.slots.register({
            name: 'settings.general.item',
            id: 'pikachu-pet.sound',
            order: 25,
          }, SoundSettingsRow);
        });
      },
    };
  },
});
