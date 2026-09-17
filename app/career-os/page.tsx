import type { Metadata } from "next";
import "@/app/career-tutor.css";
import { CareerOsWorkspace } from "@/components/career-os/career-os-workspace";

export const metadata: Metadata = { title: "Career OS" };

export default function CareerOsPage() {
  return <CareerOsWorkspace />;
}
