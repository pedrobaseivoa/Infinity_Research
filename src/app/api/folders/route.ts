import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List folders for a user
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST - Create new folder
export async function POST(request: NextRequest) {
    const { name, user_id, project_id } = await request.json();

    if (!name || !user_id) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Ensure we have a valid project_id (create default if needed, for now allow without or require one)
    // Since we don't have a UI for projects yet, maybe we associate folders with a "default" project or nullable?
    // Table definition says project_id is NOT NULL.
    // So we MUST have a project.

    // Check if a "Default Project" exists for this user, if not create one.
    let targetProjectId = project_id;

    if (!targetProjectId) {
        // Find or create default project
        const { data: projects } = await supabase
            .from('projects')
            .select('id')
            .eq('user_id', user_id)
            .limit(1);

        if (projects && projects.length > 0) {
            targetProjectId = projects[0].id;
        } else {
            // Create default project
            const { data: newProject, error: projError } = await supabase
                .from('projects')
                .insert({
                    name: 'My Research',
                    user_id: user_id
                })
                .select()
                .single();

            if (projError) {
                return NextResponse.json({ error: 'Failed to create default project' }, { status: 500 });
            }
            targetProjectId = newProject.id;
        }
    }

    const { data, error } = await supabase
        .from('folders')
        .insert({
            name,
            user_id,
            project_id: targetProjectId
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
