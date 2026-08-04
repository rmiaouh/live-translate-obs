import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { release } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, BrowserWindow, MessageChannelMain, type MessagePortMain } from 'electron';
import { z } from 'zod';
import {
  IPC,
  WindowsAudioApplicationSchema,
  type WindowsAudioApplication,
  type WindowsAudioCapability,
  type WindowsAudioCaptureStatus,
  type WindowsAudioStartInput,
  type WindowsAudioStartResult,
} from '../shared/contracts';
import type { DiagnosticLog } from './diagnostics';

const execFileAsync = promisify(execFile);
const MINIMUM_PROCESS_LOOPBACK_BUILD = 20_348;
const RETRY_DELAY_MS = 2_000;
const MAX_CAPTURE_FAILURES = 5;

const ListedApplicationSchema = WindowsAudioApplicationSchema.extend({
  pid: z.number().int().positive(),
});

interface ActiveCapture {
  captureId: string;
  applicationId: string;
  applicationName: string;
  process: ChildProcess | null;
  port: MessagePortMain;
  retryTimer: NodeJS.Timeout | null;
  stopped: boolean;
  failures: number;
}

export class WindowsAudioService {
  private active: ActiveCapture | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly diagnostics: DiagnosticLog,
  ) {}

  capability(): WindowsAudioCapability {
    const build = windowsBuild();
    if (process.platform !== 'win32') return { supported: false, build, reason: 'platform' };
    if (build < MINIMUM_PROCESS_LOOPBACK_BUILD) {
      return { supported: false, build, reason: 'windows_build' };
    }
    if (!existsSync(this.helperPath())) return { supported: false, build, reason: 'helper_missing' };
    return { supported: true, build, reason: 'available' };
  }

  async listApplications(): Promise<WindowsAudioApplication[]> {
    return (await this.listInternal()).map((application) => ({
      id: application.id,
      name: application.name,
      type: application.type,
      available: application.available,
    }));
  }

  async start(input: WindowsAudioStartInput): Promise<WindowsAudioStartResult> {
    this.stop();
    const capability = this.capability();
    if (!capability.supported) throw new Error(capability.reason ?? 'unsupported');

    const captureId = randomUUID();
    const { port1, port2 } = new MessageChannelMain();
    const active: ActiveCapture = {
      captureId,
      applicationId: input.applicationId,
      applicationName: input.applicationName,
      process: null,
      port: port2,
      retryTimer: null,
      stopped: false,
      failures: 0,
    };
    this.active = active;
    port2.start();
    this.window.webContents.postMessage(
      IPC.windowsAudioPort,
      { captureId, sampleRate: 48_000, channels: 1 },
      [port1],
    );
    this.sendStatus(active, 'starting');
    void this.attach(active);
    return { captureId, sampleRate: 48_000, channels: 1 };
  }

  stop(captureId?: string): void {
    const active = this.active;
    if (!active || (captureId && active.captureId !== captureId)) return;
    active.stopped = true;
    if (active.retryTimer) clearTimeout(active.retryTimer);
    active.retryTimer = null;
    active.process?.kill();
    active.process = null;
    active.port.close();
    this.sendStatus(active, 'stopped');
    this.active = null;
  }

  private async attach(active: ActiveCapture): Promise<void> {
    if (active.stopped || this.active !== active) return;
    try {
      const applications = await this.listInternal();
      const application = applications.find(({ id }) => id === active.applicationId);
      if (!application) {
        this.sendStatus(active, 'waiting');
        this.scheduleRetry(active);
        return;
      }
      this.spawnCapture(active, application.pid);
    } catch (error) {
      active.failures += 1;
      this.diagnostics.add('warning', 'windows_audio_list_failed', technicalErrorCode(error));
      if (active.failures >= MAX_CAPTURE_FAILURES) {
        this.sendStatus(active, 'failed', 'application_list_failed');
      } else {
        this.sendStatus(active, 'waiting', 'application_list_failed');
        this.scheduleRetry(active);
      }
    }
  }

  private spawnCapture(active: ActiveCapture, pid: number): void {
    if (active.stopped || this.active !== active) return;
    const child = spawn(this.helperPath(), ['--capture', String(pid)], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    active.process = child;
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      if (active.stopped || this.active !== active) return;
      const copy = Uint8Array.from(chunk);
      active.port.postMessage({ type: 'pcm', captureId: active.captureId, data: copy.buffer });
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-1_024);
      if (stderr.includes('ready')) {
        active.failures = 0;
        this.sendStatus(active, 'live');
      }
    });
    child.on('error', (error) => {
      this.diagnostics.add('warning', 'windows_audio_helper_failed', technicalErrorCode(error));
    });
    child.on('close', (code) => {
      if (active.process === child) active.process = null;
      if (active.stopped || this.active !== active) return;
      active.failures += 1;
      const errorCode = sanitizeHelperError(stderr) ?? `helper_exit_${code ?? 'unknown'}`;
      this.diagnostics.add('warning', 'windows_audio_capture_interrupted', errorCode);
      if (active.failures >= MAX_CAPTURE_FAILURES) {
        this.sendStatus(active, 'failed', errorCode);
      } else {
        this.sendStatus(active, 'waiting', errorCode);
        this.scheduleRetry(active);
      }
    });
  }

  private scheduleRetry(active: ActiveCapture): void {
    if (active.stopped || active.retryTimer || this.active !== active) return;
    active.retryTimer = setTimeout(() => {
      active.retryTimer = null;
      void this.attach(active);
    }, RETRY_DELAY_MS);
  }

  private async listInternal(): Promise<Array<z.infer<typeof ListedApplicationSchema>>> {
    const capability = this.capability();
    if (!capability.supported) return [];
    const { stdout } = await execFileAsync(this.helperPath(), ['--list'], {
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 1_048_576,
      encoding: 'utf8',
    });
    return z.array(ListedApplicationSchema).parse(JSON.parse(stdout));
  }

  private sendStatus(
    active: ActiveCapture,
    status: WindowsAudioCaptureStatus['status'],
    errorCode?: string,
  ): void {
    if (this.window.isDestroyed()) return;
    const update: WindowsAudioCaptureStatus = {
      captureId: active.captureId,
      applicationId: active.applicationId,
      applicationName: active.applicationName,
      status,
      errorCode,
    };
    this.window.webContents.send(IPC.windowsAudioStatus, update);
  }

  private helperPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'windows-audio-capture.exe')
      : path.join(app.getAppPath(), 'native', 'windows-audio-capture', 'bin', 'x64', 'Release', 'windows-audio-capture.exe');
  }
}

function windowsBuild(): number {
  if (process.platform !== 'win32') return 0;
  const parts = release().split('.');
  return Number.parseInt(parts[2] ?? '0', 10) || 0;
}

function sanitizeHelperError(stderr: string): string | undefined {
  const match = stderr.match(/(?:activation|audio|capture|com)_[a-z_]+(?::0x[0-9a-f]+)?/iu);
  return match?.[0].slice(0, 80);
}

function technicalErrorCode(error: unknown): string {
  if (error instanceof Error) return error.name.slice(0, 80);
  return 'unknown_error';
}
