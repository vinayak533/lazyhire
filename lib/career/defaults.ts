import type { CareerBrief } from "./types";
import { sourceIds } from "@/lib/jobs/types";

export function emptyCareerBrief(): CareerBrief {
  return {
    role: "",
    skills: [],
    experienceLevel: "mid",
    cities: ["kerala"],
    workMode: "any",
    salaryPreference: "",
    sources: [...sourceIds],
    rankingGoal: "best-fit",
    cvUploadId: null,
  };
}
