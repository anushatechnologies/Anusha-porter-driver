/**
 * src/services/telemetrySocket.ts
 * ─────────────────────────────────────────────────────────────
 * Real-Time Telemetry & Dispatch WebSocket Service.
 * Connects to ws(s)://<domain_or_ip>/ws/telemetry
 * Handles:
 *  - driver:offer:new  (incoming ride broadcast with 60s timer)
 *  - driver:offer:stop (immediate dismiss / stop ringer)
 *  - Auto-reconnect on network transitions while driver is online.
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from './asyncStorageShim';
import { stopRingtone, dismissIncomingOrderModal } from './soundManager';

export interface DriverOfferEventData {
  bookingId: string;
  pickupAddress?: string;
  dropAddress?: string;
  amount?: number;
  offeredFare?: number;
  distanceKm?: number;
  serviceName?: string;
  serviceType?: 'PASSENGER' | 'GOODS' | 'BOTH' | string;
  serviceLabel?: string;
  passengerCount?: number;
  goodsCategory?: string;
  remainingSeconds?: number;
  [key: string]: any;
}

export interface DriverOfferNewEvent {
  event: 'driver:offer:new';
  bookingId: string;
  data: DriverOfferEventData;
}

export interface DriverOfferStopEvent {
  event: 'driver:offer:stop';
  bookingId: string;
  reason?: 'ACCEPTED_BY_ANOTHER' | 'CANCELLED' | string;
}

type OfferNewListener = (payload: DriverOfferNewEvent) => void;
type OfferStopListener = (payload: DriverOfferStopEvent) => void;
type StatusListener = (connected: boolean) => void;

class TelemetrySocketService {
  private socket: WebSocket | null = null;
  private isConnecting: boolean = false;
  private shouldBeConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;

  private offerNewListeners: Set<OfferNewListener> = new Set();
  private offerStopListeners: Set<OfferStopListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();

  /**
   * Determine WebSocket URL from configured base URL or environment
   */
  private getWsUrl(): string {
    const rawBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';
    let wsBase = rawBase.trim();
    if (wsBase.startsWith('https://')) {
      wsBase = wsBase.replace(/^https:\/\//, 'wss://');
    } else if (wsBase.startsWith('http://')) {
      wsBase = wsBase.replace(/^http:\/\//, 'ws://');
    } else if (!wsBase.startsWith('ws://') && !wsBase.startsWith('wss://')) {
      wsBase = `wss://${wsBase}`;
    }
    wsBase = wsBase.replace(/\/+$/, '');
    return `${wsBase}/ws/telemetry`;
  }

  /**
   * Connect to WebSocket telemetry server
   */
  public async connectTelemetry(): Promise<void> {
    this.shouldBeConnected = true;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const token = (await AsyncStorage.getItem('authToken')) || (await AsyncStorage.getItem('@driver_token')) || (await AsyncStorage.getItem('userToken')) || '';
      const profileStr = await AsyncStorage.getItem('driverProfile');
      const profile = profileStr ? JSON.parse(profileStr) : null;
      const driverId = profile?.id || profile?.driverId || '';

      const baseWsUrl = this.getWsUrl();
      const queryParams: string[] = [];
      if (token) queryParams.push(`token=${encodeURIComponent(token)}`);
      if (driverId) queryParams.push(`driverId=${encodeURIComponent(String(driverId))}`);
      queryParams.push(`role=driver`);

      const fullWsUrl = queryParams.length > 0 ? `${baseWsUrl}?${queryParams.join('&')}` : baseWsUrl;

      console.log(`[TelemetryWS] Connecting to ${baseWsUrl}...`);
      const ws = new WebSocket(fullWsUrl);

      ws.onopen = () => {
        console.log('[TelemetryWS] Connected successfully ✔');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.notifyStatus(true);
        this.startHeartbeat();

        try {
          ws.send(
            JSON.stringify({
              action: 'subscribe_driver',
              driverId: driverId ? String(driverId) : undefined,
              token: token || undefined,
            })
          );
        } catch (e) {
          // ignore
        }
      };

      ws.onmessage = (event) => {
        try {
          if (!event.data) return;
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
          this.handleIncomingMessage(msg);
        } catch (err) {
          console.warn('[TelemetryWS] Message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.warn('[TelemetryWS] Socket error notice:', (error as any)?.message || error);
      };

      ws.onclose = (event) => {
        console.log(`[TelemetryWS] Socket closed (code: ${event.code}, reason: ${event.reason})`);
        this.isConnecting = false;
        this.socket = null;
        this.stopHeartbeat();
        this.notifyStatus(false);

        if (this.shouldBeConnected) {
          this.scheduleReconnect();
        }
      };

      this.socket = ws;
    } catch (err) {
      console.warn('[TelemetryWS] Connection attempt failed:', err);
      this.isConnecting = false;
      if (this.shouldBeConnected) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect telemetry socket (e.g. when driver goes offline or logs out)
   */
  public disconnectTelemetry(): void {
    this.shouldBeConnected = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    this.isConnecting = false;
    this.notifyStatus(false);
    console.log('[TelemetryWS] Disconnected explicitly');
  }

  /**
   * Handle incoming parsed WebSocket messages
   */
  private handleIncomingMessage(msg: any): void {
    if (!msg) return;

    const rawEventName = msg.event || msg.action || msg.type || msg.data?.action || msg.data?.type || msg.data?.event;
    const eventName = typeof rawEventName === 'string' ? rawEventName.trim() : '';

    // 1. New Order Offer (supports driver:offer:new, ORDER_OFFER, NEW_ORDER, NEW_BOOKING, BOOKING_OFFER, etc.)
    const isNewOffer =
      eventName === 'driver:offer:new' ||
      eventName === 'ORDER_OFFER' ||
      eventName === 'NEW_ORDER' ||
      eventName === 'NEW_BOOKING' ||
      eventName === 'BOOKING_OFFER' ||
      eventName === 'RIDE_OFFER' ||
      eventName === 'RIDE_REQUEST' ||
      eventName === 'driver:order:new' ||
      eventName === 'order:new' ||
      eventName === 'ORDER_BROADCAST' ||
      Boolean(msg.order && (msg.order.id || msg.order.bookingId)) ||
      Boolean(msg.data?.order && (msg.data.order.id || msg.data.order.bookingId));

    if (isNewOffer) {
      const rawBookingId =
        msg.bookingId ||
        msg.data?.bookingId ||
        msg.orderId ||
        msg.data?.orderId ||
        msg.id ||
        msg.data?.id ||
        msg.order?.id ||
        msg.order?.bookingId ||
        msg.data?.order?.id ||
        msg.data?.order?.bookingId ||
        '';
      const cleanBookingId = String(rawBookingId).replace(/^#+/, '').trim();

      const orderData = msg.data?.order || msg.order || msg.data || msg;
      const payload: DriverOfferNewEvent = {
        event: 'driver:offer:new',
        bookingId: cleanBookingId,
        data: orderData,
      };
      console.log(`[TelemetryWS] 🚨 New offer received for bookingId: ${payload.bookingId}`, orderData);
      this.offerNewListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (e) {
          console.error('[TelemetryWS] Error in offerNew listener:', e);
        }
      });
    }

    // 2. Stop Order Offer / Silence Ringtone (driver:offer:stop, OFFER_TOO_LATE, OFFER_DISMISSED, STOP_RINGTONE, etc.)
    else if (
      eventName === 'driver:offer:stop' ||
      eventName === 'ORDER_OFFER_CANCELLED' ||
      eventName === 'ORDER_ACCEPTED_STOP_RING' ||
      eventName === 'ORDER_REJECTED_DISMISS' ||
      eventName === 'STOP_DRIVER_OFFER' ||
      eventName === 'STOP_RINGTONE' ||
      eventName === 'OFFER_TOO_LATE' ||
      eventName === 'OFFER_DISMISSED' ||
      eventName === 'TRIP_CANCELLED' ||
      eventName === 'ORDER_CANCELLED' ||
      eventName === 'BOOKING_CANCELLED' ||
      eventName === 'RIDE_CANCELLED' ||
      eventName === 'trip:cancelled' ||
      eventName === 'order:cancelled' ||
      eventName === 'booking:cancelled' ||
      eventName === 'ride:cancelled' ||
      eventName === 'driver:order:cancelled' ||
      eventName === 'CANCELLED' ||
      eventName === 'cancelled' ||
      msg.status === 'TOO_LATE' ||
      msg.status === 'OFFER_TOO_LATE' ||
      msg.status === 'ACCEPTED_BY_ANOTHER' ||
      msg.status === 'STOPPED' ||
      msg.status === 'cancelled' ||
      msg.status === 'CANCELLED' ||
      msg.stopSound === 'true' ||
      msg.stopSound === true ||
      msg.stopAudio === 'true' ||
      msg.stopAudio === true ||
      msg.stop_ringtone === 'true' ||
      msg.data?.stopSound === 'true' ||
      msg.data?.stopSound === true ||
      msg.data?.stopAudio === 'true' ||
      msg.data?.stopAudio === true ||
      msg.data?.stop_ringtone === 'true' ||
      msg.data?.status === 'STOPPED' ||
      msg.data?.status === 'TOO_LATE' ||
      msg.data?.status === 'ACCEPTED_BY_ANOTHER' ||
      msg.data?.status === 'cancelled' ||
      msg.data?.status === 'CANCELLED' ||
      msg.data?.action === 'STOP_RINGTONE' ||
      msg.data?.action === 'STOP_DRIVER_OFFER' ||
      msg.data?.action === 'TRIP_CANCELLED' ||
      msg.data?.action === 'ORDER_CANCELLED' ||
      msg.data?.notificationType === 'STOP_DRIVER_OFFER' ||
      msg.data?.notificationType === 'TRIP_CANCELLED' ||
      msg.data?.notificationType === 'ORDER_CANCELLED' ||
      msg.notificationType === 'STOP_DRIVER_OFFER' ||
      msg.notificationType === 'TRIP_CANCELLED' ||
      msg.notificationType === 'ORDER_CANCELLED'
    ) {
      const targetBookingId =
        msg.bookingId ||
        msg.data?.bookingId ||
        msg.orderId ||
        msg.data?.orderId ||
        msg.id ||
        msg.data?.id ||
        msg.order?.id ||
        msg.order?.bookingId ||
        '';
      
      // Immediately stop ringtone audio and dismiss modal
      stopRingtone();
      dismissIncomingOrderModal(targetBookingId);

      const payload: DriverOfferStopEvent = {
        event: 'driver:offer:stop',
        bookingId: targetBookingId,
        reason: msg.reason || eventName || 'CANCELLED',
      };
      console.log(`[TelemetryWS] 🛑 Stop offer received for ${payload.bookingId} (${payload.reason})`);
      this.offerStopListeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (e) {
          console.error('[TelemetryWS] Error in offerStop listener:', e);
        }
      });
    }
  }

  /**
   * Auto-reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!this.shouldBeConnected) return;

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldBeConnected) {
        this.connectTelemetry();
      }
    }, delay);
  }

  /**
   * Periodic ping/heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ action: 'ping', time: Date.now() }));
        } catch {}
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private notifyStatus(connected: boolean): void {
    this.statusListeners.forEach((listener) => {
      try {
        listener(connected);
      } catch {}
    });
  }

  // ── Listener Registrations ────────────────────────────────────

  public onOfferNew(cb: OfferNewListener): () => void {
    this.offerNewListeners.add(cb);
    return () => this.offerNewListeners.delete(cb);
  }

  public offOfferNew(cb: OfferNewListener): void {
    this.offerNewListeners.delete(cb);
  }

  public onOfferStop(cb: OfferStopListener): () => void {
    this.offerStopListeners.add(cb);
    return () => this.offerStopListeners.delete(cb);
  }

  public offOfferStop(cb: OfferStopListener): void {
    this.offerStopListeners.delete(cb);
  }

  public onStatusChange(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public sendLocation(latitude: number, longitude: number, heading?: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({
          action: 'driver:location:update',
          latitude,
          longitude,
          heading: heading ?? 0,
          timestamp: Date.now(),
        }));
      } catch {}
    }
  }
}

export const telemetrySocket = new TelemetrySocketService();

/**
 * In-memory registry of dismissed/rejected/stopped offers.
 * Prevents re-alerting or re-navigating to the same offer for 10 minutes.
 */
const dismissedOffersMap = new Map<string, number>();

// Periodic cleanup of stale dismissed-offer entries every 5 minutes
// Prevents the map from growing unboundedly during long driver sessions.
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of dismissedOffersMap) {
    if (now > expiry) {
      dismissedOffersMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export const dismissOffer = (bookingId: string): void => {
  const clean = String(bookingId || '').trim().replace(/^#+/, '');
  if (clean) {
    dismissedOffersMap.set(clean, Date.now() + 10 * 60 * 1000);
  }
};

export const isOfferDismissed = (bookingId: string): boolean => {
  const clean = String(bookingId || '').trim().replace(/^#+/, '');
  if (!clean) return false;
  const expiry = dismissedOffersMap.get(clean);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    dismissedOffersMap.delete(clean);
    return false;
  }
  return true;
};

export default telemetrySocket;
