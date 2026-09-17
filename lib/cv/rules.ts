import type {
  CvAnalysis,
  CvBullet,
  CvIssue,
  ParsedCv,
  ScoreCategory,
} from "./types";

export const weakVerbs: Record<
  string,
  { severity: CvIssue["severity"]; advice: string }
> = {
  "responsible for": {
    severity: "warning",
    advice: "Name the action you took instead of a responsibility.",
  },
  "duties included": {
    severity: "warning",
    advice: "Describe your contribution rather than listing duties.",
  },
  helped: {
    severity: "suggestion",
    advice: "Clarify your specific contribution to this work.",
  },
  assisted: {
    severity: "suggestion",
    advice:
      "Explain how you contributed; retain the actual scope of your role.",
  },
  "worked on": {
    severity: "suggestion",
    advice: "Name the specific work you completed.",
  },
  "participated in": {
    severity: "suggestion",
    advice: "Describe what you contributed to this activity.",
  },
  handled: {
    severity: "suggestion",
    advice: "Use a more specific action if it accurately reflects your work.",
  },
};
const actionPattern =
  /\b(built|build|developed|develop|created|create|led|lead|managed|manage|improved|improve|reduced|reduce|increased|increase|delivered|deliver|designed|design|implemented|implement|automated|automate|launched|launch|resolved|resolve|supported|support|helped|assisted|handled|worked|responsible|contributed|maintained|optimized|tested|analyzed|coordinated|engineered)\b/i;
const actionStartPattern = new RegExp(`^(?:${actionPattern.source})`, "i");

export function scoreCv(parsed: ParsedCv): CvAnalysis {
  const { text } = parsed;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sections = {
    Experience:
      /(?:^|\n)\s*(?:(?:professional|work|relevant|employment)\s+)?(?:experience|employment history|work history)\s*[:\n]/i.test(
        text + "\n",
      ),
    Education:
      /(?:^|\n)\s*(?:education|academic(?: background| qualifications)?)\s*[:\n]/i.test(
        text + "\n",
      ),
    Skills:
      /(?:^|\n)\s*(?:(?:technical|core|key)\s+)?(?:skills|competencies|technologies)\s*[:\n]/i.test(
        text + "\n",
      ),
    Contact:
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) &&
      /(?:\+?\d[\d ()-]{7,}\d)/.test(text),
  };
  const bullets: CvBullet[] = [];
  const issues: CvIssue[] = [];
  // Preserve original string offsets for highlights. No separate normalized text is scored.
  for (const line of text.matchAll(/[^\n]+/g)) {
    if (
      line[0].trim().split(/\s+/).length < 5 ||
      !(
        /^[•●▪◦*\-–]\s+/.test(line[0].trimStart()) ||
        actionStartPattern.test(line[0].trimStart())
      )
    )
      continue;
    const bullet: CvBullet = {
      id: `b-${line.index}`,
      start: line.index,
      end: line.index + line[0].length,
      text: line[0],
    };
    bullets.push(bullet);
    for (const [phrase, rule] of Object.entries(weakVerbs)) {
      const regex = new RegExp(`\\b${phrase}\\b`, "gi");
      for (const match of line[0].matchAll(regex)) {
        issues.push({
          id: `weak-${line.index + match.index}`,
          kind: "weak-verb",
          severity: rule.severity,
          start: line.index + match.index,
          end: line.index + match.index + match[0].length,
          message: rule.advice,
          bulletId: bullet.id,
        });
      }
    }
    const action = line[0].match(actionPattern);
    // Ignore years alone: a date is not evidence of quantified impact.
    const meaningfulNumbers = [
      ...line[0].matchAll(/\b\d+(?:[.,]\d+)?\s*(?:%|x\b)?/g),
    ].filter((match) => !/^(?:19|20)\d{2}$/.test(match[0].trim()));
    const quantified =
      action &&
      meaningfulNumbers.some(
        (match) => Math.abs(match.index - (action.index ?? 0)) <= 140,
      );
    if (action && !quantified)
      issues.push({
        id: `quantity-${line.index}`,
        kind: "unquantified",
        severity: "suggestion",
        start: bullet.start,
        end: bullet.end,
        message:
          "Could you add a truthful measure of scope or impact? Keep this qualitative if no reliable number exists.",
        bulletId: bullet.id,
      });
  }
  const missing = Object.entries(sections)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  const weakCount = new Set(
    issues
      .filter((issue) => issue.kind === "weak-verb")
      .map((issue) => issue.bulletId),
  ).size;
  const unquantified = issues.filter(
    (issue) => issue.kind === "unquantified",
  ).length;
  const actionBullets = bullets.filter((bullet) =>
    actionPattern.test(bullet.text),
  ).length;
  const categories: ScoreCategory[] = [
    {
      id: "sections",
      label: "Essential sections",
      score: Math.round(((4 - missing.length) / 4) * 30),
      max: 30,
      detail: missing.length
        ? `Could not identify: ${missing.join(", ")}. Contact checks for email and phone.`
        : "Experience, education, skills, email and phone found.",
    },
    {
      id: "length",
      label: "Length & focus",
      score:
        wordCount >= 250 && wordCount <= 900
          ? 15
          : wordCount >= 150 && wordCount <= 1200
            ? 10
            : wordCount >= 50
              ? 5
              : 0,
      max: 15,
      detail: `${wordCount} words. A 250–900 word CV is the default guideline; suitable length varies by career and role.`,
    },
    {
      id: "language",
      label: "Action language",
      score: bullets.length
        ? Math.max(0, Math.round(20 * (1 - weakCount / bullets.length)))
        : 0,
      max: 20,
      detail: bullets.length
        ? `${weakCount} of ${bullets.length} achievement lines use vague wording.`
        : "No clear achievement lines were detected.",
    },
    {
      id: "impact",
      label: "Evidence of impact",
      score: actionBullets
        ? Math.round(25 * (1 - unquantified / actionBullets))
        : 0,
      max: 25,
      detail: `${actionBullets - unquantified} of ${actionBullets} action lines include a nearby measure. Never invent numbers to improve this score.`,
    },
    {
      id: "format",
      label: "Readable format",
      score: parsed.imageOnly
        ? 0
        : parsed.hasTables
          ? 5
          : parsed.hasTables === null
            ? 8
            : 10,
      max: 10,
      detail: parsed.imageOnly
        ? "Insufficient readable text; a scan may need OCR."
        : parsed.hasTables
          ? "Word tables detected. A single-column layout may extract more reliably."
          : parsed.hasTables === null
            ? "Readable text found. PDF tables and reading order remain unverified."
            : "Readable text found and no Word tables detected.",
    },
  ];
  return {
    score: categories.reduce((sum, category) => sum + category.score, 0),
    wordCount,
    categories,
    issues,
    bullets,
    sections,
    notes: [
      ...parsed.warnings,
      "This is a transparent writing and extraction check, not an employer's ATS score or a hiring prediction.",
    ],
  };
}
