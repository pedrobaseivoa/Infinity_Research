import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE - Delete folder and all its articles
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: folder, error: fetchError } = await supabase
        .from('folders')
        .select('id, user_id')
        .eq('id', id)
        .single();

    if (fetchError || !folder || folder.user_id !== user.id) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const { data: articles } = await supabase.from('articles').select('id, pdf_storage_path, status').eq('folder_id', id);
    if (articles && articles.length > 0) {
        await supabase.from('articles').update({ status: 'failed', error_message: 'Cancelled - folder deleted' }).eq('folder_id', id).eq('status', 'processing');
        const paths = articles.map(a => a.pdf_storage_path).filter(Boolean) as string[];
        if (paths.length > 0) await supabase.storage.from('article-pdfs').remove(paths);
        await supabase.from('articles').delete().eq('folder_id', id);
    }

    const { error: deleteError } = await supabase.from('folders').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

// PATCH - Move all articles from this folder to another folder or root
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: folder, error: fetchError } = await supabase
        .from('folders')
        .select('id, user_id')
        .eq('id', id)
        .single();

    if (fetchError || !folder || folder.user_id !== user.id) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const targetFolderId = body.move_articles_to !== undefined ? body.move_articles_to : null;

    if (targetFolderId !== null) {
        const { data: targetFolder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', targetFolderId)
            .eq('user_id', user.id)
            .single();
        if (!targetFolder) {
            return NextResponse.json({ error: 'Target folder not found' }, { status: 400 });
        }
    }

    const { error: updateError } = await supabase
        .from('articles')
        .update({ folder_id: targetFolderId })
        .eq('folder_id', id)
        .eq('user_id', user.id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
