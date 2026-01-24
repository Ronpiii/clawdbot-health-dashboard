-- context memory database schema
-- PostgreSQL 15+ with pgvector extension

-- enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- accounts (API key owners)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of the key
    key_prefix VARCHAR(8) NOT NULL, -- first 8 chars for identification
    name VARCHAR(255) DEFAULT 'default',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_api_keys_hash (key_hash),
    INDEX idx_api_keys_account (account_id)
);

-- namespaces (isolated memory spaces)
CREATE TABLE namespaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(account_id, slug),
    INDEX idx_namespaces_account (account_id)
);

-- entries (the actual memory items)
CREATE TABLE entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    namespace_id UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    key VARCHAR(500) NOT NULL,
    value JSONB NOT NULL,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536), -- OpenAI ada-002 dimension
    ttl_seconds INTEGER, -- NULL = no expiry
    expires_at TIMESTAMPTZ, -- computed from ttl
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(namespace_id, key),
    INDEX idx_entries_namespace (namespace_id),
    INDEX idx_entries_tags USING GIN (tags),
    INDEX idx_entries_embedding USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100),
    INDEX idx_entries_expires (expires_at) WHERE expires_at IS NOT NULL
);

-- entry history (versioning)
CREATE TABLE entry_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    value JSONB NOT NULL,
    metadata JSONB,
    version INTEGER NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_history_entry (entry_id, version DESC)
);

-- usage tracking
CREATE TABLE usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'read', 'write', 'search', 'delete'
    namespace_id UUID REFERENCES namespaces(id) ON DELETE SET NULL,
    tokens_used INTEGER DEFAULT 0, -- for embedding calls
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_usage_account_date (account_id, created_at DESC)
);

-- functions

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    
CREATE TRIGGER namespaces_updated_at BEFORE UPDATE ON namespaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    
CREATE TRIGGER entries_updated_at BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- auto-compute expires_at from ttl
CREATE OR REPLACE FUNCTION compute_expires_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ttl_seconds IS NOT NULL THEN
        NEW.expires_at = NOW() + (NEW.ttl_seconds || ' seconds')::INTERVAL;
    ELSE
        NEW.expires_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_compute_expires BEFORE INSERT OR UPDATE OF ttl_seconds ON entries
    FOR EACH ROW EXECUTE FUNCTION compute_expires_at();

-- save history on update
CREATE OR REPLACE FUNCTION save_entry_history()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
        INSERT INTO entry_history (entry_id, value, metadata, version)
        VALUES (OLD.id, OLD.value, OLD.metadata, OLD.version);
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_save_history BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION save_entry_history();

-- cleanup expired entries (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_entries()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM entries WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
