import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client (Service Role for Storage/DB write access)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const projectId = formData.get('projectId') as string;

        if (!file || !projectId) {
            return NextResponse.json({ error: 'Missing file or projectId' }, { status: 400 });
        }

        console.log(`[Ingest] uploading: ${file.name} (Project: ${projectId})`);

        // 1. Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const filePath = `${projectId}/pdfs/${crypto.randomUUID()}.${fileExt}`;

        const { error: storageError } = await supabaseAdmin
            .storage
            .from('article-pdfs')
            .upload(filePath, file);

        if (storageError) {
            console.error('Storage Error:', storageError);
            throw new Error(`Storage Upload Failed: ${storageError.message}`);
        }

        // 2. Create DB Record
        const { data: docData, error: docError } = await supabaseAdmin
            .from('articles')
            .insert({
                project_id: projectId,
                pdf_filename: file.name,
                pdf_storage_path: filePath,
                status: 'queued',
                queued_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (docError) {
            console.error('DB Error:', docError);
            throw new Error(`DB Insert Failed: ${docError.message}`);
        }

        return NextResponse.json({
            success: true,
            documentId: docData.id,
            message: "File uploaded successfully."
        });

    } catch (error: any) {
        console.error('[Ingest] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
