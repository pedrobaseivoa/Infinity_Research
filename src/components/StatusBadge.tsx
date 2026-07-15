
import React from 'react';

export function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        queued: 'bg-blue-500/20 text-blue-400',
        uploaded: 'bg-gray-700 text-gray-300',
        processing: 'bg-yellow-500/20 text-yellow-400',
        completed: 'bg-green-500/20 text-green-400',
        failed: 'bg-red-500/20 text-red-400',
    }

    return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.uploaded}`}>
            {status}
        </span>
    )
}
