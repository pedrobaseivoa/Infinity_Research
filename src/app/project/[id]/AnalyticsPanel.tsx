'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { TrendingUp, Clock, Coins, Zap } from 'lucide-react';

interface Article {
    id: string;
    pdf_filename: string;
    status: string;
    total_cost: number;
    phase1_json: any;
    phase3_json: any;
    phase7_json: any;
    phase1_duration_ms?: number;
    phase2_duration_ms?: number;
    phase3_duration_ms?: number;
    phase4_duration_ms?: number;
    phase5_duration_ms?: number;
    phase6_duration_ms?: number;
    phase7_duration_ms?: number;
    total_duration_ms?: number;
    total_tokens?: number;
    phase1_prompt_tokens?: number;
    phase1_completion_tokens?: number;
    phase3_prompt_tokens?: number;
    phase3_completion_tokens?: number;
    phase4_prompt_tokens?: number;
    phase4_completion_tokens?: number;
    phase5_prompt_tokens?: number;
    phase5_completion_tokens?: number;
    phase6_prompt_tokens?: number;
    phase6_completion_tokens?: number;
}

interface AnalyticsPanelProps {
    articles: Article[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AnalyticsPanel({ articles }: AnalyticsPanelProps) {
    const completedArticles = articles.filter(a => a.status === 'completed');

    if (completedArticles.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No completed articles yet. Analytics will appear here once processing is done.</p>
            </div>
        );
    }

    // Prepare cost data
    const costData = completedArticles.map(a => ({
        name: (a.phase7_json?.output?.phase3_consensus?.title || a.pdf_filename || 'Unknown').substring(0, 20) + '...',
        cost: Number(a.total_cost) || 0
    })).sort((a, b) => b.cost - a.cost);

    // Prepare duration data
    const durationData = completedArticles.map(a => ({
        name: (a.phase7_json?.output?.phase3_consensus?.title || a.pdf_filename || 'Unknown').substring(0, 20) + '...',
        duration: Number(((a.total_duration_ms || 0) / 1000).toFixed(1))
    })).sort((a, b) => b.duration - a.duration);

    // Prepare tokens data
    const tokensData = completedArticles.map(a => {
        const promptTokens = (a.phase1_prompt_tokens || 0) + (a.phase3_prompt_tokens || 0) + (a.phase4_prompt_tokens || 0) + (a.phase5_prompt_tokens || 0) + (a.phase6_prompt_tokens || 0);
        const completionTokens = (a.phase1_completion_tokens || 0) + (a.phase3_completion_tokens || 0) + (a.phase4_completion_tokens || 0) + (a.phase5_completion_tokens || 0) + (a.phase6_completion_tokens || 0);
        return {
            name: (a.phase7_json?.output?.phase3_consensus?.title || a.pdf_filename || 'Unknown').substring(0, 20) + '...',
            prompt: promptTokens,
            completion: completionTokens,
        };
    });

    // Calculate field coverage from phase3_json (consensus)
    const fields = ['title', 'authors', 'doi', 'pmid', 'year', 'journal', 'abstract', 'keywords', 'citations_count', 'open_access'];
    const apis = ['vision', 'openalex', 'crossref', 'pubmed', 'europe_pmc', 'unpaywall', 'doaj', 'arxiv'];

    const fieldCoverage = fields.map(field => {
        const coverage: any = { field };
        apis.forEach(api => {
            let count = 0;
            completedArticles.forEach(a => {
                const fieldSources = a.phase3_json?.output?.field_sources || {};
                const sources = (fieldSources[field] || '').toLowerCase();
                // Normalize API name for matching (remove _ and check variations)
                const apiNormalized = api.toLowerCase().replace(/_/g, '');
                const apiWithUnderscore = api.toLowerCase();
                // Check if sources contain the API name (with or without underscore)
                if (sources.includes(apiNormalized) || sources.includes(apiWithUnderscore)) {
                    count++;
                }
            });
            coverage[api] = Math.round((count / completedArticles.length) * 100);
        });
        return coverage;
    });

    // Summary stats
    const totalCost = completedArticles.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0);
    const avgCost = totalCost / completedArticles.length;
    const totalDuration = completedArticles.reduce((sum, a) => sum + (a.total_duration_ms || 0), 0);
    const avgDuration = totalDuration / completedArticles.length / 1000;
    const totalTokens = completedArticles.reduce((sum, a) => sum + (a.total_tokens || 0), 0);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <Coins className="w-4 h-4" />
                        Total Cost
                    </div>
                    <div className="text-2xl font-bold text-gray-900">${totalCost.toFixed(4)}</div>
                    <div className="text-xs text-gray-400">Avg: ${avgCost.toFixed(4)}/article</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <Clock className="w-4 h-4" />
                        Total Time
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{(totalDuration / 1000).toFixed(0)}s</div>
                    <div className="text-xs text-gray-400">Avg: {avgDuration.toFixed(1)}s/article</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <Zap className="w-4 h-4" />
                        Total Tokens
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{(totalTokens / 1000).toFixed(1)}k</div>
                    <div className="text-xs text-gray-400">{completedArticles.length} articles processed</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />
                        Efficiency
                    </div>
                    <div className="text-2xl font-bold text-green-600">{((totalTokens / totalCost) / 1000).toFixed(1)}k</div>
                    <div className="text-xs text-gray-400">tokens per $1</div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-2 gap-6">
                {/* Cost per Article */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-700">Cost per Article (USD)</h3>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Avg:</span>
                            <span className="font-semibold text-blue-600">${avgCost.toFixed(4)}</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={costData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v) => `$${(v as number).toFixed(4)}`} />
                            <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                                {costData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.cost > avgCost ? '#EF4444' : '#10B981'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Below avg</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500" /> Above avg</div>
                    </div>
                </div>

                {/* Duration per Article */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-700">Processing Time (seconds)</h3>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Avg:</span>
                            <span className="font-semibold text-purple-600">{avgDuration.toFixed(1)}s</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={durationData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" unit="s" />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v) => `${v}s`} />
                            <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                                {durationData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.duration > avgDuration ? '#F59E0B' : '#3B82F6'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Below avg</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-500" /> Above avg</div>
                    </div>
                </div>
            </div>

            {/* Tokens Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Token Usage per Article</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={tokensData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                        <Legend />
                        <Bar dataKey="prompt" name="Prompt Tokens" fill="#3B82F6" stackId="a" />
                        <Bar dataKey="completion" name="Completion Tokens" fill="#10B981" stackId="a" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Field Coverage Heatmap */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Field Coverage by Data Source (%)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr>
                                <th className="text-left py-2 px-3 font-medium text-gray-600">Field</th>
                                {apis.map(api => (
                                    <th key={api} className="py-2 px-3 font-medium text-gray-600 text-center capitalize">
                                        {api.replace('_', ' ')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {fieldCoverage.map((row, i) => (
                                <tr key={row.field} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                                    <td className="py-2 px-3 font-medium text-gray-700 capitalize">{row.field.replace('_', ' ')}</td>
                                    {apis.map(api => {
                                        const val = row[api] || 0;
                                        let bg = 'bg-gray-100';
                                        if (val > 80) bg = 'bg-green-500 text-white';
                                        else if (val > 50) bg = 'bg-green-300';
                                        else if (val > 20) bg = 'bg-yellow-200';
                                        else if (val > 0) bg = 'bg-orange-200';
                                        return (
                                            <td key={api} className={`py-2 px-3 text-center ${bg} transition-colors`}>
                                                {val > 0 ? `${val}%` : '-'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                    <span>Coverage:</span>
                    <span className="px-2 py-1 bg-green-500 text-white rounded">80%+</span>
                    <span className="px-2 py-1 bg-green-300 rounded">50-80%</span>
                    <span className="px-2 py-1 bg-yellow-200 rounded">20-50%</span>
                    <span className="px-2 py-1 bg-orange-200 rounded">1-20%</span>
                    <span className="px-2 py-1 bg-gray-100 rounded">0%</span>
                </div>
            </div>
        </div>
    );
}
