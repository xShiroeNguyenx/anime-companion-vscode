import { state } from './core.js';

let currentAudio = null;
let currentPlaybackToken = 0;

function stopCurrentAudio() {
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
  console.log('[AnimeCompanion] playAudio →', url);
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
