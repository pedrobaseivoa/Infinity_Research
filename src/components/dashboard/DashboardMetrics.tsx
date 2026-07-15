'use client'

import { useMemo } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts'
import {
    CurrencyDollarIcon, DocumentTextIcon, ChartBarIcon,
    BoltIcon, CpuChipIcon, ClockIcon
} from '@heroicons/react/24/outline'
import ScreenshotButton from '@/components/ScreenshotButton'

interface Article {
    id: string
    created_at: string
    status: string
    total_cost: number
    total_tokens: number
    total_duration_ms: number | null
    phase1_cost: number
    phase3_cost: number
    phase4_cost: number
    phase5_cost: number
    phase6_cost: number
    phase1_model: string | null
    phase3_model: string | null
    phase4_models: string[] | null
    phase5_models: string[] | null
    phase6_model: string | null
    phase1_json: any
    phase3_json: any
    phase7_json: any
}

interface DashboardMetricsProps {
    articles: Article[]
}

function shortModel(name: string): string {
    const parts = name.split('/')
    return parts[parts.length - 1]
        .replace(/-\d{8,}$/, '')
        .replace(/-preview$/, '')
}

const PHASE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
const MODEL_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6']

const tooltipStyle = {
    contentStyle: { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' },
    itemStyle: { color: '#e5e7eb' },
}

export function DashboardMetrics({ articles }: DashboardMetricsProps) {
    const stats = useMemo(() => {
        const totalArticles = articles.length
        const completed = articles.filter(a => a.status === 'completed')
        const failed = articles.filter(a => a.status === 'failed')
        const totalCost = articles.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0)
        const totalTokens = articles.reduce((sum, a) => sum + (Number(a.total_tokens) || 0), 0)
        const avgCost = completed.length > 0 ? totalCost / completed.length : 0
        const finishedCount = completed.length + failed.length
        const successRate = finishedCount > 0 ? completed.length / finishedCount : 0
        const durations = completed.map(a => Number(a.total_duration_ms) || 0).filter(d => d > 0)
        const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000 : 0

        const dailyMap = new Map<string, number>()
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i)
            dailyMap.set(d.toISOString().split('T')[0], 0)
        }
        articles.forEach(a => {
            const date = new Date(a.created_at).toISOString().split('T')[0]
            if (dailyMap.has(date)) dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(a.total_cost) || 0))
        })
        const dailyData = Array.from(dailyMap.entries())
            .map(([date, amount]) => ({ date: date.slice(5), amount: Number(amount.toFixed(4)) }))

        const phaseCosts = [
            { name: 'P1 Metadata', value: 0 },
            { name: 'P3 Consensus', value: 0 },
            { name: 'P4 Extraction', value: 0 },
            { name: 'P5 Visual', value: 0 },
            { name: 'P6 Consolidation', value: 0 },
        ]
        articles.forEach(a => {
            phaseCosts[0].value += Number(a.phase1_cost) || 0
            phaseCosts[1].value += Number(a.phase3_cost) || 0
            phaseCosts[2].value += Number(a.phase4_cost) || 0
            phaseCosts[3].value += Number(a.phase5_cost) || 0
            phaseCosts[4].value += Number(a.phase6_cost) || 0
        })
        const phaseData = phaseCosts.map(p => ({ ...p, value: Number(p.value.toFixed(4)) })).filter(p => p.value > 0)

        const modelMap = new Map<string, number>()
        const addCost = (model: string | null | undefined, cost: number) => {
            if (!model) return
            const c = Number(cost) || 0; if (c === 0) return
            const short = shortModel(model)
            modelMap.set(short, (modelMap.get(short) || 0) + c)
        }
        articles.forEach(a => {
            addCost(a.phase1_model, a.phase1_cost)
            addCost(a.phase3_model, a.phase3_cost)
            addCost(a.phase6_model, a.phase6_cost)
            if (a.phase4_models?.length) {
                const perModel = (Number(a.phase4_cost) || 0) / a.phase4_models.length
                a.phase4_models.forEach(m => addCost(m, perModel))
            }
            if (a.phase5_models?.length) {
                const perModel = (Number(a.phase5_cost) || 0) / a.phase5_models.length
                a.phase5_models.forEach(m => addCost(m, perModel))
            }
        })
        const modelData = Array.from(modelMap.entries())
            .map(([name, value]) => ({ name, value: Number(value.toFixed(4)) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)

        let totalCitations = 0
        const journalMap = new Map<string, { count: number; citations: number }>()
        articles.forEach(a => {
            const meta = a.phase7_json?.output?.phase3_consensus || a.phase3_json?.output || a.phase1_json?.output || {}
            const cit = Number(meta.citations_count) || 0
            totalCitations += cit
            const journal = meta.journal
            if (journal && journal !== 'Unknown') {
                const entry = journalMap.get(journal) || { count: 0, citations: 0 }
                entry.count++; entry.citations += cit
                journalMap.set(journal, entry)
            }
        })
        const journalData = Array.from(journalMap.entries())
            .map(([name, v]) => ({ name: name.length > 25 ? name.substring(0, 25) + '...' : name, count: v.count, citations: v.citations }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)

        return {
            totalArticles, completedCount: completed.length, totalCost, totalTokens,
            avgCost, successRate, avgDuration, dailyData, phaseData, modelData,
            totalCitations, journalData,
        }
    }, [articles])

    if (stats.totalArticles === 0) return null

    return (
        <div className="space-y-6 mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPI title="Total Spending" value={`$${stats.totalCost.toFixed(2)}`} icon={CurrencyDollarIcon} color="text-blue-400" bg="bg-blue-400/10" />
                <KPI title="Avg / Paper" value={`$${stats.avgCost.toFixed(4)}`} icon={ChartBarIcon} color="text-green-400" bg="bg-green-400/10" />
                <KPI title="Articles" value={`${stats.completedCount}/${stats.totalArticles}`} icon={DocumentTextIcon} color="text-amber-400" bg="bg-amber-400/10" />
                <KPI title="Success Rate" value={stats.successRate > 0 ? `${(stats.successRate * 100).toFixed(0)}%` : '—'} icon={BoltIcon} color="text-emerald-400" bg="bg-emerald-400/10" />
                <KPI title="Avg Duration" value={stats.avgDuration > 0 ? formatDuration(stats.avgDuration) : '—'} icon={ClockIcon} color="text-purple-400" bg="bg-purple-400/10" />
                <KPI title="Total Tokens" value={formatTokens(stats.totalTokens)} icon={CpuChipIcon} color="text-cyan-400" bg="bg-cyan-400/10" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard id="chart-daily" title="Daily Spending (30d)" filename="infinity_daily_spending">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                            <YAxis stroke="#6b7280" fontSize={10} tickFormatter={v => `$${v}`} tickLine={false} axisLine={false} width={45} />
                            <Tooltip {...tooltipStyle} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, 'Cost'] as [string, string]} />
                            <Bar dataKey="amount" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard id="chart-phase" title="Cost by Phase" filename="infinity_cost_phase">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.phaseData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                            <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={v => `$${v}`} />
                            <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={11} width={110} tickLine={false} axisLine={false} />
                            <Tooltip {...tooltipStyle} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, 'Cost'] as [string, string]} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {stats.phaseData.map((_, i) => <Cell key={i} fill={PHASE_COLORS[i % PHASE_COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard id="chart-models" title="Cost by Model" filename="infinity_cost_model">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.modelData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                            <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={v => `$${v}`} />
                            <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} width={130} tickLine={false} axisLine={false} />
                            <Tooltip {...tooltipStyle} cursor={{ fill: '#1f2937' }} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, 'Cost'] as [string, string]} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {stats.modelData.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard id="chart-journals" title={`Top Journals (${stats.totalCitations} citations)`} filename="infinity_journals">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.journalData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                            <XAxis type="number" stroke="#6b7280" fontSize={10} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} width={140} tickLine={false} axisLine={false} />
                            <Tooltip {...tooltipStyle} cursor={{ fill: '#1f2937' }} />
                            <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Articles" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    )
}

function KPI({ title, value, icon: Icon, color, bg }: { title: string; value: string | number; icon: any; color: string; bg: string }) {
    return (
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-gray-500">{title}</h3>
                <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
            </div>
            <p className="text-xl font-bold text-white">{value}</p>
        </div>
    )
}

function ChartCard({ id, title, filename, children }: { id: string; title: string; filename: string; children: React.ReactNode }) {
    return (
        <div className="p-5 bg-gray-900 rounded-xl border border-gray-800" id={id}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <ScreenshotButton targetId={id} filename={filename} label="" className="!px-2 !py-1 !border-0 bg-transparent hover:bg-white/5 text-gray-500 hover:text-white" />
            </div>
            <div className="h-56 w-full">{children}</div>
        </div>
    )
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const min = Math.floor(seconds / 60)
    const sec = Math.round(seconds % 60)
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(2) + 'M'
    if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'K'
    return String(tokens)
}
