// Lightweight keyword + emoji heuristic that maps an assistant reply to one
// of the existing Live2D moods so the companion visibly reacts to chat. This
// is intentionally cheap (no extra LLM call) — accuracy doesn't need to be
// great, the goal is "the companion feels alive when chatting".
//
// The moods returned here match the values main.js already accepts in its
// `setMood` handler: 'happy' | 'angry' | 'sleepy' | 'idle'. We additionally
// emit a matching motion so the model also plays an animation.

export type ChatMood = 'happy' | 'sad' | 'thinking' | 'excited' | 'neutral';

export interface SentimentResult {
  mood: ChatMood;
  // Mood value compatible with media/webview/main.js setMood handler.
  webviewMood: 'happy' | 'angry' | 'sleepy' | 'idle';
  motion: 'TapBody' | 'TapHead' | 'Idle';
}

const POSITIVE = [
  /\b(great|awesome|nice|cool|love|perfect|excellent|wonderful|amazing|fantastic|sweet|yay|woo+hoo)\b/i,
  /\b(tuy[eê]?t|hay qu[aá]|gi[oỏ]i|ok+|tu+y[eê]t|chu[ẩa]n)\b/i,
  /[😄😃😀😊😁😆🎉✨🥳😸🌸💖💕👍🥰]/u,
];
const EXCITED = [
  /[!]{2,}/,
  /\b(wow|whoa|let'?s go|gosh|excited|amazing|huzzah)\b/i,
  /[🚀🔥⭐💥✨🎉]/u,
];
const NEGATIVE = [
  /\b(sorry|unfortunately|error|fail(ed|ure)?|cannot|can'?t|won'?t|broken|bug|issue|problem|wrong)\b/i,
  /\b(xin l[oỗ]i|kh[oô]ng th[eể]?|l[oõ]i|h[oỏ]ng|ti[eế]c)\b/i,
  /[😢😞😔😟😕🥺💔]/u,
];
const THINKING = [
  /\b(let me think|hmm+|hmmm|i wonder|considering|on second thought|actually,|wait,)\b/i,
  /\b(suy ngh[iĩ]|ch[oờ]? ch[uú]t|hmm+|đ[eể]? xem|th[uử]? xem)\b/i,
  /[🤔💭🧐😌]/u,
];

export function detectSentiment(text: string): SentimentResult {
  const head = (text ?? '').slice(0, 400);
  const tail = (text ?? '').slice(-400);
  const sample = head + ' ' + tail;

  const scoreHappy =
    countMatches(sample, POSITIVE) +
    Math.min(2, countCharClasses(sample, /[😄😃😀😊😁😆🥰💖]/gu));
  const scoreExcited = countMatches(sample, EXCITED);
  const scoreSad = countMatches(sample, NEGATIVE);
  const scoreThinking = countMatches(sample, THINKING);

  let mood: ChatMood = 'neutral';
  if (scoreSad > scoreHappy && scoreSad > scoreExcited && scoreSad > scoreThinking) {
    mood = 'sad';
  } else if (scoreExcited > Math.max(scoreHappy, scoreSad, scoreThinking) && scoreExcited >= 2) {
    mood = 'excited';
  } else if (scoreHappy > Math.max(scoreSad, scoreThinking)) {
    mood = 'happy';
  } else if (scoreThinking > 0 && scoreHappy === 0 && scoreSad === 0) {
    mood = 'thinking';
  }

  return {
    mood,
    webviewMood: moodToWebview(mood),
    motion: moodToMotion(mood),
  };
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(text)) n++;
  return n;
}
function countCharClasses(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function moodToWebview(mood: ChatMood): SentimentResult['webviewMood'] {
  switch (mood) {
    case 'happy':
    case 'excited':
      return 'happy';
    case 'sad':
      return 'sleepy';
    case 'thinking':
      return 'idle';
    default:
      return 'idle';
  }
}

function moodToMotion(mood: ChatMood): SentimentResult['motion'] {
  switch (mood) {
    case 'happy':
    case 'excited':
      return 'TapBody';
    case 'sad':
    case 'thinking':
      return 'TapHead';
    default:
      return 'Idle';
  }
}
