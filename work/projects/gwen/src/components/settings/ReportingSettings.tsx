import { useState } from 'react';
import { Mail, Plus, X, Clock, Calendar, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { useAppStore } from '@/context/AppContext';
import { generateId, timeAgo } from '@/lib/utils';
import type { ReportFrequency, ReportingConfig } from '@/types';

const frequencyOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const dayOptions = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

const timeOptions = [
  { value: '07:00', label: '7:00 AM' },
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '16:00', label: '4:00 PM' },
  { value: '18:00', label: '6:00 PM' },
];

function getNextSendLabel(frequency: ReportFrequency, dayOfWeek: number, timeOfDay: string): string {
  const dayName = dayOptions.find((d) => d.value === String(dayOfWeek))?.label ?? 'Monday';
  const timeName = timeOptions.find((t) => t.value === timeOfDay)?.label ?? timeOfDay;

  switch (frequency) {
    case 'weekly':
      return `Every ${dayName} at ${timeName}`;
    case 'biweekly':
      return `Every other ${dayName} at ${timeName}`;
    case 'monthly':
      return `1st of each month at ${timeName}`;
    case 'quarterly':
      return `1st of each quarter at ${timeName}`;
  }
}

export function ReportingSettings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const reporting = settings.reporting;

  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  function updateReporting(partial: Partial<ReportingConfig>) {
    updateSettings({ reporting: { ...reporting, ...partial } });
  }

  function handleAddRecipient() {
    const email = newEmail.trim().toLowerCase();

    if (!email) {
      setEmailError('Enter an email address');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address');
      return;
    }

    if (reporting.recipients.some((r) => r.email === email)) {
      setEmailError('This email is already added');
      return;
    }

    updateReporting({
      recipients: [
        ...reporting.recipients,
        { id: `rcpt-${generateId().slice(0, 8)}`, email, addedAt: new Date().toISOString() },
      ],
    });
    setNewEmail('');
    setEmailError('');
  }

  function handleRemoveRecipient(recipientId: string) {
    updateReporting({
      recipients: reporting.recipients.filter((r) => r.id !== recipientId),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddRecipient();
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Send size={18} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Email Reports</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Automatically send audit overviews to your team
            </p>
          </div>
        </div>
        <Toggle
          checked={reporting.enabled}
          onChange={(checked) => updateReporting({ enabled: checked })}
        />
      </div>

      {reporting.enabled && (
        <>
          {/* Schedule */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-[var(--text-muted)]" />
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Schedule</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Frequency"
                options={frequencyOptions}
                value={reporting.frequency}
                onChange={(e) => updateReporting({ frequency: e.target.value as ReportFrequency })}
              />
              {(reporting.frequency === 'weekly' || reporting.frequency === 'biweekly') && (
                <Select
                  label="Day"
                  options={dayOptions}
                  value={String(reporting.dayOfWeek)}
                  onChange={(e) => updateReporting({ dayOfWeek: Number(e.target.value) })}
                />
              )}
              <Select
                label="Time"
                options={timeOptions}
                value={reporting.timeOfDay}
                onChange={(e) => updateReporting({ timeOfDay: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/10">
              <Clock size={14} className="text-[var(--color-accent)] shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">
                {getNextSendLabel(reporting.frequency, reporting.dayOfWeek, reporting.timeOfDay)}
              </p>
            </div>
          </div>

          {/* Recipients */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-[var(--text-muted)]" />
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Recipients</h3>
              <Badge>{reporting.recipients.length}</Badge>
            </div>

            {/* Add email input */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="name@company.com"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                  onKeyDown={handleKeyDown}
                  error={emailError}
                />
              </div>
              <Button onClick={handleAddRecipient} size="sm" className="h-10 shrink-0">
                <Plus size={16} />
                Add
              </Button>
            </div>

            {/* Recipient list */}
            {reporting.recipients.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Mail size={24} className="text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-tertiary)]">No recipients yet</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Add email addresses to receive reports</p>
              </div>
            ) : (
              <div className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                {reporting.recipients.map((recipient, i) => (
                  <div
                    key={recipient.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors ${
                      i < reporting.recipients.length - 1 ? 'border-b border-[var(--border-default)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">
                          {recipient.email.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{recipient.email}</p>
                        <p className="text-xs text-[var(--text-muted)]">Added {timeAgo(recipient.addedAt)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveRecipient(recipient.id)}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                      aria-label={`Remove ${recipient.email}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report content */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">Include in Report</h3>
            <Toggle
              checked={reporting.includeSections.scoreOverview}
              onChange={(checked) =>
                updateReporting({
                  includeSections: { ...reporting.includeSections, scoreOverview: checked },
                })
              }
              label="Score overview"
              description="Summary of all client health scores"
            />
            <Toggle
              checked={reporting.includeSections.criticalIssues}
              onChange={(checked) =>
                updateReporting({
                  includeSections: { ...reporting.includeSections, criticalIssues: checked },
                })
              }
              label="Critical issues"
              description="List of all unresolved critical findings"
            />
            <Toggle
              checked={reporting.includeSections.trendAnalysis}
              onChange={(checked) =>
                updateReporting({
                  includeSections: { ...reporting.includeSections, trendAnalysis: checked },
                })
              }
              label="Trend analysis"
              description="Score changes and improvements over time"
            />
            <Toggle
              checked={reporting.includeSections.clientBreakdown}
              onChange={(checked) =>
                updateReporting({
                  includeSections: { ...reporting.includeSections, clientBreakdown: checked },
                })
              }
              label="Client breakdown"
              description="Per-client detailed section scores"
            />
          </div>
        </>
      )}
    </div>
  );
}
