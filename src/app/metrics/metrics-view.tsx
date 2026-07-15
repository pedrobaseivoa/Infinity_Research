'use client'

import { useState, useMemo } from 'react'
import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics'
import { ApiHeatmap } from '@/components/dashboard/ApiHeatmap'

interface Folder { id: string; name: string }

interface MetricsViewProps {
    articles: any[]
    folders: Folder[]
    reviews: any[]
}

const SCIENTIFIC_FIELDS = ['methodology', 'sample_size', 'population', 'intervention', 'control', 'primary_outcomes', 'secondary_outcomes', 'main_results', 'limitations', 'conclusions', 'ethical_considerations']
const METADATA_FIELDS = ['title', 'doi', 'pmid', 'journal', 'year', 'citations_count', 'study_type', 'abstract']

export default function MetricsView({ articles, folders, reviews }: MetricsViewProps) {
    const [selectedFolder, setSelectedFolder] = useState<string>('all')

    const filteredArticles = useMemo(() => {
        if (selectedFolder === 'all') return articles
        return articles.filter(a => a.folder_id === selectedFolder)
    }, [articles, selectedFolder])

    const filteredArticleIds = new Set(filteredArticles.map(a => a.id))
    const filteredReviews = reviews.filter(r => filteredArticleIds.has(r.article_id))

    const folderCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        articles.forEach(a => { counts[a.folder_id || '_root'] = (counts[a.folder_id || '_root'] || 0) + 1 })
        return counts
    }, [articles])

    const foldersWithArticles = folders.filter(f => (folderCounts[f.id] || 0) > 0)

    const reviewStats = useMemo(() => {
        if (filteredReviews.length === 0) return null

        const finalized = filteredReviews.filter(r => r.finalized)
        const reviewedArticleIds = new Set(filteredReviews.map(r => r.article_id))
        const completedArticles = filteredArticles.filter(a => a.status === 'completed').length

        let metaCorrect = 0, metaTotal = 0
        let sciCorrect = 0, sciPartial = 0, sciTotal = 0
        let sciComplete = 0, sciIncomplete = 0, sciCompTotal = 0
        let textClean = 0, textIssues = 0
        let outCorrect = 0, outTotal = 0
        const scores: number[] = []
        const fieldAccuracy: Record<string, { correct: number; total: number }> = {}

        for (const rev of filteredReviews) {
            if (rev.overall_score) scores.push(rev.overall_score)

            const mr = rev.metadata_reviews || {}
            for (const f of METADATA_FIELDS) {
                if (mr[f]?.accuracy) {
                    metaTotal++
                    if (mr[f].accuracy === 'correct') metaCorrect++
                    if (!fieldAccuracy[f]) fieldAccuracy[f] = { correct: 0, total: 0 }
                    fieldAccuracy[f].total++
                    if (mr[f].accuracy === 'correct') fieldAccuracy[f].correct++
                }
            }

            const sr = rev.scientific_reviews || {}
            for (const f of SCIENTIFIC_FIELDS) {
                if (sr[f]?.accuracy) {
                    sciTotal++
                    if (sr[f].accuracy === 'correct') sciCorrect++
                    else if (sr[f].accuracy === 'partial') sciPartial++
                    if (!fieldAccuracy[f]) fieldAccuracy[f] = { correct: 0, total: 0 }
                    fieldAccuracy[f].total++
                    if (sr[f].accuracy === 'correct') fieldAccuracy[f].correct++
                }
                if (sr[f]?.completeness) {
                    sciCompTotal++
                    if (sr[f].completeness === 'complete') sciComplete++
                    else if (sr[f].completeness === 'incomplete') sciIncomplete++
                }
                if (sr[f]?.text_quality) {
                    if (sr[f].text_quality === 'clean') textClean++
                    else textIssues++
                }
            }

            const ors = rev.outcome_reviews || []
            for (const o of ors) {
                outTotal++
                if (o.correct) outCorrect++
            }
        }

        const worstFields = Object.entries(fieldAccuracy)
            .map(([field, { correct, total }]) => ({ field, accuracy: total > 0 ? correct / total : 1, total }))
            .filter(f => f.total >= 1)
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 5)

        return {
            totalReviews: filteredReviews.length,
            finalizedReviews: finalized.length,
            reviewedArticles: reviewedArticleIds.size,
            completedArticles,
            avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
            metadataAccuracy: metaTotal > 0 ? metaCorrect / metaTotal : null,
            scientificAccuracy: sciTotal > 0 ? sciCorrect / sciTotal : null,
            scientificCompleteness: sciCompTotal > 0 ? sciComplete / sciCompTotal : null,
            textCleanRate: (textClean + textIssues) > 0 ? textClean / (textClean + textIssues) : null,
            outcomeAccuracy: outTotal > 0 ? outCorrect / outTotal : null,
            outTotal,
            worstFields,
        }
    }, [filteredReviews, filteredArticles])

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => setSelectedFolder('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedFolder === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                    All ({articles.length})
                </button>
                {foldersWithArticles.map(f => (
                    <button key={f.id} type="button" onClick={() => setSelectedFolder(f.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors truncate max-w-[200px] ${selectedFolder === f.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title={f.name}>
                        {f.name} ({folderCounts[f.id] || 0})
                    </button>
                ))}
            </div>

            <DashboardMetrics articles={filteredArticles} />

            {reviewStats && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-white">Review Metrics</h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <ReviewKPI label="Reviewed" value={`${reviewStats.reviewedArticles}/${reviewStats.completedArticles}`} sub="articles" />
                        <ReviewKPI label="Reviews" value={`${reviewStats.finalizedReviews}/${reviewStats.totalReviews}`} sub="finalized" />
                        <ReviewKPI label="Avg Score" value={reviewStats.avgScore ? `${reviewStats.avgScore.toFixed(1)}/5` : '—'} sub="overall" />
                        <ReviewKPI label="Metadata" value={reviewStats.metadataAccuracy !== null ? `${(reviewStats.metadataAccuracy * 100).toFixed(0)}%` : '—'} sub="accuracy" color={reviewStats.metadataAccuracy !== null && reviewStats.metadataAccuracy >= 0.9 ? 'text-green-400' : 'text-amber-400'} />
                        <ReviewKPI label="Scientific" value={reviewStats.scientificAccuracy !== null ? `${(reviewStats.scientificAccuracy * 100).toFixed(0)}%` : '—'} sub="accuracy" color={reviewStats.scientificAccuracy !== null && reviewStats.scientificAccuracy >= 0.8 ? 'text-green-400' : 'text-amber-400'} />
                        <ReviewKPI label="Outcomes" value={reviewStats.outcomeAccuracy !== null ? `${(reviewStats.outcomeAccuracy * 100).toFixed(0)}%` : '—'} sub={`${reviewStats.outTotal} checked`} color={reviewStats.outcomeAccuracy !== null && reviewStats.outcomeAccuracy >= 0.8 ? 'text-green-400' : 'text-amber-400'} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quality Breakdown</h4>
                            <div className="space-y-2 text-xs">
                                {reviewStats.scientificCompleteness !== null && (
                                    <QualityBar label="Completeness" value={reviewStats.scientificCompleteness} />
                                )}
                                {reviewStats.textCleanRate !== null && (
                                    <QualityBar label="Text Quality" value={reviewStats.textCleanRate} />
                                )}
                                {reviewStats.metadataAccuracy !== null && (
                                    <QualityBar label="Metadata Accuracy" value={reviewStats.metadataAccuracy} />
                                )}
                                {reviewStats.scientificAccuracy !== null && (
                                    <QualityBar label="Scientific Accuracy" value={reviewStats.scientificAccuracy} />
                                )}
                            </div>
                        </div>

                        {reviewStats.worstFields.length > 0 && (
                            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fields with Lowest Accuracy</h4>
                                <div className="space-y-2">
                                    {reviewStats.worstFields.map(f => (
                                        <div key={f.field} className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400 capitalize">{f.field.replace(/_/g, ' ')}</span>
                                            <span className={`font-mono font-bold ${f.accuracy >= 0.8 ? 'text-green-400' : f.accuracy >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {(f.accuracy * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ApiHeatmap articles={filteredArticles} />
        </div>
    )
}

function ReviewKPI({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub: string; color?: string }) {
    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
            <p className="text-[9px] text-gray-600">{sub}</p>
        </div>
    )
}

function QualityBar({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100)
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400">{label}</span>
                <span className={`font-mono font-bold ${pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>{pct}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}
