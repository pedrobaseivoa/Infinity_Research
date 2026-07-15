'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PdfViewerProps {
    path: string
    filename: string
}

export function PdfViewer({ path, filename }: PdfViewerProps) {
    const [url, setUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchUrl() {
            try {
                if (!path) {
                    setError('No file path provided')
                    return
                }

                // Create a signed URL valid for 1 hour
                const { data, error } = await supabase
                    .storage
                    .from('article-pdfs')
                    .createSignedUrl(path, 3600)

                if (error) throw error

                setUrl(data.signedUrl)
            } catch (err: any) {
                console.error('Error fetching PDF:', err)
                setError('Could not load PDF. It may have been deleted.')
            } finally {
                setLoading(false)
            }
        }

        fetchUrl()
    }, [path, supabase])

    if (loading) {
        return (
            <div className="w-full h-full min-h-[600px] flex items-center justify-center bg-gray-900 border border-gray-800 rounded-xl">
                <div className="animate-spin text-blue-500">Loading PDF...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="w-full h-full min-h-[600px] flex items-center justify-center bg-gray-900 border border-gray-800 rounded-xl">
                <div className="text-red-400">{error}</div>
            </div>
        )
    }

    if (!url) return null

    return (
        <div className="w-full h-[85vh] bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
            <div className="bg-gray-900 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                <span className="text-sm text-gray-400 truncate max-w-xs" title={filename}>{filename}</span>
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                >
                    Open in new tab
                </a>
            </div>
            <iframe
                src={url}
                className="w-full h-full"
                title={`PDF Viewer: ${filename}`}
            />
        </div>
    )
}
