import type { TailoredCv } from "@/lib/ai/prompts";

/**
 * Zero-fabrication checks for generated CV drafts.
 *
 * The AI prompt forbids inventing evidence, but a prompt is not a guarantee, so
 * everything that can become the user's CV is verified against the uploaded CV
 * before it reaches the browser: the generated draft and the "tailored" side of
 * every listed change. Analysis fields (the score, its explanation and the gap
 * lists) discuss the job rather than claiming experience, so they are free to
 * mention requirements the CV does not evidence.
 */

function extractedNumbers(value: string) {
  return new Set(value.match(/\b\d+(?:[.,]\d+)?%?\+?\b/g) ?? []);
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/** Nouns that turn a number word into a factual claim rather than prose. */
const QUANTITY_NOUNS =
  "years?|yrs?|months?|weeks?|days?|percent|times|members?|teams?|people|persons?|projects?|clients?|customers?|users?|engineers?|developers?|designers?|companies|products?|languages?|frameworks?";

/**
 * Finds claims written as words — "four years of experience" — that the digit
 * scan cannot see. A model that is told not to invent numbers will sometimes
 * spell one out instead, and years-of-experience totals are exactly the claim
 * the zero-fabrication rule exists to stop.
 */
function spelledOutClaims(source: string, draft: string) {
  const pattern = new RegExp(
    `\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b(?:\\s+[a-z-]+){0,2}\\s+\\b(?:${QUANTITY_NOUNS})\\b`,
    "gi",
  );
  const found = new Set<string>();
  for (const match of draft.matchAll(pattern)) {
    const word = match[1].toLowerCase();
    const digits = String(NUMBER_WORDS[word]);
    const documented =
      new RegExp(`\\b${digits}\\b`).test(source) ||
      new RegExp(`\\b${word}\\b`, "i").test(source);
    if (!documented) found.add(match[0].replace(/\s+/g, " ").toLowerCase());
  }
  return [...found];
}

/** Whitespace-insensitive comparison so line wrapping cannot hide a match. */
export function flatten(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function cvContentOf(tailored: TailoredCv) {
  return [
    tailored.tailored_cv,
    ...tailored.changes.map((change) => change.tailored),
  ].join("\n");
}

/**
 * Returns a human-readable problem per violated rule, ready to replay to the
 * model as corrective feedback. An empty array means the draft is safe to show.
 */
export function guardrailProblems(
  cvText: string,
  tailored: TailoredCv,
): string[] {
  const problems: string[] = [];
  const cvContent = cvContentOf(tailored);

  const sourceNumbers = extractedNumbers(cvText);
  const introduced = [...extractedNumbers(cvContent)].filter(
    (number) => !sourceNumbers.has(number),
  );
  if (introduced.length)
    problems.push(
      `It used numbers the CV never states: ${introduced.slice(0, 6).join(", ")}.`,
    );

  const source = flatten(cvText);
  const draft = flatten(cvContent);

  const spelled = spelledOutClaims(source, draft);
  if (spelled.length)
    problems.push(
      `It spelled out quantities the CV never states: ${spelled
        .slice(0, 6)
        .join("; ")}.`,
    );

  const claimed = tailored.missing_keywords.filter((keyword) => {
    const term = flatten(keyword);
    return term.length > 1 && !source.includes(term) && draft.includes(term);
  });
  if (claimed.length)
    problems.push(
      `It added requirements the CV does not evidence: ${claimed
        .slice(0, 6)
        .join(", ")}.`,
    );

  return problems;
}

/**
 * Keeps only the changes whose "original" really appears in the uploaded CV, so
 * the comparison never invents a "before" the candidate never wrote.
 */
export function verifiedChanges(cvText: string, tailored: TailoredCv) {
  const source = flatten(cvText);
  return tailored.changes.filter((change) =>
    source.includes(flatten(change.original).replace(/^[-•*]\s*/, "")),
  );
}

export class GuardrailError extends Error {}
