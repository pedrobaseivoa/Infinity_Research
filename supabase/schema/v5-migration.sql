-- ============================================================
-- INFINITY RESEARCH - Schema v5 Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. PROJECTS TABLE (new)
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

CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. FOLDERS TABLE (new)
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

CREATE POLICY "Users can manage own folders" ON public.folders
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. ADD COLUMNS TO ARTICLES
-- ============================================================

-- Project and folder references
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Deduplication
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Queue management
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Confidence scoring
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS confidence_scores JSONB;

-- Pipeline version
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT '5.0';

-- Update status check to include 'queued'
ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE public.articles ADD CONSTRAINT articles_status_check
    CHECK (status IN ('queued', 'uploaded', 'processing', 'completed', 'failed'));

-- Indexes for queue
CREATE INDEX IF NOT EXISTS idx_articles_project ON public.articles(project_id);
CREATE INDEX IF NOT EXISTS idx_articles_folder ON public.articles(folder_id);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON public.articles(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_queue ON public.articles(user_id, status) WHERE status IN ('queued', 'processing');

-- ============================================================
-- 4. UPDATE USER_SETTINGS
-- ============================================================

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS max_concurrent INTEGER DEFAULT 3;

-- Drop outdated default_model column or update it
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS default_model;

-- ============================================================
-- 5. UPDATE TRIGGERS
-- ============================================================

-- Auto-calculate totals (updated to include all fields)
CREATE OR REPLACE FUNCTION public.calculate_article_totals()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_cost := COALESCE(NEW.phase1_cost, 0) +
                      COALESCE(NEW.phase3_cost, 0) +
                      COALESCE(NEW.phase4_cost, 0) +
                      COALESCE(NEW.phase5_cost, 0) +
                      COALESCE(NEW.phase6_cost, 0);

    NEW.total_tokens := COALESCE(NEW.phase1_tokens, 0) +
                        COALESCE(NEW.phase3_tokens, 0) +
                        COALESCE(NEW.phase4_tokens, 0) +
                        COALESCE(NEW.phase5_tokens, 0) +
                        COALESCE(NEW.phase6_tokens, 0);

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update project stats when article changes
CREATE OR REPLACE FUNCTION public.update_project_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_id IS NOT NULL THEN
        UPDATE public.projects SET
            articles_count = (SELECT COUNT(*) FROM public.articles WHERE project_id = NEW.project_id),
            completed_count = (SELECT COUNT(*) FROM public.articles WHERE project_id = NEW.project_id AND status = 'completed'),
            total_cost_usd = (SELECT COALESCE(SUM(total_cost), 0) FROM public.articles WHERE project_id = NEW.project_id),
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

-- Auto-create default project for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_project()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.projects (user_id, name, description)
    VALUES (NEW.id, 'Quick Extractions', 'Default project for quick uploads');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_project ON auth.users;
CREATE TRIGGER on_auth_user_created_project
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_project();

-- ============================================================
-- 6. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
-- public.articles already added in original schema

-- ============================================================
-- 7. GRANTS
-- ============================================================

GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.folders TO service_role;

-- ============================================================
-- 8. CLEANUP (optional - run after confirming migration works)
-- ============================================================
-- DROP SCHEMA IF EXISTS infinity CASCADE;
-- DROP TABLE IF EXISTS public.processing_jobs;

-- ============================================================
-- 9. HELPER FUNCTIONS
-- ============================================================

-- Increment monthly articles processed counter
CREATE OR REPLACE FUNCTION public.increment_articles_processed(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.user_settings
    SET articles_processed_this_month = articles_processed_this_month + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
