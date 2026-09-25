/// <reference lib="webworker" />
/* Runs on the audio thread: forwards every 128-sample block to the page. */

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      const block = new Float32Array(channel);
      this.port.postMessage(block, [block.buffer]);
    }
    return true;
  }
}

registerProcessor('stt-capture', CaptureProcessor);
