import { withTimeout } from "@/lib/sources/shared";

export class CircuitBreaker {
  failures = 0;
  openUntil = 0;
  private probing = false;
  constructor(private now: () => number = Date.now) {}
  enter(): boolean {
    if (this.openUntil > this.now() || this.probing) return false;
    if (this.failures >= 3) this.probing = true;
    return true;
  }
  success() {
    this.failures = 0;
    this.openUntil = 0;
    this.probing = false;
  }
  failure() {
    this.probing = false;
    this.failures++;
    if (this.failures >= 3) this.openUntil = this.now() + 60_000;
  }
}
const globalAi = globalThis as unknown as { orvioCircuit?: CircuitBreaker };
export const circuit = (globalAi.orvioCircuit ??= new CircuitBreaker());
export class AiUnavailableError extends Error {
  /** How long the provider asked us to wait, when it said so. */
  retryAfterMs?: number;
}

const RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 12_000;

/**
 * Reads a provider's own back-off request so a retry does not repeat the 429.
 * Groq puts the wait in the error body ("Please try again in 9.855s") rather
 * than a Retry-After header, so both are consulted.
 */
async function retryAfterMs(response: Response) {
  const header = response.headers.get("retry-after");
  let seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds <= 0) {
    seconds = NaN;
    if (response.status === 429) {
      try {
        const match = (await response.text()).match(
          /try again in\s*(?:(\d+)m)?\s*([\d.]+)\s*s/i,
        );
        if (match) seconds = Number(match[1] ?? 0) * 60 + Number(match[2]);
      } catch {
        /* An unreadable body is treated as no hint. */
      }
    }
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
}

export const AI_UNAVAILABLE_MESSAGE =
  "AI suggestions temporarily unavailable — here's your instant score.";

type ChatBody = Record<string, unknown> & {
  messages?: Array<{ role: string; content: string }>;
  response_format?: {
    type?: string;
    json_schema?: { schema?: unknown };
  };
};

interface AiProvider {
  id: "deepseek" | "groq";
  label: string;
  endpoint: string;
  key: string;
  defaults: Record<string, unknown>;
}

function configuredKey(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function configuredProviders(): AiProvider[] {
  const deepseekKey = configuredKey([
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_V4_FLASH_API_KEY",
    "DEEPSEEK_KEY",
    ...(process.env.AI_PROVIDER?.toLowerCase() === "deepseek"
      ? ["AI_API_KEY"]
      : []),
  ]);
  const groqKey = configuredKey([
    "GROQ_API_KEY",
    ...(process.env.AI_PROVIDER?.toLowerCase() === "groq"
      ? ["AI_API_KEY"]
      : []),
  ]);
  const providers: AiProvider[] = [];
  if (deepseekKey) {
    const baseUrl = normalizeBaseUrl(
      process.env.DEEPSEEK_BASE_URL?.trim() ||
        process.env.DEEPSEEK_API_BASE_URL?.trim() ||
        "https://api.deepseek.com",
    );
    providers.push({
      id: "deepseek",
      label: "DeepSeek V4 Flash",
      endpoint: `${baseUrl}/chat/completions`,
      key: deepseekKey,
      defaults: {
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        max_tokens: 6000,
        temperature: 0.2,
      },
    });
  }
  if (groqKey) {
    providers.push({
      id: "groq",
      label: "Groq GPT-OSS 120B",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      key: groqKey,
      defaults: {
        model: "openai/gpt-oss-120b",
        reasoning_effort: "medium",
        max_completion_tokens: 6000,
      },
    });
  }
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (requested === "groq")
    return [
      ...providers.filter((item) => item.id === "groq"),
      ...providers.filter((item) => item.id !== "groq"),
    ];
  return providers;
}

export function hasAiProvider() {
  return configuredProviders().length > 0;
}

export function aiProviderLabel() {
  return configuredProviders()[0]?.label ?? "configured AI provider";
}

function providerBody(body: ChatBody, provider: AiProvider) {
  if (
    provider.id !== "deepseek" ||
    body.response_format?.type !== "json_schema"
  )
    return { ...provider.defaults, ...body };

  const schema = body.response_format.json_schema?.schema;
  return {
    ...provider.defaults,
    ...body,
    response_format: { type: "json_object" },
    messages: body.messages?.map((message, index) =>
      index === 0 && message.role === "system"
        ? {
            ...message,
            content: `${message.content}\nReturn valid JSON matching this schema: ${JSON.stringify(schema)}`,
          }
        : message,
    ),
  };
}

export async function aiJson(
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; attemptsPerProvider?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const providers = configuredProviders();
  if (!providers.length) throw new AiUnavailableError(AI_UNAVAILABLE_MESSAGE);
  let lastError: unknown;
  const attempts = providers.flatMap((provider) => Array.from({length: options.attemptsPerProvider ?? 2}, () => provider));
  let delayMs = 0;
  for (let index = 0; index < attempts.length; index++) {
    options.signal?.throwIfAborted();
    const provider = attempts[index];
    if (index > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs || RETRY_DELAY_MS),
      );
    delayMs = 0;
    try {
      return await withTimeout(async (signal) => {
        const response = await fetcher(provider.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(providerBody(body as ChatBody, provider)),
          signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
        });
        if (!response.ok) {
          const wait = await retryAfterMs(response);
          await response.body?.cancel().catch(() => undefined);
          const failure = new AiUnavailableError(
            `AI request failed (HTTP ${response.status}).`,
          );
          failure.retryAfterMs = wait;
          throw failure;
        }
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (
          typeof content !== "string" ||
          payload?.choices?.[0]?.finish_reason === "length"
        )
          throw new AiUnavailableError("Incomplete AI response.");
        try {
          return JSON.parse(content);
        } catch {
          throw new AiUnavailableError("Unreadable AI response.");
        }
      }, options.timeoutMs ?? 20_000);
    } catch (error) {
      lastError = error;
      if (error instanceof AiUnavailableError && error.retryAfterMs)
        delayMs = error.retryAfterMs;
    }
  }
  throw new AiUnavailableError(
    lastError instanceof AiUnavailableError
      ? lastError.message
      : AI_UNAVAILABLE_MESSAGE,
  );
}

export async function groqJson(
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const previous = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "groq";
  try {
    return await aiJson(body, fetcher);
  } finally {
    if (previous === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previous;
  }
}
