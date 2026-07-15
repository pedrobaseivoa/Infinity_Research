import { MAX_RETRIES, RETRY_DELAYS_MS } from './models';

interface OpenRouterOptions {
  model: string;
  prompt: string;
  apiKey: string;
  pdfBase64?: string;
  responseSchema?: { name: string; strict: boolean; schema: object };
  maxTokens?: number;
}

interface OpenRouterResult {
  content: string;
  parsed: Record<string, unknown> | null;
  model: string;
  generationId: string | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
    reported_cost: number;
    calculated_cost: number;
  };
  timestamp: string;
}

/** Per-million-token USD pricing (input, output) for manual cost calculation. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'meta-llama/llama-4-maverick': { input: 0.15, output: 0.6 },
  'google/gemini-3-flash-preview': { input: 0.5, output: 3 },
  'anthropic/claude-haiku-4.5': { input: 1, output: 5 },
  'openai/gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'x-ai/grok-4.3': { input: 0.2, output: 0.5 },
  'google/gemini-3.1-pro-preview': { input: 2, output: 12 },
  'deepseek/deepseek-v3.2': { input: 0.25, output: 0.4 },
};

function calculateManualCost(model: string, promptTokens: number, completionTokens: number): number {
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  const key = keys.find(k => model.startsWith(k));
  const pricing = key ? MODEL_PRICING[key] : null;
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchGenerationCost(generationId: string, apiKey: string): Promise<{
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
}> {
  await sleep(2000);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (data.data) {
        return {
          totalCost: data.data.cost ?? data.data.total_cost ?? 0,
          promptTokens: data.data.native_tokens_prompt ?? 0,
          completionTokens: data.data.native_tokens_completion ?? 0,
        };
      }
    } catch { /* retry */ }
    if (attempt === 0) await sleep(1000);
  }

  return { totalCost: 0, promptTokens: 0, completionTokens: 0 };
}

function isPdfParseError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('failed to parse document') || msg.includes('file-parser') || msg.includes('invalid input');
}

function buildRequestBody(
  model: string,
  content: Array<Record<string, unknown>>,
  hasPdf: boolean,
  pdfEngine: 'cloudflare-ai' | 'mistral-ocr' | 'native',
  responseSchema?: { name: string; strict: boolean; schema: object },
  maxTokens = 16000,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  };

  if (hasPdf) {
    body.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
  }

  if (responseSchema) {
    const schema = { ...responseSchema };
    if (model.startsWith('openai/')) {
      schema.strict = false;
    }
    body.response_format = { type: 'json_schema', json_schema: schema };
  }

  return body;
}

async function executeOpenRouterRequest(
  body: Record<string, unknown>,
  apiKey: string,
  model: string,
): Promise<OpenRouterResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://theinfinityresearch.vercel.app',
      'X-Title': 'Infinity Research',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'OpenRouter API error');
  }

  const rawContent = data.choices?.[0]?.message?.content || '';
  const finishReason = data.choices?.[0]?.finish_reason;
  const generationId = data.id || null;
  const actualModel = data.model || model;

  if (finishReason === 'length') {
    const tokens = data.usage?.completion_tokens ?? '?';
    throw new Error(`Output truncated (finish_reason=length, ${tokens} tokens). Model ${actualModel} hit output limit.`);
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    parsed = parseJsonFallback(rawContent);
  }

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  let reportedCost = typeof data.usage?.cost === 'number' ? data.usage.cost : 0;

  if (reportedCost === 0 && generationId) {
    const genCost = await fetchGenerationCost(generationId, apiKey);
    reportedCost = genCost.totalCost;
  }

  const calculatedCost = calculateManualCost(actualModel, promptTokens, completionTokens);
  const totalCost = reportedCost > 0 ? reportedCost : calculatedCost;

  console.log(
    `OpenRouter ${actualModel}: reported=$${reportedCost.toFixed(4)} | calculated=$${calculatedCost.toFixed(4)} | tokens=${promptTokens}+${completionTokens}`
  );

  return {
    content: rawContent,
    parsed,
    model: actualModel,
    generationId,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_cost: totalCost,
      reported_cost: reportedCost,
      calculated_cost: calculatedCost,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function callOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResult> {
  const { model, prompt, apiKey, pdfBase64, responseSchema, maxTokens = 16000 } = options;

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];

  if (pdfBase64) {
    content.push({
      type: 'file',
      file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
    });
  }

  const hasPdf = !!pdfBase64;
  let pdfEngine: 'cloudflare-ai' | 'mistral-ocr' | 'native' = 'cloudflare-ai';
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const body = buildRequestBody(model, content, hasPdf, pdfEngine, responseSchema, maxTokens);
      return await executeOpenRouterRequest(body, apiKey, model);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`OpenRouter attempt ${attempt + 1}/${MAX_RETRIES} failed for ${model}:`, lastError.message);

      if (hasPdf && pdfEngine === 'cloudflare-ai' && isPdfParseError(lastError)) {
        pdfEngine = 'mistral-ocr';
        console.log(`PDF cloudflare-ai parsing failed, falling back to mistral-ocr engine for ${model}`);
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  throw lastError || new Error(`OpenRouter call failed after ${MAX_RETRIES} attempts`);
}

function parseJsonFallback(content: string): Record<string, unknown> | null {
  try {
    let cleaned = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) cleaned = match[1].trim();
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function fetchPdfAsBase64(pdfUrl: string): Promise<string> {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
