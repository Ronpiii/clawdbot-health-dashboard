# Scratchpad - Session Context (2026-02-02)

## Active Project: Anivia (Sales CRM)
Location: `projects/anivia/`

## Recent Work This Session

### UI/UX Improvements
- **Loading animations → progress bars**: replaced Loader2 spinners with animated progress bars for initial page loads
- **Sequence builder wizard**: new modal replaces step-by-step editing — template selection → visual builder with all steps inline
- **Leads page stage filter**: changed from dropdown to horizontal tabs (All | New | Contacted | Proposal | Won | Lost)
- **Campaign edit**: added Edit option in dropdown menu
- **Removed thumbs up button** from lead detail (keep thumbs down for disqualify)
- **Company size multi-select**: lead gen modal now has checkboxes instead of single select

### Lead Generation Improvements
- **Estonian Business Registry integration**: new module `src/lib/enrichment/estonian-registry.ts`
  - Uses official ariregister.rik.ee API (free, no key needed)
  - Searches by EMTAK industry codes
  - Gets board member names as contacts
  - Primary source for Estonian searches now
- **Apollo improvements**: multi-page fetching, industry tag mapping, broader fallback
- **TLD filtering**: rejects wrong-country domains (.fi for Estonia search, etc)
- **Light enrichment upgraded**: now scrapes homepage for emails, tries multiple prefixes

### Email Scheduling Feature (NEW)
- **Schedule for morning button**: clock icon in approval queue
- **Keyboard shortcut**: S
- **Cron job**: runs at 6:00 UTC (8:00 Tallinn) to send scheduled emails
- **Migration 027**: adds `scheduled_for` column + `scheduled` status
- **Migration fix needed**: existing data has `completed` and `pendign` statuses that need cleanup first

### Bug Fixes
- Duplicate enrollment error: now shows "One or more leads are already enrolled in this sequence"
- Campaign sequences empty: was querying non-existent `enrolled_count` column
- Step editor generate: no longer overwrites user-written AI instructions

## Pending Migration (027)
Ron needs to run this after fixing existing data:
```sql
-- Fix existing data first
UPDATE ai_actions SET status = 'pending' WHERE status = 'pendign';
UPDATE ai_actions SET status = 'executed' WHERE status = 'completed';

-- Then the migration
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE ai_actions DROP CONSTRAINT IF EXISTS ai_actions_status_check;
ALTER TABLE ai_actions ADD CONSTRAINT ai_actions_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'scheduled'));
CREATE INDEX IF NOT EXISTS idx_ai_actions_scheduled 
  ON ai_actions(scheduled_for) WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
```

## Anivia Blockers (from earlier)
- Vercel Pro upgrade needed for sub-daily crons ($20/mo)
- Stripe API keys for billing
- Custom domain
- CRON_SECRET in Vercel env vars

## Ron's Preferences (noted)
- Hates generic/template icons — prefers minimal or none
- Prefers tabs over dropdowns for filtering
- Wants wizard-style flows (like onboarding) for complex forms
- User-friendly error messages, not raw DB errors
