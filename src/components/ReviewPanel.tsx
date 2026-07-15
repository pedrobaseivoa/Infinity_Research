'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Check, X, Star, Lock, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const REVIEWERS = ['A', 'B', 'C', 'D'] as const

export const METADATA_FIELDS = ['title', 'authors', 'journal', 'year', 'doi', 'pmid', 'study_type', 'citations_count', 'abstract'] as const
export const SCIENTIFIC_FIELDS = ['methodology', 'population', 'sample_size', 'intervention', 'control', 'primary_outcomes', 'secondary_outcomes', 'main_results', 'conclusions', 'limitations', 'ethical_considerations'] as const

interface MetadataReview {
    accuracy: 'correct' | 'incorrect' | null
    correct_value?: string
}

interface ScientificReview {
    accuracy: 'correct' | 'partial' | 'incorrect' | null
    completeness: 'complete' | 'incomplete' | 'excessive' | null
    text_quality: 'clean' | 'has_issues' | null
    note?: string
}

interface OutcomeReview {
    outcome_index: number
    correct: boolean
    note?: string
}

interface ReviewData {
    id?: string
    reviewer_name: string
    finalized: boolean
    overall_score: number | null
    overall_notes: string
    metadata_reviews: Record<string, MetadataReview>
    scientific_reviews: Record<string, ScientificReview>
    outcome_reviews: OutcomeReview[]
}

const EMPTY_REVIEW = (name: string): ReviewData => ({
    reviewer_name: name, finalized: false, overall_score: null, overall_notes: '',
    metadata_reviews: {}, scientific_reviews: {}, outcome_reviews: [],
})

interface UseReviewPanelOptions {
    articleId: string
    totalMetadata?: number
    totalScientific?: number
    totalOutcomes?: number
}

export default function useReviewPanel({ articleId, totalMetadata = 9, totalScientific = 11, totalOutcomes = 0 }: UseReviewPanelOptions) {
    const supabase = useMemo(() => createClient(), [])
    const [activeReviewer, setActiveReviewer] = useState<string | null>(null)
    const [allReviews, setAllReviews] = useState<ReviewData[]>([])
    const [current, setCurrent] = useState<ReviewData>(EMPTY_REVIEW(''))
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const savingRef = useRef(false)
    const pendingRef = useRef<ReviewData | null>(null)
    const reviewIdRef = useRef<string | undefined>(undefined)
    const currentRef = useRef(current)
    currentRef.current = current

    useEffect(() => {
        const s = localStorage.getItem('infinity_reviewer')
        if (s && (REVIEWERS as readonly string[]).includes(s)) setActiveReviewer(s)
    }, [])

    const fetchReviews = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('article_reviews')
                .select('*')
                .eq('article_id', articleId)
                .order('created_at')
            if (error) throw error
            if (data) setAllReviews(data)
            return data || []
        } catch (e) {
            console.error('[ReviewPanel] fetch failed:', e)
            return []
        }
    }, [articleId, supabase])

    useEffect(() => {
        fetchReviews().then(data => {
            if (activeReviewer) {
                const mine = data.find((r: ReviewData) => r.reviewer_name === activeReviewer)
                if (mine) { setCurrent(mine); reviewIdRef.current = mine.id }
                else { setCurrent(EMPTY_REVIEW(activeReviewer)); reviewIdRef.current = undefined }
            }
        })
    }, [fetchReviews, activeReviewer])

    useEffect(() => {
        const channel = supabase
            .channel(`article-reviews-${articleId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'article_reviews',
                filter: `article_id=eq.${articleId}`
            }, (payload) => {
                fetchReviews().then(data => {
                    const reviewer = activeReviewer
                    if (!reviewer || savingRef.current || pendingRef.current) return
                    const mine = data.find((r: ReviewData) => r.reviewer_name === reviewer)
                    if (mine) { setCurrent(mine); reviewIdRef.current = mine.id }
                })
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') console.error('[ReviewPanel] Realtime channel error - ensure Realtime is enabled for article_reviews')
            })
        return () => { supabase.removeChannel(channel) }
    }, [articleId, supabase, fetchReviews, activeReviewer])

    const save = useCallback(async (review: ReviewData) => {
        if (!review.reviewer_name) return
        if (savingRef.current) { pendingRef.current = review; return }

        savingRef.current = true
        setSaving(true)
        setSaveError(null)
        try {
            const payload = {
                overall_score: review.overall_score,
                overall_notes: review.overall_notes,
                metadata_reviews: review.metadata_reviews || {},
                scientific_reviews: review.scientific_reviews || {},
                outcome_reviews: review.outcome_reviews || [],
                finalized: review.finalized || false,
                updated_at: new Date().toISOString(),
            }
            const id = review.id || reviewIdRef.current
            if (id) {
                const { error } = await supabase.from('article_reviews').update(payload).eq('id', id)
                if (error) throw error
            } else {
                const { data, error } = await supabase
                    .from('article_reviews')
                    .insert({ article_id: articleId, reviewer_name: review.reviewer_name, ...payload })
                    .select().single()
                if (error) throw error
                if (data) {
                    reviewIdRef.current = data.id
                    setCurrent(prev => ({ ...prev, id: data.id }))
                }
            }
            setLastSaved(new Date().toLocaleTimeString())
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Save failed'
            console.error('[ReviewPanel] save failed:', msg)
            setSaveError(msg)
        } finally {
            savingRef.current = false
            setSaving(false)
            if (pendingRef.current) {
                const next = pendingRef.current
                pendingRef.current = null
                save(next)
            }
        }
    }, [articleId, supabase])

    const selectReviewer = (name: string) => {
        if (activeReviewer === name) {
            setActiveReviewer(null)
            localStorage.removeItem('infinity_reviewer')
            reviewIdRef.current = undefined
            return
        }
        setActiveReviewer(name)
        localStorage.setItem('infinity_reviewer', name)
        const found = allReviews.find(r => r.reviewer_name === name)
        setCurrent(found || EMPTY_REVIEW(name))
        reviewIdRef.current = found?.id
    }

    const locked = current.finalized

    const upd = (p: Partial<ReviewData>) => {
        if (locked) return
        const u = { ...currentRef.current, ...p }
        setCurrent(u)
        currentRef.current = u
        save(u)
        setSaveError(null)
    }

    const setMetadata = (field: string, val: Partial<MetadataReview>) => {
        if (locked) return
        upd({ metadata_reviews: { ...currentRef.current.metadata_reviews, [field]: { ...currentRef.current.metadata_reviews[field], ...val } } })
    }

    const setScientific = (field: string, val: Partial<ScientificReview>) => {
        if (locked) return
        upd({ scientific_reviews: { ...currentRef.current.scientific_reviews, [field]: { ...currentRef.current.scientific_reviews[field], ...val } } })
    }

    const setOutcome = (index: number, correct: boolean | null, note?: string) => {
        if (locked) return
        let ors = currentRef.current.outcome_reviews.filter(o => o.outcome_index !== index)
        if (correct !== null) ors = [...ors, { outcome_index: index, correct, note }]
        upd({ outcome_reviews: ors })
    }

    const clear = () => {
        if (locked || !activeReviewer) return
        const empty = EMPTY_REVIEW(activeReviewer)
        empty.id = currentRef.current.id || reviewIdRef.current as string | undefined
        setCurrent(empty)
        currentRef.current = empty
        save(empty)
    }

    const metadataCount = Object.values(current.metadata_reviews).filter(r => r?.accuracy).length
    const scientificCount = Object.values(current.scientific_reviews).filter(r => r?.accuracy && r?.completeness && r?.text_quality).length
    const outcomeCount = current.outcome_reviews.length
    const hasScore = current.overall_score !== null

    const isComplete = metadataCount >= totalMetadata
        && scientificCount >= totalScientific
        && (totalOutcomes === 0 || outcomeCount >= totalOutcomes)
        && hasScore

    const finalize = () => {
        if (!isComplete || locked) return
        const u = { ...currentRef.current, finalized: true }
        setCurrent(u)
        currentRef.current = u
        save(u)
    }

    const remaining = (totalMetadata - metadataCount) + (totalScientific - scientificCount)
        + (totalOutcomes > 0 ? Math.max(0, totalOutcomes - outcomeCount) : 0)
        + (hasScore ? 0 : 1)

    return {
        activeReviewer, selectReviewer, current, allReviews,
        saving, lastSaved, saveError, locked, finalize, clear,
        isComplete, remaining,
        setMetadata, setScientific, setOutcome,
        setOverallScore: (s: number) => upd({ overall_score: s }),
        setOverallNotes: (n: string) => upd({ overall_notes: n }),
        metadataCount, scientificCount, outcomeCount,
        totalMetadata, totalScientific, totalOutcomes,
        getOutcome: (i: number) => current.outcome_reviews.find(o => o.outcome_index === i),
    }
}

// ---- UI Components ----

export function ReviewerSelector({ review }: {
    review: ReturnType<typeof useReviewPanel>
}) {
    const getState = (name: string): 'active' | 'finalized' | 'started' | 'empty' => {
        if (review.activeReviewer === name) return 'active'
        const r = review.allReviews.find(r => r.reviewer_name === name)
        if (!r) return 'empty'
        return r.finalized ? 'finalized' : 'started'
    }

    const total = review.totalMetadata + review.totalScientific + (review.totalOutcomes > 0 ? review.totalOutcomes : 0) + 1
    const done = review.metadataCount + review.scientificCount + review.outcomeCount + (review.current.overall_score !== null ? 1 : 0)

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-900/50 rounded-lg border border-gray-800 mb-4">
            <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Reviewer:</span>
                <div className="flex items-center gap-1.5">
                    {REVIEWERS.map(name => {
                        const st = getState(name)
                        return (
                            <button key={name} type="button" onClick={() => review.selectReviewer(name)}
                                className={`w-7 h-7 rounded-full text-xs font-bold transition-all relative ${
                                    st === 'active' ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1 ring-offset-gray-950' :
                                    st === 'finalized' ? 'bg-green-600 text-white hover:ring-2 hover:ring-green-400/50 hover:ring-offset-1 hover:ring-offset-gray-950 cursor-pointer' :
                                    st === 'started' ? 'bg-amber-600/40 text-amber-300 border border-amber-500/50 hover:bg-amber-600/60' :
                                    'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700 hover:text-white'
                                }`} title={`Reviewer ${name}${st === 'finalized' ? ' (done - click to view)' : st === 'started' ? ' (in progress)' : ''}`}
                            >
                                {name}
                                {st === 'finalized' && <Lock className="w-2 h-2 absolute -bottom-0.5 -right-0.5 text-green-300" />}
                            </button>
                        )
                    })}
                </div>
                {review.activeReviewer && done > 0 && (
                    <span className={`text-[10px] ${done >= total ? 'text-green-400' : 'text-gray-500'}`}>
                        {done}/{total} fields
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {review.saving && <span className="text-[10px] text-blue-400 animate-pulse">Saving...</span>}
                {review.saveError && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                        <AlertCircle className="w-3 h-3" /> {review.saveError}
                    </span>
                )}
                {review.lastSaved && !review.saving && !review.saveError && (
                    <span className="text-[10px] text-gray-600">Saved {review.lastSaved}</span>
                )}
                {review.activeReviewer && !review.locked && done > 0 && (
                    <button type="button" onClick={() => { if (window.confirm('Clear all responses for this reviewer?')) review.clear() }}
                        className="px-2.5 py-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-[10px] font-medium">
                        Clear Review
                    </button>
                )}
                {review.activeReviewer && !review.locked && (
                    <button type="button" onClick={() => {
                        if (review.isComplete) { review.finalize(); return }
                        const el = document.querySelector('[data-review-incomplete]')
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-gray-950', 'rounded')
                            setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-gray-950', 'rounded'), 2000)
                        }
                    }}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            review.isComplete
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-amber-600 hover:text-amber-400'
                        }`} title={review.isComplete ? 'Finalize review' : `${review.remaining} fields remaining - click to find`}>
                        Finalize{!review.isComplete && review.remaining > 0 ? ` (${review.remaining})` : ''}
                    </button>
                )}
                {review.activeReviewer && review.locked && (
                    <span className="flex items-center gap-1 text-[10px] text-green-400"><Lock className="w-3 h-3" /> Done</span>
                )}
            </div>
        </div>
    )
}

export function MetadataReviewInline({ field, review }: {
    field: string; review: ReturnType<typeof useReviewPanel>
}) {
    if (!review.activeReviewer) return null
    const r = review.current.metadata_reviews[field]
    const acc = r?.accuracy
    const [showInput, setShowInput] = useState(false)

    const incomplete = !acc

    return (
        <span className="inline-flex items-center gap-0.5 ml-1 relative" {...(incomplete ? { 'data-review-incomplete': 'true' } : {})}>
            {!review.locked ? (
                <>
                    <button type="button" onClick={() => review.setMetadata(field, { accuracy: 'correct' })} title="Correct"
                        className={`p-0.5 rounded ${acc === 'correct' ? 'text-green-400 bg-green-500/20' : 'text-gray-700 hover:text-green-400'}`}>
                        <Check className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => { review.setMetadata(field, { accuracy: 'incorrect' }); setShowInput(true) }} title="Incorrect"
                        className={`p-0.5 rounded ${acc === 'incorrect' ? 'text-red-400 bg-red-500/20' : 'text-gray-700 hover:text-red-400'}`}>
                        <X className="w-3 h-3" />
                    </button>
                    {acc === 'incorrect' && !showInput && r?.correct_value && (
                        <span className="text-[9px] text-red-300 bg-red-500/10 px-1 py-0.5 rounded cursor-pointer" onClick={() => setShowInput(true)}>{r.correct_value}</span>
                    )}
                </>
            ) : acc ? (
                <>
                    <span className={`text-[9px] px-1 py-0.5 rounded ${acc === 'correct' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{acc}</span>
                    {acc === 'incorrect' && r?.correct_value && <span className="text-[9px] text-red-300 px-1">({r.correct_value})</span>}
                </>
            ) : null}
            {showInput && acc === 'incorrect' && !review.locked && (
                <input type="text" autoFocus value={r?.correct_value || ''} onChange={e => review.setMetadata(field, { correct_value: e.target.value })}
                    onBlur={() => setShowInput(false)} onKeyDown={e => e.key === 'Enter' && setShowInput(false)}
                    placeholder="Correct value..." className="absolute top-full left-0 mt-1 z-20 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-white w-40 focus:outline-none focus:border-blue-500 shadow-lg" />
            )}
        </span>
    )
}

export function ScientificReviewBlock({ field, review }: {
    field: string; review: ReturnType<typeof useReviewPanel>
}) {
    if (!review.activeReviewer) return null
    const r = review.current.scientific_reviews[field]
    const incomplete = !(r?.accuracy && r?.completeness && r?.text_quality)
    const needsNote = r?.accuracy === 'incorrect' || r?.accuracy === 'partial' || r?.completeness === 'incomplete'
    const [showNote, setShowNote] = useState(false)

    return (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap text-[10px]" {...(incomplete ? { 'data-review-incomplete': 'true' } : {})}>
            {!review.locked ? (
                <>
                    <span className="text-gray-600 mr-0.5">Acc:</span>
                    {(['correct', 'partial', 'incorrect'] as const).map(v => (
                        <button key={v} type="button" onClick={() => { review.setScientific(field, { accuracy: v }); if (v !== 'correct') setShowNote(true) }}
                            className={`px-1.5 py-0.5 rounded transition-colors ${
                                r?.accuracy === v
                                    ? v === 'correct' ? 'bg-green-500/20 text-green-400' : v === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                                    : 'text-gray-600 hover:text-gray-300 bg-gray-800/50'
                            }`}>{v}</button>
                    ))}
                    <span className="text-gray-700 mx-0.5">|</span>
                    <span className="text-gray-600 mr-0.5">Comp:</span>
                    {(['complete', 'incomplete', 'excessive'] as const).map(v => (
                        <button key={v} type="button" onClick={() => { review.setScientific(field, { completeness: v }); if (v === 'incomplete') setShowNote(true) }}
                            className={`px-1.5 py-0.5 rounded transition-colors ${
                                r?.completeness === v
                                    ? v === 'complete' ? 'bg-green-500/20 text-green-400' : v === 'incomplete' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-orange-500/20 text-orange-400'
                                    : 'text-gray-600 hover:text-gray-300 bg-gray-800/50'
                            }`}>{v}</button>
                    ))}
                    <span className="text-gray-700 mx-0.5">|</span>
                    <span className="text-gray-600 mr-0.5">Text:</span>
                    <button type="button" onClick={() => review.setScientific(field, { text_quality: 'clean' })}
                        className={`px-1.5 py-0.5 rounded transition-colors ${r?.text_quality === 'clean' ? 'bg-green-500/20 text-green-400' : 'text-gray-600 hover:text-gray-300 bg-gray-800/50'}`}>clean</button>
                    <button type="button" onClick={() => review.setScientific(field, { text_quality: 'has_issues' })}
                        className={`px-1.5 py-0.5 rounded transition-colors ${r?.text_quality === 'has_issues' ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-gray-300 bg-gray-800/50'}`}>issues</button>
                </>
            ) : (
                <>
                    {r?.accuracy && <span className={`px-1.5 py-0.5 rounded ${r.accuracy === 'correct' ? 'bg-green-500/20 text-green-400' : r.accuracy === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{r.accuracy}</span>}
                    {r?.completeness && <span className={`px-1.5 py-0.5 rounded ${r.completeness === 'complete' ? 'bg-green-500/20 text-green-400' : r.completeness === 'incomplete' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-orange-500/20 text-orange-400'}`}>{r.completeness}</span>}
                    {r?.text_quality === 'has_issues' && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">text issues</span>}
                </>
            )}
            {!review.locked && needsNote && showNote && (
                <div className="flex-1 min-w-[120px] ml-1 flex items-center gap-1">
                    <input type="text" autoFocus value={r?.note || ''} onChange={e => review.setScientific(field, { note: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && setShowNote(false)}
                        placeholder="What's wrong/missing..." className="flex-1 px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] text-white focus:outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => setShowNote(false)}
                        className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-medium rounded transition-colors shrink-0">
                        OK
                    </button>
                </div>
            )}
            {!review.locked && needsNote && !showNote && (
                <span className="text-[10px] text-amber-400/80 italic ml-1 cursor-pointer hover:text-amber-300" onClick={() => setShowNote(true)}>
                    {r?.note || '+ add note'}
                </span>
            )}
            {review.locked && r?.note && (
                <span className="text-[10px] text-amber-400/80 italic ml-1">{r.note}</span>
            )}
        </div>
    )
}

export function OutcomeReviewCell({ index, review }: {
    index: number; review: ReturnType<typeof useReviewPanel>
}) {
    if (!review.activeReviewer) return null
    const o = review.getOutcome(index)
    const incomplete = o === undefined

    return (
        <div className="flex items-center gap-0.5" {...(incomplete ? { 'data-review-incomplete': 'true' } : {})}>
            {!review.locked ? (
                <>
                    <button type="button" onClick={() => review.setOutcome(index, o?.correct === true ? null : true)} title="Correct"
                        className={`p-0.5 rounded ${o?.correct === true ? 'text-green-400 bg-green-500/20' : 'text-gray-700 hover:text-green-400'}`}>
                        <Check className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => review.setOutcome(index, o?.correct === false ? null : false)} title="Incorrect"
                        className={`p-0.5 rounded ${o?.correct === false ? 'text-red-400 bg-red-500/20' : 'text-gray-700 hover:text-red-400'}`}>
                        <X className="w-3 h-3" />
                    </button>
                </>
            ) : o ? (
                <span className={`p-0.5 ${o.correct ? 'text-green-400' : 'text-red-400'}`}>
                    {o.correct ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                </span>
            ) : null}
        </div>
    )
}

export function OverallScorePanel({ review }: { review: ReturnType<typeof useReviewPanel> }) {
    if (!review.activeReviewer) return null
    const score = review.current.overall_score
    const incomplete = score === null
    return (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-4" {...(incomplete ? { 'data-review-incomplete': 'true' } : {})}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                Overall Rating
                {score !== null && <span className="text-green-400 text-[10px] font-normal">✓</span>}
            </h3>
            <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" title={`${n}/5`} onClick={() => !review.locked && review.setOverallScore(n)} disabled={review.locked}
                        className={`p-0.5 transition-colors ${score && score >= n ? 'text-amber-400' : 'text-gray-700 hover:text-amber-400'} ${review.locked ? 'cursor-default' : ''}`}>
                        <Star className="w-5 h-5" fill={score && score >= n ? 'currentColor' : 'none'} />
                    </button>
                ))}
                {score && <span className="text-xs text-gray-500 ml-1">{score}/5</span>}
            </div>
            <textarea value={review.current.overall_notes} onChange={e => !review.locked && review.setOverallNotes(e.target.value)}
                placeholder="General notes about extraction quality..." disabled={review.locked}
                className={`w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white resize-none h-20 focus:outline-none focus:border-blue-500 ${review.locked ? 'opacity-60' : ''}`} />
        </div>
    )
}
