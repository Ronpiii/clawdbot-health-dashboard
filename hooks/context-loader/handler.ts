import type { HookHandler } from '../../src/hooks/hooks.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Context Loader Hook
 * 
 * Injects today + yesterday's daily memory logs into the session bootstrap context
 * so the agent wakes up with recent context already loaded. Prevents context loss
 * bugs where the agent doesn't know what it did recently.
 */

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDates(timezone: string | undefined): string[] {
  // Calculate today + yesterday in the user's timezone
  const tz = timezone || 'Europe/Tallinn';
  const now = new Date();
  
  // Get today's date string in the target timezone
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD
  
  // Yesterday
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: tz });
  
  // Deduplicate (edge case: around midnight UTC they could differ from timezone calc)
  const dates = [todayStr];
  if (yesterdayStr !== todayStr) dates.push(yesterdayStr);
  return dates;
}

const contextLoader: HookHandler = async (event) => {
  // Only handle agent:bootstrap events
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  const context = event.context;
  const workspaceDir = context.workspaceDir;
  if (!workspaceDir || !Array.isArray(context.bootstrapFiles)) return;

  // Skip subagent sessions — they get minimal context
  const sessionKey = context.sessionKey;
  if (sessionKey && sessionKey.includes(':spawn:')) return;

  const memoryDir = path.join(workspaceDir, 'memory');
  const userTimezone = context.cfg?.agents?.defaults?.userTimezone;
  const dates = getDates(userTimezone);

  for (const dateStr of dates) {
    const filename = `${dateStr}.md`;
    const filePath = path.join(memoryDir, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Don't inject empty or near-empty files
      if (content.trim().length < 20) continue;
      
      // Truncate very large daily logs to avoid blowing up context
      const maxChars = 8000;
      const truncated = content.length > maxChars 
        ? content.slice(0, maxChars) + `\n\n[... truncated, ${content.length - maxChars} chars remaining — use read tool for full file]`
        : content;
      
      context.bootstrapFiles.push({
        name: `memory/${filename}`,
        path: filePath,
        content: truncated,
        missing: false,
      });
      
      console.log(`[context-loader] injected memory/${filename} (${content.length} chars)`);
    } catch {
      // File doesn't exist for this date — that's fine
    }
  }
};

export default contextLoader;
