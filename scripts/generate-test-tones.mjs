// Generates the fake-microphone fixture used by the Playwright e2e tests.
// Writes e2e/fixtures/tone-a4-440hz.wav: RIFF/WAVE, 16-bit PCM, mono, 48 kHz, 4.0 s, 440 Hz sine,
// amplitude 0.5 (≈ -9 dBFS RMS). 4 s × 440 Hz = 1760 whole periods, so Chrome's looping of the
// file is seamless. Concert A4 = written Si4 (MIDI 71). Node built-ins only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 48_000;
const DURATION_SECONDS = 4;
const FREQUENCY_HZ = 440;
const AMPLITUDE = 0.5;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const PCM_FORMAT = 1;
const RIFF_HEADER_BYTES = 44;
const FMT_CHUNK_BYTES = 16;
const INT16_MAX = 0x7fff;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'e2e', 'fixtures', 'tone-a4-440hz.wav');

const sampleCount = SAMPLE_RATE * DURATION_SECONDS;
const bytesPerSample = BITS_PER_SAMPLE / 8;
const dataBytes = sampleCount * CHANNELS * bytesPerSample;
const buffer = Buffer.alloc(RIFF_HEADER_BYTES + dataBytes);

let offset = 0;
const writeString = (s) => {
  buffer.write(s, offset, 'ascii');
  offset += s.length;
};
const writeUint32 = (v) => {
  buffer.writeUInt32LE(v, offset);
  offset += 4;
};
const writeUint16 = (v) => {
  buffer.writeUInt16LE(v, offset);
  offset += 2;
};

writeString('RIFF');
writeUint32(RIFF_HEADER_BYTES - 8 + dataBytes);
writeString('WAVE');
writeString('fmt ');
writeUint32(FMT_CHUNK_BYTES);
writeUint16(PCM_FORMAT);
writeUint16(CHANNELS);
writeUint32(SAMPLE_RATE);
writeUint32(SAMPLE_RATE * CHANNELS * bytesPerSample); // byte rate
writeUint16(CHANNELS * bytesPerSample); // block align
writeUint16(BITS_PER_SAMPLE);
writeString('data');
writeUint32(dataBytes);

for (let i = 0; i < sampleCount; i += 1) {
  const value = AMPLITUDE * Math.sin((2 * Math.PI * FREQUENCY_HZ * i) / SAMPLE_RATE);
  buffer.writeInt16LE(Math.round(value * INT16_MAX), offset);
  offset += bytesPerSample;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, buffer);
console.log(`Wrote ${outFile} (${buffer.length} bytes)`);
