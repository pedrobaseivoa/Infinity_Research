/**
 * Phase 2: 11-API Enrichment
 * Queries 11 academic APIs in parallel to enrich metadata
 */

import {
    searchPubMed,
    searchOpenAlex,
    searchCrossRef,
    searchSemanticScholar,
    searchEuropePMC,
    searchArxiv,
    searchDataCite,
    searchUnpaywall,
    searchDOAJ,
    searchORCID,
    searchCORE
} from '../apis'
import type { PipelineContext, Phase1Output, Phase2Output, PhaseResult } from '../types'

export async function runPhase2(
    ctx: PipelineContext,
    phase1: Phase1Output
): Promise<PhaseResult<Phase2Output>> {
    const startTime = Date.now()

    // Update status to running
    await ctx.updateArticle({
        phase2_status: 'running',
        current_phase: 2
    })

    try {
        const { title, doi, authors } = phase1
        const firstAuthor = authors?.[0] || ''

        // Call all 11 APIs in parallel
        const [
            pubmed,
            openalex,
            crossref,
            semanticScholar,
            europePmc,
            arxiv,
            datacite,
            unpaywall,
            doaj,
            orcid,
            core
        ] = await Promise.allSettled([
            searchPubMed(title, doi || undefined),
            searchOpenAlex(title, doi || undefined, ctx.apiKeys.openalex_api_key),
            searchCrossRef(title, doi || undefined),
            searchSemanticScholar(title, doi || undefined, ctx.apiKeys.semantic_scholar_api_key),
            searchEuropePMC(title, doi || undefined),
            searchArxiv(title, doi || undefined),
            searchDataCite(title, doi || undefined),
            searchUnpaywall(title, doi || undefined),
            searchDOAJ(title, doi || undefined),
            searchORCID(firstAuthor),
            searchCORE(title, doi || undefined, ctx.apiKeys.core_api_key)
        ])

        // Process results
        const processResult = (result: PromiseSettledResult<any>, source: string) => {
            if (result.status === 'fulfilled' && result.value) {
                return result.value
            }
            return {
                success: false,
                source,
                error: result.status === 'rejected' ? result.reason?.message : 'No data'
            }
        }

        const output: Phase2Output = {
            pubmed: processResult(pubmed, 'pubmed'),
            openalex: processResult(openalex, 'openalex'),
            crossref: processResult(crossref, 'crossref'),
            semantic_scholar: processResult(semanticScholar, 'semantic_scholar'),
            europe_pmc: processResult(europePmc, 'europe_pmc'),
            arxiv: processResult(arxiv, 'arxiv'),
            datacite: processResult(datacite, 'datacite'),
            unpaywall: processResult(unpaywall, 'unpaywall'),
            doaj: processResult(doaj, 'doaj'),
            orcid: processResult(orcid, 'orcid'),
            core: processResult(core, 'core'),
            _status: {},
            _stats: {
                success: 0,
                failed: 0,
                total: 11,
                elapsed_ms: 0
            }
        }

        // Calculate stats
        const sources = ['pubmed', 'openalex', 'crossref', 'semantic_scholar', 'europe_pmc', 'arxiv', 'datacite', 'unpaywall', 'doaj', 'orcid', 'core']
        sources.forEach(source => {
            const data = output[source as keyof Phase2Output] as any
            const success = data?.success === true
            output._status[source] = { success, error: data?.error }
            if (success) output._stats.success++
            else output._stats.failed++
        })

        const duration_ms = Date.now() - startTime
        output._stats.elapsed_ms = duration_ms

        // Save to database
        await ctx.updateArticle({
            phase2_json: {
                output,
                duration_ms,
                timestamp: new Date().toISOString()
            },
            phase2_status: 'completed',
            phase2_apis_success: output._stats.success,
            phase2_apis_failed: output._stats.failed,
            phase2_duration_ms: duration_ms,
            phase2_completed_at: new Date().toISOString()
        })

        return {
            output,
            duration_ms,
            timestamp: new Date().toISOString()
        }
    } catch (error: any) {
        await ctx.updateArticle({
            phase2_status: 'failed',
            error_message: `Phase 2 failed: ${error.message}`
        })
        throw error
    }
}
