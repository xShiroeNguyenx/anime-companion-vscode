import { state } from './core.js';

let currentAudio = null;
let currentPlaybackToken = 0;
let currentUtterance = null;
let speechVoiceLoadPromise = null;
let ambientAudio = null;
let ambientPreset = 'off';
let ambientUnlocked = false;

function statusTextEl() {
  return document.querySelector('.status-text');
}

function ambientTrackMap() {
  const items = Array.isArray(window.__AMBIENT_TRACKS__) ? window.__AMBIENT_TRACKS__ : [];
  return new Map(items.map((item) => [item.id, item]));
}

function currentAmbientTrack() {
  return ambientTrackMap().get(ambientPreset) || null;
}

function ambientVolumeValue() {
  const raw = Number(window.__AMBIENT_VOLUME__);
  if (!Number.isFinite(raw)) return 0.3;
  return Math.max(0, Math.min(1, raw / 100));
}

function updateAmbientStatusLabel() {
  const el = statusTextEl();
  if (!el) return;

  const track = currentAmbientTrack();
  if (!track || ambientPreset === 'off') {
    el.textContent = 'Live2D';
    return;
  }

  el.textContent = `Live2D - ${track.label}`;
}

function ensureAmbientAudio() {
  if (ambientAudio) return ambientAudio;

  ambientAudio = new Audio();
  ambientAudio.loop = true;
  ambientAudio.preload = 'none';
  ambientAudio.crossOrigin = 'anonymous';
  ambientAudio.volume = ambientVolumeValue();
  ambientAudio.addEventListener('error', () => {
    const code = ambientAudio.error && ambientAudio.error.code;
    const msg = (ambientAudio.error && ambientAudio.error.message) || '';
    console.warn('[AnimeCompanion] Ambient audio error code=' + code + ' msg=' + msg + ' src=' + ambientAudio.src);
  });
  return ambientAudio;
}

function stopAmbientAudio() {
  if (!ambientAudio) return;
  try {
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
  } catch (err) {
    console.warn('[AnimeCompanion] Failed to stop ambient audio:', err);
  }
}

function ambientShouldPlay() {
  const track = currentAmbientTrack();
  return Boolean(track && track.url && !window.__AUDIO_MUTED__);
}

async function tryPlayAmbient() {
  const track = currentAmbientTrack();
  if (!track || !track.url || !ambientUnlocked || window.__AUDIO_MUTED__) {
    return;
  }

  const audio = ensureAmbientAudio();
  audio.volume = ambientVolumeValue();
  if (audio.src !== track.url) {
    audio.src = track.url;
  }

  try {
    await audio.play();
  } catch (err) {
    console.warn('[AnimeCompanion] Ambient play rejected:', err && err.message ? err.message : err);
  }
}

function syncAmbientPlayback() {
  updateAmbientStatusLabel();

  if (!ambientShouldPlay()) {
    stopAmbientAudio();
    return;
  }

  const track = currentAmbientTrack();
  const audio = ensureAmbientAudio();
  audio.volume = ambientVolumeValue();
  if (track && audio.src !== track.url) {
    audio.src = track.url;
  }
  void tryPlayAmbient();
}

export function initAmbientAudio() {
  ambientPreset = window.__AMBIENT_PRESET__ || 'off';
  updateAmbientStatusLabel();

  const unlock = () => {
    if (ambientUnlocked) return;
    ambientUnlocked = true;
    void tryPlayAmbient();
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  syncAmbientPlayback();
}

function stopCurrentAudio() {
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.warn('[AnimeCompanion] Failed to cancel speech synthesis:', err);
    }
  }
  currentUtterance = null;

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = '';
      currentAudio.load();
    } catch (err) {
      console.warn('[AnimeCompanion] Failed to stop previous HTML5 audio:', err);
    }
    currentAudio = null;
  }

  // Best-effort stop hooks for model-driven audio/lipsync fallback.
  if (state.model) {
    try {
      if (typeof state.model.stopSpeaking === 'function') {
        state.model.stopSpeaking();
      } else if (typeof state.model.stopSpeak === 'function') {
        state.model.stopSpeak();
      } else if (typeof state.model.stopVoice === 'function') {
        state.model.stopVoice();
      }
    } catch (err) {
      console.warn('[AnimeCompanion] Failed to stop previous model speech:', err);
    }
  }
}

function voiceLanguageToSpeechLang(voiceLanguage) {
  switch (voiceLanguage) {
    case 'ja':
      return 'ja-JP';
    case 'en':
      return 'en-US';
    case 'vi':
    default:
      return 'vi-VN';
  }
}

function waitForVoices() {
  if (!window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') {
    return Promise.resolve([]);
  }

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }

  if (!speechVoiceLoadPromise) {
    speechVoiceLoadPromise = new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const onVoicesChanged = () => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          synth.removeEventListener('voiceschanged', onVoicesChanged);
          resolve(voices);
        }
      };

      synth.addEventListener('voiceschanged', onVoicesChanged);
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(synth.getVoices());
      }, 1200);
    });
  }

  return speechVoiceLoadPromise;
}

function pickSpeechVoice(voices, lang) {
  if (!voices || voices.length === 0) return null;

  const exact = voices.find((voice) => voice.lang === lang);
  if (exact) return exact;

  const prefix = lang.split('-')[0];
  return voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(prefix.toLowerCase())) || null;
}

// Plays an audio file from `${__AUDIO_BASE_URL__}/${filename}`. Tries HTML5
// Audio first (most reliable, doesn't need model state), then drives Cubism's
// lipsync silently after playback starts. Falls back to model.speak() if
// HTML5 playback is rejected (e.g. CSP / autoplay block).
export function playAudio(filename) {
  if (window.__AUDIO_MUTED__) {
    console.log('[AnimeCompanion] Audio muted, skipping', filename);
    return;
  }

  if (!window.__AUDIO_BASE_URL__) {
    console.warn('[AnimeCompanion] No __AUDIO_BASE_URL__ set');
    return;
  }
  let baseUrl = window.__AUDIO_BASE_URL__;
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  const url = baseUrl + '/' + filename;
  console.log('[AnimeCompanion] playAudio ->', url);
  stopCurrentAudio();

  const playbackToken = ++currentPlaybackToken;

  const audio = new Audio(url);
  audio.volume = 0.8;
  currentAudio = audio;

  audio.addEventListener('error', () => {
    const code = audio.error && audio.error.code;
    const msg = (audio.error && audio.error.message) || '';
    console.error('[AnimeCompanion] HTML5 audio error code=' + code + ' msg=' + msg + ' url=' + url);
  });
  audio.addEventListener('ended', () => {
    if (currentAudio === audio) {
      currentAudio = null;
    }
  });

  const playPromise = audio.play();
  if (!playPromise || !playPromise.catch) return;

  playPromise.then(() => {
    if (playbackToken !== currentPlaybackToken) return;

    // Drive lipsync via Cubism on top of the already-playing HTML5 stream
    if (state.model && typeof state.model.speak === 'function') {
      try {
        const r = state.model.speak(url, { volume: 0, expression: null });
        if (r && r.catch) r.catch(e => console.warn('[AnimeCompanion] model.speak (lipsync) failed:', e));
      } catch (e) { console.warn('[AnimeCompanion] model.speak threw:', e); }
    }
  }).catch(err => {
    if (playbackToken !== currentPlaybackToken) return;

    console.error('[AnimeCompanion] HTML5 audio.play rejected:', err && err.name, err && err.message, 'url=' + url);
    if (state.model && typeof state.model.speak === 'function') {
      try {
        const r = state.model.speak(url, { volume: 0.8 });
        if (r && r.catch) r.catch(e => console.error('[AnimeCompanion] model.speak fallback failed:', e));
      } catch (e) { console.error('[AnimeCompanion] model.speak fallback threw:', e); }
    }
  });
}

export async function speakText(text) {
  void text;
  // System TTS is intentionally disabled so the companion only uses bundled audio assets.
  return;
}

export function setAmbientPreset(preset) {
  ambientPreset = preset || 'off';
  window.__AMBIENT_PRESET__ = ambientPreset;
  syncAmbientPlayback();
}

export function setAmbientVolume(volume) {
  window.__AMBIENT_VOLUME__ = volume;
  if (ambientAudio) {
    ambientAudio.volume = ambientVolumeValue();
  }
}

export function setGlobalAudioMuted(muted) {
  window.__AUDIO_MUTED__ = Boolean(muted);
  syncAmbientPlayback();
}
