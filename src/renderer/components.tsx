import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Activity, AudioLines, Check, ChevronDown, ChevronUp, CircleAlert, CircleStop, Clock3, Copy as CopyIcon,
  ExternalLink, FileDown, KeyRound, Languages, Mic2, MicOff, MonitorUp, Radio, RefreshCcw, Settings2,
  SlidersHorizontal, Square, Unplug, Volume2, VolumeX, X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  CaptureProfile, DensityPreset, Locale, OverlayConfig, PermissionState, SessionStatus, TargetLanguage,
} from '../shared/contracts';
import { OVERLAY_PRESETS, TARGET_LANGUAGES } from '../shared/contracts';
import type { Copy } from './i18n';
export { OverlayStage } from './overlay/OverlayStage';

export type Destination = 'direct' | 'appearance' | 'obs' | 'diagnostics';
export type ChannelStatus = 'pending' | 'healthy' | 'warning' | 'stopped';

export function SelectField({ value, onValueChange, options, disabled, ariaLabel }: {
  value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>;
  disabled?: boolean; ariaLabel: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger className="select-trigger" aria-label={ariaLabel}>
        <Select.Value />
        <Select.Icon><ChevronDown size={16} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="select-content"
          position="popper"
          sideOffset={6}
          collisionPadding={{ top: 16, right: 16, bottom: 112, left: 16 }}
          sticky="always"
        >
          <Select.ScrollUpButton className="select-scroll-button" aria-label="Scroll up"><ChevronUp size={15} /></Select.ScrollUpButton>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item className="select-item" value={option.value} key={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll-button" aria-label="Scroll down"><ChevronDown size={15} /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <div className="meter-wrap">
      <div className="meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <span className="meter-value">{percent}% <span className="sr-only">{label}</span></span>
    </div>
  );
}

const statusLabel = (status: ChannelStatus, t: Copy) => ({ pending: t.pending, healthy: t.healthy, warning: t.warning, stopped: t.stopped })[status];

export function SignalRail({ t, levels, sourceStatus, linkStatus, obsClients, isLive }: {
  t: Copy; levels: { microphone: number; guests: number }; sourceStatus: ChannelStatus; linkStatus: ChannelStatus; obsClients: number; isLive: boolean;
}) {
  const channels = [
    { key: 'source', label: t.source, status: sourceStatus, level: Math.max(levels.microphone, levels.guests), icon: <AudioLines size={18} /> },
    { key: 'link', label: t.link, status: linkStatus, level: linkStatus === 'healthy' ? 1 : 0, icon: <Radio size={18} /> },
    { key: 'obs', label: t.obsShort, status: obsClients > 0 ? 'healthy' : isLive ? 'warning' : 'stopped', level: obsClients > 0 ? 1 : 0, icon: <MonitorUp size={18} /> },
  ] as const;
  return (
    <aside className="signal-rail" role="status" aria-live="polite" aria-label="Signal status">
      <div className="brand-mark" aria-label="Live Translate">LT</div>
      <div className="rail-channels">
        {channels.map((channel) => (
          <div className={`rail-channel is-${channel.status}`} key={channel.key}>
            <span className="rail-icon">{channel.icon}</span>
            <span className="rail-label">{channel.label}</span>
            <span className="rail-status">{statusLabel(channel.status, t)}</span>
            <span className="rail-meter" aria-hidden="true"><i style={{ height: `${Math.max(5, channel.level * 100)}%` }} /></span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function Navigation({ destination, setDestination, t, locale, onLocale }: {
  destination: Destination; setDestination: (next: Destination) => void; t: Copy; locale: Locale; onLocale: (locale: Locale) => void;
}) {
  const items: Array<{ id: Destination; label: string; icon: ReactNode }> = [
    { id: 'direct', label: t.direct, icon: <Radio size={18} /> },
    { id: 'appearance', label: t.appearance, icon: <SlidersHorizontal size={18} /> },
    { id: 'obs', label: t.obs, icon: <MonitorUp size={18} /> },
    { id: 'diagnostics', label: t.diagnostics, icon: <Activity size={18} /> },
  ];
  return (
    <>
      <nav className="main-nav" aria-label="Main navigation">
        {items.map((item) => (
          <button className={destination === item.id ? 'active' : ''} onClick={() => setDestination(item.id)} key={item.id}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>
      <Tabs.Root className="compact-nav" value={destination} onValueChange={(value) => setDestination(value as Destination)}>
        <Tabs.List aria-label="Main navigation">{items.map((item) => <Tabs.Trigger value={item.id} key={item.id}>{item.label}</Tabs.Trigger>)}</Tabs.List>
      </Tabs.Root>
      <Tooltip.Provider delayDuration={400}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button className="utility-button" aria-label={t.utility} onClick={() => setDestination('diagnostics')}><Settings2 size={18} /></button>
          </Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content className="tooltip" side="right">{t.utility}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      <div className="locale-toggle" aria-label={t.language}>
        <button className={locale === 'fr' ? 'active' : ''} onClick={() => onLocale('fr')}>FR</button>
        <button className={locale === 'en' ? 'active' : ''} onClick={() => onLocale('en')}>EN</button>
      </div>
    </>
  );
}

export function SourceStrip({ kind, label, device, level, status, enabled, onToggle, toggleLabel, children }: {
  kind: 'microphone' | 'guests'; label: string; device: string; level: number; status: ChannelStatus;
  enabled: boolean; onToggle: () => void; toggleLabel: string; children?: ReactNode;
}) {
  return (
    <div className="source-strip">
      <button
        type="button"
        className={`source-glyph is-${status}${enabled ? '' : ' is-muted'}`}
        aria-label={toggleLabel}
        aria-pressed={!enabled}
        title={toggleLabel}
        onClick={onToggle}
      >
        {kind === 'microphone' ? enabled ? <Mic2 /> : <MicOff /> : enabled ? <Volume2 /> : <VolumeX />}
      </button>
      <div className="source-copy"><strong>{label}</strong><span>{device}</span></div>
      <Meter value={level} label={`${label} level`} />
      {children}
    </div>
  );
}

export function LiveControl({ state, elapsed, onStart, onStop, onRetry, t }: {
  state: SessionStatus; elapsed: number; onStart: () => void; onStop: () => void; onRetry: () => void; t: Copy;
}) {
  const working = state === 'starting' || state === 'stopping';
  const label = state === 'live' || state === 'reconnecting' ? t.stop : state === 'failed' ? t.retry : state === 'starting' ? t.starting : state === 'stopping' ? t.stopping : t.start;
  const action = state === 'live' || state === 'reconnecting' ? onStop : state === 'failed' ? onRetry : onStart;
  return (
    <button className={`live-control state-${state}`} disabled={working} onClick={action} aria-describedby="live-state">
      {state === 'live' || state === 'reconnecting' ? <Square size={20} fill="currentColor" /> : state === 'failed' ? <RefreshCcw size={21} /> : <Radio size={23} />}
      <span>{label}</span>
      {(state === 'live' || state === 'reconnecting') && <time>{formatElapsed(elapsed)}</time>}
    </button>
  );
}

export function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':');
}

export function KeyDialog({ open, onOpenChange, hasKey, onSave, onDelete, state, error, t }: {
  open: boolean; onOpenChange: (open: boolean) => void; hasKey: boolean; onSave: (key: string) => Promise<boolean>; onDelete: () => Promise<void>;
  state: 'idle' | 'loading' | 'success' | 'error'; error?: string; t: Copy;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
        <Dialog.Title>{t.apiKeys}</Dialog.Title>
        <Dialog.Description>{t.apiBody}</Dialog.Description>
        <label className="field"><span>OpenAI API key</span><input type="password" autoComplete="off" placeholder={hasKey ? '••••••••••••••••' : t.apiPlaceholder} /></label>
        {error && <p className="inline-alert danger"><CircleAlert size={17} />{error}</p>}
        <div className="dialog-actions">
          {hasKey && <button className="button danger-quiet" onClick={() => void onDelete()}>{t.deleteKey}</button>}
          <button className="button primary" disabled={state === 'loading'} onClick={(event) => { const input = event.currentTarget.closest('[role=dialog]')?.querySelector('input') as HTMLInputElement | null; void onSave(input?.value ?? '').then((ok) => { if (ok && input) input.value = ''; }); }}>{state === 'loading' ? t.starting : hasKey ? t.replaceKey : t.testKey}</button>
        </div>
        <Dialog.Close className="icon-button dialog-close" aria-label={t.close}><X /></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

export function LanguageSelect({ value, locale, onChange, disabled, label }: { value: TargetLanguage; locale: Locale; onChange: (value: TargetLanguage) => void; disabled?: boolean; label: string }) {
  return <SelectField value={value} onValueChange={(value) => onChange(value as TargetLanguage)} disabled={disabled} ariaLabel={label} options={TARGET_LANGUAGES.map((language) => ({ value: language.code, label: language.label[locale] }))} />;
}

export function CaptureModeTabs({ value, onChange, disabled, t }: { value: CaptureProfile['mode']; onChange: (value: CaptureProfile['mode']) => void; disabled?: boolean; t: Copy }) {
  return (
    <Tabs.Root className="segmented" value={value} onValueChange={(next) => onChange(next as CaptureProfile['mode'])}>
      <Tabs.List aria-label={t.mode} aria-disabled={disabled}>
        <Tabs.Trigger value="mixed" disabled={disabled}>{t.mixed}</Tabs.Trigger>
        <Tabs.Trigger value="split" disabled={disabled}>{t.split}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  );
}

export function OverlayControls({ config, onChange, t }: { config: OverlayConfig; onChange: (config: OverlayConfig) => void; t: Copy }) {
  const patch = <K extends keyof OverlayConfig>(key: K, value: OverlayConfig[K]) => onChange({ ...config, [key]: value });
  const applyPreset = (densityPreset: DensityPreset) => {
    if (densityPreset === 'custom') {
      onChange({ ...config, densityPreset, maxLines: 2 });
      return;
    }
    const preset = OVERLAY_PRESETS[densityPreset];
    onChange({
      ...config,
      densityPreset,
      fontSizePx: preset.fontSizePx,
      maxWidthPercent: preset.maxWidthPercent,
      maxLines: preset.maxLines,
    });
  };
  return (
    <div className="overlay-controls">
      <section><label>{t.readingMode}</label><Tabs.Root className="segmented" value={config.readingMode} onValueChange={(value) => patch('readingMode', value as OverlayConfig['readingMode'])}><Tabs.List><Tabs.Trigger value="pages">{t.pages}</Tabs.Trigger><Tabs.Trigger value="rollup">{t.rollup}</Tabs.Trigger></Tabs.List></Tabs.Root><small className="control-help">{config.readingMode === 'pages' ? t.pagesInfo : t.rollupInfo}</small></section>
      <section><label>{t.captionDensity}</label><div className="preset-grid">{(['large', 'balanced', 'moreText', 'custom'] as const).map((preset) => <button key={preset} className={config.densityPreset === preset ? 'active' : ''} onClick={() => applyPreset(preset)}><strong>{t[preset]}</strong><small>{preset === 'large' ? '72 px · 2L' : preset === 'balanced' ? '60 px · 2L' : preset === 'moreText' ? '46 px · 3L' : t.customInfo}</small></button>)}</div>{config.densityPreset === 'custom' && <div className="custom-controls"><RangeField label={t.size} value={config.fontSizePx} min={32} max={96} suffix="px" onChange={(value) => patch('fontSizePx', value)} /><RangeField label={t.width} value={config.maxWidthPercent} min={40} max={94} suffix="%" onChange={(value) => patch('maxWidthPercent', value)} /></div>}</section>
      <section><label>{t.position}</label><SelectField ariaLabel={t.position} value={config.position} onValueChange={(value) => patch('position', value as OverlayConfig['position'])} options={[{ value: 'top', label: t.top }, { value: 'center', label: t.center }, { value: 'bottom', label: t.bottom }]} /></section>
      <section><label>{t.duration}</label><RangeField label={t.duration} value={config.displayDurationMs / 1000} min={2} max={12} suffix="s" onChange={(value) => patch('displayDurationMs', value * 1000)} /><div className="switch-row"><span>{t.labels}</span><Switch.Root checked={config.showLabels} onCheckedChange={(value) => patch('showLabels', value)}><Switch.Thumb /></Switch.Root></div></section>
      <details><summary>{t.advanced}</summary><div className="advanced-grid"><label>{t.theme}</label><Tabs.Root className="segmented" value={config.theme} onValueChange={(value) => patch('theme', value as OverlayConfig['theme'])}><Tabs.List><Tabs.Trigger value="signal">{t.signal}</Tabs.Trigger><Tabs.Trigger value="subtitle">{t.subtitle}</Tabs.Trigger><Tabs.Trigger value="minimal">{t.minimal}</Tabs.Trigger></Tabs.List></Tabs.Root><label className="color-field">{t.textColor}<input type="color" value={config.textColor} onChange={(event) => patch('textColor', event.target.value)} /></label><label className="color-field">{t.hostColor}<input type="color" value={config.hostAccentColor} onChange={(event) => patch('hostAccentColor', event.target.value)} /></label><label className="color-field">{t.guestColor}<input type="color" value={config.guestAccentColor} onChange={(event) => patch('guestAccentColor', event.target.value)} /></label><RangeField label={t.background} value={Math.round(config.backgroundOpacity * 100)} min={0} max={100} suffix="%" onChange={(value) => patch('backgroundOpacity', value / 100)} /></div></details>
    </div>
  );
}

function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="range-field"><div><span>{label}</span><output>{value}{suffix}</output></div><Slider.Root value={[value]} min={min} max={max} step={1} onValueChange={([next]) => onChange(next)} aria-label={label}><Slider.Track><Slider.Range /></Slider.Track><Slider.Thumb /></Slider.Root></div>;
}

export function PermissionBadge({ state, t }: { state: PermissionState[keyof PermissionState]; t: Copy }) {
  const ok = state === 'granted';
  return <span className={`status-chip ${ok ? 'success' : state === 'denied' ? 'danger' : 'neutral'}`}>{ok ? <Check /> : state === 'denied' ? <CircleStop /> : <Clock3 />}{ok ? t.healthy : state === 'denied' ? t.stopped : t.pending}</span>;
}

export function ClipboardButton({ text, copied, onCopy, t, prominent = false }: { text: string; copied: boolean; onCopy: (text: string) => void; t: Copy; prominent?: boolean }) {
  return <button className={`${prominent ? 'button copy-button primary' : 'button copy-button'}${copied ? ' is-copied' : ''}`} onClick={() => onCopy(text)}>{copied ? <Check size={17} /> : <CopyIcon size={17} />}<span aria-live="polite">{copied ? t.copied : t.copy}</span></button>;
}

export function ToastLayer({ toast, clear }: { toast: { title: string; detail?: string; danger?: boolean } | null; clear: () => void }) {
  return <Toast.Provider swipeDirection="right"><Toast.Root className={`toast ${toast?.danger ? 'danger' : ''}`} open={Boolean(toast)} onOpenChange={(open) => { if (!open) clear(); }} duration={toast?.danger ? 120000 : 4000}><Toast.Title>{toast?.title}</Toast.Title>{toast?.detail && <Toast.Description>{toast.detail}</Toast.Description>}<Toast.Close aria-label="Close"><X /></Toast.Close></Toast.Root><Toast.Viewport className="toast-viewport" /></Toast.Provider>;
}

export const icons = { Activity, Check, CircleAlert, Clock3, ExternalLink, FileDown, KeyRound, Languages, Mic2, MonitorUp, Radio, RefreshCcw, SlidersHorizontal, Unplug, Volume2 };
