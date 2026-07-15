'use client'

import { useState } from 'react'
import { useProcessingQueue } from '@/hooks/useProcessingQueue'
import { PIPELINE_CONFIG } from '@/lib/processing/models'
import { Play, Square, Info, X, Clock } from 'lucide-react'

function shortModel(m: string): string {
    const parts = m.split('/')
    return parts[parts.length - 1].replace(/-\d{8,}$/, '').replace(/-preview$/, '')
}

const PIPELINE_MODELS = {
    p1: shortModel(PIPELINE_CONFIG.phases[1].model),
    p3: shortModel(PIPELINE_CONFIG.phases[3].model),
    p4: [...PIPELINE_CONFIG.phases[4].models].map(shortModel),
    p5: shortModel(PIPELINE_CONFIG.phases[5].model),
    p6: shortModel(String(PIPELINE_CONFIG.phases[6].model)),
}

export default function QueueProgress({ userId, folderId }: { userId: string; folderId: string | null }) {
    const queue = useProcessingQueue(userId, folderId)
    const [showInfo, setShowInfo] = useState(false)

    const hasQueued = queue.queued > 0
    const hasProcessing = queue.processing > 0
    const hasWork = hasQueued || hasProcessing

    if (!hasWork && !queue.isRunning) return null

    const slotsUsed = queue.globalProcessing
    const otherProcessing = slotsUsed - queue.processing
    const isWaiting = queue.isRunning && hasQueued && !hasProcessing && slotsUsed >= 3

    return (
        <>
            <div className={`border rounded-xl p-4 mb-4 ${queue.isRunning ? 'bg-gray-900/80 border-gray-800' : hasQueued ? 'bg-blue-950/30 border-blue-500/40' : 'bg-gray-900/80 border-gray-800'}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        {hasProcessing && <div className="shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                        {isWaiting && <Clock className="w-4 h-4 text-amber-400 shrink-0" />}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                                {hasProcessing && <span className="text-blue-400 font-medium">{queue.processing} processing</span>}
                                {isWaiting && <span className="text-amber-400 text-xs">waiting ({otherProcessing} in other folders)</span>}
                                {hasQueued && <span className="text-gray-400">{queue.queued} in queue</span>}
                                {queue.completed > 0 && <span className="text-green-400/60 text-xs">{queue.completed} done</span>}
                                {queue.failed > 0 && <span className="text-red-400 text-xs">{queue.failed} failed</span>}
                                {slotsUsed > 0 && <span className="text-gray-600 text-[10px]">{slotsUsed}/3 slots</span>}
                            </div>
                            {hasQueued && !queue.isRunning && <p className="text-xs text-gray-600 mt-0.5">~${queue.estimatedCost.toFixed(2)} estimated</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {!queue.isRunning && hasQueued && !hasProcessing && (
                            <>
                                <button type="button" onClick={() => setShowInfo(true)} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="View pipeline details">
                                    <Info className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={queue.startQueue} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                                    <Play className="w-3.5 h-3.5" />
                                    Start ({queue.queued})
                                </button>
                            </>
                        )}
                        {queue.isRunning && (
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setShowInfo(true)} className="p-1 text-gray-600 hover:text-white transition-colors" title="View pipeline">
                                    <Info className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={queue.stopQueue} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-medium rounded-lg transition-colors border border-red-500/30">
                                    <Square className="w-3 h-3" /> Stop
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {queue.total > 0 && (queue.isRunning || hasProcessing) && (
                    <div className="w-full bg-gray-800 rounded-full h-1 mt-3 overflow-hidden">
                        <div className="flex h-full">
                            <div className="bg-green-500 transition-all duration-500" style={{ width: `${(queue.completed / queue.total) * 100}%` }} />
                            <div className="bg-blue-500 transition-all duration-500" style={{ width: `${(queue.processing / queue.total) * 100}%` }} />
                            {queue.failed > 0 && <div className="bg-red-500 transition-all duration-500" style={{ width: `${(queue.failed / queue.total) * 100}%` }} />}
                        </div>
                    </div>
                )}
            </div>

            {showInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInfo(false)} aria-label="Close" />
                    <div className="relative z-[101] w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700">
                            <h3 className="text-sm font-semibold text-white">Pipeline (v{PIPELINE_CONFIG.version})</h3>
                            <button type="button" title="Close" onClick={() => setShowInfo(false)} className="p-1 text-zinc-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-5 gap-2 text-[10px]">
                                <div><span className="text-gray-600 block mb-0.5">P1 Metadata</span><span className="text-gray-300">{PIPELINE_MODELS.p1}</span></div>
                                <div><span className="text-gray-600 block mb-0.5">P3 Consensus</span><span className="text-gray-300">{PIPELINE_MODELS.p3}</span></div>
                                <div><span className="text-gray-600 block mb-0.5">P4 Extraction</span><div className="space-y-0.5">{PIPELINE_MODELS.p4.map((model, i) => <span key={i} className="block text-gray-300">{model}</span>)}</div></div>
                                <div><span className="text-gray-600 block mb-0.5">P5 Visual</span><span className="text-gray-300">{PIPELINE_MODELS.p5}</span></div>
                                <div><span className="text-gray-600 block mb-0.5">P6 Consolidation</span><span className="text-gray-300">{PIPELINE_MODELS.p6}</span></div>
                            </div>
                            <p className="text-[11px] text-gray-600 mt-4">Phase 2 enriches metadata from 11 scholarly APIs. Phase 7 merges everything deterministically.</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
