/*
 * The part of sherpa-onnx-node this package uses, typed from the JSDoc in
 * its `non-streaming-asr.js` and `types.js`. The package is CommonJS with
 * no types of its own; recognizer.ts is the only code that imports it.
 */

declare module 'sherpa-onnx-node' {
  interface OfflineRecognizerConfig {
    readonly featConfig: {
      readonly sampleRate: number;
      readonly featureDim: number;
    };
    readonly modelConfig: {
      readonly transducer: {
        readonly encoder: string;
        readonly decoder: string;
        readonly joiner: string;
      };
      readonly tokens: string;
      readonly modelType: string;
      readonly numThreads: number;
      readonly provider: string;
      readonly debug: number;
    };
  }

  interface OfflineStream {
    acceptWaveform(wave: {
      readonly samples: Float32Array;
      readonly sampleRate: number;
    }): void;
  }

  interface OfflineRecognizerResult {
    readonly text: string;
    /** Each token's text; one that starts with a space begins a word. */
    readonly tokens: ReadonlyArray<string>;
    /** When each token begins, in seconds from the start of the stream. */
    readonly timestamps: ReadonlyArray<number>;
    /** How long each token lasts, in seconds; empty for models without. */
    readonly durations: ReadonlyArray<number>;
  }

  interface OfflineRecognizer {
    createStream(): OfflineStream;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
  }

  const sherpa: {
    readonly OfflineRecognizer: {
      createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    };
  };
  export = sherpa;
}
