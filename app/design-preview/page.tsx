import type { Metadata } from "next";
import { DesignPreview } from "@/components/design-preview";

export const metadata: Metadata = { title: "Design system" };

export default function DesignPreviewPage() {
  return <DesignPreview />;
}
