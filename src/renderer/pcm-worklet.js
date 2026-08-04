/* global AudioWorkletProcessor, registerProcessor */

class PcmRingPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(96_000);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.port.onmessage = ({ data }) => {
      const samples = data instanceof Float32Array ? data : new Float32Array(data);
      for (const sample of samples) {
        this.buffer[this.write] = sample;
        this.write = (this.write + 1) % this.buffer.length;
        if (this.available < this.buffer.length) {
          this.available += 1;
        } else {
          this.read = (this.read + 1) % this.buffer.length;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const channel = outputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) {
      if (this.available > 0) {
        channel[index] = this.buffer[this.read];
        this.read = (this.read + 1) % this.buffer.length;
        this.available -= 1;
      } else {
        channel[index] = 0;
      }
    }
    return true;
  }
}

registerProcessor('live-translate-pcm-player', PcmRingPlayer);
