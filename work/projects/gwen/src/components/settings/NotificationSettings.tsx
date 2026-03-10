import { Toggle } from '@/components/ui/Toggle';
import { Select } from '@/components/ui/Select';
import { useAppStore } from '@/context/AppContext';

const languages = [
  { value: 'English', label: 'English' },
  { value: 'Estonian', label: 'Estonian' },
  { value: 'German', label: 'German' },
  { value: 'Finnish', label: 'Finnish' },
  { value: 'Russian', label: 'Russian' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
];

export function NotificationSettings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  return (
    <div className="flex flex-col gap-8 max-w-lg">
      {/* Language */}
      <Select
        label="Default Target Language"
        options={languages}
        value={settings.defaultLanguage}
        onChange={(e) => updateSettings({ defaultLanguage: e.target.value })}
      />

      {/* Notifications */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Notifications</h3>
        <Toggle
          checked={settings.notifications.emailOnScanComplete}
          onChange={(checked) =>
            updateSettings({
              notifications: { ...settings.notifications, emailOnScanComplete: checked },
            })
          }
          label="Email on scan complete"
          description="Get notified when a scan finishes"
        />
        <Toggle
          checked={settings.notifications.weeklyDigest}
          onChange={(checked) =>
            updateSettings({
              notifications: { ...settings.notifications, weeklyDigest: checked },
            })
          }
          label="Weekly digest"
          description="Receive a summary of all client scores"
        />
      </div>

      {/* Score threshold */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--text-secondary)]">
          Score drop alert threshold
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={settings.notifications.scoreDropThreshold}
            onChange={(e) =>
              updateSettings({
                notifications: {
                  ...settings.notifications,
                  scoreDropThreshold: Number(e.target.value),
                },
              })
            }
            className="flex-1 accent-[var(--color-accent)]"
          />
          <span className="text-sm font-medium text-[var(--text-primary)] w-8 text-right">
            {settings.notifications.scoreDropThreshold}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Alert when any client's score drops below this value
        </p>
      </div>
    </div>
  );
}
