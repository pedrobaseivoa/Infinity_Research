import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List articles for a project
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST - Create new article (after file upload). Pass user_id for RLS when using anon key.
export async function POST(request: NextRequest) {
    const body = await request.json();
    const { project_id, storage_path, original_filename, file_size_bytes, user_id } = body;

    if (!project_id || !storage_path || !original_filename) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = {
        project_id,
        pdf_storage_path: storage_path,
        pdf_filename: original_filename,
        status: 'queued',
        queued_at: new Date().toISOString(),
    };
    if (user_id) insertPayload.user_id = user_id;

    const { data, error } = await supabase
        .from('articles')
        .insert(insertPayload)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
