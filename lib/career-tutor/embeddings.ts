import "server-only";
import { resolve } from "node:path";

export const embeddingModel = "Xenova/all-MiniLM-L6-v2";
let extractor: Promise<(text: string) => Promise<number[]>> | undefined;

// Download once with kb:embed. Requests never download models or transmit questions.
export async function embed(text: string): Promise<number[]> {
  extractor ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = resolve(/* turbopackIgnore: true */ process.env.TUTOR_MODEL_CACHE ?? "./data/models");
    env.allowRemoteModels = process.env.TUTOR_DOWNLOAD_MODELS === "1";
    const pipe = await pipeline("feature-extraction", embeddingModel, {
      dtype: "q8", device: "cpu", local_files_only: !env.allowRemoteModels,
    });
    return async (input: string) => {
      const output = await pipe(input, {pooling: "mean", normalize: true});
      return Array.from(output.data as Float32Array);
    };
  })();
  try { return await (await extractor)(text.slice(0, 4000)); }
  catch (error) { extractor = undefined; throw error; }
}

export function cosine(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) return 0;
  let dot = 0, a = 0, b = 0;
  for (let i = 0; i < left.length; i++) { dot += left[i] * right[i]; a += left[i] ** 2; b += right[i] ** 2; }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}
