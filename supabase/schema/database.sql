-- ============================================================
-- INFINITY RESEARCH - Database Schema (Simplified)
-- Version: 3.0
-- Structure: Projects → Articles → Phase JSONs as columns
-- ============================================================

CREATE SCHEMA IF NOT EXISTS infinity;

-- ============================================================
-- 1. PROJECTS TABLE
-- Groups articles for a research project
-- ============================================================
CREATE TABLE infinity.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name TEXT NOT NULL,                    -- "Glaucoma AR Review 2024"
    description TEXT,                      -- Project description
    
    -- Stats (updated by trigger or manually)
    articles_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. ARTICLES TABLE
-- Each PDF with all 8 phases as JSONB columns
-- ============================================================
CREATE TABLE infinity.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to project
    project_id UUID NOT NULL REFERENCES infinity.projects(id) ON DELETE CASCADE,
    
    -- File info
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes INTEGER,
    content_hash TEXT,                     -- To detect duplicates
    
    -- ========== PHASE 1: Metadata Extraction ==========
    phase1_json JSONB,                     -- title, authors, doi, abstract, etc
    phase1_status TEXT DEFAULT 'pending' CHECK (phase1_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase1_error TEXT,
    phase1_model TEXT,                     -- 'google/gemini-2.5-flash'
    phase1_cost DECIMAL(10,6) DEFAULT 0,
    phase1_tokens INTEGER DEFAULT 0,
    phase1_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 2: API Enrichment ==========
    phase2_json JSONB,                     -- crossref, openalex, semantic_scholar, etc
    phase2_status TEXT DEFAULT 'pending' CHECK (phase2_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase2_error TEXT,
    phase2_apis_success INTEGER,           -- How many APIs returned data
    phase2_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 3: Metadata Consensus ==========
    phase3_json JSONB,                     -- Merged metadata from phase1 + phase2
    phase3_status TEXT DEFAULT 'pending' CHECK (phase3_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase3_error TEXT,
    phase3_model TEXT,                     -- 'deepseek/deepseek-chat'
    phase3_cost DECIMAL(10,6) DEFAULT 0,
    phase3_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 4: Scientific Extraction (Multi-LLM) ==========
    phase4_json JSONB,                     -- methodology, sample_size, outcomes, etc (multiple models)
    phase4_status TEXT DEFAULT 'pending' CHECK (phase4_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase4_error TEXT,
    phase4_models TEXT[],                  -- ['openai/gpt-4o', 'google/gemini-2.5-flash']
    phase4_cost DECIMAL(10,6) DEFAULT 0,
    phase4_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 5: Verification & Consensus ==========
    phase5_json JSONB,                     -- Compared extractions, consensus fields
    phase5_status TEXT DEFAULT 'pending' CHECK (phase5_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase5_error TEXT,
    phase5_model TEXT,                     -- 'anthropic/claude-sonnet-4'
    phase5_cost DECIMAL(10,6) DEFAULT 0,
    phase5_consistency_score DECIMAL(3,2), -- 0.67 = 67% consensus
    phase5_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 6: Visual Asset Mapping ==========
    phase6_json JSONB,                     -- figures[], tables[] with captions
    phase6_status TEXT DEFAULT 'pending' CHECK (phase6_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase6_error TEXT,
    phase6_model TEXT,                     -- 'x-ai/grok-4'
    phase6_cost DECIMAL(10,6) DEFAULT 0,
    phase6_figures_count INTEGER DEFAULT 0,
    phase6_tables_count INTEGER DEFAULT 0,
    phase6_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 7: Visual Asset Analysis ==========
    phase7_json JSONB,                     -- Detailed analysis of each figure/table
    phase7_status TEXT DEFAULT 'pending' CHECK (phase7_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase7_error TEXT,
    phase7_model TEXT,                     -- 'openai/gpt-4o'
    phase7_cost DECIMAL(10,6) DEFAULT 0,
    phase7_data_points INTEGER DEFAULT 0,  -- Number of data points extracted
    phase7_completed_at TIMESTAMPTZ,
    
    -- ========== PHASE 8: Final Synthesis ==========
    phase8_json JSONB,                     -- The final consolidated output
    phase8_status TEXT DEFAULT 'pending' CHECK (phase8_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    phase8_error TEXT,
    phase8_model TEXT,                     -- 'openai/gpt-4o'
    phase8_cost DECIMAL(10,6) DEFAULT 0,
    phase8_completed_at TIMESTAMPTZ,
    
    -- ========== OVERALL STATUS ==========
    overall_status TEXT DEFAULT 'pending' CHECK (overall_status IN ('pending', 'processing', 'completed', 'failed')),
    current_phase INTEGER DEFAULT 0,       -- 0 = not started, 1-8 = in progress
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    pipeline_version TEXT DEFAULT '4.0',
    
    -- ========== DURATION TRACKING (milliseconds) ==========
    phase1_duration_ms INTEGER,
    phase2_duration_ms INTEGER,
    phase3_duration_ms INTEGER,
    phase4_duration_ms INTEGER,
    phase5_duration_ms INTEGER,
    phase6_duration_ms INTEGER,
    phase7_duration_ms INTEGER,
    total_duration_ms INTEGER,             -- Total processing time
    
    -- ========== TOKEN TRACKING ==========
    phase1_prompt_tokens INTEGER,
    phase1_completion_tokens INTEGER,
    phase3_prompt_tokens INTEGER,
    phase3_completion_tokens INTEGER,
    phase4_prompt_tokens INTEGER,
    phase4_completion_tokens INTEGER,
    phase5_prompt_tokens INTEGER,
    phase5_completion_tokens INTEGER,
    phase6_prompt_tokens INTEGER,
    phase6_completion_tokens INTEGER,
    total_prompt_tokens INTEGER,
    total_completion_tokens INTEGER,
    
    -- Timestamps
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_articles_project ON infinity.articles(project_id);
CREATE INDEX idx_articles_status ON infinity.articles(overall_status);
CREATE INDEX idx_articles_hash ON infinity.articles(content_hash) WHERE content_hash IS NOT NULL;

-- ============================================================
-- 3. PROCESSING_LOGS TABLE (Optional - for debugging)
-- ============================================================
CREATE TABLE infinity.processing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES infinity.articles(id) ON DELETE CASCADE,
    
    level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
    phase INTEGER,
    message TEXT NOT NULL,
    details JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_article ON infinity.processing_logs(article_id);

-- ============================================================
-- VIEWS (for easy querying)
-- ============================================================

-- Quick overview of all articles with key extracted data
CREATE OR REPLACE VIEW infinity.articles_overview AS
SELECT 
    a.id,
    p.name as project_name,
    a.original_filename,
    a.overall_status,
    a.current_phase,
    
    -- Key fields from Phase 8 (or Phase 1 if 8 not ready)
    COALESCE(a.phase8_json->>'title', a.phase1_json->>'title') as title,
    COALESCE(a.phase8_json->>'study_type', a.phase1_json->>'study_type') as study_type,
    a.phase8_json->>'sample_size' as sample_size,
    a.phase8_json->>'doi' as doi,
    
    -- Visual counts
    a.phase6_figures_count as figures,
    a.phase6_tables_count as tables,
    a.phase7_data_points as data_points,
    
    -- Quality
    a.phase5_consistency_score,
    
    -- Cost
    a.total_cost_usd,
    
    -- Timing
    a.processing_started_at,
    a.processing_completed_at,
    EXTRACT(EPOCH FROM (a.processing_completed_at - a.processing_started_at)) as processing_seconds
    
FROM infinity.articles a
JOIN infinity.projects p ON a.project_id = p.id;

-- Phase status summary per article
CREATE OR REPLACE VIEW infinity.articles_phases AS
SELECT 
    id,
    original_filename,
    phase1_status, phase1_cost,
    phase2_status, phase2_apis_success,
    phase3_status, phase3_cost,
    phase4_status, phase4_cost,
    phase5_status, phase5_cost, phase5_consistency_score,
    phase6_status, phase6_cost, phase6_figures_count, phase6_tables_count,
    phase7_status, phase7_cost, phase7_data_points,
    phase8_status, phase8_cost,
    total_cost_usd
FROM infinity.articles;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION infinity.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_articles_updated_at
    BEFORE UPDATE ON infinity.articles
    FOR EACH ROW
    EXECUTE FUNCTION infinity.update_updated_at();

CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON infinity.projects
    FOR EACH ROW
    EXECUTE FUNCTION infinity.update_updated_at();

-- Auto-calculate total_cost_usd
CREATE OR REPLACE FUNCTION infinity.calculate_article_cost()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_cost_usd = COALESCE(NEW.phase1_cost, 0) + 
                         COALESCE(NEW.phase3_cost, 0) + 
                         COALESCE(NEW.phase4_cost, 0) + 
                         COALESCE(NEW.phase5_cost, 0) + 
                         COALESCE(NEW.phase6_cost, 0) + 
                         COALESCE(NEW.phase7_cost, 0) + 
                         COALESCE(NEW.phase8_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_cost
    BEFORE INSERT OR UPDATE ON infinity.articles
    FOR EACH ROW
    EXECUTE FUNCTION infinity.calculate_article_cost();

-- ============================================================
-- EXAMPLE QUERIES
-- ============================================================

-- Get all completed articles with their Phase 8 output:
-- SELECT id, original_filename, phase8_json 
-- FROM infinity.articles 
-- WHERE phase8_status = 'completed';

-- Get specific fields from Phase 8 JSON:
-- SELECT 
--     phase8_json->>'title' as title,
--     phase8_json->>'methodology' as methodology,
--     phase8_json->'key_data_points' as data_points
-- FROM infinity.articles;

-- Find articles where Phase 5 failed:
-- SELECT original_filename, phase5_error 
-- FROM infinity.articles 
-- WHERE phase5_status = 'failed';

-- Get all articles from a project:
-- SELECT * FROM infinity.articles_overview 
-- WHERE project_name = 'Glaucoma Review 2024';

-- Habilita realtime pra tabela articles
ALTER PUBLICATION supabase_realtime ADD TABLE infinity.articles;

-- Opcional: também pra projects
ALTER PUBLICATION supabase_realtime ADD TABLE infinity.projects;