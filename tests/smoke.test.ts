import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";
import { cvUploads } from "../lib/db/schema";
import { buildCareerOsSnapshot } from "../lib/career-os/engine";
import { saveCareerBrief, upsertApplication } from "../lib/career/store";
import { createJob } from "../lib/sources/shared";
import { encryptJson, encryptText } from "../lib/security/crypto";

test("Career OS smoke snapshot builds from private career data", () => {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  try {
    const userId = "career-os-user";
    const cvResult = {
      id: "cv-a",
      filename: "react-developer.pdf",
      parsed: {
        text: "React Developer with TypeScript, REST API, accessibility, and Playwright project experience.",
        format: "pdf" as const,
        pages: 1,
        hasTables: false,
        imageOnly: false,
        warnings: [],
      },
      analysis: {
        score: 78,
        wordCount: 11,
        categories: [],
        issues: [],
        bullets: [],
        notes: [],
        sections: {},
      },
    };
    db.insert(cvUploads)
      .values({
        id: cvResult.id,
        userId,
        filename: cvResult.filename,
        textCiphertext: encryptText(cvResult.parsed.text),
        resultJson: encryptJson(cvResult),
        fileSha256: "test",
        mimeType: "application/pdf",
        scanStatus: "passed",
        createdAt: new Date(),
      })
      .run();
    saveCareerBrief(db, userId, {
      role: "React Developer",
      skills: ["React", "TypeScript"],
      experienceLevel: "mid",
      cities: ["kochi"],
      workMode: "hybrid",
      salaryPreference: "12 LPA",
      sources: ["technopark", "indeed"],
      rankingGoal: "best-fit",
      cvUploadId: cvResult.id,
    });
    upsertApplication(db, userId, {
      status: "saved",
      job: createJob("technopark", {
        title: "Frontend Engineer",
        company: "Signal Studio",
        location: "Kochi, Kerala",
        applyUrl: "https://example.test/apply",
        description:
          "Build React TypeScript interfaces, integrate REST APIs, write Playwright tests, and use Docker.",
        skills: ["React", "TypeScript", "Playwright", "Docker"],
      }),
    });
    const snapshot = buildCareerOsSnapshot(db, userId);
    assert.equal(snapshot.twin.role, "React Developer");
    assert.ok(snapshot.metrics.length >= 4);
    assert.ok(snapshot.radar.length >= 4);
    assert.ok(snapshot.skills.gaps.some((gap) => gap.skill === "Docker"));
    assert.ok(snapshot.missionControl.nextActions[0].label.includes("Signal Studio"));
    assert.ok(snapshot.roadmap.length >= 3);
    assert.ok(snapshot.interviewLab.prompts.length >= 3);
    assert.ok(snapshot.portfolio.length >= 2);
    assert.equal(snapshot.compatibility[0].company, "Signal Studio");
  } finally {
    sqlite.close();
  }
});
