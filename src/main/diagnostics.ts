import { randomUUID } from 'node:crypto';
import type { DiagnosticEntry } from '../shared/contracts';
import { redactSecrets } from '../shared/redaction';

const MAX_ENTRIES = 200;

export class DiagnosticLog {
  private readonly entries: DiagnosticEntry[] = [];

  add(level: DiagnosticEntry['level'], code: string, message: string): void {
    this.entries.push({
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      code: code.slice(0, 80),
      message: redactSecrets(message).slice(0, 500),
    });

    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
  }

  snapshot(): DiagnosticEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  toText(metadata: Record<string, string | number | boolean>): string {
    const header = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
    const events = this.entries
      .map(
        (entry) =>
          `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.code}: ${entry.message}`,
      )
      .join('\n');

    return redactSecrets(`${header}\n\n${events}\n`);
  }
}
