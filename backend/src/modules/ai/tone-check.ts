/**
 * Heuristic tone-consistency check. Maps common brand tones to signal words,
 * then scores generated copy by how many tone signals it contains.
 * Returns a warning when the copy drifts from the selected tones.
 */

const TONE_SIGNALS: Record<string, string[]> = {
  professional: ["pleased", "announce", "insight", "strategy", "expertise", "trusted", "proven", "leverage"],
  friendly: ["hey", "thanks", "love", "awesome", "excited", "glad", "welcome", "cheers"],
  playful: ["fun", "yay", "whoa", "oops", "haha", "party", "vibes", "lol"],
  formal: ["hereby", "cordially", "esteemed", "furthermore", "regarding", "sincerely"],
  casual: ["gonna", "wanna", "yeah", "stuff", "kinda", "hey", "btw"],
  inspirational: ["dream", "believe", "achieve", "journey", "unstoppable", "rise", "thrive", "imagine"],
  humorous: ["haha", "lol", "oops", "plot twist", "whoops", "😂", "🤣"],
  empathetic: ["understand", "sorry", "here for you", "we hear", "together", "support"],
  bold: ["game-changer", "revolutionary", "fearless", "disrupt", "no compromise", "dominate"],
  minimal: [],
};

const ANTI_SIGNALS: Record<string, string[]> = {
  professional: ["lol", "lmao", "omg", "haha", "😂", "🤣", "yay!!"],
  formal: ["lol", "gonna", "wanna", "yeah", "btw", "😂"],
  minimal: ["!!!", "🔥🔥", "💯💯", "!!!"],
};

export interface ToneCheck {
  tones: string[];
  score: number; // 0-100, higher = more consistent
  drift: boolean;
  warning?: string;
}

export function checkTone(text: string, tones: string[]): ToneCheck {
  if (!tones || tones.length === 0) {
    return { tones, score: 100, drift: false };
  }

  const lower = text.toLowerCase();
  let hits = 0;
  let misses = 0;

  for (const tone of tones) {
    const key = tone.toLowerCase();
    const signals = TONE_SIGNALS[key] || [];
    const anti = ANTI_SIGNALS[key] || [];
    for (const s of signals) {
      if (lower.includes(s.toLowerCase())) hits++;
    }
    for (const a of anti) {
      if (lower.includes(a.toLowerCase())) misses += 2;
    }
  }

  // Longer copy gets more chances to hit; normalize roughly by length
  const words = lower.split(/\s+/).length;
  const expected = Math.max(1, Math.floor(words / 25));
  const raw = hits - misses;
  const score = Math.max(0, Math.min(100, Math.round(50 + (raw / expected) * 25)));

  const drift = score < 40;
  return {
    tones,
    score,
    drift,
    warning: drift
      ? `This copy may drift from your brand tone (${tones.join(", ")}). Consider revising.`
      : undefined,
  };
}
