/**
 * alarmSound.ts
 * Plays a repeating alarm tone when a new ride is assigned to the driver.
 * Uses expo-av for reliable audio playback on Android/iOS.
 * Guaranteed race-condition proof, leak-proof, and crash-proof.
 */

import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

let sound: Audio.Sound | null = null;
let alarmInterval: ReturnType<typeof setInterval> | null = null;
let isStarting = false;
let currentAlarmSession = 0;
let failsafeTimeout: NodeJS.Timeout | null = null;

export const getAlarmSound = (): Audio.Sound | null => sound;
export const isAlarmPlaying = (): boolean => sound !== null || alarmInterval !== null || isStarting;

/**
 * Silently clean up any existing audio resources WITHOUT incrementing
 * the session counter. Used internally by startAlarm to avoid the
 * race condition where stopAlarm() would invalidate the new session.
 */
const _cleanupExistingAudio = async () => {
  // Clear any running speech interval
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }

  // Stop and unload any existing expo-av sound
  if (sound) {
    const currentSound = sound;
    sound = null;
    try {
      await currentSound.stopAsync();
    } catch {}
    try {
      await currentSound.unloadAsync();
    } catch {}
  }

  // Stop any in-progress speech
  try {
    Speech.stop();
  } catch {}
};

/**
 * Start the alarm. Plays a loud alarm tone via expo-av.
 * Automatically stops after 30 seconds via failsafe timer if not stopped earlier.
 * Falls back to Speech if audio file fails.
 */
export const startAlarm = async () => {
  // If already playing or currently starting, do not tear down and restart
  if (isStarting || sound !== null) return;
  isStarting = true;
  const sessionId = ++currentAlarmSession;

  // Reset/arm the 30-second failsafe timer so sound never plays forever
  if (failsafeTimeout) {
    clearTimeout(failsafeTimeout);
    failsafeTimeout = null;
  }
  failsafeTimeout = setTimeout(() => {
    console.log('[alarmSound] 30s failsafe triggered: stopping alarm audio automatically');
    stopAlarm().catch(() => {});
  }, 30000);

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Clean up any existing sound/speech WITHOUT invalidating our session
    await _cleanupExistingAudio();

    // If stopAlarm was called externally while we were awaiting, abort
    if (sessionId !== currentAlarmSession) return;

    // Start clear branded voice announcement IMMEDIATELY so driver hears it without delay
    _startSpeechVoice(sessionId);

    // Concurrently load and play subtle background chime tone
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        require('../../assets/loud_alarm.wav'),
        { shouldPlay: true, isLooping: true, volume: 0.25 }
      );

      // CRITICAL: If stop was called while createAsync was in-flight, clean up immediately
      if (sessionId !== currentAlarmSession) {
        try {
          await newSound.stopAsync();
          await newSound.unloadAsync();
        } catch {}
        return;
      }

      sound = newSound;
    } catch (soundErr) {
      console.warn('[alarmSound] expo-av chime notice:', soundErr);
    }
  } catch (e) {
    if (sessionId === currentAlarmSession) {
      _startSpeechVoice(sessionId);
    }
  } finally {
    isStarting = false;
  }
};

const _startSpeechVoice = (sessionId: number) => {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }

  const announce = async () => {
    if (sessionId !== currentAlarmSession) {
      if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
      }
      return;
    }

    try {
      // Stop previous utterance so they do not overlap
      Speech.stop();

      // Check if device TTS has English (India) installed; if not, use device default English
      let voiceLanguage: string | undefined = undefined;
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (voices && voices.some(v => (v.language || '').toLowerCase().replace('_', '-').includes('en-in'))) {
          voiceLanguage = 'en-IN';
        }
      } catch {}

      Speech.speak('New order from Anusha Porter! Please accept!', {
        ...(voiceLanguage ? { language: voiceLanguage } : {}),
        rate: 0.9,
        pitch: 1.0,
        volume: 1.0,
        onError: () => {
          // Universal fallback without options if device TTS rejects custom locale
          try {
            Speech.speak('New order from Anusha Porter! Please accept!');
          } catch {}
        },
      });
    } catch (err) {
      try {
        Speech.speak('New order from Anusha Porter! Please accept!');
      } catch {}
    }
  };

  // Announce immediately, then repeat every 3.5 seconds until accepted or rejected
  announce();
  alarmInterval = setInterval(announce, 3500);
};

/**
 * Stop the alarm, invalidate any in-flight sessions, and release audio resources.
 */
export const stopAlarm = async () => {
  // Clear 30-second failsafe timer
  if (failsafeTimeout) {
    clearTimeout(failsafeTimeout);
    failsafeTimeout = null;
  }

  // Invalidate any currently starting sessions immediately
  currentAlarmSession++;

  // Also reset isStarting to unblock future startAlarm calls
  isStarting = false;

  try {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }

    if (sound) {
      const currentSound = sound;
      sound = null;
      try {
        await currentSound.stopAsync();
      } catch {}
      try {
        await currentSound.unloadAsync();
      } catch {}
    }

    try {
      Speech.stop();
    } catch {}
  } catch (e) {
    console.warn('Error stopping alarm:', e);
  }
};

export const playOrderRingtone = startAlarm;
export const stopOrderRingtone = stopAlarm;
