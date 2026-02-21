#!/usr/bin/env node
/**
 * arc log — daily log browser
 * 
 * browse your daily memory files like `git log` for your life.
 * extracts sections, renders timeline, supports search + filtering.
 * 
 * usage:
 *   arc log                        # recent logs (last 7 days)
 *   arc log --all                  # all logs ever
 *   arc log --day 2026-02-14       # specific day
 *   arc log --week                 # this week
 *   arc log --month                # this month
 *   arc log --days N               # last N days
 *   arc log --since YYYY-MM-DD     # since date
 *   arc log --grep <pattern>       # search across all logs
 *   arc log --sections             # show only section headers (skim mode)
 *   arc log --calendar             # monthly calendar view of logged days
 *   arc log --stats                # log statistics
 *   arc log --short                # one-liner per day
 *   arc log --json                 # machine-readable
 * 
 * nightly build 2026-02-21
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(import.meta.dirname, '..');
const MEMORY_DIR = join(ROOT, 'memory');
const args = process.argv.slice(2);

// ── flags ────────────────────────────────────────────────────────────────
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const sectionsMode = args.includes('--sections');
const calendarMode = args.includes('--calendar');
const statsMode = args.includes('--stats');
const allMode = args.includes('--all');
const weekMode = args.includes('--week');
const monthMode = args.includes('--month');
const todayMode = args.includes('--today');

const daysIdx = args.indexOf('--days');
const daysN = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 7 : null;

const sinceIdx = args.indexOf('--since');
const sinceDate = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

const dayIdx = args.indexOf('--day');
const specificDay = dayIdx >= 0 ? args[dayIdx + 1] : null;

const grepIdx = args.indexOf('--grep');
const grepPattern = grepIdx >= 0 ? args[grepIdx + 1] : null;

// ── helpers ──────────────────────────────────────────────────────────────

function getAllLogs() {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .map(f => {
      const date = f.replace('.md', '');
      const path = join(MEMORY_DIR, f);
      const content = readFileSync(path, 'utf-8');
      return { date, path, content, filename: f };
    });
}

function parseLog(entry) {
  const lines = entry.content.split('\n');
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // h2 sections (## ...)
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        title: h2[1].trim(),
        level: 2,
        startLine: i,
        lines: [],
        subsections: []
      };
      continue;
    }
    // h3 subsections (### ...)
    const h3 = line.match(/^### (.+)/);
    if (h3 && currentSection) {
      currentSection.subsections.push(h3[1].trim());
    }
    if (currentSection) {
      currentSection.lines.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  return {
    ...entry,
    sections,
    lineCount: lines.length,
    wordCount: entry.content.split(/\s+/).filter(Boolean).length
  };
}

function getDateRange() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (specificDay) return { start: specificDay, end: specificDay };
  if (todayMode) return { start: today, end: today };

  if (weekMode) {
    const d = new Date(now);
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1; // monday start
    d.setUTCDate(d.getUTCDate() - diff);
    return { start: d.toISOString().slice(0, 10), end: today };
  }

  if (monthMode) {
    return { start: `${today.slice(0, 7)}-01`, end: today };
  }

  if (sinceDate) return { start: sinceDate, end: today };

  if (daysN) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysN + 1);
    return { start: d.toISOString().slice(0, 10), end: today };
  }

  if (allMode || grepPattern || calendarMode || statsMode) return null; // no filter

  // default: last 7 days
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 6);
  return { start: d.toISOString().slice(0, 10), end: today };
}

function filterByDate(logs, range) {
  if (!range) return logs;
  return logs.filter(l => l.date >= range.start && l.date <= range.end);
}

function grepLogs(logs, pattern) {
  const regex = new RegExp(pattern, 'gi');
  const results = [];

  for (const log of logs) {
    const lines = log.content.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        // grab context: 1 line before, match, 1 line after
        const ctx = [];
        if (i > 0) ctx.push({ line: i, text: lines[i - 1], type: 'context' });
        ctx.push({ line: i + 1, text: lines[i], type: 'match' });
        if (i < lines.length - 1) ctx.push({ line: i + 2, text: lines[i + 1], type: 'context' });
        matches.push(ctx);
      }
      regex.lastIndex = 0; // reset for 'g' flag
    }
    if (matches.length > 0) {
      results.push({ date: log.date, matches, matchCount: matches.length });
    }
  }
  return results;
}

function formatDaysAgo(date) {
  const now = new Date();
  const d = new Date(date + 'T00:00:00Z');
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}

function dayOfWeek(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(date + 'T00:00:00Z').getUTCDay()];
}

function bar(value, max, width = 20) {
  const filled = Math.round((value / Math.max(max, 1)) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ── renderers ────────────────────────────────────────────────────────────

function renderTimeline(logs) {
  if (logs.length === 0) {
    console.log('\n  no logs found for this period\n');
    return;
  }

  const range = getDateRange();
  const label = range
    ? range.start === range.end
      ? range.start
      : `${range.start} to ${range.end}`
    : 'all time';

  console.log(`\n  arc log  ${label}  (${logs.length} ${logs.length === 1 ? 'day' : 'days'})`);
  console.log('  ' + '\u2500'.repeat(50));

  for (const log of logs) {
    const parsed = parseLog(log);
    const dow = dayOfWeek(log.date);
    const ago = formatDaysAgo(log.date);

    console.log(`\n  \u25CF ${log.date} (${dow})  ${ago}  [${parsed.lineCount}L / ${parsed.wordCount}w]`);

    if (shortMode) {
      // show section titles as a compact summary
      const sectionTitles = parsed.sections.map(s => s.title).slice(0, 3);
      if (sectionTitles.length > 0) {
        const summary = sectionTitles.join(' | ');
        const truncated = summary.length > 70 ? summary.slice(0, 67) + '...' : summary;
        console.log(`    ${truncated}`);
      }
      continue;
    }

    for (const section of parsed.sections) {
      const subCount = section.subsections.length;
      const contentLines = section.lines.filter(l => l.trim()).length;
      const subLabel = subCount > 0 ? ` (${subCount} sub)` : '';
      console.log(`    \u251C\u2500 ${section.title}${subLabel}  [${contentLines}L]`);

      if (sectionsMode && section.subsections.length > 0) {
        for (const sub of section.subsections) {
          console.log(`    \u2502  \u2514\u2500 ${sub}`);
        }
      }
    }
  }

  console.log();
}

function renderGrepResults(results, pattern) {
  if (results.length === 0) {
    console.log(`\n  no matches for "${pattern}"\n`);
    return;
  }

  const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);
  console.log(`\n  arc log --grep "${pattern}"  (${totalMatches} matches in ${results.length} files)`);
  console.log('  ' + '\u2500'.repeat(50));

  for (const result of results) {
    console.log(`\n  \u25CF ${result.date}  (${result.matchCount} match${result.matchCount > 1 ? 'es' : ''})`);

    for (const match of result.matches) {
      for (const line of match) {
        if (line.type === 'match') {
          // highlight the match
          const highlighted = line.text.replace(
            new RegExp(`(${pattern})`, 'gi'),
            '>>$1<<'
          );
          console.log(`    ${String(line.line).padStart(4)}> ${highlighted}`);
        } else {
          console.log(`    ${String(line.line).padStart(4)}  ${line.text}`);
        }
      }
      console.log('    ' + '\u2500'.repeat(40));
    }
  }

  console.log();
}

function renderCalendar(logs) {
  const logDates = new Set(logs.map(l => l.date));

  // determine months to show
  const months = new Set();
  for (const l of logs) months.add(l.date.slice(0, 7));
  const sortedMonths = [...months].sort().reverse();

  // show last 3 months max unless --all
  const showMonths = allMode ? sortedMonths : sortedMonths.slice(0, 3);

  console.log(`\n  arc log --calendar  (${logDates.size} days logged)`);
  console.log('  ' + '\u2500'.repeat(50));

  for (const ym of showMonths) {
    const [year, month] = ym.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });

    console.log(`\n  ${monthName}`);
    console.log('  Mon Tue Wed Thu Fri Sat Sun');

    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let dow = firstDay.getUTCDay();
    dow = dow === 0 ? 6 : dow - 1; // monday start

    let row = '  ' + '    '.repeat(dow);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (logDates.has(dateStr)) {
        row += `[${String(d).padStart(2)}] `;
      } else {
        row += ` ${String(d).padStart(2)}  `;
      }
      dow++;
      if (dow >= 7) {
        console.log(row);
        row = '  ';
        dow = 0;
      }
    }
    if (dow > 0) console.log(row);
  }

  console.log();
}

function renderStats(logs) {
  if (logs.length === 0) {
    console.log('\n  no logs found\n');
    return;
  }

  const parsed = logs.map(parseLog);
  const totalLines = parsed.reduce((s, l) => s + l.lineCount, 0);
  const totalWords = parsed.reduce((s, l) => s + l.wordCount, 0);
  const totalSections = parsed.reduce((s, l) => s + l.sections.length, 0);

  // section frequency
  const sectionCounts = {};
  for (const log of parsed) {
    for (const section of log.sections) {
      // normalize: strip time stamps and specific details
      const key = section.title
        .replace(/\(\d{2}:\d{2}.*?\)/g, '')
        .replace(/\d{4}-\d{2}-\d{2}/g, '')
        .trim()
        .toLowerCase();
      sectionCounts[key] = (sectionCounts[key] || 0) + 1;
    }
  }

  // words per day distribution
  const wordCounts = parsed.map(l => l.wordCount).sort((a, b) => a - b);
  const median = wordCounts[Math.floor(wordCounts.length / 2)];
  const avg = Math.round(totalWords / parsed.length);
  const maxWords = Math.max(...wordCounts);
  const minWords = Math.min(...wordCounts);

  // day of week distribution
  const dowCounts = Array(7).fill(0);
  for (const log of logs) {
    const dow = new Date(log.date + 'T00:00:00Z').getUTCDay();
    dowCounts[dow]++;
  }

  // monthly distribution
  const monthCounts = {};
  for (const log of logs) {
    const m = log.date.slice(0, 7);
    monthCounts[m] = (monthCounts[m] || 0) + 1;
  }

  // longest streak
  const sortedDates = logs.map(l => l.date).sort();
  let streak = 1, maxStreak = 1, streakStart = sortedDates[0], bestStreakStart = sortedDates[0];
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00Z');
    const curr = new Date(sortedDates[i] + 'T00:00:00Z');
    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
      if (streak > maxStreak) {
        maxStreak = streak;
        bestStreakStart = streakStart;
      }
    } else {
      streak = 1;
      streakStart = sortedDates[i];
    }
  }

  // current streak (from today or yesterday backwards — allow 1 day gap for "today not logged yet")
  const today = new Date().toISOString().slice(0, 10);
  const dateSet = new Set(sortedDates);
  let currentStreak = 0;
  let checkDate = new Date();
  // if today has no log, start from yesterday
  if (!dateSet.has(checkDate.toISOString().slice(0, 10))) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  }
  while (true) {
    const ds = checkDate.toISOString().slice(0, 10);
    if (dateSet.has(ds)) {
      currentStreak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  // busiest day
  const busiestLog = parsed.reduce((a, b) => a.wordCount > b.wordCount ? a : b);

  console.log(`\n  arc log --stats`);
  console.log('  ' + '\u2500'.repeat(50));
  console.log(`\n  total logs:     ${logs.length} days`);
  console.log(`  date range:     ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);
  console.log(`  total lines:    ${totalLines.toLocaleString()}`);
  console.log(`  total words:    ${totalWords.toLocaleString()}`);
  console.log(`  total sections: ${totalSections}`);
  console.log(`\n  words/day:      avg ${avg} | median ${median} | min ${minWords} | max ${maxWords}`);
  console.log(`  busiest day:    ${busiestLog.date} (${busiestLog.wordCount.toLocaleString()} words)`);
  console.log(`  current streak: ${currentStreak} day${currentStreak !== 1 ? 's' : ''}`);
  console.log(`  longest streak: ${maxStreak} day${maxStreak !== 1 ? 's' : ''} (from ${bestStreakStart})`);

  // day of week chart
  const dowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]; // reorder to mon-sun
  const maxDow = Math.max(...dowCounts);
  console.log('\n  day of week:');
  for (const i of dowOrder) {
    console.log(`    ${dowNames[i === 0 ? 6 : i - 1]}  ${bar(dowCounts[i], maxDow, 15)} ${dowCounts[i]}`);
  }

  // monthly chart
  const sortedMonths = Object.keys(monthCounts).sort();
  const maxMonth = Math.max(...Object.values(monthCounts));
  console.log('\n  by month:');
  for (const m of sortedMonths) {
    console.log(`    ${m}  ${bar(monthCounts[m], maxMonth, 15)} ${monthCounts[m]}d`);
  }

  // top recurring section titles
  const topSections = Object.entries(sectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (topSections.length > 0) {
    console.log('\n  recurring topics:');
    for (const [title, count] of topSections) {
      const truncated = title.length > 35 ? title.slice(0, 32) + '...' : title;
      console.log(`    ${String(count).padStart(3)}x  ${truncated}`);
    }
  }

  console.log();
}

function renderDayDetail(log) {
  const parsed = parseLog(log);
  const dow = dayOfWeek(log.date);
  const ago = formatDaysAgo(log.date);

  console.log(`\n  ${log.date} (${dow})  ${ago}`);
  console.log('  ' + '\u2500'.repeat(50));
  console.log(`  ${parsed.lineCount} lines | ${parsed.wordCount} words | ${parsed.sections.length} sections`);
  console.log();

  // render full content with light formatting
  const lines = log.content.split('\n');
  for (const line of lines) {
    if (/^# /.test(line)) {
      // skip h1 (it's the date title)
      continue;
    } else if (/^## /.test(line)) {
      console.log(`  ${'='.repeat(40)}`);
      console.log(`  ${line.replace(/^## /, '').trim()}`);
      console.log(`  ${'='.repeat(40)}`);
    } else if (/^### /.test(line)) {
      console.log(`  --- ${line.replace(/^### /, '').trim()} ---`);
    } else {
      console.log(`  ${line}`);
    }
  }
  console.log();
}

function renderJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ── main ─────────────────────────────────────────────────────────────────

function main() {
  const allLogs = getAllLogs();

  if (allLogs.length === 0) {
    console.log('\n  no daily logs found in memory/\n');
    process.exit(0);
  }

  // json mode
  if (jsonMode) {
    const range = getDateRange();
    const filtered = filterByDate(allLogs, range);

    if (grepPattern) {
      renderJson(grepLogs(filtered, grepPattern));
    } else if (statsMode) {
      const parsed = filtered.map(parseLog);
      renderJson({
        count: filtered.length,
        totalLines: parsed.reduce((s, l) => s + l.lineCount, 0),
        totalWords: parsed.reduce((s, l) => s + l.wordCount, 0),
        dates: filtered.map(l => l.date)
      });
    } else {
      renderJson(filtered.map(l => {
        const p = parseLog(l);
        return {
          date: l.date,
          lineCount: p.lineCount,
          wordCount: p.wordCount,
          sections: p.sections.map(s => s.title)
        };
      }));
    }
    return;
  }

  // calendar mode
  if (calendarMode) {
    renderCalendar(allLogs);
    return;
  }

  // stats mode
  if (statsMode) {
    const range = getDateRange();
    const filtered = range ? filterByDate(allLogs, range) : allLogs;
    renderStats(filtered);
    return;
  }

  // grep mode
  if (grepPattern) {
    const range = getDateRange();
    const filtered = range ? filterByDate(allLogs, range) : allLogs;
    renderGrepResults(grepLogs(filtered, grepPattern), grepPattern);
    return;
  }

  // specific day detail view
  if (specificDay) {
    const log = allLogs.find(l => l.date === specificDay);
    if (!log) {
      console.log(`\n  no log found for ${specificDay}\n`);
      process.exit(1);
    }
    renderDayDetail(log);
    return;
  }

  // default: timeline view
  const range = getDateRange();
  const filtered = filterByDate(allLogs, range);
  renderTimeline(filtered);
}

main();
