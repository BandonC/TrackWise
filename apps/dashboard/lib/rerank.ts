import "server-only";

// Voyage rerank-2.5 wrapper. Used by the application detail page
// to turn a top-K of cosine-similar resume chunks into a single
// best chunk under a cross-encoder model -- more accurate than
// max-pool over independent embeddings because the model attends
// across query and document together.
//
// See https://docs.voyageai.com/docs/reranker.
//
// Server-only by import attribute. The VOYAGE_API_KEY is server
// secret and must never reach the browser bundle.

const VOYAGE_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_MODEL = "rerank-2.5";

const REQUEST_TIMEOUT_MS = 8000;

export type RerankCandidate = {
  section_label: string;
  section_text: string;
};

export type RerankWinner = {
  section_label: string;
  relevance_score: number;
};

// Returns the highest-scoring candidate under rerank-2.5, or null
// if the candidate list is empty or the upstream call fails. The
// caller is expected to fall back to the candidates' raw cosine
// score when null is returned.
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankWinner | null> {
  if (candidates.length === 0) return null;

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.error("rerank: VOYAGE_API_KEY missing");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        documents: candidates.map((c) => c.section_text),
        model: VOYAGE_MODEL,
        top_k: 1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("rerank: voyage error", res.status, detail);
      return null;
    }

    // Read body as text first so we can log the raw payload if the
    // shape is wrong. Voyage occasionally returns 200 with an error
    // envelope rather than a `results` array; logging the raw body
    // is the only way to tell.
    const raw = await res.text();
    let json: {
      data?: Array<{ index?: number; relevance_score?: number }>;
    };
    try {
      json = JSON.parse(raw);
    } catch {
      console.error("rerank: voyage returned non-JSON body", raw.slice(0, 500));
      return null;
    }

    // Voyage's rerank response wraps results under `data`, not
    // `results` (their published docs page is misleading on this).
    const top = json.data?.[0];
    if (
      !top ||
      typeof top.index !== "number" ||
      top.index < 0 ||
      top.index >= candidates.length ||
      typeof top.relevance_score !== "number"
    ) {
      console.error(
        "rerank: voyage 2xx without usable results",
        raw.slice(0, 500),
      );
      return null;
    }

    return {
      section_label: candidates[top.index].section_label,
      relevance_score: top.relevance_score,
    };
  } catch (err) {
    console.error("rerank: request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
