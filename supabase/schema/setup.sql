-- ============================================================
-- INFINITY RESEARCH — Canonical database setup (self-hosted)
-- ------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor of a fresh project.
-- It is idempotent: safe to re-run. It creates every table,
-- trigger, RLS policy, index, function, the storage bucket and
-- realtime publications the app needs.
--
-- After running this, create your account in the app, then go to
-- Settings and paste your own OpenRouter API key (BYOK).
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. profiles  (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 3. user_settings  (BYOK API keys + preferences)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- BYOK API keys (openrouter required; others optional)
    openrouter_api_key TEXT,
    semantic_scholar_api_key TEXT,
    openalex_api_key TEXT,
    core_api_key TEXT,

    -- Preferences / limits
    max_concurrent INTEGER DEFAULT 3,
    articles_processed_this_month INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 100,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings"
    ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings"
    ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings"
    ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 4. projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    extraction_schema JSONB,
    articles_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    total_cost_usd NUMERIC(10,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own projects" ON public.projects;
CREATE POLICY "Users can manage own projects" ON public.projects
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. folders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_project ON public.folders(project_id);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own folders" ON public.folders;
CREATE POLICY "Users can manage own folders" ON public.folders
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. articles  (one row per uploaded PDF; stores all 7 phases)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Organization
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,

    -- Original PDF
    pdf_url TEXT,
    pdf_storage_path TEXT,
    pdf_filename TEXT,
    content_hash TEXT,

    -- Status / queue
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('queued','uploaded','processing','completed','failed')),
    current_phase INTEGER DEFAULT 0,
    error_message TEXT,
    queued_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    pipeline_version TEXT DEFAULT '5.0',
    pipeline_config TEXT,

    -- Phase 1: metadata extraction
    phase1_json JSONB,
    phase1_status TEXT DEFAULT 'pending' CHECK (phase1_status IN ('pending','running','completed','failed')),
    phase1_model TEXT,
    phase1_cost NUMERIC(10,6) DEFAULT 0,
    phase1_tokens INTEGER DEFAULT 0,
    phase1_duration_ms INTEGER,
    phase1_prompt_tokens INTEGER,
    phase1_completion_tokens INTEGER,
    phase1_completed_at TIMESTAMPTZ,

    -- Phase 2: 11-API enrichment
    phase2_json JSONB,
    phase2_status TEXT DEFAULT 'pending' CHECK (phase2_status IN ('pending','running','completed','failed')),
    phase2_apis_success INTEGER DEFAULT 0,
    phase2_apis_failed INTEGER DEFAULT 0,
    phase2_duration_ms INTEGER,
    phase2_completed_at TIMESTAMPTZ,

    -- Phase 3: consensus with provenance
    phase3_json JSONB,
    phase3_status TEXT DEFAULT 'pending' CHECK (phase3_status IN ('pending','running','completed','failed')),
    phase3_model TEXT,
    phase3_cost NUMERIC(10,6) DEFAULT 0,
    phase3_tokens INTEGER DEFAULT 0,
    phase3_duration_ms INTEGER,
    phase3_prompt_tokens INTEGER,
    phase3_completion_tokens INTEGER,
    phase3_completed_at TIMESTAMPTZ,

    -- Phase 4: multi-model scientific extraction
    phase4_json JSONB,
    phase4_status TEXT DEFAULT 'pending' CHECK (phase4_status IN ('pending','running','completed','failed')),
    phase4_models TEXT[],
    phase4_cost NUMERIC(10,6) DEFAULT 0,
    phase4_tokens INTEGER DEFAULT 0,
    phase4_duration_ms INTEGER,
    phase4_prompt_tokens INTEGER,
    phase4_completion_tokens INTEGER,
    phase4_completed_at TIMESTAMPTZ,

    -- Phase 5: visual + tables extraction
    phase5_json JSONB,
    phase5_status TEXT DEFAULT 'pending' CHECK (phase5_status IN ('pending','running','completed','failed')),
    phase5_models TEXT[],
    phase5_cost NUMERIC(10,6) DEFAULT 0,
    phase5_tokens INTEGER DEFAULT 0,
    phase5_duration_ms INTEGER,
    phase5_prompt_tokens INTEGER,
    phase5_completion_tokens INTEGER,
    phase5_completed_at TIMESTAMPTZ,

    -- Phase 6: scientific consolidation
    phase6_json JSONB,
    phase6_status TEXT DEFAULT 'pending' CHECK (phase6_status IN ('pending','running','completed','failed')),
    phase6_model TEXT,
    phase6_cost NUMERIC(10,6) DEFAULT 0,
    phase6_tokens INTEGER DEFAULT 0,
    phase6_duration_ms INTEGER,
    phase6_prompt_tokens INTEGER,
    phase6_completion_tokens INTEGER,
    phase6_completed_at TIMESTAMPTZ,

    -- Phase 7: deterministic final merge
    phase7_json JSONB,
    phase7_status TEXT DEFAULT 'pending' CHECK (phase7_status IN ('pending','running','completed','failed')),
    phase7_duration_ms INTEGER,
    phase7_completed_at TIMESTAMPTZ,

    -- Confidence + totals
    confidence_scores JSONB,
    total_cost NUMERIC(10,6) DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,

    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_user_id ON public.articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_project ON public.articles(project_id);
CREATE INDEX IF NOT EXISTS idx_articles_folder ON public.articles(folder_id);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON public.articles(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_queue ON public.articles(user_id, status) WHERE status IN ('queued','processing');

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own articles" ON public.articles;
CREATE POLICY "Users can view own articles"
    ON public.articles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own articles" ON public.articles;
CREATE POLICY "Users can insert own articles"
    ON public.articles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own articles" ON public.articles;
CREATE POLICY "Users can update own articles"
    ON public.articles FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own articles" ON public.articles;
CREATE POLICY "Users can delete own articles"
    ON public.articles FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 7. article_reviews  (human validation / blind review)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.article_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL,
    overall_score INTEGER,
    overall_notes TEXT,
    metadata_reviews JSONB DEFAULT '{}'::JSONB,
    scientific_reviews JSONB DEFAULT '{}'::JSONB,
    outcome_reviews JSONB DEFAULT '[]'::JSONB,
    finalized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (article_id, reviewer_name)
);

CREATE INDEX IF NOT EXISTS idx_reviews_article ON public.article_reviews(article_id);
ALTER TABLE public.article_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage reviews on own articles" ON public.article_reviews;
CREATE POLICY "Users manage reviews on own articles" ON public.article_reviews
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.articles a WHERE a.id = article_id AND a.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.articles a WHERE a.id = article_id AND a.user_id = auth.uid())
    );

-- ============================================================
-- 8. processing_jobs  (optional queue/log table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
    current_phase INTEGER DEFAULT 1,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    logs JSONB DEFAULT '[]'::JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_article_id ON public.processing_jobs(article_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.processing_jobs(created_at DESC);

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own jobs" ON public.processing_jobs;
CREATE POLICY "Users can view own jobs"
    ON public.processing_jobs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own jobs" ON public.processing_jobs;
CREATE POLICY "Users can insert own jobs"
    ON public.processing_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 9. TRIGGERS & FUNCTIONS
-- ============================================================

-- Auto-create profile + settings + default project on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.projects (user_id, name, description)
    VALUES (NEW.id, 'Quick Extractions', 'Default project for quick uploads');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-sum cost/tokens on every article update
CREATE OR REPLACE FUNCTION public.calculate_article_totals()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_cost := COALESCE(NEW.phase1_cost,0) + COALESCE(NEW.phase3_cost,0)
                    + COALESCE(NEW.phase4_cost,0) + COALESCE(NEW.phase5_cost,0)
                    + COALESCE(NEW.phase6_cost,0);
    NEW.total_tokens := COALESCE(NEW.phase1_tokens,0) + COALESCE(NEW.phase3_tokens,0)
                      + COALESCE(NEW.phase4_tokens,0) + COALESCE(NEW.phase5_tokens,0)
                      + COALESCE(NEW.phase6_tokens,0);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_totals ON public.articles;
CREATE TRIGGER calculate_totals
    BEFORE UPDATE ON public.articles
    FOR EACH ROW EXECUTE FUNCTION public.calculate_article_totals();

-- Keep project aggregate stats fresh
CREATE OR REPLACE FUNCTION public.update_project_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_id IS NOT NULL THEN
        UPDATE public.projects SET
            articles_count = (SELECT COUNT(*) FROM public.articles WHERE project_id = NEW.project_id),
            completed_count = (SELECT COUNT(*) FROM public.articles WHERE project_id = NEW.project_id AND status = 'completed'),
            total_cost_usd = (SELECT COALESCE(SUM(total_cost),0) FROM public.articles WHERE project_id = NEW.project_id),
            updated_at = NOW()
        WHERE id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_stats_trigger ON public.articles;
CREATE TRIGGER update_project_stats_trigger
    AFTER INSERT OR UPDATE OF status, total_cost ON public.articles
    FOR EACH ROW EXECUTE FUNCTION public.update_project_stats();

-- User stats helper (used by dashboard)
CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'total_articles', COUNT(*),
        'completed_articles', COUNT(*) FILTER (WHERE status = 'completed'),
        'processing_articles', COUNT(*) FILTER (WHERE status = 'processing'),
        'failed_articles', COUNT(*) FILTER (WHERE status = 'failed'),
        'total_cost', COALESCE(SUM(total_cost),0),
        'total_tokens', COALESCE(SUM(total_tokens),0)
    ) INTO result FROM public.articles WHERE user_id = p_user_id;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Monthly usage counter helpers
CREATE OR REPLACE FUNCTION public.increment_articles_processed(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.user_settings
    SET articles_processed_this_month = articles_processed_this_month + 1, updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reset_monthly_counters()
RETURNS void AS $$
BEGIN
    UPDATE public.user_settings SET articles_processed_this_month = 0, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. STORAGE bucket + policies (bucket: article-pdfs, private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-pdfs', 'article-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Users can only access PDFs under a top-level folder named after their uid
DROP POLICY IF EXISTS "Users can read own pdfs" ON storage.objects;
CREATE POLICY "Users can read own pdfs" ON storage.objects
    FOR SELECT USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can upload own pdfs" ON storage.objects;
CREATE POLICY "Users can upload own pdfs" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own pdfs" ON storage.objects;
CREATE POLICY "Users can delete own pdfs" ON storage.objects
    FOR DELETE USING (bucket_id = 'article-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 11. REALTIME
-- ============================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 12. GRANTS (service_role bypasses RLS; used by server routes)
-- ============================================================
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_settings TO service_role;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.folders TO service_role;
GRANT ALL ON public.articles TO service_role;
GRANT ALL ON public.article_reviews TO service_role;
GRANT ALL ON public.processing_jobs TO service_role;

-- ============================================================
-- END OF SETUP
-- ============================================================
