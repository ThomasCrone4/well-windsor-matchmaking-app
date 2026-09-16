// src/utils/contentChecks.js
//
// APP-5. Roles publish without human review, so the two things that check
// them are the database and this file.
//
// The split is deliberate:
//
//   * LENGTHS are enforced by CHECK constraints in the database — the form is
//     not the only way in, and "a 2MB description breaks browse for everyone"
//     is a property of the data, not of the page that submitted it. The
//     numbers here MUST match migration 20260915160103; they exist so the
//     form can say it in words and show a counter instead of surfacing a
//     23514 the person cannot read.
//
//   * THE WORD LIST lives only here. It is a content-quality measure for a
//     small number of approved organisations, not a security boundary, and a
//     false positive in the database would be a 400 with no explanation on
//     the longest form on the site. In the form it can name the word and let
//     the person fix it.
//
// There is deliberately NO SQL-injection filter and NO HTML/<script> filter.
// Supabase's client sends values separately from the query and React escapes
// what it renders, so both are already handled. A filter that greps for
// `<script>` catches the obvious attempt, misses the real one, and teaches
// people the site is protected by the wrong thing. The user asked for one;
// the reasoning is in the APP-5 thread and they accepted it.

/** Must match the CHECK constraints on volunteer_opportunities. */
export const LIMITS = {
  title: 120,
  description: 5000,
  location: 200,
  skills: 300,
  closed_reason: 200,
  volunteers_needed: 500,
};

// Slurs and sexual terms, plus the small set of general profanity most likely
// to be typed in anger. Kept short on purpose: a long list is a long list of
// false positives, and the real defence against a bad actor is that
// organisations are approved before they can publish at all.
//
// Matched on word boundaries against a normalised copy of the text, so
// "Scunthorpe" and "class" survive — the classic failure of a naive
// substring check.
const BANNED_WORDS = [
  'fuck', 'fucking', 'fucked', 'shit', 'shite', 'bullshit', 'cunt', 'twat',
  'wanker', 'bastard', 'bollocks', 'arsehole', 'asshole', 'dickhead',
  'motherfucker', 'prick', 'slut', 'whore', 'nigger', 'nigga', 'paki',
  'chink', 'spic', 'kike', 'faggot', 'fag', 'tranny', 'retard', 'retarded',
  'rape', 'rapist', 'porn', 'pornographic',
];

// Common letter-for-symbol substitutions, so f*ck and sh1t are still caught.
const LEET = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't', '*': '' };

function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[4@31!05$7*]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s]/g, ' ');
}

/**
 * Banned words found in `text`, de-duplicated and in the order they appear.
 * Empty array means nothing to report.
 */
export function findBannedWords(text) {
  const haystack = normalise(text);
  if (!haystack.trim()) return [];
  const found = [];
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(haystack) && !found.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

/**
 * A zod `.superRefine` body for one free-text field: length then wording.
 * Used by both the post and the edit form so they cannot drift apart.
 */
export function checkFreeText(value, field, ctx, { checkWords = false } = {}) {
  const text = value ?? '';
  const limit = LIMITS[field];

  if (limit && text.length > limit) {
    ctx.addIssue({
      code: 'custom',
      message: `Please keep this to ${limit.toLocaleString()} characters. It is currently ${text.length.toLocaleString()}.`,
    });
    return;
  }

  if (checkWords) {
    const bad = findBannedWords(text);
    if (bad.length) {
      ctx.addIssue({
        code: 'custom',
        message:
          bad.length === 1
            ? `Please reword this: “${bad[0]}” is not something we can publish.`
            : `Please reword this: ${bad.map((w) => `“${w}”`).join(', ')} are not something we can publish.`,
      });
    }
  }
}

/** Characters left, for a counter under an input. Negative means over. */
export function charsLeft(value, field) {
  const limit = LIMITS[field];
  if (!limit) return null;
  return limit - String(value ?? '').length;
}
