import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, CircleAlert, ExternalLink, FileDown, KeyRound, Languages, LockKeyhole, Mic2, MonitorUp, ShieldCheck, Volume2 } from 'lucide-react';
import type {
  AppMetadata, AppSettings, CaptionState, CaptureProfile, DiagnosticEntry, DiagnosticsSnapshot, KeyValidationResult,
  Locale, OverlayConfig, PermissionState, SessionStateUpdate, SessionStatus, WindowsAudioApplication,
  WindowsAudioCapability, WindowsAudioCaptureStatus,
} from '../shared/contracts';
import { PRICE_EFFECTIVE_DATE, PRICE_PER_SESSION_MINUTE_USD } from '../shared/contracts';
import { captureGuests, captureMicrophone, closeCaptureStream, listAudioInputs, sessionCountForMode, setCaptureSourceEnabled, startCapture, TranslationManager, watchLevel, type CaptureBundle } from './audio';
import {
  CaptureModeTabs, ClipboardButton, type Destination, LanguageSelect, LiveControl, Meter, Navigation, OverlayControls,
  OverlayStage, PermissionBadge, SelectField, SignalRail, SourceStrip, ToastLayer, formatElapsed, icons,
} from './components';
import { copy } from './i18n';

const EMPTY_PERMISSIONS: PermissionState = { microphone: 'not-determined', screen: 'not-determined' };
const DEFAULT_METADATA: AppMetadata = { name: 'Live Translate for OBS', version: '0.2.0', platform: 'darwin', overlayUrl: '', overlayClients: 0 };
const EMPTY_DIAGNOSTICS: DiagnosticsSnapshot = { entries: [], overlayClients: 0, overlayPort: 17654, hasKey: false, permissions: EMPTY_PERMISSIONS };
const EMPTY_WINDOWS_AUDIO: WindowsAudioCapability = { supported: false, build: 0, reason: 'platform' };

type KeyState = 'idle' | 'loading' | 'success' | 'error';
type ToastState = { title: string; detail?: string; danger?: boolean } | null;

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [metadata, setMetadata] = useState(DEFAULT_METADATA);
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS);
  const [hasKey, setHasKey] = useState(false);
  const [keyState, setKeyState] = useState<KeyState>('idle');
  const [keyError, setKeyError] = useState<string>();
  const [destination, setDestination] = useState<Destination>('direct');
  const [captions, setCaptions] = useState<CaptionState[]>([]);
  const [overlayClients, setOverlayClients] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [levels, setLevels] = useState({ microphone: 0, guests: 0 });
  const [liveState, setLiveState] = useState<SessionStatus>('idle');
  const [sessionStates, setSessionStates] = useState<Record<string, SessionStateUpdate>>({});
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState(EMPTY_DIAGNOSTICS);
  const [testing, setTesting] = useState(false);
  const [audioApplications, setAudioApplications] = useState<WindowsAudioApplication[]>([]);
  const [windowsAudioCapability, setWindowsAudioCapability] = useState(EMPTY_WINDOWS_AUDIO);
  const [windowsAudioStatus, setWindowsAudioStatus] = useState<WindowsAudioCaptureStatus | null>(null);
  const captureRef = useRef<CaptureBundle | null>(null);
  const managerRef = useRef<TranslationManager | null>(null);
  const meterStops = useRef<Array<() => void>>([]);
  const copiedTimer = useRef<number | null>(null);
  const captureProfileRef = useRef<CaptureProfile | null>(null);
  const sourceToggleQueue = useRef<Promise<void>>(Promise.resolve());

  const locale = settings?.locale ?? 'fr';
  const t = copy[locale];

  useEffect(() => {
    if (settings) captureProfileRef.current = settings.captureProfile;
  }, [settings]);

  const refreshDevices = useCallback(async () => {
    try { setDevices(await listAudioInputs()); } catch { setDevices([]); }
  }, []);

  const refreshAudioApplications = useCallback(async () => {
    try { setAudioApplications(await window.liveTranslate.windowsAudio.listApplications()); }
    catch { setAudioApplications([]); }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.liveTranslate.settings.get(),
      window.liveTranslate.app.metadata(),
      window.liveTranslate.app.permissions(),
      window.liveTranslate.key.status(),
      window.liveTranslate.app.diagnostics(),
      window.liveTranslate.windowsAudio.capability(),
    ]).then(([nextSettings, nextMetadata, nextPermissions, key, nextDiagnostics, audioCapability]) => {
      if (!active) return;
      setSettings(nextSettings); setMetadata(nextMetadata); setPermissions(nextPermissions); setHasKey(key.hasKey);
      setOverlayClients(nextMetadata.overlayClients); setDiagnostics(nextDiagnostics); setWindowsAudioCapability(audioCapability);
      void refreshDevices();
      if (audioCapability.supported) void refreshAudioApplications();
    }).catch(() => setToast({ title: 'Initialization failed', danger: true }));
    const offMessages = window.liveTranslate.overlay.onMessage((message) => {
      if (message.type === 'overlay.snapshot') setCaptions(message.captions);
      if (message.type === 'caption.delta') setCaptions((current) => [...current.filter(({ source }) => source !== message.caption.source), message.caption]);
      if (message.type === 'caption.clear') setCaptions((current) => current.filter(({ source }) => source !== message.source));
      if (message.type === 'overlay.config') setSettings((current) => current ? { ...current, overlay: message.config } : current);
    });
    const offClients = window.liveTranslate.overlay.onClientCount((count) => {
      setOverlayClients(count);
      setMetadata((current) => ({ ...current, overlayClients: count }));
    });
    const offWindowsAudio = window.liveTranslate.windowsAudio.onStatus(setWindowsAudioStatus);
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => {
      active = false; offMessages(); offClients(); offWindowsAudio(); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
      meterStops.current.forEach((stop) => stop()); captureRef.current?.close(); managerRef.current?.stop();
    };
  }, [refreshAudioApplications, refreshDevices]);

  useEffect(() => {
    if (liveState !== 'live' && liveState !== 'reconnecting') return;
    const startedAt = Date.now() - elapsed * 1000;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [liveState]);

  const updateSettings = useCallback(async (patch: Parameters<typeof window.liveTranslate.settings.update>[0]) => {
    const updated = await window.liveTranslate.settings.update(patch);
    setSettings(updated);
    return updated;
  }, []);

  const keyErrorCopy = useCallback((result: KeyValidationResult) => {
    const errors = { invalid_key: t.keyInvalid, billing_required: t.keyBilling, rate_limited: t.keyRate, model_unavailable: t.keyModel, network: t.keyNetwork, unknown: t.keyUnknown };
    return errors[result.errorCode ?? 'unknown'];
  }, [t]);

  const saveKey = useCallback(async (key: string) => {
    if (!key.trim()) { setKeyError(t.keyInvalid); return false; }
    setKeyState('loading'); setKeyError(undefined);
    try {
      const result = await window.liveTranslate.key.setAndValidate(key.trim());
      setHasKey(result.hasKey);
      if (!result.ok) { setKeyState('error'); setKeyError(keyErrorCopy(result)); return false; }
      setKeyState('success');
      return true;
    } catch {
      setKeyState('error'); setKeyError(t.keyNetwork); return false;
    }
  }, [keyErrorCopy, t]);

  const stopCapture = useCallback(async () => {
    setLiveState('stopping');
    managerRef.current?.stop(); managerRef.current = null;
    meterStops.current.forEach((stop) => stop()); meterStops.current = [];
    captureRef.current?.close(); captureRef.current = null;
    setLevels({ microphone: 0, guests: 0 });
    await window.liveTranslate.realtime.clearCaption();
    setSessionStates({}); setLiveState('idle'); setTesting(false);
  }, []);

  const onSessionState = useCallback((update: SessionStateUpdate) => {
    window.liveTranslate.realtime.updateSessionState(update);
    setSessionStates((current) => ({ ...current, [update.source]: update }));
    setLiveState((current) => {
      if (update.status === 'live') return 'live';
      if (update.status === 'failed') return 'failed';
      if (update.status === 'reconnecting' && current !== 'failed') return 'reconnecting';
      return current;
    });
  }, []);

  const startLive = useCallback(async () => {
    if (!settings || !hasKey) {
      setToast({ title: t.apiTitle, detail: t.apiBody, danger: true });
      return;
    }
    if (settings.captureProfile.guestSource === 'application' && !settings.captureProfile.guestApplicationId) {
      setToast({ title: t.applicationCapture, detail: t.noApplications, danger: true });
      return;
    }
    managerRef.current?.stop(); managerRef.current = null;
    meterStops.current.forEach((stop) => stop()); meterStops.current = [];
    captureRef.current?.close(); captureRef.current = null;
    setTesting(false); setLiveState('starting'); setElapsed(0); setSessionStates({});
    try {
      const bundle = await startCapture({ profile: settings.captureProfile, includeSystem: true });
      captureRef.current = bundle;
      meterStops.current = [
        watchLevel(bundle.microphone, (microphone) => setLevels((value) => ({ ...value, microphone }))),
        watchLevel(bundle.guests, (guests) => setLevels((value) => ({ ...value, guests }))),
      ];
      const manager = new TranslationManager(onSessionState, (source, delta) => {
        const label = source === 'host' ? settings.captureProfile.hostLabel : source === 'guest' ? settings.captureProfile.guestLabel : undefined;
        void window.liveTranslate.realtime.sendCaptionDelta({ source, delta, label });
      });
      managerRef.current = manager;
      await manager.start(bundle.translation, settings.targetLanguage);
    } catch (error) {
      captureRef.current?.close(); captureRef.current = null;
      setLiveState('failed');
      setToast({ title: t.captureFailed, detail: error instanceof DOMException && error.name === 'NotAllowedError' ? t.permissionDenied : t.systemMissing, danger: true });
    }
  }, [hasKey, onSessionState, settings, t]);

  const testSources = useCallback(async () => {
    if (testing) { await stopCapture(); return; }
    if (!settings) return;
    if (settings.captureProfile.guestSource === 'application' && !settings.captureProfile.guestApplicationId) {
      setToast({ title: t.applicationCapture, detail: t.noApplications, danger: true });
      return;
    }
    try {
      const bundle = await startCapture({ profile: settings.captureProfile, includeSystem: true });
      captureRef.current = bundle; setTesting(true);
      meterStops.current = [watchLevel(bundle.microphone, (microphone) => setLevels((v) => ({ ...v, microphone }))), watchLevel(bundle.guests, (guests) => setLevels((v) => ({ ...v, guests })))];
    } catch (error) {
      setToast({ title: t.captureFailed, detail: error instanceof DOMException && error.name === 'NotAllowedError' ? t.permissionDenied : t.systemMissing, danger: true });
    }
  }, [settings, stopCapture, t, testing]);

  const copyUrl = useCallback((text: string) => {
    void window.liveTranslate.clipboard.writeText(text).then((verified) => {
      if (!verified) throw new Error('clipboard_verification_failed');
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      setCopied(true);
      setToast({ title: t.copied });
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 2200);
    }).catch(() => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = null;
      setCopied(false);
      setToast({ title: t.copyFailed, danger: true });
    });
  }, [t]);

  const toggleCaptureSource = useCallback((source: 'microphone' | 'guests') => {
    if (!settings) return;
    const profile = captureProfileRef.current ?? settings.captureProfile;
    const setting = source === 'microphone' ? 'microphoneEnabled' : 'guestsEnabled';
    const enabled = !profile[setting];
    const nextProfile = { ...profile, [setting]: enabled };
    captureProfileRef.current = nextProfile;
    setSettings((current) => current ? { ...current, captureProfile: nextProfile } : current);
    if (captureRef.current) setCaptureSourceEnabled(captureRef.current, source, enabled);
    if (!enabled) setLevels((current) => ({ ...current, [source]: 0 }));
    sourceToggleQueue.current = sourceToggleQueue.current.then(async () => {
      const updated = await window.liveTranslate.settings.update({ captureProfile: nextProfile });
      if (captureProfileRef.current === nextProfile) setSettings(updated);
    }).catch(() => {
      if (captureProfileRef.current === nextProfile) {
        captureProfileRef.current = profile;
        setSettings((current) => current ? { ...current, captureProfile: profile } : current);
        if (captureRef.current) setCaptureSourceEnabled(captureRef.current, source, !enabled);
      }
      setToast({ title: t.captureFailed, danger: true });
    });
  }, [settings, t]);

  const refreshDiagnostics = useCallback(async () => setDiagnostics(await window.liveTranslate.app.diagnostics()), []);

  if (!settings) return <LoadingScreen />;

  if (!settings.onboardingComplete) {
    return <Onboarding settings={settings} setSettings={setSettings} metadata={metadata} permissions={permissions} setPermissions={setPermissions} hasKey={hasKey} saveKey={saveKey} keyState={keyState} keyError={keyError} devices={devices} refreshDevices={refreshDevices} levels={levels} setLevels={setLevels} copied={copied} copyUrl={copyUrl} t={t} updateSettings={updateSettings} audioApplications={audioApplications} windowsAudioCapability={windowsAudioCapability} windowsAudioStatus={windowsAudioStatus} refreshAudioApplications={refreshAudioApplications} />;
  }

  const sessions = Object.values(sessionStates);
  const sourceStatus = testing || liveState === 'live' || liveState === 'reconnecting' ? 'healthy' : liveState === 'failed' ? 'warning' : 'stopped';
  const linkStatus = liveState === 'live' ? 'healthy' : liveState === 'starting' ? 'pending' : liveState === 'reconnecting' || liveState === 'failed' ? 'warning' : 'stopped';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <SignalRail t={t} levels={levels} sourceStatus={sourceStatus} linkStatus={linkStatus} obsClients={overlayClients} isLive={liveState !== 'idle'} />
      <aside className="sidebar"><header><span>LIVE</span><strong>TRANSLATE</strong><small>FOR OBS</small></header><Navigation destination={destination} setDestination={setDestination} t={t} locale={settings.locale} onLocale={(locale) => void updateSettings({ locale })} /></aside>
      <main id="main" className={`workspace view-${destination}`}>
        {destination === 'direct' && <DirectScreen settings={settings} updateSettings={updateSettings} captions={captions} metadata={metadata} devices={devices} levels={levels} liveState={liveState} sessions={sessions} elapsed={elapsed} testing={testing} onTest={() => void testSources()} onStart={() => void startLive()} onStop={() => void stopCapture()} onRetry={() => void startLive()} onToggleSource={toggleCaptureSource} t={t} locale={locale} onDiagnostics={() => setDestination('diagnostics')} audioApplications={audioApplications} windowsAudioCapability={windowsAudioCapability} windowsAudioStatus={windowsAudioStatus} refreshAudioApplications={refreshAudioApplications} />}
        {destination === 'appearance' && <AppearanceScreen settings={settings} updateSettings={updateSettings} captions={captions} t={t} />}
        {destination === 'obs' && <ObsScreen metadata={metadata} settings={settings} clients={overlayClients} copied={copied} copyUrl={copyUrl} t={t} />}
        {destination === 'diagnostics' && <DiagnosticsScreen diagnostics={diagnostics} metadata={metadata} permissions={permissions} hasKey={hasKey} setHasKey={setHasKey} saveKey={saveKey} t={t} onRefresh={() => void refreshDiagnostics()} onExport={() => void window.liveTranslate.app.exportDiagnostics()} />}
      </main>
      <ToastLayer toast={toast} clear={() => setToast(null)} />
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen" role="status"><div className="loader-bars"><i /><i /><i /><i /></div><span>LIVE TRANSLATE</span></div>;
}

interface OnboardingProps {
  settings: AppSettings; setSettings: (settings: AppSettings) => void; metadata: AppMetadata; permissions: PermissionState; setPermissions: (value: PermissionState) => void;
  hasKey: boolean; saveKey: (key: string) => Promise<boolean>; keyState: KeyState; keyError?: string; devices: MediaDeviceInfo[]; refreshDevices: () => Promise<void>;
  levels: { microphone: number; guests: number }; setLevels: React.Dispatch<React.SetStateAction<{ microphone: number; guests: number }>>; copied: boolean; copyUrl: (text: string) => void;
  t: (typeof copy)[Locale]; updateSettings: (patch: Parameters<typeof window.liveTranslate.settings.update>[0]) => Promise<AppSettings>;
  audioApplications: WindowsAudioApplication[]; windowsAudioCapability: WindowsAudioCapability; windowsAudioStatus: WindowsAudioCaptureStatus | null; refreshAudioApplications: () => Promise<void>;
}

function Onboarding(props: OnboardingProps) {
  const { settings, t, updateSettings } = props;
  const step = Math.min(settings.onboardingStep, 4);
  const next = async () => updateSettings({ onboardingStep: Math.min(5, step + 1) });
  const back = async () => updateSettings({ onboardingStep: Math.max(0, step - 1) });
  return (
    <div className="onboarding-shell">
      <header className="onboarding-top"><div className="onboarding-logo"><span>LT</span><strong>LIVE TRANSLATE <small>FOR OBS</small></strong></div><div className="onboarding-locale"><button className={settings.locale === 'fr' ? 'active' : ''} onClick={() => void updateSettings({ locale: 'fr' })}>FR</button><button className={settings.locale === 'en' ? 'active' : ''} onClick={() => void updateSettings({ locale: 'en' })}>EN</button></div></header>
      <div className="onboarding-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={5}>{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index <= step ? 'active' : ''} />)}<span>{t.setupStep} {step + 1}/5</span></div>
      <main className="onboarding-grid">
        <aside><span className="kicker">0{step + 1} / 05</span><h1>{[t.welcome, t.apiTitle, t.permissionsTitle, t.captionTitle, t.obsTitle][step]}</h1><p>{[t.welcomeBody, t.apiBody, t.permissionsBody, t.mixedInfo, t.obsBody][step]}</p></aside>
        <section className="onboarding-step">
          {step === 0 && <WelcomeStep t={t} />}
          {step === 1 && <ApiStep {...props} />}
          {step === 2 && <SourcesStep {...props} />}
          {step === 3 && <CaptionStep {...props} />}
          {step === 4 && <ObsCheckStep {...props} />}
        </section>
      </main>
      <footer className="onboarding-footer">
        <button className="button ghost" disabled={step === 0} onClick={() => void back()}><ChevronLeft size={18} />{t.back}</button>
        {step === 0 && <button className="button primary wide" onClick={() => void next()}>{t.configure}</button>}
        {step === 1 && <button className="button primary wide" disabled={!props.hasKey || props.keyState === 'loading'} onClick={() => void next()}>{t.continue}</button>}
        {step === 2 && <button className="button primary wide" disabled={props.permissions.microphone !== 'granted'} onClick={() => void next()}>{t.continue}</button>}
        {step === 3 && <button className="button primary wide" onClick={() => void next()}>{t.continue}</button>}
        {step === 4 && <button className="button primary wide" onClick={() => void updateSettings({ onboardingStep: 5, onboardingComplete: true })}>{t.finish}</button>}
      </footer>
    </div>
  );
}

function WelcomeStep({ t }: { t: (typeof copy)[Locale] }) {
  const rows = [[ShieldCheck, t.privacy], [LockKeyhole, t.localKey], [FileDown, t.noTranscript]] as const;
  return <div className="promise-list">{rows.map(([Icon, label]) => <div key={label}><Icon /><span>{label}</span><Check /></div>)}</div>;
}

function ApiStep({ hasKey, saveKey, keyState, keyError, t }: OnboardingProps) {
  const [key, setKey] = useState('');
  const submit = async () => { const ok = await saveKey(key); setKey(''); if (ok) setKey(''); };
  return <div className="api-step"><label className="field"><span>OPENAI API KEY</span><div className="input-with-icon"><KeyRound /><input type="password" value={key} autoComplete="off" spellCheck={false} placeholder={hasKey ? '••••••••••••••••' : t.apiPlaceholder} onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} /></div></label>{keyError && <p className="inline-alert danger"><CircleAlert />{keyError}</p>}{hasKey && keyState !== 'error' && <p className="inline-alert success"><Check />{t.keyReady}</p>}<button className="button test-key" onClick={() => void submit()} disabled={keyState === 'loading' || !key.trim()}>{keyState === 'loading' ? t.starting : t.testKey}</button><a className="external-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys <ExternalLink /></a><p className="cost-footnote">{t.costNote}</p></div>;
}

function SourcesStep({ settings, permissions, setPermissions, devices, refreshDevices, levels, setLevels, t, updateSettings, audioApplications, windowsAudioCapability, windowsAudioStatus, refreshAudioApplications }: OnboardingProps) {
  const micRef = useRef<MediaStream | null>(null); const guestRef = useRef<MediaStream | null>(null); const stops = useRef<Array<() => void>>([]);
  const guestMeterStop = useRef<(() => void) | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  useEffect(() => () => { stops.current.forEach((stop) => stop()); guestMeterStop.current?.(); closeCaptureStream(micRef.current); closeCaptureStream(guestRef.current); }, []);
  const requestMic = async () => {
    setMicBusy(true);
    try {
      const current = await window.liveTranslate.app.permissions();
      if (current.microphone === 'denied' || current.microphone === 'restricted') {
        setPermissions(current);
        await window.liveTranslate.app.openMicrophoneSettings();
        return;
      }
      const granted = await window.liveTranslate.app.requestMicrophonePermission();
      if (!granted) {
        setPermissions({ ...current, microphone: 'denied' });
        await window.liveTranslate.app.openMicrophoneSettings();
        return;
      }
      stops.current.forEach((stop) => stop()); stops.current = [];
      closeCaptureStream(micRef.current);
      const stream = await captureMicrophone(settings.captureProfile.microphoneDeviceId); micRef.current = stream; stops.current.push(watchLevel(stream, (microphone) => setLevels((value) => ({ ...value, microphone }))));
      setPermissions({ ...permissions, microphone: 'granted' }); await refreshDevices();
    } catch {
      setPermissions({ ...permissions, microphone: 'denied' });
      await window.liveTranslate.app.openMicrophoneSettings();
    } finally {
      setMicBusy(false);
    }
  };
  const requestSystem = async () => {
    try { guestMeterStop.current?.(); closeCaptureStream(guestRef.current); const stream = await captureGuests(settings.captureProfile); guestRef.current = stream; guestMeterStop.current = watchLevel(stream, (guests) => setLevels((value) => ({ ...value, guests }))); setPermissions({ ...permissions, screen: 'granted' }); }
    catch { setPermissions({ ...permissions, screen: 'denied' }); }
  };
  const options = devices.map((device, index) => ({ value: device.deviceId, label: device.label || `${t.microphone} ${index + 1}` }));
  return <div className="source-setup"><div className="permission-row"><div><Mic2 /><span><strong>{t.microphone}</strong><small>{options.find(({ value }) => value === settings.captureProfile.microphoneDeviceId)?.label ?? options[0]?.label ?? t.noDevice}</small></span></div><PermissionBadge state={permissions.microphone} t={t} /></div>{options.length > 0 && <SelectField ariaLabel={t.microphone} value={settings.captureProfile.microphoneDeviceId ?? options[0].value} options={options} onValueChange={(microphoneDeviceId) => void updateSettings({ captureProfile: { ...settings.captureProfile, microphoneDeviceId } })} />}<Meter value={levels.microphone} label={t.microphone} /><button className="button" disabled={micBusy} onClick={() => void requestMic()}>{micBusy ? t.starting : permissions.microphone === 'denied' || permissions.microphone === 'restricted' ? t.openMicSettings : t.authorizeMic}</button>{(permissions.microphone === 'denied' || permissions.microphone === 'restricted') && <p className="inline-alert warning"><CircleAlert />{t.permissionDenied}</p>}<div className="permission-row separated"><div><Volume2 /><span><strong>{t.guests}</strong><small>{guestSourceName(settings, t)}</small></span></div><PermissionBadge state={permissions.screen} t={t} /></div><GuestSourceSelectors settings={settings} updateSettings={updateSettings} deviceOptions={options} t={t} audioApplications={audioApplications} capability={windowsAudioCapability} status={windowsAudioStatus} onRefresh={refreshAudioApplications} /><Meter value={levels.guests} label={t.guests} /><button className="button" onClick={() => void requestSystem()}>{t.chooseSystem}</button>{permissions.screen === 'denied' && <p className="inline-alert warning"><CircleAlert />{settings.captureProfile.guestSource === 'system' ? t.systemMissing : t.permissionDenied}</p>}</div>;
}

function metadataPlatformCopy() { return navigator.userAgent.includes('Mac') ? 'macOS ScreenCaptureKit' : 'Windows loopback'; }

function guestSourceName(settings: AppSettings, t: (typeof copy)[Locale]): string {
  if (settings.captureProfile.guestSource === 'application') {
    return settings.captureProfile.guestApplicationName ?? t.waitingApplication;
  }
  if (settings.captureProfile.guestSource === 'input') return t.virtualInput;
  return metadataPlatformCopy();
}

function GuestSourceSelectors({ settings, updateSettings, deviceOptions, t, audioApplications, capability, status, onRefresh, disabled = false }: {
  settings: AppSettings;
  updateSettings: OnboardingProps['updateSettings'];
  deviceOptions: Array<{ value: string; label: string }>;
  t: (typeof copy)[Locale];
  audioApplications: WindowsAudioApplication[];
  capability: WindowsAudioCapability;
  status: WindowsAudioCaptureStatus | null;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}) {
  const isWindows = navigator.userAgent.includes('Windows');
  const sourceOptions = [
    ...(capability.supported || settings.captureProfile.guestSource === 'application'
      ? [{ value: 'application', label: t.applicationCapture }]
      : []),
    { value: 'system', label: isWindows ? t.systemCapture : t.systemAudio },
    { value: 'input', label: t.virtualInput },
  ];
  const applicationOptions = audioApplications.map(({ id, name }) => ({ value: id, label: name }));
  const changeSource = (guestSource: string) => {
    const first = audioApplications[0];
    void updateSettings({
      captureProfile: {
        ...settings.captureProfile,
        guestSource: guestSource as AppSettings['captureProfile']['guestSource'],
        guestApplicationId: guestSource === 'application'
          ? settings.captureProfile.guestApplicationId ?? first?.id ?? null
          : settings.captureProfile.guestApplicationId,
        guestApplicationName: guestSource === 'application'
          ? settings.captureProfile.guestApplicationName ?? first?.name ?? null
          : settings.captureProfile.guestApplicationName,
      },
    });
  };
  return <div className="guest-source-controls"><SelectField ariaLabel={t.guests} value={settings.captureProfile.guestSource} options={sourceOptions} disabled={disabled} onValueChange={changeSource} />{settings.captureProfile.guestSource === 'application' && <div className="application-picker">{capability.supported && applicationOptions.length > 0 ? <SelectField ariaLabel={t.applicationCapture} value={settings.captureProfile.guestApplicationId ?? applicationOptions[0].value} options={applicationOptions} disabled={disabled} onValueChange={(guestApplicationId) => { const selected = audioApplications.find(({ id }) => id === guestApplicationId); void updateSettings({ captureProfile: { ...settings.captureProfile, guestApplicationId, guestApplicationName: selected?.name ?? guestApplicationId } }); }} /> : <small>{capability.supported ? t.noApplications : t.applicationUnsupported}</small>}<button className="button refresh-apps" disabled={disabled || !capability.supported} onClick={() => void onRefresh()}><icons.RefreshCcw />{t.refreshApplications}</button><small>{status?.applicationId === settings.captureProfile.guestApplicationId && status.status === 'waiting' ? `${t.waitingApplication} ${status.applicationName}…` : t.applicationHint}</small></div>}{settings.captureProfile.guestSource === 'input' && deviceOptions.length > 0 && <SelectField ariaLabel={t.virtualInput} value={settings.captureProfile.guestDeviceId ?? deviceOptions[0].value} options={deviceOptions} disabled={disabled} onValueChange={(guestDeviceId) => void updateSettings({ captureProfile: { ...settings.captureProfile, guestDeviceId } })} />}</div>;
}

function CaptionStep({ settings, t, updateSettings }: OnboardingProps) {
  return <div className="caption-step"><div className="field"><span>{t.input}</span><div className="readonly-control"><Languages />{t.automatic}<LockKeyhole /></div></div><label className="field"><span>{t.target}</span><LanguageSelect label={t.target} value={settings.targetLanguage} locale={settings.locale} onChange={(targetLanguage) => void updateSettings({ targetLanguage })} /></label><div className="field"><span>{t.mode}</span><CaptureModeTabs t={t} value={settings.captureProfile.mode} onChange={(mode) => void updateSettings({ captureProfile: { ...settings.captureProfile, mode } })} /></div><div className="mode-comparison"><div className={settings.captureProfile.mode === 'mixed' ? 'selected' : ''}><strong>{t.mixed}</strong><span>{t.mixedInfo}</span></div><div className={settings.captureProfile.mode === 'split' ? 'selected' : ''}><strong>{t.split}</strong><span>{t.splitInfo}</span></div></div></div>;
}

function ObsCheckStep({ settings, metadata, copied, copyUrl, t }: OnboardingProps) {
  const sample = [previewCaption(settings.captureProfile.mode === 'split' ? 'host' : 'mixed', settings.locale === 'fr' ? 'Bienvenue dans notre interview en direct.' : 'Welcome to our live interview.', 1)];
  return <div className="obs-check"><OverlayStage captions={sample} config={settings.overlay} profile={settings.captureProfile} /><label className="url-strip"><span>{t.urlLabel}</span><code>{metadata.overlayUrl}</code><ClipboardButton text={metadata.overlayUrl} copied={copied} onCopy={copyUrl} t={t} /></label><ol><li><span>01</span>{t.obsStep1}</li><li><span>02</span>{t.obsStep2}</li><li><span>03</span>{t.obsStep3}</li></ol></div>;
}

interface ScreenBase { settings: AppSettings; updateSettings: (patch: Parameters<typeof window.liveTranslate.settings.update>[0]) => Promise<AppSettings>; t: (typeof copy)[Locale]; }

function PageHeader({ kicker, title, detail, trailing }: { kicker: string; title: string; detail: string; trailing?: React.ReactNode }) { return <header className="page-header"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p>{detail}</p></div>{trailing}</header>; }

function DirectScreen({ settings, updateSettings, captions, metadata, devices, levels, liveState, sessions, elapsed, testing, onTest, onStart, onStop, onRetry, onToggleSource, t, locale, onDiagnostics, audioApplications, windowsAudioCapability, windowsAudioStatus, refreshAudioApplications }: ScreenBase & {
  captions: CaptionState[]; metadata: AppMetadata; devices: MediaDeviceInfo[]; levels: { microphone: number; guests: number }; liveState: SessionStatus; sessions: SessionStateUpdate[]; elapsed: number; testing: boolean;
  onTest: () => void; onStart: () => void; onStop: () => void; onRetry: () => void; onToggleSource: (source: 'microphone' | 'guests') => void; locale: Locale; onDiagnostics: () => void;
  audioApplications: WindowsAudioApplication[]; windowsAudioCapability: WindowsAudioCapability; windowsAudioStatus: WindowsAudioCaptureStatus | null; refreshAudioApplications: () => Promise<void>;
}) {
  const locked = liveState !== 'idle' && liveState !== 'failed';
  const count = sessionCountForMode(settings.captureProfile.mode);
  const hourly = PRICE_PER_SESSION_MINUTE_USD * 60 * count;
  const currentCost = PRICE_PER_SESSION_MINUTE_USD * count * (elapsed / 60);
  const deviceOptions = devices.map((device, index) => ({ value: device.deviceId, label: device.label || `${t.microphone} ${index + 1}` }));
  const mic = devices.find(({ deviceId }) => deviceId === settings.captureProfile.microphoneDeviceId)?.label ?? devices[0]?.label ?? t.noDevice;
  const failed = sessions.find(({ status }) => status === 'failed');
  return <div className="screen direct-screen"><PageHeader kicker={liveState === 'live' ? 'ON AIR / TRANSLATION' : 'CONSOLE / 01'} title={t.direct} detail={liveState === 'live' ? t.healthy : t.liveReady} trailing={<span className={`live-badge ${liveState}`}><i />{liveState === 'live' ? t.online : liveState === 'reconnecting' ? t.reconnecting : t.offline}</span>} /><div className="direct-grid"><section className="direct-main"><div className="preview-heading"><span>OUTPUT / {settings.targetLanguage.toUpperCase()}</span><span>{metadata.overlayClients} OBS</span></div><OverlayStage captions={captions} config={settings.overlay} profile={settings.captureProfile} emptyText={t.previewEmpty} /><div className="sources-list"><SourceStrip kind="microphone" label={t.microphone} device={settings.captureProfile.microphoneEnabled ? mic : t.muted} level={settings.captureProfile.microphoneEnabled ? levels.microphone : 0} status={!settings.captureProfile.microphoneEnabled ? 'stopped' : levels.microphone > .01 ? 'healthy' : 'stopped'} enabled={settings.captureProfile.microphoneEnabled} onToggle={() => onToggleSource('microphone')} toggleLabel={settings.captureProfile.microphoneEnabled ? t.disableMicrophone : t.enableMicrophone}>{deviceOptions.length > 0 && <SelectField ariaLabel={t.microphone} value={settings.captureProfile.microphoneDeviceId ?? deviceOptions[0].value} options={deviceOptions} disabled={locked} onValueChange={(microphoneDeviceId) => void updateSettings({ captureProfile: { ...settings.captureProfile, microphoneDeviceId } })} />}</SourceStrip><SourceStrip kind="guests" label={t.guests} device={settings.captureProfile.guestsEnabled ? guestSourceName(settings, t) : t.muted} level={settings.captureProfile.guestsEnabled ? levels.guests : 0} status={!settings.captureProfile.guestsEnabled ? 'stopped' : levels.guests > .01 ? 'healthy' : windowsAudioStatus?.status === 'waiting' ? 'pending' : 'stopped'} enabled={settings.captureProfile.guestsEnabled} onToggle={() => onToggleSource('guests')} toggleLabel={settings.captureProfile.guestsEnabled ? t.disableGuests : t.enableGuests}><GuestSourceSelectors settings={settings} updateSettings={updateSettings} deviceOptions={deviceOptions} t={t} audioApplications={audioApplications} capability={windowsAudioCapability} status={windowsAudioStatus} onRefresh={refreshAudioApplications} disabled={locked} /></SourceStrip></div></section><aside className="live-settings"><section><label>{t.input}</label><div className="value-row"><Languages />{t.automatic}</div></section><section><label>{t.target}</label><LanguageSelect label={t.target} value={settings.targetLanguage} locale={locale} disabled={locked} onChange={(targetLanguage) => void updateSettings({ targetLanguage })} /></section><section><label>{t.mode}</label><CaptureModeTabs t={t} value={settings.captureProfile.mode} disabled={locked} onChange={(mode) => void updateSettings({ captureProfile: { ...settings.captureProfile, mode } })} /><small>{settings.captureProfile.mode === 'mixed' ? t.mixedInfo : t.splitInfo}</small></section>{settings.captureProfile.mode === 'split' && <section className="label-settings"><label>{t.hostLabel}<input disabled={locked} value={settings.captureProfile.hostLabel} maxLength={32} onChange={(event) => void updateSettings({ captureProfile: { ...settings.captureProfile, hostLabel: event.target.value || t.host } })} /></label><label>{t.guestLabel}<input disabled={locked} value={settings.captureProfile.guestLabel} maxLength={32} onChange={(event) => void updateSettings({ captureProfile: { ...settings.captureProfile, guestLabel: event.target.value || t.guest } })} /></label></section>}<div className="stat-strip"><div><span>{count === 1 ? t.session : t.sessions}</span><strong>{count}</strong></div><div><span>{t.elapsed}</span><strong>{formatElapsed(elapsed)}</strong></div><div><span>{t.estimate}</span><strong>${currentCost.toFixed(2)}</strong><small>${hourly.toFixed(2)}/h</small></div></div><small className="price-date">{PRICE_EFFECTIVE_DATE}</small>{locked && <p className="locked-note"><LockKeyhole />{t.settingsLocked}</p>}{failed && <div className="failure-box"><CircleAlert /><strong>{t.fiveFailures}</strong><span>{failed.errorCode}</span><button onClick={onDiagnostics}>{t.openDiagnostic}</button></div>}</aside></div><footer className="action-dock"><button className="button secondary-action" onClick={onTest} disabled={locked}>{testing ? t.stopTest : t.testSources}</button><div id="live-state" className="state-text" aria-live="polite">{liveState === 'reconnecting' ? `${t.retryAttempt} ${Math.max(...sessions.map(({ attempt }) => attempt ?? 0), 1)}/5` : t.idleHint}</div><LiveControl state={liveState} elapsed={elapsed} onStart={onStart} onStop={onStop} onRetry={onRetry} t={t} /></footer></div>;
}

function AppearanceScreen({ settings, updateSettings, captions, t }: ScreenBase & { captions: CaptionState[] }) {
  const [scenario, setScenario] = useState<'short' | 'long' | 'overlap'>('long');
  const samples: Record<typeof scenario, CaptionState[]> = {
    short: [previewCaption(settings.captureProfile.mode === 'split' ? 'host' : 'mixed', settings.locale === 'fr' ? 'La traduction reste lisible.' : 'Translation stays easy to read.', 1)],
    long: [previewCaption(settings.captureProfile.mode === 'split' ? 'host' : 'mixed', settings.locale === 'fr' ? "Quand une réponse devient plus longue, l’application conserve chaque mot, remplit la zone disponible puis continue naturellement sur la page suivante sans couper le début de la phrase ni faire disparaître sa conclusion." : 'When an answer becomes longer, the application keeps every word, fills the available area, and then continues naturally on the next page without cutting off the beginning or losing the conclusion.', 2)],
    overlap: [
      previewCaption('host', settings.locale === 'fr' ? 'Je voudrais revenir sur ce point.' : 'I would like to come back to that point.', 3, settings.captureProfile.hostLabel),
      previewCaption('guest', settings.locale === 'fr' ? 'Bien sûr, je vais préciser ma réponse.' : 'Of course, let me clarify my answer.', 4, settings.captureProfile.guestLabel),
    ],
  };
  const sample = captions.length ? captions : samples[scenario];
  const updateOverlay = async (overlay: OverlayConfig) => { await window.liveTranslate.overlay.updateConfig(overlay); setTimeout(() => void updateSettings({ overlay }), 0); };
  return <div className="screen appearance-screen"><PageHeader kicker="OVERLAY / 02" title={t.appearanceTitle} detail={t.appearanceBody} /><div className="scenario-toolbar"><span>{t.previewScenario}</span><div>{(['short', 'long', 'overlap'] as const).map((value) => <button key={value} className={scenario === value ? 'active' : ''} disabled={captions.length > 0} onClick={() => setScenario(value)}>{value === 'short' ? t.shortScenario : value === 'long' ? t.longScenario : t.overlapScenario}</button>)}</div></div><div className="appearance-preview"><OverlayStage captions={sample} config={settings.overlay} profile={settings.captureProfile} showGuides /></div><div className="appearance-editor"><div className="editor-context"><span>1920 × 1080</span><h2>OBS BROWSER SOURCE</h2><p>{t.obsStep3}</p><div className="token-rules"><i /><i /><i /><i /><i /><i /></div></div><OverlayControls config={settings.overlay} onChange={(overlay) => void updateOverlay(overlay)} t={t} /></div></div>;
}

function ObsScreen({ metadata, settings, clients, copied, copyUrl, t }: { metadata: AppMetadata; settings: AppSettings; clients: number; copied: boolean; copyUrl: (text: string) => void; t: (typeof copy)[Locale] }) {
  return <div className="screen obs-screen"><PageHeader kicker="OUTPUT / 03" title={t.obsSetupTitle} detail={t.obsBody} trailing={<span className={`status-chip ${clients ? 'success' : 'neutral'}`}>{clients ? <Check /> : <MonitorUp />}{clients} {clients === 1 ? t.connected : t.connectedPlural}</span>} /><div className="obs-layout"><section><div className="url-panel"><span>{t.urlLabel}</span><code>{metadata.overlayUrl}</code><ClipboardButton prominent text={metadata.overlayUrl} copied={copied} onCopy={copyUrl} t={t} /></div><ol className="obs-steps"><li><span>01</span><div><strong>Browser Source</strong><p>{t.obsStep1}</p></div></li><li><span>02</span><div><strong>1920 × 1080</strong><p>{t.obsStep2}</p></div></li><li><span>03</span><div><strong>Layer order</strong><p>{t.obsStep3}</p></div></li></ol></section><aside><div className="obs-diagram"><span className="diagram-label">1920 × 1080</span><div className="diagram-safe"><span>SAFE AREA</span><div className="diagram-caption"><i>{settings.captureProfile.mode === 'split' ? settings.captureProfile.hostLabel : 'LIVE'}</i><b>Translated caption</b></div></div></div><div className="connection-count"><MonitorUp /><div><strong>{clients}</strong><span>{clients === 1 ? t.connected : t.connectedPlural}</span></div></div></aside></div></div>;
}

function DiagnosticsScreen({ diagnostics, metadata, permissions, hasKey, setHasKey, saveKey, t, onRefresh, onExport }: { diagnostics: DiagnosticsSnapshot; metadata: AppMetadata; permissions: PermissionState; hasKey: boolean; setHasKey: (value: boolean) => void; saveKey: (key: string) => Promise<boolean>; t: (typeof copy)[Locale]; onRefresh: () => void; onExport: () => void }) {
  const [keyInput, setKeyInput] = useState('');
  const [keyMessage, setKeyMessage] = useState<string>();
  const [keyBusy, setKeyBusy] = useState(false);
  const checkStored = async () => { setKeyBusy(true); const result = await window.liveTranslate.key.validateStored(); setHasKey(result.hasKey); setKeyMessage(result.ok ? t.keyReady : result.errorCode === 'invalid_key' ? t.keyInvalid : t.keyUnknown); setKeyBusy(false); };
  const replace = async () => { setKeyBusy(true); const ok = await saveKey(keyInput); setKeyInput(''); setKeyMessage(ok ? t.keyReady : t.keyUnknown); setKeyBusy(false); };
  const remove = async () => { setKeyBusy(true); const result = await window.liveTranslate.key.delete(); setHasKey(result.hasKey); setKeyInput(''); setKeyMessage(t.keyMissing); setKeyBusy(false); };
  const checks = [{ label: 'API key', ok: hasKey, value: hasKey ? t.healthy : t.stopped, Icon: icons.KeyRound }, { label: t.microphone, ok: permissions.microphone === 'granted', value: permissions.microphone, Icon: icons.Mic2 }, { label: t.systemAudio, ok: permissions.screen === 'granted', value: permissions.screen, Icon: icons.Volume2 }, { label: t.overlayServer, ok: Boolean(metadata.overlayUrl), value: `127.0.0.1:${diagnostics.overlayPort}`, Icon: icons.MonitorUp }, { label: t.connectedPlural, ok: diagnostics.overlayClients > 0, value: String(diagnostics.overlayClients), Icon: icons.Radio }, { label: t.appVersion, ok: true, value: metadata.version, Icon: icons.Activity }];
  return <div className="screen diagnostics-screen"><PageHeader kicker="SYSTEM / 04" title={t.diagTitle} detail={t.diagBody} trailing={<button className="button" onClick={onRefresh}><icons.RefreshCcw />{t.retry}</button>} /><div className="diagnostic-layout"><section><div className="checks-list">{checks.map(({ label, ok, value, Icon }) => <div className="check-row" key={label}><Icon /><strong>{label}</strong><code>{value}</code><span className={`status-chip ${ok ? 'success' : 'warning'}`}>{ok ? <Check /> : <CircleAlert />}{ok ? t.healthy : t.warning}</span></div>)}</div><div className="key-maintenance"><span className="kicker">API / CREDENTIAL</span><h2>{t.apiKeys}</h2><p>{hasKey ? t.keyReady : t.keyMissing}</p><input type="password" autoComplete="off" spellCheck={false} placeholder={t.apiPlaceholder} value={keyInput} onChange={(event) => setKeyInput(event.target.value)} /><div><button className="button" disabled={keyBusy || !hasKey} onClick={() => void checkStored()}>{t.keyCheck}</button><button className="button primary" disabled={keyBusy || !keyInput.trim()} onClick={() => void replace()}>{hasKey ? t.replaceKey : t.testKey}</button>{hasKey && <button className="button danger-quiet" disabled={keyBusy} onClick={() => void remove()}>{t.deleteKey}</button>}</div>{keyMessage && <small>{keyMessage}</small>}</div></section><aside className="events-panel"><header><span>EVENT LOG</span><button className="button" onClick={onExport}><FileDown />{t.export}</button></header>{diagnostics.entries.length ? <div className="event-list">{diagnostics.entries.map((entry) => <EventRow entry={entry} key={entry.id} />)}</div> : <div className="empty-events"><icons.Activity /><p>{t.noEvents}</p></div>}</aside></div></div>;
}

function EventRow({ entry }: { entry: DiagnosticEntry }) { return <div className={`event-row level-${entry.level}`}><time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><code>{entry.code}</code><p>{entry.message}</p></div>; }

function previewCaption(source: CaptionState['source'], text: string, sequence: number, label?: string): CaptionState {
  const now = Date.now();
  return {
    source,
    label,
    utteranceId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    revision: 1,
    isFinal: true,
    text,
    sequence,
    receivedAt: now,
    expiresAt: now + 60_000,
    visible: true,
  };
}
