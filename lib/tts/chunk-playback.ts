/** Schedule WAV chunks back-to-back with Web Audio when buffers are ready. */
export class ChunkScheduler {
  private context: AudioContext | null = null;
  private nextAt = 0;
  private speed = 1;
  private alive = true;
  private pending = 0;
  private started = false;
  private closed = false;

  constructor(rate: number) {
    this.speed = rate;
  }

  setRate(rate: number) {
    this.speed = rate;
  }

  pause() {
    void this.context?.suspend();
  }

  resume() {
    void this.context?.resume();
  }

  stop() {
    this.alive = false;
    this.closed = true;
    if (this.context) {
      void this.context.close().catch(() => {});
      this.context = null;
    }
    this.pending = 0;
    this.nextAt = 0;
  }

  async append(wav: Blob, onFirstSound?: () => void) {
    if (!this.alive) return;
    this.pending++;
    try {
      if (!this.context)
        this.context = new AudioContext({ sampleRate: 48000 });
      if (this.context.state === "suspended")
        await this.context.resume().catch(() => {});
      const buffer = await this.context.decodeAudioData(
        await wav.arrayBuffer(),
      );
      if (!this.alive) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.speed;
      source.connect(this.context.destination);
      const now = this.context.currentTime;
      const start = Math.max(this.nextAt, now + 0.01);
      if (!this.started) {
        this.started = true;
        onFirstSound?.();
      }
      source.onended = () => {
        this.pending--;
        source.disconnect();
      };
      source.start(start);
      this.nextAt = start + buffer.duration / this.speed;
    } catch {
      this.pending--;
    }
  }

  async drain() {
    this.closed = true;
    while (this.alive && this.pending > 0) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
