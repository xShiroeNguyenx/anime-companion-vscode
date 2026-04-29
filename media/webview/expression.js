import { state, debugLog } from './core.js';

// Cubism parameter presets per emotional state. Missing params on a model are
// silently ignored by setParameterValueById's catch.
const EXPRESSIONS = {
  neutral: {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamCheek: 0,
    ParamMouthForm: 0, ParamMouthOpenY: 0,
    ParamBrowLY: 0, ParamBrowRY: 0,
    ParamBrowLAngle: 0, ParamBrowRAngle: 0,
    ParamEyeBallY: 0,
  },
  happy: {
    ParamEyeLSmile: 1, ParamEyeRSmile: 1,
    ParamCheek: 0.5,
    ParamMouthForm: 1, ParamMouthOpenY: 0.3,
    ParamBrowLY: 0.3, ParamBrowRY: 0.3,
    ParamBrowLAngle: 0.3, ParamBrowRAngle: 0.3,
  },
  shy: {
    ParamEyeLSmile: 0.6, ParamEyeRSmile: 0.6,
    ParamCheek: 1,
    ParamMouthForm: 0.4, ParamMouthOpenY: 0.1,
    ParamEyeBallY: -0.4,
    ParamBrowLY: -0.2, ParamBrowRY: -0.2,
  },
  angry: {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamCheek: 0,
    ParamMouthForm: -1, ParamMouthOpenY: 0.2,
    ParamBrowLY: -0.5, ParamBrowRY: -0.5,
    ParamBrowLAngle: -1, ParamBrowRAngle: -1,
  },
  surprised: {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamCheek: 0,
    ParamMouthForm: 0, ParamMouthOpenY: 1,
    ParamBrowLY: 0.8, ParamBrowRY: 0.8,
    ParamBrowLAngle: 0.5, ParamBrowRAngle: 0.5,
  },
  sleepy: {
    ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3,
    ParamCheek: 0,
    ParamMouthForm: 0, ParamMouthOpenY: 0.5,
    ParamBrowLY: -0.3, ParamBrowRY: -0.3,
    ParamEyeBallY: -0.2,
  },
  love: {
    ParamEyeLSmile: 1, ParamEyeRSmile: 1,
    ParamCheek: 1,
    ParamMouthForm: 1, ParamMouthOpenY: 0.2,
    ParamBrowLY: 0.2, ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.5, ParamBrowRAngle: 0.5,
    ParamEyeBallY: 0.1,
  },
  focus: {
    ParamEyeLSmile: 0.1, ParamEyeRSmile: 0.1,
    ParamCheek: 0,
    ParamMouthForm: -0.2, ParamMouthOpenY: 0,
    ParamBrowLY: -0.4, ParamBrowRY: -0.4,
    ParamBrowLAngle: -0.5, ParamBrowRAngle: -0.5,
    ParamAngleX: 5, ParamAngleY: -10,
  },
};

const BLEND_SPEED = 0.08; // per-frame interpolation toward target
let currentExpression = {};
let targetExpression = {};
let expressionResetTimer = null;

export function setExpression(name, durationMs) {
  const preset = EXPRESSIONS[name];
  if (!preset) return;
  debugLog('Expression: ' + name + (durationMs ? ' (' + durationMs + 'ms)' : ''));

  targetExpression = { ...EXPRESSIONS.neutral, ...preset };

  if (expressionResetTimer) clearTimeout(expressionResetTimer);
  if (durationMs) {
    expressionResetTimer = setTimeout(() => {
      targetExpression = { ...EXPRESSIONS.neutral };
    }, durationMs);
  }
}

// Called from PIXI ticker every frame to smoothly blend toward target.
export function updateExpressionTick() {
  if (!state.model || !state.model.internalModel) return;
  const core = state.model.internalModel.coreModel;
  if (!core) return;

  for (const [param, target] of Object.entries(targetExpression)) {
    const current = currentExpression[param] || 0;
    const blended = current + (target - current) * BLEND_SPEED;
    currentExpression[param] = blended;
    try {
      core.setParameterValueById(param, blended);
    } catch (e) { /* param not in this model — ignore */ }
  }
}

// ─── Mood indicator (status dot in corner of the panel) ──────────────────
const MOOD_COLOR = { idle: '#4caf50', happy: '#e91e63', angry: '#f44336', sleepy: '#9e9e9e' };
const MOOD_EMOJI = { idle: '💚', happy: '💖', angry: '💢', sleepy: '💤' };

export function updateMoodIndicator() {
  const dot = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  const color = MOOD_COLOR[state.currentMood] || MOOD_COLOR.idle;
  if (dot) {
    dot.style.background = color;
    dot.style.boxShadow = '0 0 6px ' + color;
  }
  if (text) {
    const emoji = MOOD_EMOJI[state.currentMood] || '';
    text.textContent = emoji + ' ' + (state.currentMood.charAt(0).toUpperCase() + state.currentMood.slice(1));
  }
}
