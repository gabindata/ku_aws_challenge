export function configureOrt(ort: any): void;

export function loadTextToSpeech(
  modelPath: string,
  sessionOptions: any
): Promise<any>;

export function loadVoiceStyle(
  paths: string[],
  verbose?: boolean
): Promise<any>;

export function writeWavFile(
  wav: Float32Array,
  sampleRate: number
): ArrayBuffer;