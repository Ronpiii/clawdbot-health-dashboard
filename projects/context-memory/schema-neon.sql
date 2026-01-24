-- Neon-specific schema with advanced metadata

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Accounts table (unchanged)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Namespaces table (enhanced)
CREATE TABLE IF NOT EXISTS namespaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}', -- Add flexible metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(account_id, slug)
);

-- Entries table with advanced features
CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    namespace_id UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    key VARCHAR(500) NOT NULL,
    value JSONB NOT NULL,
    embedding VECTOR(1536), -- OpenAI embedding dimension
    metadata JSONB DEFAULT '{}', -- Flexible, rich metadata
    tags TEXT[] DEFAULT '{}',
    
    -- Lifecycle management
    ttl_seconds INTEGER,
    expires_at TIMESTAMPTZ,
    version INTEGER DEFAULT 1,
    
    -- Tracking and performance
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    
    UNIQUE(namespace_id, key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_entries_embedding 
    ON entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_entries_tags 
    ON entries USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_entries_metadata 
    ON entries USING GIN (metadata);

-- Trigger to track access
CREATE OR REPLACE FUNCTION track_entry_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = NOW();
    NEW.access_count = COALESCE(NEW.access_count, 0) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER entries_access_tracking
BEFORE UPDATE ON entries
FOR EACH ROW EXECUTE FUNCTION track_entry_access();