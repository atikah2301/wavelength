// Preset spectrum cards: [left concept, right concept]. Ids are derived from the
// index ("p0", "p1", ...), so only ever append to the end of this list.
const PAIRS = [
  ["Cold", "Hot"],
  ["Bad movie", "Good movie"],
  ["Overrated", "Underrated"],
  ["Useless", "Useful"],
  ["Rough", "Smooth"],
  ["Ugly", "Beautiful"],
  ["Rarely eaten", "Often eaten"],
  ["Cheap", "Expensive"],
  ["Weak", "Strong"],
  ["Boring job", "Exciting job"],
  ["Quiet", "Loud"],
  ["Dangerous", "Safe"],
  ["Fashionable", "Unfashionable"],
  ["Child's toy", "Adult's toy"],
  ["Bad habit", "Good habit"],
  ["Morning activity", "Evening activity"],
  ["Easy to cook", "Hard to cook"],
  ["Sad song", "Happy song"],
  ["Ordinary", "Weird"],
  ["Tiny", "Enormous"],
  ["Slow", "Fast"],
  ["Forgettable", "Memorable"],
  ["Embarrassing", "Impressive"],
  ["Rude", "Polite"],
  ["Mainstream", "Niche"],
  ["Good pizza topping", "Bad pizza topping"],
  ["Relaxing", "Stressful"],
  ["Fiction", "Non-fiction"],
  ["Old-fashioned", "Futuristic"],
  ["Silly", "Serious"],
  ["Hard to spell", "Easy to spell"],
  ["Healthy", "Unhealthy"],
  ["Gross", "Delicious"],
  ["Round", "Pointy"],
  ["Cute animal", "Scary animal"],
  ["Beginner", "Expert"],
  ["Waste of time", "Worth the time"],
  ["Necessity", "Luxury"],
  ["Private", "Public"],
  ["Calm", "Chaotic"],
  ["Fair", "Unfair"],
  ["Cheesy", "Classy"],
  ["Lucky", "Unlucky"],
  ["Soft", "Hard"],
  ["Wet", "Dry"],
  ["Summer activity", "Winter activity"],
  ["Rich person's hobby", "Poor person's hobby"],
  ["Overdone Halloween costume", "Original Halloween costume"],
  ["Bad gift", "Great gift"],
  ["Easy to learn", "Hard to learn"],
  ["Sweet", "Savoury"],
  ["Rare", "Common"],
  ["Trustworthy", "Suspicious"],
  ["Heroic", "Villainous"],
  ["Best used alone", "Best used with friends"],
  ["Old", "New"],
  ["Short-lived", "Long-lasting"],
  ["Underpaid job", "Overpaid job"],
  ["Clean", "Dirty"],
  ["Smells bad", "Smells good"],
];

export const PRESET_PACK_ID = "preset";
export const PRESET_PACK_NAME = "Preset cards";

export const PRESETS = PAIRS.map(([left, right], i) => ({ id: `p${i}`, packId: PRESET_PACK_ID, left, right }));

const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to"]);

/**
 * Title-cases a card end: "cute" -> "Cute", "child's toy" -> "Child's Toy". Minor
 * words stay lower case unless they come first, and the rest of each word is left
 * as typed so things like "NASA" or "iPhone" survive.
 */
export function titleCase(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.replace(/(^|-)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}

const norm = (text) => text.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Terms of a new card that already appear (case-insensitive, on either end) on a
 * card in `cards`. Returns `[{ term, card }]`, one entry per clashing new term.
 */
export function findClashes(cards, left, right) {
  const clashes = [];
  for (const term of [left, right]) {
    const card = cards.find((c) => norm(c.left) === norm(term) || norm(c.right) === norm(term));
    if (card) clashes.push({ term, card });
  }
  return clashes;
}
