import type { PermissionMode } from '@my-claudia/shared';
import { ICONS } from '../../config/icons';

interface PermissionModeToggleProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: { value: PermissionMode; label: string; description: string; icon: string }[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Standard permission checks',
    icon: ICONS.permissionModes.default,
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Read-only analysis and planning',
    icon: ICONS.permissionModes.plan,
  },
  {
    value: 'acceptEdits',
    label: 'Auto-Edit',
    description: 'Auto-approve file edits',
    icon: ICONS.permissionModes.acceptEdits,
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass',
    description: 'Skip all permission checks',
    icon: ICONS.permissionModes.bypassPermissions,
  },
];

export function PermissionModeToggle({ mode, onModeChange, disabled }: PermissionModeToggleProps) {
  return (
    <div className="flex bg-secondary/50 rounded-lg p-0.5">
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onModeChange(option.value)}
          disabled={disabled}
          title={option.description}
          className={`
            px-2.5 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5
            ${mode === option.value
              ? option.value === 'plan'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : option.value === 'bypassPermissions'
                ? 'bg-destructive text-destructive-foreground shadow-sm'
                : option.value === 'acceptEdits'
                ? 'bg-warning text-warning-foreground shadow-sm'
                : 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <span>{option.icon}</span>
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
