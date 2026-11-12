/** Schedule WAV chunks back-to-back with Web Audio when buffers are ready. */
export class ChunkScheduler {
  private context: AudioContext | null = null;
  private nextAt = 0;
  private speed = 1;
  private alive = true;
  private pending = 0;
  private started = false;
  private queued: { wav: Blob; onFirstSound?: () => void }[] = [];
  private paused = false;

  constructor(
    rate: number,
    private bufferWholeReading = false,
  ) {
    this.speed = rate;
  }

  setRate(rate: number) {
    this.speed = rate;
  }

  pause() {
    this.paused = true;
    void this.context?.suspend();
  }

  resume() {
    this.paused = false;
    void this.context?.resume();
  }

  stop() {
    this.alive = false;
    this.queued = [];
    if (this.context) {
      void this.context.close().catch(() => {});
      this.context = null;
    }
    this.pending = 0;
    this.nextAt = 0;
  }

  async append(wav: Blob, onFirstSound?: () => void) {
    if (!this.alive) return;
    if (this.bufferWholeReading) {
      this.queued.push({ wav, onFirstSound });
      return;
    }
    this.pending++;
    try {
      if (!this.context) this.context = new AudioContext({ sampleRate: 48000 });
      if (this.context.state === "suspended" && !this.paused)
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
    } catch (error) {
      this.pending--;
      throw error;
    }
  }

  async drain() {
    this.bufferWholeReading = false;
    const queued = this.queued;
    this.queued = [];
    // Decode all buffers before starting: slow inference/decode cannot leave gaps.
    if (queued.length && this.alive) {
      this.context ??= new AudioContext({ sampleRate: 48000 });
      await this.context.suspend();
      let onFirstSound: (() => void) | undefined;
      for (const item of queued) {
        if (!this.alive) return;
        this.paused = true;
        await this.append(item.wav, () => {
          onFirstSound = item.onFirstSound;
        });
      }
      if (!this.alive) return;
      this.paused = false;
      await this.context?.resume();
      if (this.alive) onFirstSound?.();
    }
    while (this.alive && this.pending > 0) {
      await new Promise((r) => setTimeout(r, 40));
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
