'use client'

import { useMemo } from 'react'
import ScreenshotButton from '@/components/ScreenshotButton'

interface ApiHeatmapProps {
    articles: any[]
}

const SOURCES = [
    'vision', 'openalex', 'crossref', 'semantic_scholar',
    'europe_pmc', 'pubmed', 'unpaywall', 'orcid',
    'arxiv', 'core', 'datacite', 'doaj'
]

const FIELDS = [
    'title', 'authors', 'doi', 'pmid', 'year', 'journal',
    'abstract', 'keywords', 'citations', 'open_access'
]

const SOURCE_LABELS: Record<string, string> = {
    vision: 'PDF Vision',
    openalex: 'OpenAlex',
    crossref: 'Crossref',
    semantic_scholar: 'Semantic Scholar',
    europe_pmc: 'Europe PMC',
    pubmed: 'PubMed',
    unpaywall: 'Unpaywall',
    orcid: 'ORCID',
    arxiv: 'arXiv',
    core: 'CORE',
    datacite: 'DataCite',
    doaj: 'DOAJ'
}

const FIELD_LABELS: Record<string, string> = {
    title: 'Title',
    authors: 'Authors',
    doi: 'DOI',
    pmid: 'PMID',
    year: 'Year',
    journal: 'Journal',
    abstract: 'Abstract',
    keywords: 'Keywords',
    citations: 'Citations',
    open_access: 'Open Access'
}

export function ApiHeatmap({ articles }: ApiHeatmapProps) {
    const stats = useMemo(() => {
        const matrix: Record<string, Record<string, number>> = {}
        SOURCES.forEach(source => {
            matrix[source] = {}
            FIELDS.forEach(field => { matrix[source][field] = 0 })
        })

        if (!articles || articles.length === 0) return { matrix, totalArticles: 0, apiStatus: {} as Record<string, { success: number; failed: number }> }

        let processedCount = 0
        const apiStatusAgg: Record<string, { success: number; failed: number }> = {}
        SOURCES.filter(s => s !== 'vision').forEach(s => { apiStatusAgg[s] = { success: 0, failed: 0 } })

        articles.forEach(article => {
            const fieldCoverage = article.phase3_json?.field_coverage
            const fieldSources = article.phase7_json?.output?.phase3_consensus?.field_sources
                || article.phase3_json?.output?.field_sources
            const apiStatus = article.phase3_json?.api_status || {}

            if (!fieldCoverage && !fieldSources) return
            processedCount++

            for (const [source, status] of Object.entries(apiStatus) as [string, any][]) {
                if (apiStatusAgg[source]) {
                    if (status?.success) apiStatusAgg[source].success++
                    else apiStatusAgg[source].failed++
                }
            }

            if (fieldCoverage) {
                const phase1 = article.phase1_json?.output
                if (phase1) {
                    const visionFields: string[] = []
                    if (phase1.title) visionFields.push('title')
                    if (phase1.authors?.length) visionFields.push('authors')
                    if (phase1.doi) visionFields.push('doi')
                    if (phase1.year) visionFields.push('year')
                    if (phase1.journal) visionFields.push('journal')
                    if (phase1.abstract) visionFields.push('abstract')
                    if (phase1.keywords?.length) visionFields.push('keywords')
                    visionFields.forEach(f => { if (matrix.vision[f] !== undefined) matrix.vision[f]++ })
                }

                for (const [source, fields] of Object.entries(fieldCoverage)) {
                    if (matrix[source] && Array.isArray(fields)) {
                        (fields as string[]).forEach(f => {
                            if (matrix[source][f] !== undefined) matrix[source][f]++
                        })
                    }
                }
            } else if (fieldSources) {
                FIELDS.forEach(field => {
                    const sourceString = fieldSources[field] || fieldSources[field === 'citations' ? 'citations_count' : field]
                    if (!sourceString || sourceString === 'none') return
                    const contributors = sourceString.split(/[+|]+/).map((s: string) => s.trim().toLowerCase())
                    contributors.forEach((contributor: string) => {
                        if (matrix[contributor]) matrix[contributor][field]++
                    })
                })
            }
        })

        return { matrix, totalArticles: processedCount, apiStatus: apiStatusAgg }
    }, [articles])

    if (stats.totalArticles === 0) return null

    const getColor = (value: number): string => {
        if (value === 0) return 'bg-gray-800/50'
        const pct = value / stats.totalArticles
        if (pct >= 1) return 'bg-emerald-500/80'
        if (pct >= 0.5) return 'bg-emerald-600/60'
        if (pct > 0) return 'bg-emerald-700/40'
        return 'bg-gray-800/50'
    }

    const getTextColor = (value: number): string => {
        if (value === 0) return 'text-gray-600'
        const pct = value / stats.totalArticles
        if (pct >= 1) return 'text-white font-medium'
        if (pct >= 0.5) return 'text-emerald-200'
        return 'text-emerald-300/70'
    }

    return (
        <div className="space-y-6">
            {/* API Status Summary */}
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800" id="api-status">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white">API Enrichment Status</h3>
                        <p className="text-sm text-gray-500">{stats.totalArticles} article{stats.totalArticles !== 1 ? 's' : ''} processed</p>
                    </div>
                    <ScreenshotButton targetId="api-status" filename="infinity_api_status" label="" className="!px-2 !py-1 !border-0 bg-transparent hover:bg-white/5 text-gray-500 hover:text-white" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {SOURCES.filter(s => s !== 'vision').map(source => {
                        const st = stats.apiStatus[source]
                        if (!st) return null
                        const rate = stats.totalArticles > 0 ? st.success / stats.totalArticles : 0
                        return (
                            <div key={source} className="p-3 bg-gray-800/50 rounded-lg text-center">
                                <p className="text-xs text-gray-400 mb-1">{SOURCE_LABELS[source]}</p>
                                <p className={`text-lg font-bold font-mono ${rate >= 1 ? 'text-green-400' : rate > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {st.success}/{st.success + st.failed}
                                </p>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Field Coverage Heatmap */}
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto" id="chart-heatmap">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Field Coverage</h3>
                        <p className="text-sm text-gray-500">Which sources provided data for each metadata field</p>
                    </div>
                    <ScreenshotButton targetId="chart-heatmap" filename="infinity_field_coverage" label="" className="!px-2 !py-1 !border-0 bg-transparent hover:bg-white/5 text-gray-500 hover:text-white" />
                </div>

                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr>
                            <th className="p-2 text-gray-500 font-medium text-xs sticky left-0 bg-gray-900 z-10 border-b border-gray-800 min-w-[120px]">Source</th>
                            {FIELDS.map(field => (
                                <th key={field} className="p-2 text-gray-500 font-medium text-xs text-center border-b border-gray-800 min-w-[70px]">
                                    {FIELD_LABELS[field]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {SOURCES.map(source => {
                            const hasAnyData = FIELDS.some(f => stats.matrix[source][f] > 0)
                            return (
                                <tr key={source} className="border-b border-gray-800/50">
                                    <td className={`p-2 text-sm sticky left-0 bg-gray-900 z-10 ${hasAnyData ? 'text-gray-200' : 'text-gray-600'}`}>
                                        {SOURCE_LABELS[source]}
                                    </td>
                                    {FIELDS.map(field => {
                                        const count = stats.matrix[source][field]
                                        const pct = stats.totalArticles > 0 ? Math.round((count / stats.totalArticles) * 100) : 0
                                        return (
                                            <td key={field} className="p-1">
                                                <div className={`rounded px-2 py-1.5 text-center text-xs font-mono ${getColor(count)} ${getTextColor(count)}`}
                                                    title={`${SOURCE_LABELS[source]}: ${FIELD_LABELS[field]} in ${count}/${stats.totalArticles} articles`}
                                                >
                                                    {pct > 0 ? `${pct}%` : '—'}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/80" /> 100%</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600/60" /> 50-99%</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-700/40" /> 1-49%</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-800/50" /> No data</span>
                </div>
            </div>
        </div>
    )
}
