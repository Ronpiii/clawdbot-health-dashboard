import { ChevronDown, Languages, Palette, Search, Accessibility, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ScoreGauge } from './ScoreGauge';
import { IssueItem } from './IssueItem';
import { SeverityBadge } from '@/components/ui/Badge';
import { countBySeverity } from '@/lib/scores';
import type { AuditSection, AuditCategory } from '@/types';

const categoryIcons: Record<AuditCategory, LucideIcon> = {
  language: Languages,
  visual: Palette,
  seo: Search,
  accessibility: Accessibility,
  geo: Bot,
};

interface AuditCardProps {
  section: AuditSection;
  isExpanded: boolean;
  onToggle: () => void;
}

export function AuditCard({ section, isExpanded, onToggle }: AuditCardProps) {
  const Icon = categoryIcons[section.category];
  const counts = countBySeverity(section.issues);

  return (
    <div className="border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-4 w-full px-6 py-5 text-left hover:bg-[var(--bg-elevated)] transition-colors duration-150 cursor-pointer"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--bg-elevated)]">
          <Icon size={20} className="text-[var(--text-tertiary)]" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {section.label}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <SeverityBadge severity="critical" count={counts.critical} />
            <SeverityBadge severity="warning" count={counts.warning} />
            <SeverityBadge severity="info" count={counts.info} />
          </div>
        </div>

        <ScoreGauge score={section.score} size="sm" />

        <ChevronDown
          size={18}
          className={cn(
            'text-[var(--text-muted)] transition-transform duration-200 shrink-0',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expandable content */}
      <div
        data-print-expand
        className={cn(
          'grid transition-[grid-template-rows] duration-300',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6 pt-2">
            {/* Category-specific details */}
            <CategoryDetails section={section} />

            {/* Issues */}
            {section.issues.length > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                <h4 className="text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1">
                  Findings ({section.issues.length})
                </h4>
                {section.issues.map((issue) => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryDetails({ section }: { section: AuditSection }) {
  const { details, category } = section;

  if (category === 'language') {
    const d = details as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <DetailItem label="Detected" value={Array.isArray(d.detectedLanguages) ? (d.detectedLanguages as string[]).join(', ') : '—'} />
        <DetailItem label="Target" value={String(d.targetLanguage || '—')} />
        <DetailItem label="Untranslated" value={String(d.untranslatedStrings ?? '—')} />
        <DetailItem label="Grammar Issues" value={String(d.grammarIssues ?? '—')} />
      </div>
    );
  }

  if (category === 'visual') {
    const d = details as Record<string, unknown>;
    const fonts = Array.isArray(d.fonts) ? d.fonts as { family: string; weights: number[]; usage: number }[] : [];
    const colors = Array.isArray(d.colors) ? d.colors as { hex: string; usage: string; count: number }[] : [];

    return (
      <div className="flex flex-col gap-4">
        {fonts.length > 0 && (
          <div>
            <h5 className="text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-muted)] mb-2">Fonts</h5>
            <div className="flex flex-wrap gap-2">
              {fonts.map((f) => (
                <span key={f.family} className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                  {f.family} <span className="text-[var(--text-muted)]">({f.weights.join(', ')})</span> — {f.usage}%
                </span>
              ))}
            </div>
          </div>
        )}
        {colors.length > 0 && (
          <div>
            <h5 className="text-xs font-medium uppercase tracking-[0.05em] text-[var(--text-muted)] mb-2">Colors</h5>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <span key={c.hex} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.hex }} />
                  {c.hex} <span className="text-[var(--text-muted)]">({c.usage})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (category === 'seo') {
    const d = details as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <DetailItem label="Meta Title" value={d.metaTitle ? 'Present' : 'Missing'} highlight={!d.metaTitle} />
        <DetailItem label="Meta Description" value={d.metaDescription ? 'Present' : 'Missing'} highlight={!d.metaDescription} />
        <DetailItem label="H1 Count" value={String(d.h1Count ?? '—')} highlight={(d.h1Count as number) !== 1} />
        <DetailItem label="Heading Hierarchy" value={d.headingHierarchyValid ? 'Valid' : 'Broken'} highlight={!d.headingHierarchyValid} />
        <DetailItem label="Images Missing Alt" value={String(d.imagesWithoutAlt ?? '—')} highlight={(d.imagesWithoutAlt as number) > 0} />
        <DetailItem label="Page Speed" value={`${d.pageSpeedScore ?? '—'}/100`} />
      </div>
    );
  }

  if (category === 'accessibility') {
    const d = details as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <DetailItem label="WCAG Level" value={String(d.wcagLevel ?? '—')} highlight={d.wcagLevel === 'fail'} />
        <DetailItem label="Contrast Issues" value={String(d.contrastIssues ?? '—')} highlight={(d.contrastIssues as number) > 0} />
        <DetailItem label="Missing ARIA" value={String(d.missingAriaLabels ?? '—')} highlight={(d.missingAriaLabels as number) > 0} />
        <DetailItem label="Keyboard Issues" value={String(d.keyboardNavIssues ?? '—')} highlight={(d.keyboardNavIssues as number) > 0} />
      </div>
    );
  }

  if (category === 'geo') {
    const d = details as Record<string, unknown>;
    const schemas = Array.isArray(d.schemaTypes) ? d.schemaTypes as string[] : [];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <DetailItem label="Structured Data" value={d.structuredDataPresent ? 'Present' : 'Missing'} highlight={!d.structuredDataPresent} />
        <DetailItem label="Schema Types" value={schemas.length > 0 ? schemas.join(', ') : 'None'} />
        <DetailItem label="Content Quality" value={`${d.contentQualityScore ?? '—'}/100`} />
        <DetailItem label="Entities Found" value={String(d.entityCount ?? '—')} />
        <DetailItem label="FAQ Markup" value={d.faqMarkup ? 'Yes' : 'No'} highlight={!d.faqMarkup} />
      </div>
    );
  }

  return null;
}

function DetailItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)]">
      <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]">{label}</span>
      <span className={cn('text-sm font-medium', highlight ? 'text-red-400' : 'text-[var(--text-primary)]')}>
        {value}
      </span>
    </div>
  );
}
