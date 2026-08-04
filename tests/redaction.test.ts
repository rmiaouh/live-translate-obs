import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/shared/redaction';

describe('diagnostic redaction', () => {
  it('removes OpenAI keys, bearer tokens and overlay tokens', () => {
    const redacted = redactSecrets(
      'key sk-project-abcdefghijklmnopqrstuvwxyz Bearer abc.def-123 http://x?token=secret-value',
    );
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('abc.def-123');
    expect(redacted).not.toContain('secret-value');
    expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(3);
  });
});
