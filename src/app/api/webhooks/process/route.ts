import { NextResponse } from 'next/server'

/**
 * DEPRECATED: This route is no longer used.
 *
 * Processing is now handled by the event-driven phase-runner:
 * /api/process/phase-runner
 *
 * This file is kept for backwards compatibility but does nothing.
 * The Supabase webhooks should point to /api/process/phase-runner instead.
 */
export async function POST(request: Request) {
    console.log('[DEPRECATED] /api/webhooks/process called - redirecting to phase-runner logic')

    // Return success but do nothing
    // The phase-runner webhook handles all processing now
    return NextResponse.json({
        message: 'This endpoint is deprecated. Use /api/process/phase-runner instead.',
        deprecated: true
    })
}

// Health check
export async function GET() {
    return NextResponse.json({
        status: 'deprecated',
        message: 'Use /api/process/phase-runner instead',
        endpoint: 'webhooks/process'
    })
}
