import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVENANCE_PIPES = /\s*\|(?:vision|openalex|crossref|europe_pmc|unpaywall|pubmed|semantic_scholar|arxiv|datacite|doaj|orcid|core)(?:\|(?:vision|openalex|crossref|europe_pmc|unpaywall|pubmed|semantic_scholar|arxiv|datacite|doaj|orcid|core))*$/
const TRAILING_NONE = /\|none$/
const TRAILING_URL = /\|https?:\/\/\S+$/
function cleanString(s: string): string {
    return s.replace(PROVENANCE_PIPES, '').replace(TRAILING_NONE, '').replace(TRAILING_URL, '').trim()
}
function cleanPipeField(s: string): string {
    let cleaned = cleanString(s)
    if (cleaned.includes('|')) cleaned = cleaned.split('|')[0].trim()
    return cleaned
}
function cleanSourceTags(obj: any, parentKey?: string): any {
    if (!obj || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(v => typeof v === 'string' ? cleanString(v) : cleanSourceTags(v))
    const cleaned: any = {}
    for (const [k, v] of Object.entries(obj)) {
        if (k === 'field_sources') { cleaned[k] = v; continue }
        if (typeof v === 'string') {
            cleaned[k] = (k === 'doi' || k === 'journal') ? cleanPipeField(v) : cleanString(v)
        } else if (typeof v === 'object') {
            cleaned[k] = cleanSourceTags(v, k)
        } else {
            cleaned[k] = v
        }
    }
    return cleaned
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    try {
        const supabase = createAdminClient()

        // Fetch all completed articles with phase-level data
        const { data: articles, error } = await supabase
            .from('articles')
            .select(`
                id, pdf_filename, created_at, status,
                total_cost, total_tokens, total_duration_ms,
                phase1_cost, phase1_model, phase1_duration_ms,
                phase3_cost, phase3_model, phase3_duration_ms,
                phase4_cost, phase4_models, phase4_duration_ms,
                phase5_cost, phase5_models, phase5_duration_ms,
                phase6_cost, phase6_model, phase6_duration_ms,
                phase7_json
            `)
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })

        if (error) throw error

        if (!articles || articles.length === 0) {
            return NextResponse.json({ error: 'No completed articles found' }, { status: 404 })
        }

        // Build export structure with phase-level data
        const exportData = {
            exported_at: new Date().toISOString(),
            total_articles: articles.length,
            total_cost: articles.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0),
            total_tokens: articles.reduce((sum, a) => sum + (Number(a.total_tokens) || 0), 0),
            total_duration_ms: articles.reduce((sum, a) => sum + (Number(a.total_duration_ms) || 0), 0),
            articles: articles.map(article => ({
                id: article.id,
                filename: article.pdf_filename,
                created_at: article.created_at,
                // Totals
                total_cost: article.total_cost,
                total_tokens: article.total_tokens,
                total_duration_ms: article.total_duration_ms,
                // Phase-level breakdown
                phases: {
                    phase1: {
                        cost: article.phase1_cost,
                        model: article.phase1_model,
                        duration_ms: article.phase1_duration_ms
                    },
                    phase2: {
                        cost: 0, // APIs are free
                        model: '11 Scholarly APIs',
                        duration_ms: null
                    },
                    phase3: {
                        cost: article.phase3_cost,
                        model: article.phase3_model,
                        duration_ms: article.phase3_duration_ms
                    },
                    phase4: {
                        cost: article.phase4_cost,
                        models: article.phase4_models,
                        duration_ms: article.phase4_duration_ms
                    },
                    phase5: {
                        cost: article.phase5_cost,
                        models: article.phase5_models,
                        duration_ms: article.phase5_duration_ms
                    },
                    phase6: {
                        cost: article.phase6_cost,
                        model: article.phase6_model,
                        duration_ms: article.phase6_duration_ms
                    },
                    phase7: {
                        cost: 0, // Deterministic merge
                        model: 'Deterministic',
                        duration_ms: null
                    }
                },
                // Final merged output (cleaned of source tags)
                phase7_output: cleanSourceTags(article.phase7_json?.output || null)
            }))
        }

        // Return as downloadable JSON file
        const jsonString = JSON.stringify(exportData, null, 2)

        return new NextResponse(jsonString, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="infinity_phase7_export_${new Date().toISOString().split('T')[0]}.json"`
            }
        })

    } catch (error: any) {
        console.error('Export JSON error:', error)
        return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 })
    }
}
