/**
 * alarmSound.ts
 * Plays a repeating alarm tone when a new ride is assigned to the driver.
 * Uses expo-av for reliable audio playback on Android/iOS.
 */

import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

let sound: Audio.Sound | null = null;
let alarmInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the alarm. Plays a beep tone via expo-av and repeats it every 1.5s.
 * Falls back to Speech if audio file fails.
 */
export const startAlarm = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });

    // Stop any existing alarm first
    await stopAlarm();

    // Use the newly generated loud square-wave siren
    const { sound: newSound } = await Audio.Sound.createAsync(
      require('../../assets/loud_alarm.wav'),
      { shouldPlay: true, isLooping: true, volume: 1.0 }
    );
    sound = newSound;
  } catch (e) {
    console.warn('expo-av alarm failed, falling back to speech:', e);
    // Fallback: use text-to-speech as alarm
    _startSpeechAlarm();
  }
};

const _startSpeechAlarm = () => {
  const announce = () => {
    Speech.speak('Attention! New ride assigned! Please accept immediately!', {
      rate: 1.1,
      pitch: 1.5,
      volume: 1.0,
    });
  };
  announce();
  alarmInterval = setInterval(announce, 3000);
};

/**
 * Stop the alarm and release resources.
 */
export const stopAlarm = async () => {
  try {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      sound = null;
    }
    Speech.stop();
  } catch (e) {
    console.warn('Error stopping alarm:', e);
  }
};
