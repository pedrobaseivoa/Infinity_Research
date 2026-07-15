'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COST_ESTIMATE_PER_ARTICLE } from '@/lib/processing/models'
import { FileText, X, Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react'

interface UploadedFile {
    file: File
    status: 'pending' | 'uploading' | 'queued' | 'error'
    error?: string
}

export default function UploadForm({ projectId, folderId, folderName }: { projectId?: string; folderId?: string; folderName?: string }) {
    const [files, setFiles] = useState<UploadedFile[]>([])
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragActive, setDragActive] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
        else if (e.type === 'dragleave') setDragActive(false)
    }, [])

    const addFiles = useCallback((newFiles: FileList | File[]) => {
        const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf')
        if (pdfs.length === 0) { setError('Please upload PDF files only'); return }
        setFiles(prev => [...prev, ...pdfs.map(file => ({ file, status: 'pending' as const }))])
        setError(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setDragActive(false)
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
    }, [addFiles])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files) }
    const removeFile = (index: number) => { setFiles(prev => prev.filter((_, i) => i !== index)) }

    const handleUpload = async () => {
        if (files.length === 0) return
        setUploading(true); setError(null)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            let targetProjectId = projectId
            if (folderId && !targetProjectId) {
                const { data: folder } = await supabase.from('folders').select('project_id').eq('id', folderId).eq('user_id', user.id).single()
                if (folder?.project_id) targetProjectId = folder.project_id
            }
            if (!targetProjectId) {
                const { data: projects } = await supabase.from('projects').select('id').eq('user_id', user.id).eq('name', 'Quick Extractions').limit(1)
                if (projects && projects.length > 0) { targetProjectId = projects[0].id }
                else {
                    const { data: newProject } = await supabase.from('projects').insert({ user_id: user.id, name: 'Quick Extractions', description: 'Default project' }).select('id').single()
                    targetProjectId = newProject?.id
                }
            }

            for (let i = 0; i < files.length; i++) {
                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))
                try {
                    const sanitizedName = files[i].file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
                    const filePath = `${user.id}/${Date.now()}-${sanitizedName}`
                    const { error: uploadError } = await supabase.storage.from('article-pdfs').upload(filePath, files[i].file)
                    if (uploadError) throw uploadError
                    const { error: insertError } = await supabase.from('articles').insert({
                        user_id: user.id, project_id: targetProjectId, folder_id: folderId || null,
                        pdf_filename: files[i].file.name, pdf_storage_path: filePath,
                        status: 'queued', queued_at: new Date().toISOString(),
                    })
                    if (insertError) throw insertError
                    setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'queued' } : f))
                } catch (err: any) {
                    setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: err.message } : f))
                }
            }
            const destination = folderId ? `/dashboard?folder=${folderId}` : '/dashboard'
            setTimeout(() => router.push(destination), 1500)
        } catch (err: any) { console.error('Upload error:', err); setError(err.message) }
        finally { setUploading(false) }
    }

    const estimatedCost = files.filter(f => f.status !== 'error').length * COST_ESTIMATE_PER_ARTICLE
    const queuedCount = files.filter(f => f.status === 'queued').length
    const pendingCount = files.filter(f => f.status === 'pending').length
    const allQueued = queuedCount === files.length && files.length > 0

    return (
        <div className="max-w-2xl mx-auto space-y-5">
            {folderId && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>Destination:</span>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded text-xs font-medium">{folderName ?? 'Selected folder'}</span>
                </div>
            )}

            {/* Drop Zone */}
            <div
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                className={`relative rounded-xl p-10 text-center transition-all cursor-pointer ${dragActive ? 'border-2 border-blue-500 bg-blue-500/5' : 'border border-dashed border-gray-700 hover:border-gray-500 bg-gray-900/30'}`}
            >
                <input type="file" accept="application/pdf" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Upload PDF files" />
                <Upload className={`w-8 h-8 mx-auto mb-3 ${dragActive ? 'text-blue-400' : 'text-gray-600'}`} />
                <p className="text-sm font-medium text-gray-200">Drop PDFs here or click to browse</p>
                <p className="text-xs text-gray-600 mt-1">Multiple files supported</p>
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                        <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                        <span>~${estimatedCost.toFixed(2)} estimated</span>
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1.5">
                        {files.map((entry, i) => (
                            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/80 hover:bg-gray-800/50 transition-colors">
                                <div className="shrink-0">
                                    {entry.status === 'pending' && <FileText className="w-4 h-4 text-gray-500" />}
                                    {entry.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                                    {entry.status === 'queued' && <CheckCircle className="w-4 h-4 text-green-400" />}
                                    {entry.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                                </div>
                                <span className="flex-1 truncate text-sm text-gray-200">{entry.file.name}</span>
                                <span className="text-[10px] text-gray-600 shrink-0">{(entry.file.size / 1024 / 1024).toFixed(1)} MB</span>
                                {entry.status === 'pending' && !uploading && (
                                    <button onClick={() => removeFile(i)} className="shrink-0 p-0.5 text-gray-600 hover:text-red-400 transition-colors" title="Remove">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {allQueued ? (
                <div className="flex items-center justify-center gap-2 py-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300 text-sm">
                    <CheckCircle className="w-4 h-4" /> All files queued. Redirecting...
                </div>
            ) : (
                <button
                    onClick={handleUpload}
                    disabled={pendingCount === 0 || uploading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                    {uploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {queuedCount}/{files.length}...</>
                    ) : (
                        <><Upload className="w-4 h-4" /> Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : ''} {files.length > 0 ? `(~$${estimatedCost.toFixed(2)})` : ''}</>
                    )}
                </button>
            )}

            <p className="text-center text-[11px] text-gray-600">
                Click <span className="text-gray-400">Start Processing</span> on dashboard after upload
                &middot; ~2-4 min/article &middot; ~${COST_ESTIMATE_PER_ARTICLE.toFixed(2)}/article
            </p>
        </div>
    )
}
