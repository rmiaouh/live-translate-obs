import type { CaptionSource, CaptureMode, CaptureProfile, SessionStateUpdate, TargetLanguage } from '../shared/contracts';
import { Float32PcmAssembler } from '../shared/pcm';

const streamCleanup = new WeakMap<MediaStream, () => void>();
const windowsAudioPorts = new Map<string, MessagePort>();
const windowsAudioPortWaiters = new Map<string, (port: MessagePort) => void>();

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'live-translate-windows-audio-port') return;
  const captureId = event.data?.metadata?.captureId;
  const port = event.ports[0];
  if (typeof captureId !== 'string' || !port) return;
  const waiter = windowsAudioPortWaiters.get(captureId);
  if (waiter) {
    windowsAudioPortWaiters.delete(captureId);
    waiter(port);
  } else {
    windowsAudioPorts.set(captureId, port);
  }
});

export interface CaptureBundle {
  microphone: MediaStream;
  guests: MediaStream | null;
  translation: Array<{ source: CaptionSource; stream: MediaStream }>;
  close(): void;
}

export interface StartCaptureOptions {
  profile: CaptureProfile;
  includeSystem: boolean;
}

export function setCaptureSourceEnabled(
  bundle: Pick<CaptureBundle, 'microphone' | 'guests'>,
  source: 'microphone' | 'guests',
  enabled: boolean,
): void {
  const stream = source === 'microphone' ? bundle.microphone : bundle.guests;
  stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
}

const audioConstraints = (deviceId: string | null): MediaTrackConstraints => ({
  deviceId: deviceId ? { exact: deviceId } : undefined,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(({ kind }) => kind === 'audioinput');
}

export async function captureMicrophone(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false });
}

export async function captureGuests(profile: CaptureProfile): Promise<MediaStream> {
  if (profile.guestSource === 'input') {
    return navigator.mediaDevices.getUserMedia({ audio: audioConstraints(profile.guestDeviceId), video: false });
  }

  if (profile.guestSource === 'application') {
    if (!profile.guestApplicationId || !profile.guestApplicationName) {
      throw new DOMException('No Windows application selected', 'NotFoundError');
    }
    return captureWindowsApplication(profile.guestApplicationId, profile.guestApplicationName);
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    systemAudio: 'include',
  } as DisplayMediaStreamOptions & { systemAudio: 'include' });

  const audioTrack = await waitForAudioTrack(stream, 3_000);
  if (!audioTrack) {
    for (const track of stream.getTracks()) track.stop();
    throw new DOMException('No system audio track was shared', 'NotFoundError');
  }

  // Chromium's macOS loopback is tied to the display-capture session. Keeping
  // the video track alive preserves system audio; disabling it prevents frames
  // from being rendered or forwarded. TranslationCall adds only the audio track.
  for (const track of stream.getVideoTracks()) track.enabled = false;
  return stream;
}

async function captureWindowsApplication(applicationId: string, applicationName: string): Promise<MediaStream> {
  const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
  await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
  const player = new AudioWorkletNode(context, 'live-translate-pcm-player', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const destination = context.createMediaStreamDestination();
  player.connect(destination);
  await context.resume();

  let captureId: string | undefined;
  let port: MessagePort | undefined;
  let closed = false;
  try {
    const started = await window.liveTranslate.windowsAudio.start({ applicationId, applicationName });
    captureId = started.captureId;
    port = await waitForWindowsAudioPort(captureId);
  } catch (error) {
    player.disconnect();
    await context.close();
    throw error;
  }

  const pcm = new Float32PcmAssembler();
  port.onmessage = ({ data }) => {
    if (closed || data?.type !== 'pcm' || !(data.data instanceof ArrayBuffer)) return;
    const samples = pcm.push(data.data);
    if (samples.length > 0) {
      player.port.postMessage(samples, [samples.buffer]);
    }
  };
  port.start();

  const stream = destination.stream;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    port?.close();
    player.disconnect();
    if (captureId) void window.liveTranslate.windowsAudio.stop(captureId);
    void context.close();
    streamCleanup.delete(stream);
  };
  streamCleanup.set(stream, cleanup);
  return stream;
}

function waitForWindowsAudioPort(captureId: string): Promise<MessagePort> {
  const existing = windowsAudioPorts.get(captureId);
  if (existing) {
    windowsAudioPorts.delete(captureId);
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      windowsAudioPortWaiters.delete(captureId);
      reject(new DOMException('Windows audio port timed out', 'TimeoutError'));
    }, 5_000);
    windowsAudioPortWaiters.set(captureId, (port) => {
      window.clearTimeout(timeout);
      resolve(port);
    });
  });
}

export function closeCaptureStream(stream: MediaStream | null): void {
  if (!stream) return;
  streamCleanup.get(stream)?.();
  stream.getTracks().forEach((track) => track.stop());
}

function waitForAudioTrack(stream: MediaStream, timeoutMs: number): Promise<MediaStreamTrack | null> {
  const existing = stream.getAudioTracks()[0];
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (track: MediaStreamTrack | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      stream.removeEventListener('addtrack', onTrack);
      stream.removeEventListener('inactive', onInactive);
      resolve(track);
    };
    const onTrack = () => {
      const track = stream.getAudioTracks()[0];
      if (track) finish(track);
    };
    const onInactive = () => finish(null);
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    stream.addEventListener('addtrack', onTrack);
    stream.addEventListener('inactive', onInactive, { once: true });
  });
}

function mixStreams(streams: MediaStream[]): { stream: MediaStream; close: () => void } {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  for (const stream of streams) {
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = 0.86;
    source.connect(gain).connect(destination);
  }
  return { stream: destination.stream, close: () => void context.close() };
}

export async function startCapture({ profile, includeSystem }: StartCaptureOptions): Promise<CaptureBundle> {
  const microphone = await captureMicrophone(profile.microphoneDeviceId);
  let guests: MediaStream | null = null;
  try {
    if (includeSystem) guests = await captureGuests(profile);
  } catch (error) {
    for (const track of microphone.getTracks()) track.stop();
    throw error;
  }

  const sourceStreams = { microphone, guests };
  setCaptureSourceEnabled(sourceStreams, 'microphone', profile.microphoneEnabled);
  setCaptureSourceEnabled(sourceStreams, 'guests', profile.guestsEnabled);

  let closeMix: () => void = () => undefined;
  let translation: Array<{ source: CaptionSource; stream: MediaStream }>;
  if (profile.mode === 'mixed') {
    const mix = mixStreams(guests ? [microphone, guests] : [microphone]);
    closeMix = mix.close;
    translation = [{ source: 'mixed', stream: mix.stream }];
  } else {
    translation = [{ source: 'host', stream: microphone }];
    if (guests) translation.push({ source: 'guest', stream: guests });
  }

  return {
    microphone,
    guests,
    translation,
    close() {
      closeMix();
      for (const stream of [microphone, guests, ...translation.map(({ stream }) => stream)]) {
        closeCaptureStream(stream);
      }
    },
  };
}

export function watchLevel(stream: MediaStream | null, onLevel: (level: number) => void): () => void {
  if (!stream?.getAudioTracks().length) {
    onLevel(0);
    return () => undefined;
  }
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  context.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let frame = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4.5));
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(frame);
    void context.close();
  };
}

type StateListener = (update: SessionStateUpdate) => void;
type DeltaListener = (source: CaptionSource, delta: string) => void;

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000] as const;

class TranslationCall {
  private pc: RTCPeerConnection | null = null;
  private stopped = false;
  private retryTimer: number | null = null;
  private attempt = 0;

  constructor(
    private readonly source: CaptionSource,
    private readonly stream: MediaStream,
    private readonly language: TargetLanguage,
    private readonly onState: StateListener,
    private readonly onDelta: DeltaListener,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.onState({ source: this.source, status: this.attempt ? 'reconnecting' : 'starting', attempt: this.attempt || undefined });
    try {
      const secret = await window.liveTranslate.realtime.createClientSecret({ targetLanguage: this.language, source: this.source });
      if (this.stopped) return;
      const pc = new RTCPeerConnection();
      this.pc = pc;
      const track = this.stream.getAudioTracks()[0];
      if (!track || track.readyState !== 'live') throw new Error('audio_track_unavailable');
      pc.addTrack(track, this.stream);
      // The translated remote audio track is intentionally never attached to a media element.
      pc.ontrack = ({ track: remoteTrack }) => {
        remoteTrack.enabled = false;
      };
      const events = pc.createDataChannel('oai-events');
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(String(data)) as { type?: string; delta?: unknown };
          if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
            this.onDelta(this.source, event.delta);
          }
        } catch {
          // Malformed realtime events are ignored and never logged with payload data.
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.attempt = 0;
          this.onState({ source: this.source, status: 'live' });
        } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && !this.stopped) {
          this.scheduleRetry('connection_lost');
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret.value}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error(`translation_${response.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    } catch (error) {
      if (!this.stopped) this.scheduleRetry(error instanceof Error ? error.message : 'connection_failed');
    }
  }

  private scheduleRetry(errorCode: string) {
    this.closePeer();
    if (this.retryTimer !== null || this.stopped) return;
    if (this.attempt >= RETRY_DELAYS.length) {
      this.onState({ source: this.source, status: 'failed', attempt: this.attempt, errorCode });
      return;
    }
    const delay = RETRY_DELAYS[this.attempt];
    this.attempt += 1;
    this.onState({ source: this.source, status: 'reconnecting', attempt: this.attempt, errorCode });
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.start();
    }, delay);
  }

  private closePeer() {
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.ontrack = null;
      this.pc.close();
      this.pc = null;
    }
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.closePeer();
    this.onState({ source: this.source, status: 'idle' });
  }
}

export class TranslationManager {
  private calls: TranslationCall[] = [];

  constructor(private readonly onState: StateListener, private readonly onDelta: DeltaListener) {}

  async start(streams: CaptureBundle['translation'], targetLanguage: TargetLanguage): Promise<void> {
    this.stop();
    this.calls = streams.map(({ source, stream }) => new TranslationCall(source, stream, targetLanguage, this.onState, this.onDelta));
    await Promise.all(this.calls.map((call) => call.start()));
  }

  stop() {
    this.calls.forEach((call) => call.stop());
    this.calls = [];
  }
}

export function sessionCountForMode(mode: CaptureMode) {
  return mode === 'split' ? 2 : 1;
}
