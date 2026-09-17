import "server-only";
import { load } from "cheerio";
import { sources } from "../../knowledge/career/seed";
import { videoById, videoSource } from "../../knowledge/career/videos";
import type { TutorSource } from "./types";

const allowedHosts = new Set(Object.values(sources).map(source => new URL(source.url).hostname));
// Live search discovery stays scoped to official documentation and public bodies;
// community sites are fine to cite from the catalogue but not to search across.
const discoveryHosts = new Set(Object.values(sources).filter(source => source.kind === "web" || source.kind === "official").map(source => new URL(source.url).hostname));
const sourceImages = new Map<string, {body: Buffer; type: string; expires: number}>();
export function allowedEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowedHosts.has(url.hostname);
  } catch { return false; }
}
function allowedImageUrl(value: string, sourceHost: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === sourceHost;
  } catch { return false; }
}
async function limitedText(response: Response, limit = 800_000) {
  if (!response.ok || !response.body) throw new Error("Resource unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("Resource too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export interface Evidence { source: TutorSource; passage: string; }

export async function fetchEvidence(source: TutorSource, fetcher: typeof fetch = fetch): Promise<Evidence | null> {
  let url = source.url;
  const signal = AbortSignal.timeout(4500);
  try {
    for (let redirects = 0; redirects < 3; redirects++) {
      if (!allowedEvidenceUrl(url)) return null;
      const response = await fetcher(url, {redirect: "manual", signal, cache: "no-store", headers: {Accept: "text/html"}});
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return null;
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) { await response.body?.cancel(); return null; }
      const $ = load(await limitedText(response));
      $("script,style,nav,footer,header,noscript,form").remove();
      const content = $("main").first().length ? $("main").first() : $("body");
      const passage = content.text().replace(/\s+/g, " ").trim().slice(0, 14_000);
      if (passage.length < 200 || /access denied|verify you are human|just a moment/i.test(passage.slice(0, 300))) return null;
      const title = $("title").text().replace(/\s+/g, " ").trim().slice(0, 240) || source.title;
      return {source: {...source, title, url, verifiedAt: new Date().toISOString()}, passage};
    }
  } catch { /* Unavailable pages do not become citations. */ }
  return null;
}

export async function discoverEvidence(topic: string, fetcher: typeof fetch = fetch): Promise<TutorSource[]> {
  if (!process.env.SERPAPI_KEY) return [];
  // topic is a public KB question, not a private user question or profile.
  const search = new URL("https://serpapi.com/search.json");
  search.searchParams.set("engine", "google");
  search.searchParams.set("q", `${topic.slice(0, 240)} (${[...discoveryHosts].slice(0, 25).map(host => `site:${host}`).join(" OR ")})`);
  search.searchParams.set("api_key", process.env.SERPAPI_KEY);
  search.searchParams.set("num", "5");
  try {
    const response = await fetcher(search, {signal: AbortSignal.timeout(3500), redirect: "error", cache: "no-store"});
    const payload = JSON.parse(await limitedText(response, 100_000));
    return (Array.isArray(payload.organic_results) ? payload.organic_results : []).flatMap((row: {link?: string; title?: string}, index: number) => {
      if (!row.link || !row.title || !allowedEvidenceUrl(row.link)) return [];
      return [{id: `discovered-${index}`, title: row.title.slice(0,240), url: row.link, kind: "web" as const, description: "Official resource discovered for this topic; see the linked passage for the claim's scope.", supports: "Only the passage explicitly cited in the answer.", verifiedAt: null}];
    }).slice(0, 2);
  } catch { return []; }
}

const videos = new Map<string, {value: TutorSource; image: string; expires: number}>();
const removedVideos = new Map<string, number>();
/**
 * A registry video, re-verified through YouTube's oEmbed endpoint. The live
 * title, channel and thumbnail replace the registry copy; a video YouTube no
 * longer serves (4xx) is dropped for an hour. Only a transport failure falls
 * back to the registry metadata, which was itself verified against oEmbed.
 */
export async function youtubeResource(id: string, fetcher: typeof fetch = fetch): Promise<TutorSource | null> {
  const registered = videoById(id);
  if (!registered) return null;
  const cached = videos.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;
  if ((removedVideos.get(id) ?? 0) > Date.now()) return null;
  const fallbackImage = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
    url.searchParams.set("format", "json");
    const response = await fetcher(url, {signal: AbortSignal.timeout(2500), redirect: "error", cache: "no-store"});
    if (response.status >= 400 && response.status < 500) { await response.body?.cancel(); removedVideos.set(id, Date.now() + 3600_000); return null; }
    const body = JSON.parse(await limitedText(response, 20_000));
    if (typeof body.title !== "string" || typeof body.author_name !== "string" || typeof body.thumbnail_url !== "string") return null;
    const image = new URL(body.thumbnail_url);
    if (image.protocol !== "https:" || image.hostname !== "i.ytimg.com" || image.port || image.username || image.password) return null;
    const value: TutorSource = {...videoSource(registered), title: body.title.slice(0,240), channel: body.author_name.slice(0,120), provider: body.author_name.slice(0,120), verifiedAt: new Date().toISOString()};
    videos.set(id, {value, image: image.href, expires: Date.now() + 3600_000});
    return value;
  } catch {
    // Offline or slow: the registry copy is still a verified video, just not re-checked now.
    const value = videoSource(registered);
    videos.set(id, {value, image: fallbackImage, expires: Date.now() + 300_000});
    return value;
  }
}
/** Resolve several registry videos concurrently, dropping any that fail verification. */
export async function youtubeResources(ids: string[], fetcher: typeof fetch = fetch): Promise<TutorSource[]> {
  const resolved = await Promise.all([...new Set(ids)].map(id => youtubeResource(id, fetcher)));
  return resolved.filter((item): item is TutorSource => Boolean(item));
}
export async function videoThumbnail(id: string) {
  if (!await youtubeResource(id)) return null;
  const cached = videos.get(id);
  if (!cached) return null;
  try {
    const response = await fetch(cached.image, {signal: AbortSignal.timeout(2500), redirect: "error"});
    if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); return null; }
    if (Number(response.headers.get("content-length") ?? 0) > 250_000) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > 250_000) { await reader.cancel(); return null; } chunks.push(value); }
    } finally { reader.releaseLock(); }
    return {body: Buffer.concat(chunks), type: response.headers.get("content-type")!};
  } catch { return null; }
}

async function limitedImage(response: Response) {
  if (!response.ok || !response.body) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpe?g|webp|gif|x-icon|vnd\.microsoft\.icon)$/i.test(type)) {
    await response.body.cancel();
    return null;
  }
  if (Number(response.headers.get("content-length") ?? 0) > 250_000) {
    await response.body.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 250_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return {body: Buffer.concat(chunks), type};
}

export async function sourcePreviewImage(sourceId: string, fetcher: typeof fetch = fetch) {
  const cached = sourceImages.get(sourceId);
  if (cached && cached.expires > Date.now()) return cached;
  const source = Object.values(sources).find(item => item.id === sourceId);
  if (!source || !allowedEvidenceUrl(source.url)) return null;
  const sourceUrl = new URL(source.url);
  const candidates = [new URL("/favicon.ico", sourceUrl).href];
  try {
    const response = await fetcher(source.url, {signal: AbortSignal.timeout(2500), redirect: "manual", cache: "no-store", headers: {Accept: "text/html"}});
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      const $ = load(await limitedText(response, 250_000));
      const discovered = [
        $("meta[property='og:image']").attr("content"),
        $("link[rel~='apple-touch-icon']").attr("href"),
        $("link[rel~='icon']").attr("href"),
      ].flatMap(value => value ? [new URL(value, sourceUrl).href] : []);
      candidates.unshift(...discovered);
    } else await response.body?.cancel();
  } catch { /* Fall back to the site favicon. */ }
  for (const candidate of [...new Set(candidates)]) {
    if (!allowedImageUrl(candidate, sourceUrl.hostname)) continue;
    try {
      const response = await fetcher(candidate, {signal: AbortSignal.timeout(2500), redirect: "error", cache: "no-store", headers: {Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/x-icon,*/*;q=0.5"}});
      const image = await limitedImage(response);
      if (!image) continue;
      const value = {...image, expires: Date.now() + 3600_000};
      sourceImages.set(sourceId, value);
      return value;
    } catch { /* Try the next source-owned image candidate. */ }
  }
  return null;
}
