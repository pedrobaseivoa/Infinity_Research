'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PipelineDiagram from './pipeline-diagram'
import { PdfViewer } from '@/components/PdfViewer'
import { EyeIcon, ChevronDoubleRightIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline'
import useReviewPanel, { ReviewerSelector, MetadataReviewInline, ScientificReviewBlock, OverallScorePanel, OutcomeReviewCell, METADATA_FIELDS, SCIENTIFIC_FIELDS } from '@/components/ReviewPanel'

interface Article {
    id: string
    status: string
    current_phase: number | null
    pdf_filename: string
    pdf_storage_path: string | null
    total_cost: number | null
    total_tokens: number | null
    total_duration_ms: number | null
    error_message: string | null
    confidence_scores: Record<string, any> | null
    phase1_json: any
    phase2_json: any
    phase3_json: any
    phase4_json: any
    phase5_json: any
    phase6_json: any
    phase7_json: any
    phase1_status: string | null
    phase2_status: string | null
    phase3_status: string | null
    phase4_status: string | null
    phase5_status: string | null
    phase6_status: string | null
    phase7_status: string | null
    phase1_model: string | null
    phase3_model: string | null
    phase4_models: string[] | null
    phase5_models: string[] | null
    phase6_model: string | null
    phase2_apis_success: number | null
    phase2_apis_failed: number | null
    created_at: string
    user_id: string
}

function shortModel(name: string | null): string {
    if (!name) return '—'
    const parts = name.split('/')
    return parts[parts.length - 1].replace(/-\d{8,}$/, '').replace(/-preview$/, '')
}

function formatDuration(ms: number): string {
    const s = ms / 1000
    if (s < 60) return `${Math.round(s)}s`
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

export default function ArticleView({ initialArticle }: { initialArticle: Article }) {
    const searchParams = useSearchParams()
    const fromFolder = searchParams.get('from') === 'folder' ? searchParams.get('folder') : null
    const backHref = fromFolder ? `/dashboard?folder=${fromFolder}` : '/dashboard'

    const [article, setArticle] = useState<Article>(initialArticle)
    const [showPdf, setShowPdf] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [pdfWidth, setPdfWidth] = useState(50)
    const isDragging = useRef(false)
    const supabase = createClient()

    useEffect(() => {
        const channel = supabase
            .channel(`article-${article.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles', filter: `id=eq.${article.id}` }, (payload) => {
                setArticle(payload.new as Article)
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [article.id, supabase])

    const output = article.phase7_json?.output || {}
    const metadata = output.phase3_consensus || {}
    const scientific = output.phase6_scientific?.consolidated || {}
    const phase1 = article.phase1_json?.output || {}
    const apiStatus = article.phase3_json?.api_status || {}
    const structuredOutcomes: any[] = scientific.structured_outcomes || []
    const fieldAgreement: Record<string, string> = (() => {
        const raw = scientific.field_agreement
        if (!raw) return {}
        if (Array.isArray(raw)) {
            const map: Record<string, string> = {}
            raw.forEach((entry: any) => { if (entry?.field && entry?.agreement) map[entry.field] = entry.agreement })
            return map
        }
        return raw
    })()

    const apisSuccess = Object.values(apiStatus).filter((s: any) => s?.success).length
    const apisTotal = Object.keys(apiStatus).length || 11
    const modelsUsed = article.phase4_models?.length || 0
    const avgConfidence = (() => {
        const scores = article.confidence_scores || {}
        const nums = Object.values(scores).map((s: any) => s?.score).filter((s: any) => typeof s === 'number') as number[]
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    })()

    const isCompleted = article.status === 'completed'
    const isProcessing = article.status === 'processing'

    const visibleMetadata = useMemo(() => {
        const out = article.phase7_json?.output || {}
        const m = out.phase3_consensus || {}
        const p1 = article.phase1_json?.output || {}
        const checks: Record<string, boolean> = {
            title: !!m.title, authors: !!m.authors, journal: !!m.journal,
            year: !!m.year, doi: !!m.doi, pmid: !!m.pmid,
            study_type: !!(m.study_type || p1.study_type),
            citations_count: m.citations_count > 0, abstract: !!m.abstract,
        }
        return METADATA_FIELDS.filter(f => checks[f]).length
    }, [article])

    const visibleScientific = useMemo(() => {
        const s = article.phase7_json?.output?.phase6_scientific?.consolidated || {}
        return SCIENTIFIC_FIELDS.filter(f => !!s[f]).length
    }, [article])

    const review = useReviewPanel({
        articleId: article.id,
        totalMetadata: visibleMetadata,
        totalScientific: visibleScientific,
        totalOutcomes: structuredOutcomes.length,
    })
    const isQueued = article.status === 'queued'
    const isFailed = article.status === 'failed'

    const phases = [
        { num: 1, name: 'Metadata', status: article.phase1_status },
        { num: 2, name: 'API Enrichment', status: article.phase2_status },
        { num: 3, name: 'Consensus', status: article.phase3_status },
        { num: 4, name: 'Multi-Model', status: article.phase4_status },
        { num: 5, name: 'Visual', status: article.phase5_status },
        { num: 6, name: 'Consolidation', status: article.phase6_status },
        { num: 7, name: 'Final Merge', status: article.phase7_status },
    ]

    const phaseJsonData = [
        { num: 1, name: 'Metadata', data: article.phase1_json },
        { num: 2, name: 'API Enrichment', data: article.phase2_json },
        { num: 3, name: 'Consensus', data: article.phase3_json },
        { num: 4, name: 'Multi-Model', data: article.phase4_json },
        { num: 5, name: 'Visual', data: article.phase5_json },
        { num: 6, name: 'Consolidation', data: article.phase6_json },
        { num: 7, name: 'Final Merge', data: article.phase7_json },
    ]

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm shrink-0 sticky top-0 z-50">
                <div className="max-w-[1920px] mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                        <h1 className="text-sm font-medium text-white truncate max-w-lg" title={article.pdf_filename}>{article.pdf_filename}</h1>
                        <p className="text-xs text-gray-500">{new Date(article.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {article.pdf_storage_path && (
                            <button onClick={() => setShowPdf(!showPdf)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border flex items-center gap-1.5 ${showPdf ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                <EyeIcon className="w-3.5 h-3.5" />
                                {showPdf ? 'Hide PDF' : 'PDF'}
                            </button>
                        )}
                        <Link href={backHref} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors border border-gray-700">
                            Back
                        </Link>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-[1920px] mx-auto px-6 py-6 w-full">
                {/* Status banners */}
                {isQueued && (
                    <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-4 mb-6 flex items-center gap-3">
                        <span className="text-blue-400 text-lg">&#8987;</span>
                        <div><p className="text-sm font-medium text-blue-400">Queued for Processing</p><p className="text-xs text-gray-500">Go to Dashboard and click Start Processing.</p></div>
                    </div>
                )}
                {isProcessing && (
                    <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-4 mb-6 flex items-center gap-3">
                        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
                        <div><p className="text-sm font-medium text-blue-400">Processing Phase {article.current_phase || 1} of 7</p></div>
                    </div>
                )}
                {isFailed && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6">
                        <p className="text-sm font-medium text-red-400">Processing Failed</p>
                        <p className="text-xs text-gray-500 mt-1">{article.error_message || 'An error occurred'}</p>
                    </div>
                )}

                {/* Main layout */}
                <div className="flex gap-0">
                    {/* PDF Panel */}
                    {showPdf && article.pdf_storage_path && (
                        <>
                            <div className="sticky top-16 h-[calc(100vh-5rem)] shrink-0" style={{ width: `${pdfWidth}%` }}>
                                <PdfViewer path={article.pdf_storage_path} filename={article.pdf_filename} />
                            </div>
                            <div
                                className="w-2 shrink-0 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors flex items-center justify-center group"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    isDragging.current = true
                                    const onMove = (ev: MouseEvent) => {
                                        if (!isDragging.current) return
                                        const pct = (ev.clientX / window.innerWidth) * 100
                                        setPdfWidth(Math.max(20, Math.min(70, pct)))
                                    }
                                    const onUp = () => { isDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                                    window.addEventListener('mousemove', onMove)
                                    window.addEventListener('mouseup', onUp)
                                }}
                            >
                                <div className="w-0.5 h-8 bg-gray-700 group-hover:bg-blue-400 rounded-full transition-colors" />
                            </div>
                        </>
                    )}

                    {/* Main Content */}
                    <div className="flex-1 min-w-0 space-y-6 px-4">
                        {isCompleted && (
                            <ReviewerSelector review={review} />
                        )}

                        {/* Metadata */}
                        {isCompleted && metadata.title && (
                            <div>
                                <h2 className="text-xl font-semibold text-white mb-1 leading-tight">{metadata.title}</h2>
                                <MetadataReviewInline field="title" review={review} />
                                {metadata.authors && (
                                    <div className="mt-2 mb-2">
                                        <p className="text-sm text-gray-400">{Array.isArray(metadata.authors) ? metadata.authors.join(', ') : metadata.authors}</p>
                                        <MetadataReviewInline field="authors" review={review} />
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1">
                                    {metadata.journal && (
                                        <span className="text-gray-300 inline-flex items-center gap-1">{metadata.journal} <MetadataReviewInline field="journal" review={review} /></span>
                                    )}
                                    {metadata.year && (
                                        <span className="text-gray-500 inline-flex items-center gap-1">({metadata.year}) <MetadataReviewInline field="year" review={review} /></span>
                                    )}
                                    {metadata.doi && (
                                        <span className="inline-flex items-center gap-1">
                                            <a href={`https://doi.org/${metadata.doi}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-mono">DOI: {metadata.doi}</a>
                                            <MetadataReviewInline field="doi" review={review} />
                                        </span>
                                    )}
                                    {metadata.pmid && (
                                        <span className="inline-flex items-center gap-1">
                                            <a href={`https://pubmed.ncbi.nlm.nih.gov/${metadata.pmid}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-mono">PMID: {metadata.pmid}</a>
                                            <MetadataReviewInline field="pmid" review={review} />
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    {(metadata.study_type || phase1.study_type) && (
                                        <span className="inline-flex items-center gap-1"><Badge color="indigo">{metadata.study_type || phase1.study_type}</Badge><MetadataReviewInline field="study_type" review={review} /></span>
                                    )}
                                    {metadata.open_access && <Badge color="green">Open Access</Badge>}
                                    {metadata.citations_count > 0 && (
                                        <span className="inline-flex items-center gap-1"><Badge color="amber">{metadata.citations_count} citations</Badge><MetadataReviewInline field="citations_count" review={review} /></span>
                                    )}
                                    {structuredOutcomes.length > 0 && <Badge color="cyan">{structuredOutcomes.length} outcomes</Badge>}
                                </div>
                                {metadata.keywords?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {metadata.keywords.map((kw: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-gray-800/50 text-gray-500 text-[10px] rounded">{kw}</span>)}
                                    </div>
                                )}
                                {metadata.abstract && (
                                    <div className="mt-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800/50">
                                        <p className="text-xs text-gray-400 font-medium mb-1">Abstract</p>
                                        <p className="text-sm text-gray-300 leading-relaxed">{metadata.abstract}</p>
                                        <MetadataReviewInline field="abstract" review={review} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Scientific Data */}
                        {isCompleted && (scientific.methodology || scientific.main_results) && (
                            <div className="space-y-5">
                                <FieldSection title="Study Design">
                                    <Field label="Methodology" value={scientific.methodology} agreement={fieldAgreement.methodology} reviewProps={{ fieldKey: 'methodology', review }} />
                                    <Field label="Population" value={scientific.population} agreement={fieldAgreement.population} reviewProps={{ fieldKey: 'population', review }} />
                                    <Field label="Sample Size" value={scientific.sample_size} agreement={fieldAgreement.sample_size} reviewProps={{ fieldKey: 'sample_size', review }} />
                                </FieldSection>

                                <FieldSection title="Intervention & Comparison">
                                    <Field label="Intervention" value={scientific.intervention} agreement={fieldAgreement.intervention} reviewProps={{ fieldKey: 'intervention', review }} />
                                    <Field label="Control" value={scientific.control} agreement={fieldAgreement.control} reviewProps={{ fieldKey: 'control', review }} />
                                </FieldSection>

                                <FieldSection title="Results">
                                    <Field label="Primary Outcomes" value={scientific.primary_outcomes} agreement={fieldAgreement.primary_outcomes} reviewProps={{ fieldKey: 'primary_outcomes', review }} />
                                    <Field label="Secondary Outcomes" value={scientific.secondary_outcomes} agreement={fieldAgreement.secondary_outcomes} reviewProps={{ fieldKey: 'secondary_outcomes', review }} />
                                    <Field label="Main Results" value={scientific.main_results} agreement={fieldAgreement.main_results} reviewProps={{ fieldKey: 'main_results', review }} />
                                </FieldSection>

                                <FieldSection title="Conclusions & Context">
                                    <Field label="Conclusions" value={scientific.conclusions} agreement={fieldAgreement.conclusions} reviewProps={{ fieldKey: 'conclusions', review }} />
                                    <Field label="Limitations" value={scientific.limitations} agreement={fieldAgreement.limitations} reviewProps={{ fieldKey: 'limitations', review }} />
                                    <Field label="Ethical Considerations" value={scientific.ethical_considerations} agreement={fieldAgreement.ethical_considerations} reviewProps={{ fieldKey: 'ethical_considerations', review }} />
                                </FieldSection>

                                {(metadata.funding_sources || metadata.conflict_of_interest || metadata.registration_number) && (
                                    <FieldSection title="Provenance">
                                        {metadata.funding_sources && <Field label="Funding Sources" value={metadata.funding_sources} />}
                                        {metadata.conflict_of_interest && <Field label="Conflict of Interest" value={metadata.conflict_of_interest} />}
                                        {metadata.registration_number && <Field label="Registration Number" value={metadata.registration_number} />}
                                    </FieldSection>
                                )}

                                {scientific.consolidation_notes && (
                                    <p className="text-xs text-gray-600 italic border-t border-gray-800 pt-3">{scientific.consolidation_notes}</p>
                                )}
                            </div>
                        )}

                        {/* Structured Outcomes */}
                        {isCompleted && structuredOutcomes.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                    Structured Outcomes <span className="text-gray-500 font-normal">({structuredOutcomes.length})</span>
                                    {review.activeReviewer && (
                                        <span className={`text-[10px] font-normal ${review.outcomeCount >= structuredOutcomes.length ? 'text-green-400' : 'text-gray-600'}`}>
                                            {review.outcomeCount}/{structuredOutcomes.length} reviewed
                                            {review.outcomeCount >= structuredOutcomes.length && ' ✓'}
                                        </span>
                                    )}
                                </h3>
                                <div className="overflow-x-auto rounded-lg border border-gray-800">
                                    <table className="min-w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-gray-900 text-gray-500">
                                                <th className="px-2 py-1.5 text-left font-medium">Outcome</th>
                                                <th className="px-2 py-1.5 text-left font-medium">Cat.</th>
                                                <th className="px-2 py-1.5 text-right font-medium">N</th>
                                                <th className="px-2 py-1.5 text-right font-medium">Mean</th>
                                                <th className="px-2 py-1.5 text-right font-medium">SD</th>
                                                <th className="px-2 py-1.5 text-right font-medium">Effect</th>
                                                <th className="px-2 py-1.5 text-right font-medium">CI</th>
                                                <th className="px-2 py-1.5 text-right font-medium">p</th>
                                                <th className="px-2 py-1.5 text-center font-medium">Agr.</th>
                                                {review.activeReviewer && <th className="px-2 py-1.5 text-center font-medium">Rev.</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {structuredOutcomes.map((o: any, i: number) => (
                                                <tr key={i} className={`border-t border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-900/30'}`}>
                                                    <td className="px-2 py-1.5 text-gray-200 max-w-[180px] truncate" title={o.name}>{o.name}</td>
                                                    <td className="px-2 py-1.5"><span className={`text-[9px] px-1 py-0.5 rounded ${o.category === 'primary' ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-500'}`}>{o.category?.slice(0, 3)}</span></td>
                                                    <td className="px-2 py-1.5 text-right text-gray-400 font-mono">{o.arm1_n ?? o.intervention_n ?? o.arm1_total ?? o.intervention_total ?? '—'}{(o.arm2_n ?? o.control_n) ? `/${o.arm2_n ?? o.control_n}` : ''}</td>
                                                    <td className="px-2 py-1.5 text-right text-gray-300 font-mono">{(o.arm1_mean ?? o.intervention_mean) != null ? (o.arm1_mean ?? o.intervention_mean) : '—'}{(o.arm2_mean ?? o.control_mean) != null ? `/${o.arm2_mean ?? o.control_mean}` : ''}</td>
                                                    <td className="px-2 py-1.5 text-right text-gray-500 font-mono">{(o.arm1_sd ?? o.intervention_sd) != null ? `±${o.arm1_sd ?? o.intervention_sd}` : '—'}</td>
                                                    <td className="px-2 py-1.5 text-right text-white font-mono">{o.effect_size != null ? o.effect_size : '—'}</td>
                                                    <td className="px-2 py-1.5 text-right text-gray-500 font-mono">{o.ci_lower != null && o.ci_upper != null ? `[${o.ci_lower},${o.ci_upper}]` : '—'}</td>
                                                    <td className="px-2 py-1.5 text-right text-gray-400 font-mono">{o.p_value || '—'}</td>
                                                    <td className="px-2 py-1.5 text-center font-mono"><span className={`font-bold ${(o.models_reporting || 0) >= 4 ? 'text-green-400' : (o.models_reporting || 0) >= 3 ? 'text-yellow-400' : 'text-gray-600'}`}>{o.models_reporting ?? '?'}/{modelsUsed || '?'}</span></td>
                                                    {review.activeReviewer && <td className="px-2 py-1.5 text-center"><OutcomeReviewCell index={i} review={review} /></td>}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Inter-Model Agreement */}
                        {isCompleted && article.confidence_scores && (
                            <div>
                                <h3 className="text-sm font-semibold text-white mb-3">Inter-Model Agreement</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {Object.entries(article.confidence_scores).map(([field, data]) => {
                                        const isNew = data && typeof data === 'object' && 'agreement' in data
                                        const score = isNew ? data.score : (typeof data === 'number' ? data : 0)
                                        const agreement = isNew ? data.agreement : `${Math.round(score * 100)}%`
                                        const type = isNew ? data.type : 'legacy'
                                        return (
                                            <div key={field} className="p-2.5 bg-gray-900/50 rounded-lg">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-xs text-gray-500 capitalize">{field.replace(/_/g, ' ')}</p>
                                                    <div className="flex items-center gap-1.5">
                                                        {type === 'fact_verified' && <span className="text-[9px] px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded">FACT</span>}
                                                        <span className={`text-xs font-mono font-bold ${score >= 0.7 ? 'text-green-400' : score >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>{agreement}</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-gray-800 rounded-full h-0.5">
                                                    <div className={`h-0.5 rounded-full ${score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(score * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Overall Rating */}
                        {isCompleted && review.activeReviewer && (
                            <OverallScorePanel review={review} />
                        )}
                    </div>

                    {/* Sidebar toggle (when collapsed) */}
                    {isCompleted && !sidebarOpen && (
                        <button type="button" onClick={() => setSidebarOpen(true)} className="fixed right-4 top-20 z-40 p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors shadow-lg" title="Show sidebar">
                            <ChevronDoubleLeftIcon className="w-4 h-4" />
                        </button>
                    )}

                    {/* Sidebar */}
                    {isCompleted && sidebarOpen && (
                        <aside className="w-[260px] shrink-0 sticky top-16 self-start space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto pr-2">
                            <div className="flex justify-end">
                                <button type="button" onClick={() => setSidebarOpen(false)} className="p-1 text-gray-600 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Collapse sidebar">
                                    <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Metrics</h3>
                                <div className="space-y-2.5">
                                    <SidebarStat label="Cost" value={`$${(Number(article.total_cost) || 0).toFixed(4)}`} color="text-green-400" />
                                    <SidebarStat label="Duration" value={article.total_duration_ms ? formatDuration(article.total_duration_ms) : '—'} color="text-purple-400" />
                                    <SidebarStat label="Tokens" value={(Number(article.total_tokens) || 0).toLocaleString()} color="text-blue-400" />
                                    <SidebarStat label="Models (P4)" value={`${modelsUsed}`} color="text-amber-400" />
                                    <SidebarStat label="APIs" value={`${apisSuccess}/${apisTotal}`} color="text-cyan-400" />
                                    <SidebarStat label="Confidence" value={avgConfidence !== null ? `${(avgConfidence * 100).toFixed(0)}%` : '—'} color="text-orange-400" />
                                </div>
                            </div>

                            {/* Pipeline */}
                            <details className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                                <summary className="px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors list-none flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pipeline</span>
                                    <span className="text-[10px] text-gray-600">7 phases</span>
                                </summary>
                                <div className="px-4 pb-3 space-y-1.5">
                                    {phases.map(p => (
                                        <div key={p.num} className="flex items-center gap-2">
                                            <PhaseIndicator status={p.status} size="sm" />
                                            <span className="text-[11px] text-gray-400">{p.num}.</span>
                                            <span className={`text-[11px] ${p.status === 'completed' ? 'text-gray-300' : 'text-gray-600'}`}>{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            {/* Pipeline Diagram */}
                            <details className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                                <summary className="px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors list-none flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Flow Diagram</span>
                                </summary>
                                <div className="p-2">
                                    <PipelineDiagram article={article} />
                                </div>
                            </details>

                            {/* Debug JSON */}
                            <details className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                                <summary className="px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors list-none flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Debug JSON</span>
                                </summary>
                                <div className="px-3 pb-3 space-y-1">
                                    {phaseJsonData.map(phase => (
                                        <details key={phase.num}>
                                            <summary className="cursor-pointer px-2 py-1.5 bg-gray-800/50 rounded text-[11px] text-gray-400 hover:bg-gray-800 flex items-center justify-between">
                                                <span>P{phase.num}: {phase.name}</span>
                                                <span className={`text-[9px] px-1 rounded ${phase.data ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-600'}`}>{phase.data ? 'OK' : '—'}</span>
                                            </summary>
                                            <div className="mt-1 p-2 bg-gray-800/30 rounded overflow-auto max-h-48">
                                                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap">{phase.data ? JSON.stringify(phase.data, null, 2) : 'No data'}</pre>
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </details>
                        </aside>
                    )}
                </div>
            </main>
        </div>
    )
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
    const colors: Record<string, string> = {
        indigo: 'bg-indigo-500/20 text-indigo-300',
        green: 'bg-green-500/20 text-green-300',
        amber: 'bg-amber-500/20 text-amber-300',
        cyan: 'bg-cyan-500/20 text-cyan-300',
    }
    return <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${colors[color] || colors.indigo}`}>{children}</span>
}

function SidebarStat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-sm font-mono font-medium ${color}`}>{value}</span>
        </div>
    )
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    )
}

function Field({ label, value, agreement, reviewProps }: {
    label: string; value?: string; agreement?: string
    reviewProps?: { fieldKey: string; review: ReturnType<typeof useReviewPanel> }
}) {
    if (!value) return null
    const sr = reviewProps?.review.current.scientific_reviews[reviewProps?.fieldKey || '']
    const accColor = (v: string | null | undefined, good: string, mid: string) =>
        v === good ? 'bg-green-500/20 text-green-400' : v === mid ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
    const isFieldDone = sr?.accuracy && sr?.completeness && sr?.text_quality
    return (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-medium text-gray-400">{label}</p>
                {agreement && <span className="text-[9px] px-1 py-0.5 bg-gray-800 text-gray-600 rounded">{agreement}</span>}
                {sr && (sr.accuracy || sr.completeness || sr.text_quality) && (
                    <div className="flex items-center gap-1">
                        {sr.accuracy && <span className={`text-[9px] px-1 py-0.5 rounded ${accColor(sr.accuracy, 'correct', 'partial')}`}>{sr.accuracy}</span>}
                        {sr.completeness && <span className={`text-[9px] px-1 py-0.5 rounded ${accColor(sr.completeness, 'complete', 'incomplete')}`}>{sr.completeness}</span>}
                        {sr.text_quality && <span className={`text-[9px] px-1 py-0.5 rounded ${sr.text_quality === 'clean' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{sr.text_quality}</span>}
                        {isFieldDone && <span className="text-[9px] text-green-500">✓</span>}
                    </div>
                )}
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{value}</p>
            {reviewProps && <ScientificReviewBlock field={reviewProps.fieldKey} review={reviewProps.review} />}
        </div>
    )
}

function PhaseIndicator({ status, size = 'md' }: { status: string | null; size?: 'sm' | 'md' }) {
    const s = size === 'sm' ? 'w-4 h-4 text-[8px]' : 'w-6 h-6 text-xs'
    if (status === 'completed') return <div className={`${s} rounded-full bg-green-500 flex items-center justify-center text-white`}>✓</div>
    if (status === 'running') return <div className={`${s} rounded-full bg-blue-500 animate-pulse`} />
    if (status === 'failed') return <div className={`${s} rounded-full bg-red-500 flex items-center justify-center text-white`}>✗</div>
    return <div className={`${s} rounded-full bg-gray-700`} />
}
