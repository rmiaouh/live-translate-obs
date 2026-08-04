import { describe, expect, it } from 'vitest';
import { Float32PcmAssembler } from '../src/shared/pcm';

describe('Float32PcmAssembler', () => {
  it('reassembles float samples when pipe chunks split a four-byte value', () => {
    const source = new Float32Array([0.25, -0.5, 1]);
    const bytes = new Uint8Array(source.buffer);
    const assembler = new Float32PcmAssembler();
    const first = assembler.push(bytes.slice(0, 5).buffer);
    const second = assembler.push(bytes.slice(5).buffer);

    expect([...first, ...second]).toEqual([...source]);
    expect(assembler.pendingBytes()).toBe(0);
  });
});
