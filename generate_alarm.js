const fs = require('fs');

function generateLoudAlarm() {
    const sampleRate = 44100;
    const duration = 1.0; // seconds
    const numSamples = sampleRate * duration;
    
    // WAV header
    const buffer = Buffer.alloc(44 + numSamples * 2);
    
    // RIFF chunk
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    
    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(1, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32); // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample
    
    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);
    
    // Generate loud siren (square wave alternating between 800Hz and 1200Hz)
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const time = i / sampleRate;
        // Alternate frequency every 0.1s
        const freq = Math.floor(time * 10) % 2 === 0 ? 800 : 1200;
        
        // Square wave for maximum loudness
        const sample = Math.sin(2 * Math.PI * freq * time) > 0 ? 32000 : -32000;
        buffer.writeInt16LE(sample, offset);
        offset += 2;
    }
    
    fs.writeFileSync('assets/loud_alarm.wav', buffer);
    console.log('loud_alarm.wav generated successfully.');
}

generateLoudAlarm();
