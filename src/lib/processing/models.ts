export const PIPELINE_CONFIG = {
  version: '6.0',
  phases: {
    1: {
      name: 'Metadata Extraction',
      model: 'openai/gpt-4o',
      requiresPdf: true,
      description: 'Vision-based extraction of bibliographic markers from PDF',
    },
    2: {
      name: 'API Enrichment',
      model: null,
      requiresPdf: false,
      apis: ['pubmed', 'openalex', 'crossref', 'semantic_scholar', 'europe_pmc', 'arxiv', 'datacite', 'unpaywall', 'doaj', 'orcid', 'core'] as const,
      description: 'Parallel queries to 11 scholarly APIs for provenance data',
    },
    3: {
      name: 'Consensus Validation',
      model: 'anthropic/claude-haiku-4.5',
      requiresPdf: false,
      description: 'Reconcile AI-extracted metadata with API data into Golden Record',
    },
    4: {
      name: 'Multi-Model Extraction',
      models: [
        'google/gemini-3-flash-preview',
        'deepseek/deepseek-v3.2',
        'openai/gpt-4.1-mini',
        'x-ai/grok-4.3',
      ] as const,
      requiresPdf: true,
      description: 'Parallel scientific extraction by 4 independent models',
    },
    5: {
      name: 'Visual Extraction',
      model: 'google/gemini-3.1-pro-preview',
      requiresPdf: true,
      conditional: true,
      description: 'Extract structured data from figures and tables',
    },
    6: {
      name: 'Scientific Consolidation',
      model: 'google/gemini-3-flash-preview',
      requiresPdf: false,
      description: 'Merge multi-model extractions into single consistent record',
    },
    7: {
      name: 'Final Merge',
      model: null,
      requiresPdf: false,
      description: 'Deterministic programmatic merge of all phase outputs',
    },
  },
} as const;

export type PhaseNumber = keyof typeof PIPELINE_CONFIG.phases;

export const COST_ESTIMATE_PER_ARTICLE = 0.20;

export const MAX_RETRIES = 3;
export const RETRY_DELAYS_MS = [2000, 4000, 8000];

// ==================== VALIDATION EXPERIMENT CONFIGS ====================

export interface PipelineOverride {
  name: string;
  description: string;
  phases: {
    1?: { model: string };
    3?: { model: string };
    4?: { models: string[] };
    5?: { model: string };
    6?: { model: string };
  };
}

export const VALIDATION_CONFIGS: Record<string, PipelineOverride> = {
  A_balanced: {
    name: 'A_balanced',
    description: 'Balanced production pipeline v6 (4 providers, Gemini 3 Flash consolidation)',
    phases: {
      1: { model: 'openai/gpt-4o' },
      3: { model: 'meta-llama/llama-4-maverick' },
      4: { models: ['google/gemini-3-flash-preview', 'anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini', 'x-ai/grok-4.3'] },
      5: { model: 'google/gemini-3.1-pro-preview' },
      6: { model: 'google/gemini-3-flash-preview' },
    },
  },
  B_frontier: {
    name: 'B_frontier',
    description: 'All-frontier: top models from 4 providers, Claude Opus 4.5 consolidation',
    phases: {
      1: { model: 'openai/gpt-5.4' },
      3: { model: 'x-ai/grok-4' },
      4: { models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5.4', 'google/gemini-3.1-pro-preview', 'x-ai/grok-4.20-beta'] },
      5: { model: 'google/gemini-3.1-pro-preview' },
      6: { model: 'anthropic/claude-opus-4.5' },
    },
  },
  C_google: {
    name: 'C_google',
    description: 'Google-only: full Gemini stack from Pro to Flash Lite',
    phases: {
      1: { model: 'google/gemini-3-flash-preview' },
      3: { model: 'google/gemini-2.5-flash' },
      4: { models: ['google/gemini-3.1-pro-preview', 'google/gemini-3-flash-preview', 'google/gemini-2.5-flash', 'google/gemini-3.1-flash-lite-preview'] },
      5: { model: 'google/gemini-3.1-pro-preview' },
      6: { model: 'google/gemini-3.1-pro-preview' },
    },
  },
  D_openai: {
    name: 'D_openai',
    description: 'OpenAI-only: GPT-5.4 to GPT-4o-mini, GPT-5.4 consolidation',
    phases: {
      1: { model: 'openai/gpt-4o' },
      3: { model: 'openai/gpt-4.1-mini' },
      4: { models: ['openai/gpt-5.4', 'openai/gpt-5-mini', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini'] },
      5: { model: 'openai/gpt-4o' },
      6: { model: 'openai/gpt-5.4' },
    },
  },
  E_budget: {
    name: 'E_budget',
    description: 'Budget mix: cheapest models from all providers, Gemini 2.5 Flash consolidation',
    phases: {
      1: { model: 'google/gemini-2.5-flash-lite' },
      3: { model: 'deepseek/deepseek-v3.2' },
      4: { models: ['openai/gpt-5.4-nano', 'google/gemini-2.0-flash-001', 'x-ai/grok-4.3', 'google/gemini-3.1-flash-lite-preview'] },
      5: { model: 'google/gemini-2.5-flash' },
      6: { model: 'google/gemini-2.5-flash' },
    },
  },
};

/** Resolve effective model for a phase, applying override if present. */
export function resolveModel(phase: 1 | 3 | 5 | 6, override?: PipelineOverride): string {
  const phaseOverride = override?.phases[phase];
  if (phaseOverride && 'model' in phaseOverride) return phaseOverride.model;
  const defaultPhase = PIPELINE_CONFIG.phases[phase];
  if ('model' in defaultPhase && defaultPhase.model) return defaultPhase.model;
  throw new Error(`No model configured for phase ${phase}`);
}

/** Resolve effective models array for Phase 4, applying override if present. */
export function resolvePhase4Models(override?: PipelineOverride): string[] {
  const phaseOverride = override?.phases[4];
  if (phaseOverride && 'models' in phaseOverride) return phaseOverride.models;
  return [...PIPELINE_CONFIG.phases[4].models];
}
