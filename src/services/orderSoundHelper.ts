import { startAlarm, stopAlarm } from './alarmSound';

/**
 * Play order ringtone in a loop when a new order offer is received.
 * Wraps singleton alarm player to prevent overlapping audio streams.
 */
export const playOrderRingtone = async () => {
  await startAlarm();
};

/**
 * Immediately stop the order ringtone and release audio resources.
 */
export const stopOrderRingtone = async () => {
  await stopAlarm();
};

