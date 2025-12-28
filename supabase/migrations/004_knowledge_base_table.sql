-- ============================================
-- Knowledge Base Table
-- Stores synthesized knowledge from all enabled documents per user
-- ============================================

-- Create knowledge_bases table
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

    -- Structured knowledge components
    financial_entities JSONB DEFAULT '{}',  -- Companies, accounts, cost centers
    metrics JSONB DEFAULT '[]',             -- Extracted metrics with values, periods, units
    business_rules JSONB DEFAULT '[]',      -- Policies, thresholds, approval rules
    relationships JSONB DEFAULT '[]',       -- Entity relationships

    -- Synthesized summary for agent context
    synthesis_text TEXT,                    -- Full knowledge for system prompt
    synthesis_summary TEXT,                 -- Executive summary

    -- Source tracking
    source_documents JSONB DEFAULT '[]',    -- Array of {document_id, name, last_processed}
    document_count INTEGER DEFAULT 0,

    -- Status tracking
    last_synthesized_at TIMESTAMPTZ,
    synthesis_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    synthesis_error TEXT,
    version INTEGER DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user_id ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_status ON knowledge_bases(synthesis_status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_knowledge_bases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_knowledge_bases_updated_at ON knowledge_bases;
CREATE TRIGGER trigger_knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_bases_updated_at();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

-- Users can only view their own knowledge base
CREATE POLICY "Users can view own knowledge base" ON knowledge_bases
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own knowledge base
CREATE POLICY "Users can update own knowledge base" ON knowledge_bases
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own knowledge base
CREATE POLICY "Users can insert own knowledge base" ON knowledge_bases
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own knowledge base
CREATE POLICY "Users can delete own knowledge base" ON knowledge_bases
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can do anything (for background synthesis)
CREATE POLICY "Service role full access" ON knowledge_bases
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Helper function to get or create user's knowledge base
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_knowledge_base(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    kb_id UUID;
BEGIN
    -- Try to find existing knowledge base
    SELECT id INTO kb_id FROM knowledge_bases WHERE user_id = p_user_id;

    -- If not found, create one
    IF kb_id IS NULL THEN
        INSERT INTO knowledge_bases (user_id, synthesis_status)
        VALUES (p_user_id, 'pending')
        RETURNING id INTO kb_id;
    END IF;

    RETURN kb_id;
END;
$$;

-- ============================================
-- Function to mark knowledge base for re-synthesis
-- Called when documents are added, removed, or toggled
-- ============================================
CREATE OR REPLACE FUNCTION mark_knowledge_base_stale(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Get or create knowledge base, then mark as pending
    PERFORM get_or_create_knowledge_base(p_user_id);

    UPDATE knowledge_bases
    SET synthesis_status = 'pending',
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$;
