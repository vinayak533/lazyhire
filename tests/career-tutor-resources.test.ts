import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../lib/db/connection";
import { saveCareerBrief } from "../lib/career/store";
import { seedEntries, expansionRows, sources } from "../knowledge/career/seed";
import { topicsFor, videoById, videoRegistry, videosForSubject, videosVerifiedAt } from "../knowledge/career/videos";
import { importKnowledge } from "../lib/career-tutor/knowledge";
import { retrieve, intent } from "../lib/career-tutor/retrieval";
import { answerQuestion } from "../lib/career-tutor/service";
import { youtubeResource, youtubeResources } from "../lib/career-tutor/evidence";
import { groupResources, resourceKinds, type TutorTurn } from "../lib/career-tutor/types";

function setup() {
  const {db, sqlite} = openDatabase(":memory:");
  migrate(db, {migrationsFolder: "./drizzle"});
  importKnowledge(db, seedEntries);
  return {db, sqlite};
}
/** No provider keys and no network: every answer must come from the corpus or the registry. */
function offline<T>(work: () => Promise<T>) {
  const names = ["DEEPSEEK_API_KEY", "DEEPSEEK_V4_FLASH_API_KEY", "DEEPSEEK_KEY", "GROQ_API_KEY", "AI_API_KEY", "AI_PROVIDER", "SERPAPI_KEY"] as const;
  const saved = names.map(name => [name, process.env[name]] as const);
  names.forEach(name => { delete process.env[name]; });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  return work().finally(() => { globalThis.fetch = original; saved.forEach(([name, value]) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; }); });
}
const turn = (question: string, text: string, entryIds: string[]): TutorTurn => ({id: crypto.randomUUID(), question, createdAt: new Date().toISOString(), feedback: null, answer: {text, origin: "knowledge_base", sources: [], entryIds, confidence: 0.9, personalized: false}});

test("the video registry is consistent and every attached video is registered", () => {
  const ids = videoRegistry.map(video => video.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate video ids");
  for (const video of videoRegistry) {
    assert.match(video.id, /^[A-Za-z0-9_-]{11}$/, video.id);
    assert.ok(video.title.length > 5 && video.channel.length > 1 && video.topics.length > 0 && video.description.length > 20, video.id);
  }
  for (const entry of seedEntries) {
    for (const source of entry.youtube_resources) {
      assert.equal(source.kind, "youtube");
      const id = source.id.replace(/^youtube-/, "");
      assert.ok(videoById(id), `${entry.id} references unregistered video ${id}`);
      assert.equal(source.url, `https://www.youtube.com/watch?v=${id}`);
      assert.equal(source.verifiedAt, videosVerifiedAt);
    }
  }
  // Expansion resources carry a kind and a provider, and every kind is a known one.
  for (const source of Object.values(sources)) assert.ok(resourceKinds.includes(source.kind), source.id);
  const expansionIds = new Set(expansionRows.map(row => row[0]));
  for (const entry of seedEntries.filter(item => expansionIds.has(item.id))) {
    assert.ok(entry.sources.length > 0, `${entry.id} has no resources`);
    for (const source of entry.sources) assert.ok(source.provider, `${source.id} lacks a provider`);
  }
});

test("videos are matched to the subject of the question, never reused across unrelated careers", () => {
  const python = videosForSubject("python backend developer roadmap").map(video => video.id);
  assert.ok(python.includes("jBzwzrDvZ18"), "python backend course expected");
  assert.ok(python.every(id => videoById(id)!.topics.some(topic => /python|backend/.test(topic))));
  const accountant = videosForSubject("How do I become an accountant?").map(video => video.id);
  assert.ok(accountant.length > 0 && accountant.every(id => videoById(id)!.topics.includes("accounting")));
  assert.ok(!accountant.includes("uD8DfbJrqRI") && !accountant.includes("ua-CiDNNj30"), "no data-science video for accounting");
  const dataScience = videosForSubject("data scientist").map(video => video.id);
  assert.ok(dataScience.every(id => videoById(id)!.topics.includes("data-science")));
  // Specific signals outrank generic ones: marketing beats machine learning here.
  const marketing = videosForSubject("digital marketing with AI tools");
  assert.ok(marketing[0].topics.includes("digital-marketing"), marketing[0].id);
  assert.deepEqual(videosForSubject("orchestral audition preparation"), []);
  assert.deepEqual(videosForSubject("How do I ask my manager for feedback?"), []);
  assert.deepEqual(topicsFor("Should I learn Go or Rust?"), []);
});

test("youtube resources are re-verified live, dropped when YouTube says gone, and fall back to the registry offline", async () => {
  const live = async () => new Response(JSON.stringify({title: "Live title", author_name: "Live channel", thumbnail_url: "https://i.ytimg.com/vi/rfscVS0vtbw/hqdefault.jpg"}), {headers: {"Content-Type": "application/json"}});
  const verified = await youtubeResource("rfscVS0vtbw", live);
  assert.equal(verified?.title, "Live title"); assert.equal(verified?.channel, "Live channel"); assert.equal(verified?.kind, "youtube");
  assert.equal(verified?.thumbnail, "/api/career-tutor/thumbnail?id=rfscVS0vtbw");
  const gone = await youtubeResource("8DvywoWv6fI", async () => new Response(null, {status: 404}));
  assert.equal(gone, null);
  const fallback = await youtubeResource("grEKMHGYyns", async () => { throw new Error("offline"); });
  assert.equal(fallback?.title, videoById("grEKMHGYyns")!.title);
  assert.equal(fallback?.verifiedAt, videosVerifiedAt);
  assert.equal(await youtubeResource("not-a-registered-id", async () => { throw new Error("must not fetch"); }), null);
  const many = await youtubeResources(["rfscVS0vtbw", "rfscVS0vtbw", "nope"], live);
  assert.equal(many.length, 1);
});

test("answers carry grouped resources: videos, official bodies and learning material", async () => {
  const {db, sqlite} = setup();
  try {
    await offline(async () => {
      const answer = await answerQuestion(db, "alice", "Give me a Python backend developer roadmap", {useProfile: false}, []);
      assert.equal(answer.origin, "knowledge_base");
      assert.deepEqual(answer.entryIds, ["python-backend-roadmap"]);
      // An exact authored phrasing keeps its reviewed answer verbatim.
      assert.match(answer.text, /Phase 1: language fluency/);
      assert.ok(answer.youtube_resources!.some(source => source.id === "youtube-jBzwzrDvZ18"));
      assert.ok(answer.youtube_resources!.every(source => source.kind === "youtube" && source.channel && source.thumbnail));
      assert.ok(answer.official_resources!.some(source => source.id === "fastapi-docs"));
      assert.ok(answer.learning_resources!.some(source => source.kind === "github"));
      // sources stays the flat union, in citation order, for older clients.
      assert.equal(answer.sources.length, answer.youtube_resources!.length + answer.official_resources!.length + answer.learning_resources!.length);
      const groups = groupResources(answer.sources);
      assert.deepEqual(groups.youtube_resources.map(s => s.id), answer.youtube_resources!.map(s => s.id));
    });
  } finally { sqlite.close(); }
});

test("career context never leaks: a data science roadmap followed by an accountant question answers accounting", async () => {
  const {db, sqlite} = setup();
  try {
    saveCareerBrief(db, "alice", {role: "Data Science", skills: ["Python", "Pandas"], experienceLevel: "entry", cities: ["kochi"], workMode: "any", salaryPreference: "", sources: ["technopark"], rankingGoal: "best-fit", cvUploadId: null});
    await offline(async () => {
      const first = await answerQuestion(db, "alice", "Give me a Data Scientist roadmap.", {useProfile: true}, []);
      assert.deepEqual(first.entryIds, ["data-science-roadmap"]);
      assert.ok(first.youtube_resources!.every(source => videoById(source.id.replace(/^youtube-/, ""))!.topics.includes("data-science")));
      const history = [turn(first.text ? "Give me a Data Scientist roadmap." : "", first.text, first.entryIds)];
      for (const question of ["How do I become an Accountant?", "How do I become an accountant?", "Give me an accountant roadmap"]) {
        const second = await answerQuestion(db, "alice", question, {useProfile: true}, history);
        assert.deepEqual(second.entryIds, ["accountant-roadmap"], question);
        assert.match(second.text, /bookkeeping|accounting equation/i);
        assert.doesNotMatch(second.text, /data scien|pandas|machine learning/i);
        assert.ok(second.youtube_resources!.length > 0 && second.youtube_resources!.every(source => videoById(source.id.replace(/^youtube-/, ""))!.topics.includes("accounting")), question);
        assert.ok(second.official_resources!.some(source => source.id === "icai"));
        assert.ok(!second.sources.some(source => source.id === "youtube-uD8DfbJrqRI"));
      }
      // The reverse order holds too, and a role-free follow-up may lean on the saved profile but says so.
      const back = await answerQuestion(db, "alice", "How can I become a Data Scientist?", {useProfile: true}, history);
      assert.deepEqual(back.entryIds, ["data-science-roadmap"]);
      // A different named role with no corpus entry still never inherits the profile role.
      const other = await answerQuestion(db, "alice", "How do I become a marine biologist?", {useProfile: true}, history);
      assert.match(other.text, /Target: marine biologist\./);
      assert.doesNotMatch(other.text, /data scien/i);
      assert.deepEqual(other.youtube_resources, []);
    });
  } finally { sqlite.close(); }
});

test("comparison questions are answered by authored comparison entries and other roles resolve to their own roadmaps", async () => {
  const {db, sqlite} = setup();
  try {
    await offline(async () => {
      assert.equal(intent("Should I learn Python or Java for backend development?"), "comparison");
      const comparison = await answerQuestion(db, "alice", "Should I learn Python or Java for backend development?", {useProfile: false}, []);
      assert.equal(comparison.origin, "knowledge_base"); assert.deepEqual(comparison.entryIds, ["python-vs-java-backend"]);
      assert.match(comparison.text, /Spring Boot/); assert.match(comparison.text, /FastAPI/);
      for (const [question, expected] of [
        ["How do I become a Java developer?", "java-developer-roadmap"],
        ["How do I become a full stack developer?", "fullstack-developer-roadmap"],
        ["How do I become an AI engineer?", "ai-engineer-roadmap"],
        ["How do I become a SOC analyst?", "soc-analyst-roadmap"],
        ["How do I become a financial analyst?", "financial-analyst-roadmap"],
        ["How do I become a UI designer?", "ui-designer-roadmap"],
        ["How do I become an SEO specialist?", "seo-specialist-roadmap"],
        ["How do I become a React developer?", "react-developer-roadmap"],
        ["How do I become a digital marketer?", "marketing-entry"],
      ] as const) {
        const answer = await answerQuestion(db, "alice", question, {useProfile: false}, []);
        assert.deepEqual(answer.entryIds, [expected], question);
        assert.equal(answer.origin, "knowledge_base", question);
      }
      // A comparison paraphrase that is not an exact alias needs the semantic gate; offline it must not guess.
      const paraphrase = await retrieve(db, "Python or Java: which should I pick for server-side work?", async () => { throw new Error("no embeddings"); });
      assert.equal(paraphrase.accepted, null);
    });
  } finally { sqlite.close(); }
});

test("resource answers point at verified catalogue entries with titles, providers, URLs, descriptions and types", async () => {
  const {db, sqlite} = setup();
  try {
    await offline(async () => {
      const answer = await answerQuestion(db, "alice", "What are the best free resources to learn Python?", {useProfile: false}, []);
      assert.deepEqual(answer.entryIds, ["free-python-resources"]);
      assert.ok(answer.sources.length >= 6);
      for (const source of answer.sources) {
        assert.ok(source.title && source.url.startsWith("https://") && source.description && source.kind, source.id);
        assert.ok(source.provider || source.channel, source.id);
      }
      assert.ok(answer.learning_resources!.some(source => source.kind === "github"));
      assert.ok(answer.official_resources!.some(source => source.id === "python-tutorial"));
    });
  } finally { sqlite.close(); }
});
