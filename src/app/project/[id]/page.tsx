'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
    ArrowLeft, Upload, FileText, CheckCircle, XCircle, Loader2,
    Clock, X, ChevronDown, ChevronRight, Download, BarChart2, Workflow
} from 'lucide-react';
import AnalyticsPanel from './AnalyticsPanel';
import PipelineDiagram from './PipelineDiagram';

// Client-side Supabase (for Realtime)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Project {
    id: string;
    name: string;
    description: string | null;
}

interface Article {
    id: string;
    pdf_filename: string;
    status: string;
    current_phase: number;
    total_cost: number;
    phase1_json: any;
    phase2_json: any;
    phase3_json: any;
    phase4_json: any;
    phase5_json: any;
    phase6_json: any;
    phase7_json: any;
    phase1_status: string;
    phase2_status: string;
    phase3_status: string;
    phase4_status: string;
    phase5_status: string;
    phase6_status: string;
    phase7_status: string;
    phase1_duration_ms?: number;
    phase2_duration_ms?: number;
    phase3_duration_ms?: number;
    phase4_duration_ms?: number;
    phase5_duration_ms?: number;
    phase6_duration_ms?: number;
    phase7_duration_ms?: number;
    total_duration_ms?: number;
    total_tokens?: number;
    created_at: string;
}

const PHASE_NAMES = [
    'Metadata (GPT-4o)',
    'APIs (11 Academic APIs)',
    'Consensus (Llama 4 Maverick)',
    'Extraction (Gemini 3 Flash + Claude Haiku + GPT-4.1 Mini + Grok 4.1)',
    'Visual (Gemini 3.1 Pro)',
    'Consolidation (DeepSeek v3.2)',
    'Final Merge (No LLM)'
];

export default function ProjectDetailPage() {
    const params = useParams();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string[]>([]);

    // Drawer state
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [expandedPhases, setExpandedPhases] = useState<number[]>([]);
    const [activeTab, setActiveTab] = useState<'articles' | 'analytics' | 'pipeline'>('articles');

    useEffect(() => {
        if (projectId) {
            loadProject();
            loadArticles();
        }
    }, [projectId]);

    // Realtime subscription
    useEffect(() => {
        if (!projectId) return;

        const channel = supabase
            .channel(`articles-${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'articles',
                    filter: `project_id=eq.${projectId}`
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setArticles(prev => [payload.new as Article, ...prev]);
                    }
                    if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as Article;
                        setArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
                        // Also update drawer if this article is open
                        if (selectedArticle?.id === updated.id) {
                            setSelectedArticle(updated);
                        }
                    }
                    if (payload.eventType === 'DELETE') {
                        setArticles(prev => prev.filter(a => a.id !== (payload.old as any).id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [projectId, selectedArticle?.id]);

    async function loadProject() {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (data.id) setProject(data);
    }

    async function loadArticles() {
        const res = await fetch(`/api/articles?projectId=${projectId}`);
        const data = await res.json();
        if (Array.isArray(data)) setArticles(data);
        setLoading(false);
    }

    async function openDrawer(article: Article) {
        setSelectedArticle(article); // Show immediately with current data
        setDrawerOpen(true);
        setExpandedPhases([]);

        // Fetch fresh data from API to get all phase JSONs (Realtime may not include large fields)
        try {
            const res = await fetch(`/api/articles/${article.id}`);
            if (res.ok) {
                const freshArticle = await res.json();
                setSelectedArticle(freshArticle);
                // Also update in main list
                setArticles(prev => prev.map(a => a.id === freshArticle.id ? freshArticle : a));
            }
        } catch (err) {
            console.error('Error fetching article:', err);
        }
    }

    function closeDrawer() {
        setDrawerOpen(false);
        setSelectedArticle(null);
    }

    function togglePhase(num: number) {
        setExpandedPhases(prev =>
            prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
        );
    }

    function getPhaseStatus(article: Article, num: number): string {
        const key = `phase${num}_status` as keyof Article;
        return article[key] as string || 'pending';
    }

    function getPhaseJSON(article: Article, num: number): any {
        const key = `phase${num}_json` as keyof Article;
        return article[key];
    }

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setUploading(true);
        setUploadProgress([]);

        for (const file of acceptedFiles) {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                setUploadProgress(prev => [...prev, `⚠️ ${file.name}: Not a PDF`]);
                continue;
            }

            try {
                setUploadProgress(prev => [...prev, `📤 ${file.name}...`]);

                const formData = new FormData();
                formData.append('file', file);
                formData.append('projectId', projectId);

                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                if (!res.ok) throw new Error((await res.json()).error);

                const article = await res.json();
                setUploadProgress(prev => [...prev, `✅ ${file.name} uploaded`]);

                fetch('/api/process-article', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ articleId: article.id })
                }).catch(console.error);

            } catch (err: any) {
                setUploadProgress(prev => [...prev, `❌ ${file.name}: ${err.message}`]);
            }
        }
        setUploading(false);
    }, [projectId]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        disabled: uploading
    });

    function getStatusIcon(status: string, phase: number) {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'failed':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'processing':
                return (
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        <span className="text-xs text-blue-600">Phase {phase}/7</span>
                    </div>
                );
            default:
                return <Clock className="w-5 h-5 text-gray-400" />;
        }
    }

    function getTitle(article: Article) {
        const title = article.phase7_json?.output?.phase3_consensus?.title
            || article.phase3_json?.output?.title
            || article.phase1_json?.output?.title
            || article.phase1_json?.title;
        return title ? (title.length > 50 ? title.substring(0, 50) + '...' : title) : null;
    }

    function renderPhaseIcon(status: string) {
        switch (status) {
            case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'running': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            default: return <Clock className="w-4 h-4 text-gray-300" />;
        }
    }

    if (loading || !project) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="text-gray-400 hover:text-gray-600">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
                                {project.description && <p className="text-sm text-gray-500">{project.description}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>{articles.length} articles</span>
                            <span className="text-green-600">{articles.filter(a => a.status === 'completed').length} done</span>
                            <span>${articles.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0).toFixed(2)}</span>
                            {articles.filter(a => a.status === 'completed').length > 0 && (
                                <button
                                    onClick={() => {
                                        window.open(`/api/export-excel?projectId=${projectId}&t=${Date.now()}`, '_blank');
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                >
                                    <Download className="w-4 h-4" />
                                    Export Excel
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('articles')}
                        className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 font-medium transition-colors ${activeTab === 'articles'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <FileText className="w-4 h-4" />
                        Articles
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 font-medium transition-colors ${activeTab === 'analytics'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <BarChart2 className="w-4 h-4" />
                        Analytics
                    </button>
                    <button
                        onClick={() => setActiveTab('pipeline')}
                        className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 font-medium transition-colors ${activeTab === 'pipeline'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Workflow className="w-4 h-4" />
                        Pipeline
                    </button>
                </div>

                {activeTab === 'articles' ? (
                    <>
                        {/* Upload Zone */}
                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                    ${uploading ? 'opacity-50' : ''}`}
                        >
                            <input {...getInputProps()} />
                            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-600">Drag & drop PDF files here</p>
                            <p className="text-sm text-gray-400">Realtime updates enabled</p>
                        </div>

                        {/* Upload Progress */}
                        {uploadProgress.length > 0 && (
                            <div className="bg-gray-100 rounded-lg p-4 mb-6 font-mono text-sm">
                                {uploadProgress.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        )}

                        {/* Articles Table */}
                        {articles.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <p>No articles yet. Upload PDFs to get started.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">File</th>
                                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                                            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cost</th>
                                            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {articles.map((article) => (
                                            <tr key={article.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {article.pdf_filename.substring(0, 40)}{article.pdf_filename.length > 40 ? '...' : ''}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">{getStatusIcon(article.status, article.current_phase)}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{getTitle(article) || '—'}</td>
                                                <td className="px-6 py-4 text-right text-sm">${(Number(article.total_cost) || 0).toFixed(4)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => openDrawer(article)}
                                                        className="text-blue-500 hover:text-blue-700 text-sm"
                                                    >
                                                        View →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : activeTab === 'analytics' ? (
                    <AnalyticsPanel articles={articles} />
                ) : (
                    <PipelineDiagram />
                )}
            </main>

            {/* Drawer Overlay */}
            {drawerOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-40"
                    onClick={closeDrawer}
                />
            )}

            {/* Drawer Panel */}
            <div className={`fixed right-0 top-0 h-full w-[600px] bg-white shadow-xl z-50 transform transition-transform duration-300 ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedArticle && (
                    <div className="h-full flex flex-col">
                        {/* Drawer Header */}
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold text-gray-900 truncate max-w-[400px]">
                                    {selectedArticle.pdf_filename}
                                </h2>
                                <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                    <span className={selectedArticle.status === 'completed' ? 'text-green-600' : 'text-blue-600'}>
                                        {selectedArticle.status}
                                    </span>
                                    <span>${(Number(selectedArticle.total_cost) || 0).toFixed(4)}</span>
                                </div>
                            </div>
                            <button onClick={closeDrawer} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Phase Progress */}
                        <div className="px-6 py-4 border-b flex items-center gap-1">
                            {[1, 2, 3, 4, 5, 6, 7].map(num => (
                                <div key={num} className="flex items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
                    ${getPhaseStatus(selectedArticle, num) === 'completed' ? 'bg-green-100 text-green-700' :
                                            getPhaseStatus(selectedArticle, num) === 'running' ? 'bg-blue-100 text-blue-700' :
                                                getPhaseStatus(selectedArticle, num) === 'failed' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-100 text-gray-500'}`}>
                                        {num}
                                    </div>
                                    {num < 7 && <div className="w-3 h-0.5 bg-gray-200" />}
                                </div>
                            ))}
                        </div>

                        {/* Phases List */}
                        <div className="flex-1 overflow-auto p-4 space-y-2">
                            {[1, 2, 3, 4, 5, 6, 7].map(num => {
                                const status = getPhaseStatus(selectedArticle, num);
                                const json = getPhaseJSON(selectedArticle, num);
                                const isExpanded = expandedPhases.includes(num);

                                return (
                                    <div key={num} className="bg-gray-50 rounded-lg border overflow-hidden">
                                        <button
                                            onClick={() => togglePhase(num)}
                                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                {renderPhaseIcon(status)}
                                                <span className="font-medium text-sm">Phase {num}: {PHASE_NAMES[num - 1]}</span>
                                            </div>
                                            {json ? (
                                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                                            ) : (
                                                <span className="text-xs text-gray-400">No data</span>
                                            )}
                                        </button>
                                        {isExpanded && json && (
                                            <div className="p-4 bg-white border-t max-h-80 overflow-auto">
                                                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                                                    {JSON.stringify(json, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 border-t flex items-center justify-between">
                            <Link
                                href={`/article/${selectedArticle.id}`}
                                className="text-blue-500 hover:text-blue-700 text-sm"
                            >
                                Open full page →
                            </Link>
                            <button
                                onClick={() => {
                                    const blob = new Blob([JSON.stringify(selectedArticle, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `article_${selectedArticle.id}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
                            >
                                Export JSON
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
