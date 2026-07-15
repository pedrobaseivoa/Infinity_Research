'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, FolderPlus, Folder, ArrowRight, ChevronLeft, FileText, MoreVertical, FolderInput, Download, Upload, Eye, CheckSquare, Square, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, CalendarArrowUp, CalendarArrowDown } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal';
import { createClient } from '@/lib/supabase/client';
import QueueProgress from '@/components/dashboard/QueueProgress';

interface Article {
    id: string;
    pdf_filename: string;
    created_at: string;
    status: string;
    total_cost: number;
    total_tokens?: number | null;
    current_phase?: number | null;
    phase1_json?: any;
    phase7_json?: any;
    folder_id?: string | null;
    pipeline_config?: string | null;
}

interface Folder {
    id: string;
    name: string;
    project_id?: string;
}

interface ArticlesManagerProps {
    initialArticles: Article[];
    initialFolders: Folder[];
    userId: string;
    isDemo: boolean;
    initialFolderId?: string | null;
    articleReviews?: { article_id: string; reviewer_name: string; finalized: boolean }[];
}

export default function ArticlesManager({ initialArticles, initialFolders, userId, isDemo, initialFolderId = null, articleReviews = [] }: ArticlesManagerProps) {
    const router = useRouter();
    const supabase = createClient();

    const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId ?? null);
    useEffect(() => { setCurrentFolderId(initialFolderId ?? null); }, [initialFolderId]);

    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
    const [moveMenuArticleId, setMoveMenuArticleId] = useState<string | null>(null);
    const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
    const [previewOpen, setPreviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'alpha-asc' | 'alpha-desc'>('date-desc');
    const [sortMenuOpen, setSortMenuOpen] = useState(false);

    const showFolders = currentFolderId === null;
    const getArticleTitle = (a: Article) => a.phase1_json?.output?.title || a.pdf_filename || 'Untitled';
    const unsortedArticles = initialArticles.filter(a => currentFolderId === null ? !a.folder_id : a.folder_id === currentFolderId);
    const visibleArticles = [...unsortedArticles].sort((a, b) => {
        switch (sortBy) {
            case 'alpha-asc': return getArticleTitle(a).localeCompare(getArticleTitle(b));
            case 'alpha-desc': return getArticleTitle(b).localeCompare(getArticleTitle(a));
            case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            case 'date-desc':
            default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
    });
    const currentFolder = initialFolders.find(f => f.id === currentFolderId);
    const hasCompleted = currentFolderId ? visibleArticles.some(a => a.status === 'completed') : initialArticles.some(a => a.status === 'completed');

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        try {
            const res = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFolderName, user_id: userId }) });
            if (res.ok) { setNewFolderName(''); setIsCreatingFolder(false); router.refresh(); }
        } catch (error) { console.error('Failed to create folder', error); }
    };

    const handleDeleteArticle = async (articleId: string) => {
        if (isDemo) { alert('Deletion is disabled for this demonstration account.'); return; }
        if (!confirm('Are you sure you want to delete this article?')) return;
        setIsDeleting(articleId);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/articles/${articleId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` } });
            if (!res.ok) { const data = await res.json(); alert(data.error || 'Failed to delete'); } else { router.refresh(); }
        } catch { alert('Error deleting article'); } finally { setIsDeleting(null); }
    };

    const handleMoveArticle = async (articleId: string, targetFolderId: string | null) => {
        setMoveMenuArticleId(null);
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`/api/articles/${articleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ folder_id: targetFolderId }) });
        router.refresh();
    };

    const handleMoveAllArticles = async (folderId: string, targetFolderId: string | null) => {
        if (isDemo) return;
        setFolderMenuOpen(null);
        try {
            const res = await fetch(`/api/folders/${folderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move_articles_to: targetFolderId }) });
            if (res.ok) router.refresh(); else alert((await res.json()).error || 'Failed');
        } catch { alert('Failed to move articles'); }
    };

    const handleBulkDelete = async () => {
        if (isDemo || selectedArticles.size === 0) return;
        if (!confirm(`Delete ${selectedArticles.size} article${selectedArticles.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
        const { data: { session } } = await supabase.auth.getSession();
        for (const artId of selectedArticles) {
            await fetch(`/api/articles/${artId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` } }).catch(() => {});
        }
        setSelectedArticles(new Set());
        router.refresh();
    };

    const toggleSelect = (id: string) => {
        setSelectedArticles(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    };

    const toggleSelectAll = () => {
        if (selectedArticles.size === visibleArticles.length) setSelectedArticles(new Set());
        else setSelectedArticles(new Set(visibleArticles.map(a => a.id)));
    };

    const handleDeleteFolder = async (folderId: string) => {
        if (isDemo) return;
        const count = initialArticles.filter(a => a.folder_id === folderId).length;
        if (!confirm(`Delete this folder and ${count} article${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
        setDeletingFolderId(folderId);
        setFolderMenuOpen(null);
        try {
            const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
            if (res.ok) { setCurrentFolderId(prev => prev === folderId ? null : prev); router.refresh(); }
            else { alert((await res.json()).error || 'Failed'); }
        } catch { alert('Failed to delete folder'); } finally { setDeletingFolderId(null); }
    };

    const handleExport = async (format: 'xlsx' | 'json') => {
        setExportMenuOpen(false);
        setIsExporting(true);
        try {
            const params = new URLSearchParams({ userId });
            if (currentFolderId) params.set('folderId', currentFolderId);
            if (format === 'json') {
                const res = await fetch(`/api/export-json?${params.toString()}`);
                if (!res.ok) throw new Error('Export failed');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `infinity_export.json`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
            } else {
                const res = await fetch(`/api/export-excel?${params.toString()}`);
                if (!res.ok) throw new Error('Export failed');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `infinity_export_${new Date().toISOString().split('T')[0]}.xlsx`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
            }
        } catch (err: any) { alert(err.message || 'Export failed'); } finally { setIsExporting(false); }
    };

    const folderArticleCount = (folderId: string) => initialArticles.filter(a => a.folder_id === folderId).length;
    const folderCompletedCount = (folderId: string) => initialArticles.filter(a => a.folder_id === folderId && a.status === 'completed').length;
    const getArticleReviewers = (artId: string) => articleReviews.filter(r => r.article_id === artId)
    const reviewedArticleIds = new Set(articleReviews.map(r => r.article_id))
    const folderReviewedCount = (folderId: string) => initialArticles.filter(a => a.folder_id === folderId && reviewedArticleIds.has(a.id)).length;

    return (
        <div className="space-y-4">
            {!isDemo && <QueueProgress userId={userId} folderId={currentFolderId} />}

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {currentFolderId ? (
                        <>
                            <button type="button" title="Back" onClick={() => { setCurrentFolderId(null); setSelectedArticles(new Set()); }} className="shrink-0 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <h2 className="text-base font-semibold text-white truncate">{currentFolder?.name || 'Folder'}</h2>
                            <span className="text-xs text-gray-600 shrink-0">{visibleArticles.length} items</span>
                        </>
                    ) : (
                        <h2 className="text-base font-semibold text-white">All Files</h2>
                    )}
                    {selectedArticles.size > 0 && (
                        <button type="button" onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-medium rounded-lg transition-colors border border-red-500/30 ml-2">
                            <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedArticles.size})
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {!isDemo && (
                        <Link
                            href={currentFolderId && currentFolder ? `/upload?folderId=${currentFolderId}&projectId=${currentFolder.project_id ?? ''}` : '/upload'}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Upload
                        </Link>
                    )}

                    {hasCompleted && (
                        <>
                            <button
                                type="button"
                                onClick={() => setPreviewOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 text-xs rounded-lg transition-colors border border-gray-800"
                                title="Preview data"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                            </button>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                                    disabled={isExporting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 text-xs rounded-lg transition-colors border border-gray-800"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {isExporting ? 'Exporting...' : 'Export'}
                                </button>
                                {exportMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-20">
                                            <button type="button" onClick={() => handleExport('xlsx')} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2">
                                                <Download className="w-3.5 h-3.5" /> Excel (.xlsx)
                                            </button>
                                            <button type="button" onClick={() => handleExport('json')} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2">
                                                <Download className="w-3.5 h-3.5" /> JSON
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {!isDemo && showFolders && !isCreatingFolder && (
                        <button onClick={() => setIsCreatingFolder(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg text-xs transition-colors">
                            <FolderPlus className="w-3.5 h-3.5" />
                        <span className="sr-only">New Folder</span></button>
                    )}
                    {isCreatingFolder && (
                        <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                            <input type="text" placeholder="Folder name" className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 w-28" autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} />
                            <button type="submit" className="text-green-400 hover:text-green-300 text-xs">Save</button>
                            <button type="button" onClick={() => setIsCreatingFolder(false)} className="text-gray-600 hover:text-gray-400 text-xs">Cancel</button>
                        </form>
                    )}
                </div>
            </div>

            {/* Folders */}
            {!isDemo && showFolders && initialFolders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {initialFolders.map(folder => {
                        const total = folderArticleCount(folder.id);
                        const completed = folderCompletedCount(folder.id);
                        return (
                            <div key={folder.id} className="group relative flex items-center gap-3 px-3 py-2.5 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-gray-600 cursor-pointer transition-all" onClick={() => setCurrentFolderId(folder.id)}>
                                <Folder className="w-4 h-4 shrink-0 text-blue-500/60 group-hover:text-blue-400 transition-colors" />
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm text-gray-300 group-hover:text-white truncate">{folder.name}</h3>
                                </div>
                                <span className="text-[11px] text-gray-600 shrink-0">
                                    {total}{completed > 0 ? ` · ${completed} done` : ''}
                                    {folderReviewedCount(folder.id) > 0 && <span className="text-green-400/60"> · {folderReviewedCount(folder.id)} reviewed</span>}
                                </span>
                                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                    <div className="relative">
                                        <button type="button" title="Folder options" className="p-1 text-gray-600 hover:text-white hover:bg-gray-800 rounded" onClick={() => setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id)} disabled={!!deletingFolderId}>
                                            <MoreVertical className="w-3.5 h-3.5" />
                                        </button>
                                        {folderMenuOpen === folder.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setFolderMenuOpen(null)} />
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-20">
                                                    <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">Move all to</div>
                                                    <button type="button" className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2" onClick={() => handleMoveAllArticles(folder.id, null)}>
                                                        <FolderInput className="w-3 h-3" /> Root
                                                    </button>
                                                    {initialFolders.filter(f => f.id !== folder.id).map(f => (
                                                        <button key={f.id} type="button" className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2" onClick={() => handleMoveAllArticles(folder.id, f.id)}>
                                                            <Folder className="w-3 h-3" /> {f.name}
                                                        </button>
                                                    ))}
                                                    <div className="border-t border-gray-700 my-0.5" />
                                                    <button type="button" className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2" onClick={() => handleDeleteFolder(folder.id)} disabled={deletingFolderId === folder.id}>
                                                        <Trash2 className="w-3 h-3" /> {deletingFolderId === folder.id ? 'Deleting...' : 'Delete'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Articles */}
            {visibleArticles.length === 0 && !showFolders ? (
                <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl text-gray-600">
                    <FileText className="w-6 h-6 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">Empty folder</p>
                </div>
            ) : visibleArticles.length === 0 && showFolders && initialFolders.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl text-gray-600">
                    <FileText className="w-6 h-6 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">No articles yet</p>
                    {!isDemo && <p className="text-xs text-gray-700 mt-1">Upload PDFs to get started</p>}
                </div>
            ) : (
                <div className="space-y-1">
                    {visibleArticles.length > 1 && (
                        <div className="flex items-center gap-2 px-3 py-1">
                            {!isDemo && (
                                <>
                                    <button type="button" onClick={toggleSelectAll} className="p-0.5 text-gray-600 hover:text-white transition-colors" title={selectedArticles.size === visibleArticles.length ? 'Deselect all' : 'Select all'}>
                                        {selectedArticles.size === visibleArticles.length ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                                    </button>
                                    <span className="text-[10px] text-gray-600">Select all</span>
                                </>
                            )}
                            <div className="ml-auto relative">
                                <button type="button" onClick={() => setSortMenuOpen(v => !v)} className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md text-[11px] transition-colors" title="Sort articles">
                                    <ArrowUpDown className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">
                                        {sortBy === 'date-desc' ? 'Newest' : sortBy === 'date-asc' ? 'Oldest' : sortBy === 'alpha-asc' ? 'A → Z' : 'Z → A'}
                                    </span>
                                </button>
                                {sortMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
                                        <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-20">
                                            <button type="button" onClick={() => { setSortBy('alpha-asc'); setSortMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${sortBy === 'alpha-asc' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                <ArrowDownAZ className="w-3.5 h-3.5" /> A → Z
                                            </button>
                                            <button type="button" onClick={() => { setSortBy('alpha-desc'); setSortMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${sortBy === 'alpha-desc' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                <ArrowUpAZ className="w-3.5 h-3.5" /> Z → A
                                            </button>
                                            <div className="border-t border-gray-700 my-0.5" />
                                            <button type="button" onClick={() => { setSortBy('date-desc'); setSortMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${sortBy === 'date-desc' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                <CalendarArrowDown className="w-3.5 h-3.5" /> Newest first
                                            </button>
                                            <button type="button" onClick={() => { setSortBy('date-asc'); setSortMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${sortBy === 'date-asc' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                <CalendarArrowUp className="w-3.5 h-3.5" /> Oldest first
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {visibleArticles.map((article) => {
                        const title = getArticleTitle(article);
                        const cost = Number(article.total_cost) || 0;
                        const isSelected = selectedArticles.has(article.id);
                        const authors = article.phase7_json?.output?.phase3_consensus?.authors || article.phase1_json?.output?.authors;
                        const authorsText = authors ? (Array.isArray(authors) ? authors.join(', ') : String(authors)) : null;
                        return (
                            <div key={article.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isSelected ? 'bg-blue-950/30' : 'hover:bg-gray-900/80'}`}>
                                {!isDemo && (
                                    <button type="button" onClick={() => toggleSelect(article.id)} className="p-0.5 text-gray-600 hover:text-white transition-colors shrink-0 self-start mt-1" title="Select">
                                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                    </button>
                                )}
                                <Link href={currentFolderId ? `/article/${article.id}?from=folder&folder=${currentFolderId}` : `/article/${article.id}`} className="flex-1 min-w-0 flex items-center gap-2.5">
                                    <FileText className="w-4 h-4 text-gray-600 shrink-0 self-start mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate">{title}</span>
                                            <span className="text-[11px] text-gray-700 shrink-0 hidden sm:inline">{new Date(article.created_at).toLocaleDateString()}</span>
                                            {cost > 0 && <span className="text-[11px] text-gray-700 shrink-0">${cost.toFixed(2)}</span>}
                                        </div>
                                        {authorsText && (
                                            <p className="text-[11px] text-gray-600 truncate mt-0.5">{authorsText}</p>
                                        )}
                                    </div>
                                    {article.status === 'processing' && article.current_phase && (
                                        <span className="text-[10px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded shrink-0">Phase {article.current_phase}/7</span>
                                    )}
                                    {article.status === 'completed' && (article.pipeline_config || article.phase7_json?.output?._processing?.config_name) && (
                                        <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded shrink-0">
                                            {(article.pipeline_config || article.phase7_json?.output?._processing?.config_name || 'default').replace(/_/g, ' ')}
                                        </span>
                                    )}
                                    {getArticleReviewers(article.id).length > 0 && (
                                        <span className="inline-flex items-center gap-0.5 shrink-0">
                                            {getArticleReviewers(article.id).map(r => (
                                                <span key={r.reviewer_name} className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ${r.finalized ? 'bg-green-600 text-white' : 'bg-amber-600/40 text-amber-300'}`} title={`${r.reviewer_name}${r.finalized ? ' (finalized)' : ' (in progress)'}`}>
                                                    {r.reviewer_name}
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                    <StatusBadge status={article.status} />
                                </Link>
                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!isDemo && (
                                        <div className="relative">
                                            <button type="button" onClick={e => { e.preventDefault(); setMoveMenuArticleId(prev => prev === article.id ? null : article.id); }} className="p-1 text-gray-600 hover:text-white hover:bg-gray-800 rounded" title="Move">
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                            {moveMenuArticleId === article.id && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setMoveMenuArticleId(null)} />
                                                    <div className="absolute right-0 bottom-full mb-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-20">
                                                        <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">Move to</div>
                                                        {currentFolderId !== null && <button type="button" onClick={() => handleMoveArticle(article.id, null)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">Root</button>}
                                                        {initialFolders.filter(f => f.id !== currentFolderId).map(f => (
                                                            <button key={f.id} type="button" onClick={() => handleMoveArticle(article.id, f.id)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">{f.name}</button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <button onClick={() => handleDeleteArticle(article.id)} disabled={isDeleting === article.id} className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors" title="Delete">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ExcelPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} userId={userId} currentFolderId={currentFolderId} />
        </div>
    );
}
