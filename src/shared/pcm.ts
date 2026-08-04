export class Float32PcmAssembler {
  private carry = new Uint8Array(0);

  push(buffer: ArrayBuffer): Float32Array {
    const incoming = new Uint8Array(buffer);
    const joined = new Uint8Array(this.carry.length + incoming.length);
    joined.set(this.carry);
    joined.set(incoming, this.carry.length);
    const alignedLength = joined.length - (joined.length % Float32Array.BYTES_PER_ELEMENT);
    this.carry = joined.slice(alignedLength);
    return alignedLength > 0
      ? new Float32Array(joined.buffer.slice(0, alignedLength))
      : new Float32Array(0);
  }

  pendingBytes(): number {
    return this.carry.length;
  }
}
