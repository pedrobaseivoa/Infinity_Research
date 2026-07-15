'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { ExcelPreviewModal } from '@/components/ExcelPreviewModal'

interface ExportExcelButtonProps {
    userId: string
    hasCompletedArticles: boolean
    currentFolderId?: string | null
}

export function ExportExcelButton({ userId, hasCompletedArticles, currentFolderId }: ExportExcelButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)

    const handleExport = async () => {
        if (!hasCompletedArticles) {
            alert('No completed articles to export')
            return
        }

        setIsLoading(true)
        try {
            const params = new URLSearchParams()
            params.set('userId', userId)
            if (currentFolderId) {
                params.set('folderId', currentFolderId)
            }

            const response = await fetch(`/api/export-excel?${params.toString()}`)

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Export failed')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `infinity_export_${new Date().toISOString().split('T')[0]}.xlsx`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Export failed'
            alert(message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    disabled={!hasCompletedArticles}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
                        hasCompletedArticles
                            ? 'border border-zinc-500 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                            : 'cursor-not-allowed border border-zinc-700 bg-zinc-900 text-zinc-500'
                    }`}
                    title="Preview export in browser"
                >
                    <Eye className="h-4 w-4" />
                    View Excel
                </button>
                <button
                    type="button"
                    onClick={handleExport}
                    disabled={isLoading || !hasCompletedArticles}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
                        hasCompletedArticles
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'cursor-not-allowed bg-gray-700 text-gray-400'
                    }`}
                >
                    {isLoading ? (
                        <>
                            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            Exporting...
                        </>
                    ) : (
                        <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export Excel
                        </>
                    )}
                </button>
            </div>

            <ExcelPreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                userId={userId}
                currentFolderId={currentFolderId}
            />
        </>
    )
}
