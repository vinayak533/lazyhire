import type { Metadata } from "next";
import { CvWorkspace } from "@/components/cv/cv-workspace";

export const metadata: Metadata = { title: "CV review" };
export default function CvPage() {
  return <CvWorkspace />;
}
