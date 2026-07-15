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

// Single, fixed production pipeline. The optional PipelineOverride type is kept
// only so the phase runners can share one signature; there are no alternate
// configurations to choose from — the Default (PIPELINE_CONFIG) always runs.
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
