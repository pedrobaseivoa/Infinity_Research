'use client'

import { useState } from 'react'

interface ExportJsonButtonProps {
    userId: string
    hasCompletedArticles: boolean
}

export function ExportJsonButton({ userId, hasCompletedArticles }: ExportJsonButtonProps) {
    const [isLoading, setIsLoading] = useState(false)

    const handleExport = async () => {
        if (!hasCompletedArticles) {
            alert('No completed articles to export')
            return
        }

        setIsLoading(true)
        try {
            const response = await fetch(`/api/export-json?userId=${userId}`)

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Export failed')
            }

            // Download the file
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `infinity_phase7_export_${new Date().toISOString().split('T')[0]}.json`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (error: any) {
            alert(error.message || 'Export failed')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <button
            onClick={handleExport}
            disabled={isLoading || !hasCompletedArticles}
            className={`px-4 py-2 font-medium rounded-lg transition-colors flex items-center justify-center gap-2
                ${hasCompletedArticles
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
        >
            {isLoading ? (
                <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                </>
            ) : (
                <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export JSON
                </>
            )}
        </button>
    )
}
