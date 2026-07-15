'use client'

import { useMemo } from 'react'

interface PipelineDiagramProps {
    article: any
}

function modelTag(name: string): string {
    if (!name) return name
    const parts = name.split('/')
    const raw = parts[parts.length - 1]
    return raw.replace(/-\d{8,}$/, '').replace(/-preview$/, '')
}

export default function PipelineDiagram({ article }: PipelineDiagramProps) {
    const phases = useMemo(() => {
        const p4Models = Array.isArray(article.phase4_models) && article.phase4_models.length > 0
            ? article.phase4_models.map(modelTag) : []
        const p5Models = Array.isArray(article.phase5_models) && article.phase5_models.length > 0
            ? article.phase5_models.map(modelTag) : []
        const apiStats = article.phase3_json?.api_stats

        return [
            { id: 1, label: 'Metadata', status: article.phase1_status, model: modelTag(article.phase1_model || '') },
            { id: 2, label: 'API Enrichment', status: article.phase2_status, model: apiStats ? `${apiStats.success}/${apiStats.total} APIs` : '11 APIs' },
            { id: 3, label: 'Consensus', status: article.phase3_status, model: modelTag(article.phase3_model || '') },
            { id: 4, label: 'Multi-Model Extraction', status: article.phase4_status, model: p4Models.length > 0 ? `${p4Models.length} models` : '', models: p4Models },
            { id: 5, label: 'Visual Extraction', status: article.phase5_status, model: p5Models.join(', ') },
            { id: 6, label: 'Consolidation', status: article.phase6_status, model: modelTag(article.phase6_model || '') },
            { id: 7, label: 'Final Merge', status: article.phase7_status, model: 'Deterministic' },
        ]
    }, [article])

    return (
        <div className="space-y-0.5">
            {phases.map((phase, i) => {
                const done = phase.status === 'completed'
                const active = phase.status === 'running'
                const failed = phase.status === 'failed'

                return (
                    <div key={phase.id} className="flex items-stretch gap-2">
                        <div className="flex flex-col items-center w-5 shrink-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                done ? 'bg-green-500 text-white' :
                                active ? 'bg-blue-500 text-white animate-pulse' :
                                failed ? 'bg-red-500 text-white' :
                                'bg-gray-700 text-gray-500'
                            }`}>
                                {done ? '✓' : phase.id}
                            </div>
                            {i < phases.length - 1 && (
                                <div className={`w-px flex-1 min-h-[8px] ${done ? 'bg-green-500/40' : 'bg-gray-800'}`} />
                            )}
                        </div>
                        <div className={`flex-1 pb-2 ${i < phases.length - 1 ? '' : ''}`}>
                            <div className="flex items-center gap-2">
                                <span className={`text-[11px] font-medium ${done ? 'text-gray-200' : active ? 'text-blue-300' : 'text-gray-600'}`}>{phase.label}</span>
                                {phase.model && <span className="text-[9px] text-gray-600 font-mono">{phase.model}</span>}
                            </div>
                            {phase.models && phase.models.length > 1 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {phase.models.map((m: string) => (
                                        <span key={m} className="text-[8px] px-1 py-0.5 bg-gray-800/50 text-gray-500 rounded font-mono">{m}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
