/**
 * Type definitions for user settings (API Keys)
 */
export interface UserApiKeys {
    openrouter_api_key: string
    semantic_scholar_api_key?: string | null
    openalex_api_key?: string | null
    core_api_key?: string | null
}

/**
 * Type definitions for Phase outputs
 */
export interface PhaseResult<T = any> {
    output: T
    model?: string
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_cost: number
    }
    duration_ms: number
    timestamp: string
}

/**
 * Phase 1 Output: Metadata Extraction
 */
export interface Phase1Output {
    title: string
    authors: string[]
    doi: string | null
    abstract: string
    journal: string
    year: number
    keywords: string[]
    study_type: string
    has_tables: boolean
    has_figures: boolean
    estimated_pages: number
}

/**
 * Phase 2 Output: API Enrichment
 */
export interface Phase2Output {
    pubmed?: any
    openalex?: any
    crossref?: any
    semantic_scholar?: any
    europe_pmc?: any
    arxiv?: any
    datacite?: any
    unpaywall?: any
    doaj?: any
    orcid?: any
    core?: any
    _status: Record<string, { success: boolean; error?: string }>
    _stats: {
        success: number
        failed: number
        total: number
        elapsed_ms: number
    }
}

/**
 * Phase 3 Output: Consensus with Provenance
 */
export interface Phase3Output {
    title: string
    authors: string[]
    doi: string | null
    pmid: string | null
    abstract: string
    journal: string
    year: number
    keywords: string[]
    citations_count: number
    publisher: string
    open_access: boolean | null
    orcid_ids: string[]
    field_sources: Record<string, string>
    conflicts_resolved: Array<{
        field: string
        values: Record<string, any>
        chosen: any
        reason: string
    }>
    rejected_sources: Array<{
        source: string
        reason: string
    }>
}

/**
 * Phase 4 Output: Multi-Model Scientific Extraction
 */
export interface Phase4Extraction {
    methodology: string
    sample_size: string
    population: string
    intervention: string
    control: string
    primary_outcomes: string
    secondary_outcomes: string
    main_results: string
    limitations: string
    conclusions: string
    ethical_considerations: string
}

export interface Phase4Output {
    extractions: Array<{
        model: string
        extraction: Phase4Extraction
        usage?: any
        error?: string
    }>
}

/**
 * Phase 5 Output: Visual + Tables Extraction
 */
export interface Phase5Output {
    figures: Array<{
        id: string
        page: number
        caption: string
        type: string
        content_description: string
    }>
    tables: Array<{
        id: string
        page: number
        caption: string
        content_summary: string
    }>
    visual_summary: string
    skipped?: boolean
}

/**
 * Phase 6 Output: Scientific Consolidation
 */
export interface Phase6Output {
    consolidated: Phase4Extraction & {
        consolidation_notes: string
    }
    source_count: number
}

/**
 * Phase 7 Output: Final Merge
 */
export interface Phase7Output {
    phase3_consensus: Phase3Output
    phase6_scientific: Phase6Output
    _processing: {
        pipeline_version: string
        phases_completed: number
        merged_at: string
    }
}

/**
 * Pipeline context passed between phases
 */
export interface PipelineContext {
    articleId: string
    userId: string
    pdfUrl: string
    apiKeys: UserApiKeys
    updateArticle: (updates: Record<string, any>) => Promise<void>
}
