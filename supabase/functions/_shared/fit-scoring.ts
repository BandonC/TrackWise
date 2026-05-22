// Shared fit-scoring module (PR-C3). Imported by both the
// `score-resume-fit` Edge Function (dashboard detail page) and
// `score-external-job` (Chrome extension overlay) so the
// scoring algorithm and fallback chain live in exactly one
// place.
//
// Fallback chain: Claude Haiku 4.5 -> Voyage rerank-2.5 -> raw
// cosine. Each tier degrades gracefully; the caller always
// gets a usable score and can identify which tier produced it
// via the `source` field for telemetry.
//
// The `_` prefix on the directory name keeps the Supabase CLI
// from treating this as a deployable function.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_TIMEOUT_MS = 12000;

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_RERANK_MODEL = "rerank-2.5";
const RERANK_TIMEOUT_MS = 8000;

// Cap each candidate's section_text before sending to the LLM.
// Resume chunks are typically a few hundred chars; 2000 is a
// generous ceiling that also bounds prompt-injection surface
// from pathological inputs.
const MAX_SECTION_CHARS = 2000;

export type FitCandidate = {
  section_label: string;
  section_text: string;
  similarity: number; // raw cosine, used only by the cosine fallback
};

export type FitResult = {
  similarity: number; // 0..1
  section_label: string;
  reasoning: string | null; // populated only by the LLM tier
  source: "llm" | "rerank" | "cosine";
};

export type ScoreFitParams = {
  query: string;
  candidates: FitCandidate[];
  anthropicKey: string | undefined;
  voyageKey: string | undefined;
};

export async function scoreFit(
  params: ScoreFitParams,
): Promise<FitResult | null> {
  if (params.candidates.length === 0) return null;

  // Tier 1: Claude Haiku with tool-use for structured output.
  if (params.anthropicKey) {
    const llm = await scoreWithHaiku(
      params.anthropicKey,
      params.query,
      params.candidates,
    );
    if (llm) return llm;
  }

  // Tier 2: Voyage rerank-2.5 cross-encoder.
  if (params.voyageKey) {
    const reranked = await scoreWithRerank(
      params.voyageKey,
      params.query,
      params.candidates,
    );
    if (reranked) return reranked;
  }

  // Tier 3: raw cosine -- the candidate list is already sorted
  // by similarity desc from the RPC, so candidates[0] is the
  // highest. Always renders something.
  const top = params.candidates[0];
  return {
    similarity: top.similarity,
    section_label: top.section_label,
    reasoning: null,
    source: "cosine",
  };
}

// ----------------------------------------------------------------
// Tier 1: Claude Haiku
// ----------------------------------------------------------------

const FIT_SYSTEM_PROMPT = `You score how well a candidate's resume fits a specific job, using the strongest matching resume section as evidence. Return your answer via the report_fit tool.

Scoring anchors (0-100):
  0-30: unrelated. Resume sections don't support the role's likely requirements.
  30-60: some overlap. Adjacent skills or transferable experience, but not a direct match.
  60-85: strong fit. Resume sections substantively match what the role likely needs.
  85-100: ideal fit. Resume directly demonstrates the role's core requirements.

Reason about the role from its title even if the job description is sparse. "Backend Engineer at Stripe" likely requires distributed systems and a typed language; "AI Engineer" likely requires ML, Python, model training. Score against what the role probably wants, not just keyword overlap.

Reasoning must be one sentence under 200 characters explaining the score.`;

type HaikuToolInput = {
  score?: unknown;
  best_section_index?: unknown;
  reasoning?: unknown;
};

async function scoreWithHaiku(
  apiKey: string,
  query: string,
  candidates: FitCandidate[],
): Promise<FitResult | null> {
  const sections = candidates
    .map(
      (c, i) =>
        `[${i + 1}] ${c.section_label}\n${c.section_text.slice(0, MAX_SECTION_CHARS)}`,
    )
    .join("\n\n");

  const userMessage = `Job: ${query}\n\nCandidate resume sections:\n\n${sections}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        // Analytical scoring task with tool-enforced structured output —
        // sampling noise just makes the same resume/job render different
        // numbers across reloads. Anthropic recommends temp 0 for this
        // shape of task.
        temperature: 0,
        system: FIT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
            name: "report_fit",
            description:
              "Report the overall resume-to-job fit score, which section was the strongest evidence, and a one-sentence reason.",
            input_schema: {
              type: "object",
              properties: {
                score: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Overall fit score, 0-100.",
                },
                best_section_index: {
                  type: "integer",
                  minimum: 1,
                  maximum: candidates.length,
                  description:
                    "1-indexed index of the resume section that best supports the score.",
                },
                reasoning: {
                  type: "string",
                  maxLength: 200,
                  description:
                    "One sentence (<=200 chars) explaining the score.",
                },
              },
              required: ["score", "best_section_index", "reasoning"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "report_fit" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("scoreWithHaiku: anthropic error", res.status, detail);
      return null;
    }

    const body = (await res.json()) as {
      content?: Array<{ type?: string; name?: string; input?: HaikuToolInput }>;
    };

    const toolUse = body.content?.find(
      (b) => b.type === "tool_use" && b.name === "report_fit",
    );
    const input = toolUse?.input;
    if (
      !input ||
      typeof input.score !== "number" ||
      typeof input.best_section_index !== "number" ||
      typeof input.reasoning !== "string"
    ) {
      console.error("scoreWithHaiku: missing/invalid tool_use", body);
      return null;
    }

    const idx = input.best_section_index - 1;
    if (idx < 0 || idx >= candidates.length) {
      console.error("scoreWithHaiku: best_section_index out of range", idx);
      return null;
    }

    const score = Math.max(0, Math.min(100, input.score));
    return {
      similarity: score / 100,
      section_label: candidates[idx].section_label,
      reasoning: input.reasoning.slice(0, 200),
      source: "llm",
    };
  } catch (err) {
    console.error("scoreWithHaiku: request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ----------------------------------------------------------------
// Tier 2: Voyage rerank-2.5
// ----------------------------------------------------------------

async function scoreWithRerank(
  voyageKey: string,
  query: string,
  candidates: FitCandidate[],
): Promise<FitResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);

  try {
    const res = await fetch(VOYAGE_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        documents: candidates.map((c) => c.section_text),
        model: VOYAGE_RERANK_MODEL,
        top_k: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("scoreWithRerank: voyage error", res.status, detail);
      return null;
    }
    // Voyage rerank wraps results under `data`, not `results`.
    const body = (await res.json()) as {
      data?: Array<{ index?: number; relevance_score?: number }>;
    };
    const top = body.data?.[0];
    if (
      !top ||
      typeof top.index !== "number" ||
      top.index < 0 ||
      top.index >= candidates.length ||
      typeof top.relevance_score !== "number"
    ) {
      console.error("scoreWithRerank: unexpected shape", body);
      return null;
    }
    return {
      similarity: top.relevance_score,
      section_label: candidates[top.index].section_label,
      reasoning: null,
      source: "rerank",
    };
  } catch (err) {
    console.error("scoreWithRerank: request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
