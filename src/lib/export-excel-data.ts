/**
 * Shared data shaping for Excel export and JSON preview (must stay in sync).
 */

export const CONFIDENCE_FIELDS = [
    'methodology', 'sample_size', 'population', 'intervention', 'control',
    'primary_outcomes', 'secondary_outcomes', 'main_results', 'limitations', 'conclusions',
] as const

export const API_NAMES = [
    'pubmed', 'openalex', 'crossref', 'semantic_scholar', 'europe_pmc', 'unpaywall',
    'orcid', 'arxiv', 'core', 'datacite', 'doaj',
] as const

const PROVENANCE_PIPES = /\s*\|(?:vision|openalex|crossref|europe_pmc|unpaywall|pubmed|semantic_scholar|arxiv|datacite|doaj|orcid|core)(?:\|(?:vision|openalex|crossref|europe_pmc|unpaywall|pubmed|semantic_scholar|arxiv|datacite|doaj|orcid|core))*$/
const TRAILING_NONE = /\|none$/
const TRAILING_URL = /\|https?:\/\/\S+$/

export function stripProvenance(value: unknown): string {
    if (!value) return ''
    let s = String(value)
    s = s.replace(PROVENANCE_PIPES, '')
    s = s.replace(TRAILING_NONE, '')
    s = s.replace(TRAILING_URL, '')
    return s.trim()
}

export function stripProvenanceArray(arr: unknown): string {
    if (!Array.isArray(arr)) return stripProvenance(arr)
    return arr.map(v => stripProvenance(v)).join('; ')
}

export function cleanDoi(value: unknown): string {
    if (!value) return ''
    let s = stripProvenance(value)
    if (s.includes('|')) s = s.split('|')[0].trim()
    return s
}

export function cleanJournal(value: unknown): string {
    if (!value) return ''
    let s = stripProvenance(value)
    if (s.includes('|')) s = s.split('|')[0].trim()
    return s
}

export function humanizeFieldKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export interface ExportSheet {
    headers: string[]
    rows: (string | number)[][]
}

export interface ExcelExportPayload {
    sheets: {
        scientificData: ExportSheet
        visualCosts: ExportSheet
        performance: ExportSheet
        confidence: ExportSheet
        apiEnrichment: ExportSheet
        metaAnalysis: ExportSheet
    }
    articleCount: number
}

/** Sort by citations (same as export route). */
export function sortArticlesForExport(articles: any[]): any[] {
    return [...articles].sort((a: any, b: any) => {
        const citationsA = a.phase7_json?.output?.phase3_consensus?.citations_count || 0
        const citationsB = b.phase7_json?.output?.phase3_consensus?.citations_count || 0
        return citationsB - citationsA
    })
}

export function buildExcelExportPayload(articles: any[]): ExcelExportPayload {
    const sorted = sortArticlesForExport(articles)

    const headers1 = [
        'Title', 'Authors', 'DOI', 'PMID', 'Year', 'Journal', 'Keywords', 'Abstract',
        'Open Access', 'Citations', 'Study Type', 'Registration No.',
        'Methodology', 'Sample Size', 'Population', 'Intervention',
        'Control', 'Primary Outcomes', 'Secondary Outcomes', 'Main Results',
        'Limitations', 'Conclusions', 'Ethical Considerations',
        'Funding Sources', 'Conflict of Interest', 'Consolidation Notes',
    ]
    const rows1: (string | number)[][] = sorted.map((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const scientific = output.phase6_scientific?.consolidated || {}
        const phase1 = article.phase1_json?.output || {}
        return [
            stripProvenance(metadata.title),
            stripProvenanceArray(metadata.authors),
            cleanDoi(metadata.doi),
            stripProvenance(metadata.pmid),
            metadata.year || '',
            cleanJournal(metadata.journal),
            stripProvenanceArray(metadata.keywords),
            stripProvenance(metadata.abstract),
            metadata.open_access === true ? 'Yes' : (metadata.open_access === false ? 'No' : ''),
            metadata.citations_count || 0,
            metadata.study_type || phase1.study_type || '',
            metadata.registration_number || phase1.registration_number || '',
            scientific.methodology || '',
            scientific.sample_size || '',
            scientific.population || '',
            scientific.intervention || '',
            scientific.control || '',
            scientific.primary_outcomes || '',
            scientific.secondary_outcomes || '',
            scientific.main_results || '',
            scientific.limitations || '',
            scientific.conclusions || '',
            scientific.ethical_considerations || '',
            metadata.funding_sources || phase1.funding_sources || '',
            metadata.conflict_of_interest || phase1.conflict_of_interest || '',
            scientific.consolidation_notes || '',
        ]
    })

    const headers2 = [
        'Title', 'Figures', 'Tables',
        'Phase 1 Model', 'Phase 1 Cost', 'Phase 2 APIs',
        'Phase 3 Model', 'Phase 3 Cost', 'Phase 4 Models', 'Phase 4 Cost',
        'Phase 5 Model', 'Phase 5 Cost', 'Phase 6 Model', 'Phase 6 Cost', 'Total Cost',
    ]
    const rows2: (string | number)[][] = sorted.map((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const phase1 = article.phase1_json?.output || {}
        const phase5Model = (Array.isArray(article.phase5_models) && article.phase5_models.length > 0)
            ? article.phase5_models.join('; ')
            : 'N/A (No Visuals)'
        const apisSuccess = article.phase2_apis_success || 0
        const apisFailed = article.phase2_apis_failed || 0
        const apisTotal = apisSuccess + apisFailed
        return [
            stripProvenance(metadata.title) || article.pdf_filename || '',
            phase1.has_figures ? 'Yes' : 'No',
            phase1.has_tables ? 'Yes' : 'No',
            article.phase1_model || '',
            article.phase1_cost ? `$${Number(article.phase1_cost).toFixed(4)}` : '$0.0000',
            `${apisSuccess}/${apisTotal} APIs`,
            article.phase3_model || '',
            article.phase3_cost ? `$${Number(article.phase3_cost).toFixed(4)}` : '$0.0000',
            Array.isArray(article.phase4_models) ? article.phase4_models.join('; ') : '',
            article.phase4_cost ? `$${Number(article.phase4_cost).toFixed(4)}` : '$0.0000',
            phase5Model,
            article.phase5_cost ? `$${Number(article.phase5_cost).toFixed(4)}` : '$0.0000',
            article.phase6_model || '',
            article.phase6_cost ? `$${Number(article.phase6_cost).toFixed(4)}` : '$0.0000',
            article.total_cost ? `$${Number(article.total_cost).toFixed(4)}` : '$0.0000',
        ]
    })
    const totalRow2: (string | number)[] = [
        'TOTAL', '', '', '',
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.phase1_cost) || 0), 0).toFixed(4)}`,
        '', '',
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.phase3_cost) || 0), 0).toFixed(4)}`,
        '',
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.phase4_cost) || 0), 0).toFixed(4)}`,
        '',
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.phase5_cost) || 0), 0).toFixed(4)}`,
        '',
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.phase6_cost) || 0), 0).toFixed(4)}`,
        `$${sorted.reduce((sum: number, a: any) => sum + (Number(a.total_cost) || 0), 0).toFixed(4)}`,
    ]
    rows2.push(totalRow2)

    const headers3 = [
        'Title', 'P1 (ms)', 'P2 (ms)', 'P3 (ms)', 'P4 (ms)', 'P5 (ms)', 'P6 (ms)', 'P7 (ms)',
        'Total (s)', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens',
    ]
    const rows3: (string | number)[][] = sorted.map((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const totalMs = (article.phase1_duration_ms || 0) + (article.phase2_duration_ms || 0) +
            (article.phase3_duration_ms || 0) + (article.phase4_duration_ms || 0) +
            (article.phase5_duration_ms || 0) + (article.phase6_duration_ms || 0) +
            (article.phase7_duration_ms || 0)
        const totalPrompt = (article.phase1_prompt_tokens || 0) + (article.phase3_prompt_tokens || 0) +
            (article.phase4_prompt_tokens || 0) + (article.phase5_prompt_tokens || 0) +
            (article.phase6_prompt_tokens || 0)
        const totalCompletion = (article.phase1_completion_tokens || 0) + (article.phase3_completion_tokens || 0) +
            (article.phase4_completion_tokens || 0) + (article.phase5_completion_tokens || 0) +
            (article.phase6_completion_tokens || 0)
        return [
            stripProvenance(metadata.title) || article.pdf_filename || '',
            article.phase1_duration_ms || 0,
            article.phase2_duration_ms || 0,
            article.phase3_duration_ms || 0,
            article.phase4_duration_ms || 0,
            article.phase5_duration_ms || 0,
            article.phase6_duration_ms || 0,
            article.phase7_duration_ms || 0,
            (totalMs / 1000).toFixed(1),
            totalPrompt,
            totalCompletion,
            totalPrompt + totalCompletion,
        ]
    })

    const headers4 = [
        'Title',
        ...CONFIDENCE_FIELDS.map(f => humanizeFieldKey(f)),
        'Avg Score',
    ]
    const rows4: (string | number)[][] = sorted.map((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const scores = output.confidence_scores || article.confidence_scores || {}
        const fieldValues = CONFIDENCE_FIELDS.map(field => {
            const entry = scores[field]
            if (!entry) return ''
            return `${entry.score ?? '?'} (${entry.agreement || '?'})`
        })
        const numericScores = CONFIDENCE_FIELDS.map(f => scores[f]?.score).filter((s: any) => typeof s === 'number') as number[]
        const avgScore = numericScores.length > 0
            ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(2)
            : ''
        return [
            stripProvenance(metadata.title) || article.pdf_filename || '',
            ...fieldValues,
            avgScore,
        ]
    })

    const headers5 = [
        'Title',
        ...API_NAMES.map(n => humanizeFieldKey(n)),
        'Success Rate',
        'Conflicts Resolved',
    ]
    const rows5: (string | number)[][] = sorted.map((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const apiStatus = article.phase3_json?.api_status || {}
        const conflicts = metadata.conflicts_resolved || []
        const apiCells = API_NAMES.map(name => {
            const status = apiStatus[name]
            if (!status) return '—'
            if (status.success) return `OK (${status.time_ms || 0}ms)`
            return `FAIL: ${status.error || 'unknown'}`
        })
        const successCount = API_NAMES.filter(n => apiStatus[n]?.success).length
        const conflictsSummary = conflicts.map((c: any) => `${c.field}: ${c.chosen} (${c.reason})`).join('; ')
        return [
            stripProvenance(metadata.title) || article.pdf_filename || '',
            ...apiCells,
            `${successCount}/${API_NAMES.length}`,
            conflictsSummary || 'None',
        ]
    })

    const headers6 = [
        'Study (First Author, Year)', 'Outcome', 'Comparison Type', 'Category', 'Type', 'Timepoint',
        'Arm 1 Label', 'Arm 1 N', 'Arm 1 Mean', 'Arm 1 SD', 'Arm 1 Events', 'Arm 1 Total',
        'Arm 2 Label', 'Arm 2 N', 'Arm 2 Mean', 'Arm 2 SD', 'Arm 2 Events', 'Arm 2 Total',
        'Proportion', 'SE Reported', 'Corr Pre-Post',
        'Effect Measure', 'Effect Size', 'CI Lower', 'CI Upper', 'p-value', 'Direction Favorable',
        'Source', 'Models', 'Agreement',
    ]
    const rows6: (string | number)[][] = []
    sorted.forEach((article: any) => {
        const output = article.phase7_json?.output || {}
        const metadata = output.phase3_consensus || {}
        const consolidated = output.phase6_scientific?.consolidated || {}
        const outcomes: any[] = consolidated.structured_outcomes || []
        if (outcomes.length === 0) return

        const firstAuthor = (() => {
            const authors = metadata.authors
            if (Array.isArray(authors) && authors.length > 0) {
                const name = stripProvenance(authors[0])
                const parts = name.split(/[,\s]+/)
                return parts[0]
            }
            return stripProvenance(metadata.title)?.substring(0, 30) || article.pdf_filename || 'Unknown'
        })()
        const studyLabel = `${firstAuthor} et al., ${metadata.year || '?'}`

        outcomes.forEach((o: any) => {
            rows6.push([
                studyLabel,
                o.name || '',
                o.comparison_type || '',
                o.category || '',
                o.type || '',
                o.timepoint ?? '',
                o.arm1_label ?? o.intervention_label ?? '',
                o.arm1_n ?? o.intervention_n ?? '',
                o.arm1_mean ?? o.intervention_mean ?? '',
                o.arm1_sd ?? o.intervention_sd ?? '',
                o.arm1_events ?? o.intervention_events ?? '',
                o.arm1_total ?? o.intervention_total ?? '',
                o.arm2_label ?? o.control_label ?? '',
                o.arm2_n ?? o.control_n ?? '',
                o.arm2_mean ?? o.control_mean ?? '',
                o.arm2_sd ?? o.control_sd ?? '',
                o.arm2_events ?? o.control_events ?? '',
                o.arm2_total ?? o.control_total ?? '',
                o.proportion ?? '',
                o.se_reported === true ? 'Yes' : (o.se_reported === false ? 'No' : ''),
                o.correlation_pre_post ?? '',
                o.effect_measure ?? '',
                o.effect_size ?? '',
                o.ci_lower ?? '',
                o.ci_upper ?? '',
                o.p_value ?? '',
                o.direction_favorable ?? '',
                o.source ?? '',
                o.models_reporting ?? '',
                o.agreement_note ?? '',
            ])
        })
    })

    return {
        sheets: {
            scientificData: { headers: headers1, rows: rows1 },
            visualCosts: { headers: headers2, rows: rows2 },
            performance: { headers: headers3, rows: rows3 },
            confidence: { headers: headers4, rows: rows4 },
            apiEnrichment: { headers: headers5, rows: rows5 },
            metaAnalysis: { headers: headers6, rows: rows6 },
        },
        articleCount: sorted.length,
    }
}
