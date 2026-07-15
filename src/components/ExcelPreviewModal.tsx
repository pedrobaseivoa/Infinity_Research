'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ExcelExportPayload } from '@/lib/export-excel-data'

const TAB_CONFIG = [
    { key: 'scientificData' as const, label: 'Scientific Data' },
    { key: 'visualCosts' as const, label: 'Visual & Costs' },
    { key: 'performance' as const, label: 'Performance' },
    { key: 'confidence' as const, label: 'Confidence & Agreement' },
    { key: 'apiEnrichment' as const, label: 'API Enrichment' },
    { key: 'metaAnalysis' as const, label: 'Meta-Analysis Data' },
] as const

type TabKey = (typeof TAB_CONFIG)[number]['key']

function cellDisplay(value: string | number): string {
    if (value === null || value === undefined) return ''
    return String(value)
}

interface ExcelPreviewModalProps {
    open: boolean
    onClose: () => void
    userId: string
    currentFolderId?: string | null
}

export function ExcelPreviewModal({ open, onClose, userId, currentFolderId }: ExcelPreviewModalProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('scientificData')
    const [payload, setPayload] = useState<ExcelExportPayload | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) setActiveTab('scientificData')
    }, [open])

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true)
        setError(null)
        setPayload(null)

        const params = new URLSearchParams()
        params.set('userId', userId)
        params.set('format', 'json')
        if (currentFolderId) {
            params.set('folderId', currentFolderId)
        }

        fetch(`/api/export-excel?${params.toString()}`)
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}))
                    throw new Error(body.error || 'Failed to load preview')
                }
                return res.json() as Promise<ExcelExportPayload>
            })
            .then((data) => { if (!cancelled) setPayload(data) })
            .catch((e: Error) => { if (!cancelled) setError(e.message || 'Failed to load preview') })
            .finally(() => { if (!cancelled) setLoading(false) })

        return () => { cancelled = true }
    }, [open, userId, currentFolderId])

    const handleEscape = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }, [onClose])

    useEffect(() => {
        if (!open) return
        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [open, handleEscape])

    if (!open) return null

    const sheet = payload?.sheets[activeTab]

    const isWideSheet = activeTab === 'scientificData' || activeTab === 'apiEnrichment' || activeTab === 'metaAnalysis'

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div role="dialog" aria-modal="true" className="relative z-[101] flex max-h-[90vh] w-full max-w-[min(96rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-zinc-600 bg-zinc-900 shadow-2xl">
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-700 bg-zinc-950 px-4 py-3">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Excel preview</h2>
                        {payload && <p className="text-sm text-zinc-400">{payload.articleCount} completed article{payload.articleCount !== 1 ? 's' : ''}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <nav className="flex shrink-0 flex-wrap gap-1 border-b border-zinc-700 bg-zinc-900 px-2 py-2">
                    {TAB_CONFIG.map((tab) => (
                        <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="flex-1 overflow-auto">
                    {loading && (
                        <div className="flex items-center justify-center py-16 text-zinc-400">
                            <svg className="mr-2 h-8 w-8 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Loading...
                        </div>
                    )}
                    {error && !loading && (
                        <div className="m-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">{error}</div>
                    )}
                    {!loading && !error && sheet && (
                        <table className="w-max border-collapse text-left text-[11px] text-zinc-200">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-blue-900">
                                    {sheet.headers.map((h, i) => (
                                        <th key={i} className="whitespace-nowrap border-b border-r border-zinc-600 px-3 py-2 font-semibold text-white">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sheet.rows.map((row, ri) => {
                                    const isTotals = activeTab === 'visualCosts' && row.length > 0 && String(row[0]) === 'TOTAL'
                                    return (
                                        <tr key={ri} className={isTotals ? 'bg-sky-950 font-semibold text-white' : ri % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/30'}>
                                            {row.map((cell, ci) => {
                                                let cellClass = 'whitespace-nowrap'
                                                if (activeTab === 'scientificData') {
                                                    if (ci === 0) cellClass = 'max-w-[220px] whitespace-pre-wrap break-words'
                                                    else if (ci === 1) cellClass = 'max-w-[160px] whitespace-pre-wrap break-words'
                                                    else if (ci === 5) cellClass = 'max-w-[120px] whitespace-pre-wrap break-words'
                                                    else if (ci === 7) cellClass = 'max-w-[800px] min-w-[500px] whitespace-pre-wrap break-words'
                                                    else if (ci >= 12) cellClass = 'max-w-[400px] whitespace-pre-wrap break-words'
                                                    else if (ci >= 6) cellClass = 'max-w-[200px] whitespace-pre-wrap break-words'
                                                } else if (isWideSheet && ci > 0) {
                                                    cellClass = 'max-w-[320px] whitespace-pre-wrap break-words'
                                                }
                                                return (
                                                    <td key={ci} className={`border-b border-r border-zinc-800 px-3 py-1.5 align-top ${cellClass}`}>
                                                        {cellDisplay(cell)}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
