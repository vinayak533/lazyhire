export interface ParsedCv {
  text: string;
  format: "pdf" | "docx";
  pages: number | null;
  hasTables: boolean | null;
  imageOnly: boolean;
  warnings: string[];
}
export interface CvIssue {
  id: string;
  kind: "weak-verb" | "unquantified";
  severity: "suggestion" | "warning";
  start: number;
  end: number;
  message: string;
  bulletId: string;
}
export interface CvBullet {
  id: string;
  start: number;
  end: number;
  text: string;
}
export interface ScoreCategory {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}
export interface CvAnalysis {
  score: number;
  wordCount: number;
  categories: ScoreCategory[];
  issues: CvIssue[];
  bullets: CvBullet[];
  notes: string[];
  sections: Record<string, boolean>;
}
export interface CvResult {
  id: string;
  filename: string;
  parsed: ParsedCv;
  analysis: CvAnalysis;
}
