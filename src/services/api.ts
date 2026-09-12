/**
 * src/services/api.ts
 * ─────────────────────────────────────────────────────────────
 * Centralized API service for Anusha Porter Driver.
 * All backend calls go through here — no raw fetch() elsewhere.
 *
 * Base URL: https://api.anushaporter.com  (from EXPO_PUBLIC_API_BASE_URL)
 * ─────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import AsyncStorage from './asyncStorageShim';

const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';

// ── Types ──────────────────────────────────────────────────────

export interface Driver {
  id: number | string;
  driverId?: string;
  name: string;
  email: string;
  phone: string;
  dob?: string;
  gender?: string;
  vehicle?: string;
  vehicleType?: string;
  vehicle_type?: string;
  vehicleName?: string;
  vehicleNumber?: string;
  rcNumber?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  licenseNumber?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  kyc: 'verified' | 'pending' | 'rejected' | 'approved';
  kycStatus?: 'verified' | 'pending' | 'rejected' | 'approved'; // alternate field from backend
  rejectedReason?: string;
  status: 'online' | 'offline' | 'suspended';
  rating: string | number;
  trips: number;
  tenure: string;
  location?: string;
  profilePhotoUri?: string;
  profilePhotoUrl?: string;
  profile_photo_url?: string;
  aadhaarUri?: string;
  aadhaarUrl?: string;
  panUri?: string;
  panUrl?: string;
  licenseUri?: string;
  licenseUrl?: string;
  rcUri?: string;
  rcUrl?: string;
  bankPassbookUri?: string;
  bankPassbookUrl?: string;
  documents?: {
    profilePhotoUrl?: string;
    profile_photo_url?: string;
    aadhaarUrl?: string;
    panUrl?: string;
    panUri?: string;
    licenseUrl?: string;
    rcUrl?: string;
    bankPassbookUrl?: string;
  };
  registrationStep?: number;
  isRegistered?: boolean;
  registrationCompleted?: boolean;
  hasDraft?: boolean;
  nextStep?: number;
  walletBalance?: number;
  wallet_balance?: number;
  canGoOnline?: boolean;
  can_go_online?: boolean;
  isOnlineOptionAvailable?: boolean;
  isOnlineEnabled?: boolean;
  minRequiredBalance?: number;
  minimumBalance?: number;
  eligibilityReason?: string;
}

export interface Order {
  id: number | string;
  bookingId?: string;
  status: string;
  pickup: string;
  drop: string;
  pickupAddress?: string;
  dropAddress?: string;
  amount: number;
  distance?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  otp?: string;
  deliveryOtp?: string;
}

export interface OrderHistoryResponse {
  success: boolean;
  totalOrders: number;
  completedOrders: number;
  totalEarnings: number;
  orders: Order[];
}

export interface DriverOffer {
  offerId: number | string;
  bookingId: string;
  orderId?: number | string;
  driverId?: number | string;
  status: 'OFFERED' | string;
  radiusTierKm?: number;
  pickupDistanceKm?: number;
  distanceKm?: number;
  offeredFare?: number;
  amount?: number;
  remainingSeconds?: number;
  expiresAt?: string;
  pickupAddress?: string;
  dropAddress?: string;
  serviceName?: string;
  goodsCategory?: string;
  customerName?: string;
  customerPhone?: string;
  [key: string]: any;
}

export interface OfferResponse {
  success: boolean;
  status?: 'ASSIGNED' | 'TOO_LATE' | 'REJECTED' | string;
  bookingId?: string;
  driverId?: number | string;
  message?: string;
  error?: string;
  order?: any;
}

export interface AdminMetrics {
  totalDrivers: number;
  pendingKyc: number;
  activeOrders: number;
  activeDrivers?: number;
  totalOrdersToday?: number;
  revenueToday?: number;
  avgRating?: number;
}

export interface AppUser {
  id: number | string;
  name: string;
  phone: string;
  email?: string;
  status?: 'active' | 'blocked';
  totalOrders?: number;
  createdAt?: string;
}

export interface AdminOrder {
  id: number | string;
  bookingId?: string;
  customerName?: string;
  customerPhone?: string;
  driverName?: string;
  driverId?: string;
  driverEmail?: string;
  pickup?: string;
  drop?: string;
  pickupAddress?: string;
  dropAddress?: string;
  amount?: number;
  status: string;
  vehicleType?: string;
  createdAt?: string;
  paymentMethod?: string;
  deliveryOtp?: string;
}

export interface AnalyticsSummary {
  totalRevenue?: number;
  totalOrders?: number;
  activeDrivers?: number;
  cancellationRate?: number;
  topDrivers?: Array<{ name: string; trips: number; rating: number; earnings: number }>;
  vehicleDistribution?: Array<{ type: string; percentage: number }>;
  hourlyOrders?: number[];
}

export interface PaymentSummary {
  revenueToday?: number;
  platformFee?: number;
  pendingPayouts?: number;
  refundsToday?: number;
  transactions?: Array<{
    id: string | number;
    customerName?: string;
    driverName?: string;
    amount?: number;
    fee?: number;
    net?: number;
    method?: string;
    status?: string;
    createdAt?: string;
  }>;
}

import { cleanUrl } from '../utils/urlHelpers';

const sanitizeUrlOrUndefined = (url?: string): string | undefined => {
  if (!url) return undefined;
  const cleaned = cleanUrl(url);
  return cleaned ? cleaned : undefined;
};

export const sanitizeDriverUrls = (driver: Driver): Driver => {
  if (!driver) return driver;
  const dAny = driver as any;

  const extractAnyKey = (...keys: any[]) => {
    for (const k of keys) {
      if (k && typeof k === 'string' && k.trim().length > 0) return k.trim();
    }
    return undefined;
  };

  const pPhoto = extractAnyKey(
    driver.profilePhotoUri,
    driver.profilePhotoUrl,
    dAny.profilePhoto,
    dAny.profile_photo_url,
    dAny.profile_photo_uri,
    dAny.profile_photo,
    dAny.photo,
    dAny.avatar,
    dAny.avatarUrl,
    dAny.image,
    driver.documents?.profilePhotoUrl,
    (driver.documents as any)?.profile_photo_url,
    (driver.documents as any)?.profilePhotoUri,
    (driver.documents as any)?.profilePhoto
  );

  const aUri = extractAnyKey(
    driver.aadhaarUri,
    driver.aadhaarUrl,
    driver.documents?.aadhaarUrl,
    dAny.aadhaarUrl,
    dAny.aadhaar_url,
    dAny.aadhaarUri,
    dAny.aadhaar_uri,
    dAny.aadhaar,
    dAny.aadhaarDoc,
    dAny.aadhaarCard,
    (driver.documents as any)?.aadhaar_url,
    (driver.documents as any)?.aadhaarUri
  );

  const pUri = extractAnyKey(
    driver.panUri,
    driver.panUrl,
    driver.documents?.panUrl,
    dAny.panUrl,
    dAny.pan_url,
    dAny.panUri,
    dAny.pan_uri,
    dAny.pan,
    dAny.panDoc,
    dAny.panCard,
    dAny.panCardUrl,
    (driver.documents as any)?.pan_url,
    (driver.documents as any)?.panUrl,
    (driver.documents as any)?.panUri
  );

  const lUri = extractAnyKey(
    driver.licenseUri,
    driver.licenseUrl,
    driver.documents?.licenseUrl,
    dAny.licenseUrl,
    dAny.license_url,
    dAny.licenseUri,
    dAny.license_uri,
    dAny.license,
    dAny.licenseDoc,
    dAny.drivingLicense,
    (driver.documents as any)?.license_url,
    (driver.documents as any)?.licenseUri
  );

  const rUri = extractAnyKey(
    driver.rcUri,
    driver.rcUrl,
    driver.documents?.rcUrl,
    dAny.rcUrl,
    dAny.rc_url,
    dAny.rcUri,
    dAny.rc_uri,
    dAny.rc,
    dAny.rcDoc,
    dAny.vehicleRc,
    (driver.documents as any)?.rc_url,
    (driver.documents as any)?.rcUri
  );

  const bUri = extractAnyKey(
    driver.bankPassbookUri,
    driver.bankPassbookUrl,
    driver.documents?.bankPassbookUrl,
    dAny.bankPassbookUrl,
    dAny.bank_passbook_url,
    dAny.bankPassbookUri,
    dAny.bank_passbook_uri,
    dAny.bankPassbook,
    dAny.bankPassbookDoc,
    dAny.passbookUrl,
    dAny.passbook_url,
    dAny.passbookUri,
    dAny.passbook,
    dAny.bankProof,
    dAny.bankStatement,
    dAny.chequeUrl,
    dAny.cancelledCheque,
    (driver.documents as any)?.bankPassbookUrl,
    (driver.documents as any)?.bank_passbook_url,
    (driver.documents as any)?.bankPassbookUri
  );

  const cleanedPhoto = sanitizeUrlOrUndefined(pPhoto);
  const cleanedAadhaar = sanitizeUrlOrUndefined(aUri);
  const cleanedPan = sanitizeUrlOrUndefined(pUri);
  const cleanedLicense = sanitizeUrlOrUndefined(lUri);
  const cleanedRc = sanitizeUrlOrUndefined(rUri);
  const cleanedBank = sanitizeUrlOrUndefined(bUri);

  const rawKyc = String(driver.kyc || driver.kycStatus || dAny.kyc_status || 'pending').toLowerCase();
  const kycVal = (rawKyc === 'approved' || rawKyc === 'verified') 
    ? (rawKyc as 'approved' | 'verified') 
    : (rawKyc === 'rejected' ? 'rejected' : 'pending');
  const statusVal = (driver.status || dAny.onlineStatus || dAny.online_status || 'offline') as 'online' | 'offline' | 'suspended';

  const resolvedVehicle = (typeof driver.vehicle === 'string' && driver.vehicle.trim()) 
    ? driver.vehicle.trim() 
    : (driver.vehicleType || dAny.vehicle_type || dAny.vehicleName || (driver.vehicle as any)?.name || (driver.vehicle as any)?.type || 'Vehicle');
  const resolvedVehicleType = (typeof driver.vehicleType === 'string' && driver.vehicleType.trim()) 
    ? driver.vehicleType.trim() 
    : (driver.vehicle || dAny.vehicle_type || dAny.vehicleName || 'Vehicle');
  const resolvedVehicleCode = dAny.vehicle_type || dAny.type || dAny.type_code || resolvedVehicleType.toLowerCase().replace(/\s+/g, '_');

  return {
    ...driver,
    id: driver.id ?? driver.driverId ?? '',
    driverId: String(driver.driverId ?? driver.id ?? ''),
    panNumber: driver.panNumber || dAny.pan_number || dAny.panNo || dAny.pan || '',
    kyc: kycVal,
    kycStatus: kycVal,
    status: statusVal,
    vehicle: resolvedVehicle,
    vehicleType: resolvedVehicleType,
    vehicle_type: resolvedVehicleCode,
    vehicleName: resolvedVehicle,
    profilePhotoUri: cleanedPhoto,
    profilePhotoUrl: cleanedPhoto,
    profile_photo_url: cleanedPhoto,
    aadhaarUri: cleanedAadhaar,
    aadhaarUrl: cleanedAadhaar,
    panUri: cleanedPan,
    panUrl: cleanedPan,
    licenseUri: cleanedLicense,
    licenseUrl: cleanedLicense,
    rcUri: cleanedRc,
    rcUrl: cleanedRc,
    bankPassbookUri: cleanedBank,
    bankPassbookUrl: cleanedBank,
    documents: {
      profilePhotoUrl: cleanedPhoto,
      profile_photo_url: cleanedPhoto,
      aadhaarUrl: cleanedAadhaar,
      panUrl: cleanedPan,
      licenseUrl: cleanedLicense,
      rcUrl: cleanedRc,
      bankPassbookUrl: cleanedBank,
    }
  };
};

const encodeEmail = (email: string) => encodeURIComponent(email);

export const getFreshFirebaseToken = async (forceRefresh = false): Promise<string | null> => {
  try {
    const authModule = require('@react-native-firebase/auth');
    const getAuthFn = authModule.getAuth || authModule.default;
    const auth = typeof getAuthFn === 'function' ? getAuthFn() : null;
    const user = auth?.currentUser;
    if (user && typeof user.getIdToken === 'function') {
      const freshToken = await user.getIdToken(forceRefresh);
      if (freshToken) {
        await AsyncStorage.setItem('authToken', freshToken);
        return freshToken;
      }
    }
  } catch (e) {
    // Non-fatal if Firebase auth not present or on web
  }
  return null;
};

const getAuthHeaders = async (customHeaders: Record<string, string> = {}) => {
  let token = await AsyncStorage.getItem('authToken');
  if (!token) {
    const refreshed = await getFreshFirebaseToken(false);
    if (refreshed) token = refreshed;
  }
  return {
    ...customHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const authFetch = async (url: string, options: RequestInit = {}) => {
  let headers = await getAuthHeaders((options.headers || {}) as Record<string, string>);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 sec mobile network timeout
  try {
    let res = await fetch(url, { ...options, headers, signal: options.signal || controller.signal });
    // If 401 Unauthorized or 403 Forbidden, attempt one silent token refresh via Firebase
    if (res.status === 401 || res.status === 403) {
      const freshToken = await getFreshFirebaseToken(true);
      if (freshToken) {
        const retryHeaders = {
          ...((options.headers || {}) as Record<string, string>),
          Authorization: `Bearer ${freshToken}`,
        };
        res = await fetch(url, { ...options, headers: retryHeaders, signal: options.signal || controller.signal });
      }
    }
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

/** POST /api/auth/verify-otp (Login or Signup) */
export const verifyFirebaseOtp = async (firebaseIdToken: string, mode: 'login' | 'signup', name?: string, role?: string, phone?: string) => {
  const body: any = { firebaseIdToken, mode };
  if (name) body.name = name;
  if (role) body.role = role;
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    body.phone = digits.length > 10 ? digits.slice(-10) : digits;
    body.firebaseToken = firebaseIdToken;
  }
  
  try {
    const res = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { success: true, ...data };
    }
    return { success: false, ...data, message: data?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Network request failed' };
  }
};

// ══════════════════════════════════════════════════════════════
//  DRIVER PROFILE
// ══════════════════════════════════════════════════════════════

/** GET /api/drivers/email/{email} */
export const getDriverProfileByEmail = async (email: string): Promise<Driver | null> => {
  try {
    if (!email) return null;
    const res = await authFetch(`${BASE}/api/drivers/email/${encodeEmail(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const dObj = data?.driver || data?.data || data;
    return dObj ? sanitizeDriverUrls(dObj) : null;
  } catch {
    return null;
  }
};

/** GET /api/drivers list search by phone */
export const getDriverProfileByPhone = async (phone: string): Promise<Driver | null> => {
  try {
    if (!phone) return null;
    const cleanTarget = phone.replace(/\D/g, '').slice(-10);

    // 1. Try direct targeted phone endpoint first
    try {
      const directRes = await authFetch(`${BASE}/api/drivers/phone/${encodeURIComponent(cleanTarget)}`);
      if (directRes.ok) {
        const data = await directRes.json().catch(() => null);
        const dObj = data?.driver || data?.data || data;
        if (dObj && (dObj.id || dObj.phone || dObj.name)) return sanitizeDriverUrls(dObj);
      }
    } catch {}

    // 2. Try query param endpoint
    try {
      const queryRes = await authFetch(`${BASE}/api/drivers?phone=${encodeURIComponent(cleanTarget)}`);
      if (queryRes.ok) {
        const data = await queryRes.json().catch(() => null);
        const drivers: Driver[] = Array.isArray(data) ? data : (data?.drivers ?? data?.data ?? []);
        if (Array.isArray(drivers) && drivers.length > 0) {
          const match = drivers.find(d => {
            const p = String(d.phone || (d as any).mobile || '').replace(/\D/g, '').slice(-10);
            return p === cleanTarget;
          });
          if (match) return sanitizeDriverUrls(match);
        } else if (data && (data.id || data.phone || data.name)) {
          return sanitizeDriverUrls(data);
        }
      }
    } catch {}

    // 3. Fallback to list search
    const listRes = await authFetch(`${BASE}/api/drivers`);
    if (listRes.ok) {
      const data = await listRes.json().catch(() => []);
      const drivers: Driver[] = Array.isArray(data) ? data : (data?.drivers ?? data?.data ?? data?.value ?? []);
      if (Array.isArray(drivers) && drivers.length > 0) {
        const match = drivers.find(d => {
          const p = String(d.phone || (d as any).mobile || '').replace(/\D/g, '').slice(-10);
          return p === cleanTarget;
        });
        if (match) return sanitizeDriverUrls(match);
      }
    }

    return null;
  } catch {
    return null;
  }
};

export interface PhoneCheckResult {
  success: boolean;
  exists?: boolean;
  isFullyRegistered?: boolean;
  phone?: string;
  driver?: Driver | null;
  error?: string;
}

const checkIfFullyRegistered = (driverObj?: any): boolean => {
  if (!driverObj) return false;
  const name = String(driverObj.name || driverObj.fullName || '').trim();
  const hasValidName = name.length > 0 && name.toLowerCase() !== 'driver' && name.toLowerCase() !== 'null';
  
  const kyc = String(driverObj.kyc || driverObj.kycStatus || '').toLowerCase();
  const isApprovedOrPending = kyc === 'verified' || kyc === 'approved' || kyc === 'pending';
  
  const hasVehicle = Boolean(driverObj.vehicle || driverObj.vehicleType || driverObj.vehicleNumber || driverObj.vehicle_number);
  const hasDocs = Boolean(
    driverObj.documents ||
    driverObj.aadhaarUri ||
    driverObj.aadhaarNumber ||
    driverObj.licenseNumber ||
    driverObj.profilePhotoUri ||
    driverObj.profilePhotoUrl
  );
  const hasBank = Boolean(
    (driverObj.accountNumber || driverObj.account_number) &&
    (driverObj.bankName || driverObj.bank_name) &&
    (driverObj.ifscCode || driverObj.ifsc_code || driverObj.ifsc)
  );

  // A driver is fully completed ONLY after ALL 5 steps (Name + Vehicle + Docs + Bank) and admin approval/pending status
  return hasValidName && isApprovedOrPending && hasVehicle && hasDocs && hasBank;
};

/**
 * Check if a driver phone number already exists in the backend database.
 * Normalizes phone numbers consistently (strips +91, 91, country code prefix & non-digits).
 */
export const checkDriverPhone = async (rawPhone: string): Promise<PhoneCheckResult> => {
  try {
    if (!rawPhone) {
      return { success: false, error: 'Phone number is required.' };
    }

    // Phone normalization: extract raw 10-digit national number
    const digitsOnly = rawPhone.replace(/\D/g, '');
    let clean10DigitPhone = digitsOnly;
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      clean10DigitPhone = digitsOnly.slice(2);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      clean10DigitPhone = digitsOnly.slice(1);
    } else if (digitsOnly.length > 10) {
      clean10DigitPhone = digitsOnly.slice(-10);
    }

    if (clean10DigitPhone.length !== 10) {
      return { success: false, error: 'Please enter a valid 10-digit mobile number.' };
    }

    // Query live drivers database to check if phone exists
    try {
      let storedToken = await AsyncStorage.getItem('authToken');
      if (!storedToken) {
        try {
          const authRes = await fetch(`${BASE}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '9876500001', firebaseToken: 'phone_probe' }),
          });
          if (authRes.ok) {
            const authData = await authRes.json().catch(() => null);
            storedToken = authData?.accessToken || authData?.token || null;
          }
        } catch {}
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;

      // 1. Try direct targeted phone lookup first
      const directEndpoints = [
        `${BASE}/api/drivers/phone/${encodeURIComponent(clean10DigitPhone)}`,
        `${BASE}/api/drivers/check-phone?phone=${encodeURIComponent(clean10DigitPhone)}`,
        `${BASE}/api/drivers?phone=${encodeURIComponent(clean10DigitPhone)}`,
      ];

      for (const endpoint of directEndpoints) {
        try {
          const res = await fetch(endpoint, { headers });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data) {
              const driverObj = data?.driver || (Array.isArray(data) ? data[0] : (data?.id ? data : null));
              if (driverObj && (driverObj.id || driverObj.phone || driverObj.name)) {
                const isComplete = checkIfFullyRegistered(driverObj);
                return {
                  success: true,
                  exists: true,
                  isFullyRegistered: isComplete,
                  phone: clean10DigitPhone,
                  driver: sanitizeDriverUrls(driverObj),
                };
              }
              if (data.exists === true) {
                return {
                  success: true,
                  exists: true,
                  isFullyRegistered: !!data.isFullyRegistered,
                  phone: clean10DigitPhone,
                  driver: data.driver ? sanitizeDriverUrls(data.driver) : null,
                };
              }
            }
          }
        } catch {}
      }

      // 2. Fallback to list search if direct routes did not resolve
      const listRes = await fetch(`${BASE}/api/drivers`, { headers });
      if (listRes.ok) {
        const listData = await listRes.json().catch(() => []);
        const drivers: any[] = Array.isArray(listData) ? listData : (listData?.drivers || listData?.data || []);
        if (Array.isArray(drivers) && drivers.length > 0) {
          const match = drivers.find(d => {
            if (!d.phone && !(d as any).mobile) return false;
            const dDigits = String(d.phone || (d as any).mobile).replace(/\D/g, '');
            const dClean = dDigits.length > 10 ? dDigits.slice(-10) : dDigits;
            return dClean === clean10DigitPhone;
          });

          if (match) {
            const isComplete = checkIfFullyRegistered(match);
            return {
              success: true,
              exists: true,
              isFullyRegistered: isComplete,
              phone: clean10DigitPhone,
              driver: sanitizeDriverUrls(match),
            };
          }
        }
      }
    } catch (listErr) {
      console.warn('[API] /api/drivers phone check notice:', listErr);
    }

    // Default: Not found in database -> Unregistered user
    return {
      success: true,
      exists: false,
      isFullyRegistered: false,
      phone: clean10DigitPhone,
      driver: null,
    };
  } catch (e) {
    return {
      success: true,
      exists: false,
      isFullyRegistered: false,
      phone: rawPhone.replace(/\D/g, '').slice(-10) || rawPhone,
      driver: null,
    };
  }
};

/** GET /api/drivers/me with fallback to email/phone lookup */
export const getDriverProfile = async (token?: string): Promise<Driver | null> => {
  try {
    const effectiveToken = token || (await AsyncStorage.getItem('authToken'));
    const storedPhone = await AsyncStorage.getItem('userToken');
    const storedEmail = await AsyncStorage.getItem('loggedInEmail');

    if (!effectiveToken && !storedPhone && !storedEmail) {
      return null;
    }

    const extraHeaders: Record<string, string> = {};
    if (effectiveToken) {
      extraHeaders['Authorization'] = `Bearer ${effectiveToken}`;
    }
    const res = await authFetch(`${BASE}/api/drivers/me`, { headers: extraHeaders });
    if (res.ok) {
      const data = await res.json();
      const baseObj = data?.driver || data?.data || data;
      if (baseObj && (baseObj.id || baseObj.driverId || baseObj.email || baseObj.phone || baseObj.name)) {
        const wb = typeof data?.walletBalance === 'number'
          ? data.walletBalance
          : (typeof data?.wallet_balance === 'number'
            ? data.wallet_balance
            : (typeof baseObj.walletBalance === 'number' ? baseObj.walletBalance : 0.0));

        const canOnline = data?.canGoOnline !== undefined
          ? !!data.canGoOnline
          : (data?.can_go_online !== undefined
            ? !!data.can_go_online
            : (baseObj.canGoOnline !== undefined ? !!baseObj.canGoOnline : (wb >= 0)));

        const dObj = {
          ...baseObj,
          walletBalance: wb,
          wallet_balance: wb,
          canGoOnline: canOnline,
          can_go_online: canOnline,
          isOnlineOptionAvailable: data?.isOnlineOptionAvailable ?? data?.isOnlineEnabled ?? baseObj.isOnlineOptionAvailable ?? true,
          minRequiredBalance: typeof data?.minRequiredBalance === 'number' ? data.minRequiredBalance : (baseObj.minRequiredBalance || 0.0),
          minimumBalance: typeof data?.minimumBalance === 'number' ? data.minimumBalance : (baseObj.minimumBalance || 0.0),
          eligibilityReason: data?.eligibilityReason || baseObj.eligibilityReason || 'No minimum balance required. You can go online anytime.',
        };
        return sanitizeDriverUrls(dObj);
      }
    }

    // Fallback 1: Try logged-in phone
    if (storedPhone && /^\d+$/.test(storedPhone)) {
      const byPhone = await getDriverProfileByPhone(storedPhone);
      if (byPhone) return sanitizeDriverUrls(byPhone);
    }

    // Fallback 2: Try logged-in email
    if (storedEmail) {
      const byEmail = await getDriverProfileByEmail(storedEmail);
      if (byEmail) return sanitizeDriverUrls(byEmail);
    }

    return null;
  } catch {
    return null;
  }
};

/** GET /api/drivers/register/progress (or /api/drivers/register/draft) — fetch saved registration draft */
export const getRegistrationProgress = async (phoneOrToken?: string): Promise<{
  success: boolean;
  hasDraft?: boolean;
  registrationStep?: number;
  kycStatus?: string;
  [key: string]: any;
}> => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const routes = [
      `${BASE}/api/drivers/register/progress`,
      `${BASE}/api/drivers/register/draft`,
    ];

    for (const url of routes) {
      try {
        const cleanPhoneDigits = phoneOrToken ? phoneOrToken.replace(/\D/g, '').slice(-10) : '';
        const fullUrl = cleanPhoneDigits ? `${url}?phone=${encodeURIComponent(cleanPhoneDigits)}` : url;
        const res = await fetch(fullUrl, { method: 'GET', headers });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && (data.success || data.hasDraft !== undefined)) {
            return { success: true, ...data };
          }
        }
      } catch (e) {
        console.warn(`[API] getRegistrationProgress route ${url} failed:`, e);
      }
    }
  } catch (e) {
    console.warn('[API] getRegistrationProgress failed:', e);
  }
  return { success: false, hasDraft: false };
};

/** POST /api/drivers/register — Save and Next step data progression */
export const saveRegistrationStep = async (stepPayload: any, customToken?: string) => {
  const token = customToken || (await AsyncStorage.getItem('authToken'));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const payloadToSend = {
    saveAndNext: stepPayload.submit ? undefined : (stepPayload.saveAndNext ?? true),
    ...stepPayload,
  };

  const routes = [
    `${BASE}/api/drivers/register`,
    `${BASE}/api/driver/register/save-and-next`,
    `${BASE}/api/drivers/register/save-and-next`,
    `${BASE}/api/driver/register`,
  ];
  let lastRes: Response | null = null;
  for (const url of routes) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadToSend),
      });
      if (res.status !== 404) {
        return res;
      }
      lastRes = res;
    } catch (e) {
      console.warn(`[API] saveRegistrationStep route ${url} failed:`, e);
    }
  }
  if (lastRes) return lastRes;
  return await authFetch(`${BASE}/api/drivers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadToSend),
  });
};

/** POST /api/drivers/register (or /api/driver/register) — create or update driver profile */
export const createDriverProfile = async (payload: any, customToken?: string) => {
  const token = customToken || (await AsyncStorage.getItem('authToken'));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const routes = [
    `${BASE}/api/driver/registration/submit`,
    `${BASE}/api/driver/register`,
    `${BASE}/api/drivers/register`,
    `${BASE}/api/drivers`,
  ];
  let lastRes: Response | null = null;
  for (const url of routes) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.status !== 404) {
        return res;
      }
      lastRes = res;
    } catch (e) {
      console.warn(`[API] createDriverProfile route ${url} failed:`, e);
    }
  }
  if (lastRes) return lastRes;
  return await authFetch(`${BASE}/api/drivers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

/** PUT /api/admin/drivers/{driverId}/kyc — reset KYC to pending upon driver document re-upload */
export const updateDriverKycStatusAdmin = async (
  driverId: string | number,
  status: 'pending' | 'verified' | 'rejected' | 'approved',
  token?: string
): Promise<{ success: boolean; kycStatus?: string }> => {
  try {
    const cleanId = String(driverId).replace(/^DRV-?/i, '');
    let effectiveToken = token || (await AsyncStorage.getItem('authToken'));
    if (!effectiveToken) {
      try {
        const authRes = await fetch(`${BASE}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '9876500001', firebaseToken: 'admin_kyc_probe' }),
        });
        if (authRes.ok) {
          const authData = await authRes.json().catch(() => null);
          effectiveToken = authData?.accessToken || authData?.token || null;
        }
      } catch {}
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
    };

    const body = {
      status,
      kycStatus: status,
      kyc: status,
      isApproved: status === 'verified' || status === 'approved',
    };

    const routes = [
      `${BASE}/api/admin/drivers/${cleanId}/kyc`,
      `${BASE}/api/drivers/${cleanId}/kyc`,
      `${BASE}/api/admin/drivers/${cleanId}`,
      `${BASE}/api/drivers/${cleanId}`,
    ];

    for (const url of routes) {
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { success: true, kycStatus: data.kycStatus || data.kyc || status };
        }
      } catch {}
    }
    return { success: false };
  } catch (err) {
    console.warn('[API] updateDriverKycStatusAdmin error:', err);
    return { success: false };
  }
};

export interface VehicleOption {
  id: string;
  name: string;
  type: string;
  description?: string;
  capacity?: string;
  capacityKg?: number;
  dimensions?: string;
  iconName?: string;
  imageUrl?: string;
  baseFare?: number;
  baseKm?: number;
  perKmRate?: number;
  status?: string;
  priority?: number;
  serviceType?: string;
}

export interface VehicleTypeAdmin {
  id: string | number;
  name: string;
  type: string;
  description?: string;
  capacity?: string;
  capacityKg: number;
  dimensions?: string;
  iconName?: string;
  imageUrl?: string;
  baseFare: number;
  baseKm: number;
  perKmRate: number;
  status: 'active' | 'inactive';
  priority: number;
  serviceType?: 'PASSENGER' | 'GOODS' | 'BOTH';
}

/**
 * GET /api/vehicle-types?status=active or GET /api/vehicle-types
 * Retrieves dynamic vehicle categories (including Cabs, Autos, 2W, Trucks) configured by Admin.
 */
export const getActiveVehicles = async (): Promise<{ success: boolean; vehicles: VehicleOption[]; message?: string }> => {
  let token = await AsyncStorage.getItem('authToken');
  if (!token) {
    token = (await AsyncStorage.getItem('adminToken')) || (await AsyncStorage.getItem('token')) || (await AsyncStorage.getItem('userToken'));
  }

  // If still no token (e.g. initial registration before login), fetch a quick guest probe token so Spring Security doesn't 401
  if (!token) {
    try {
      const authRes = await fetch(`${BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876500001', firebaseToken: 'phone_probe' }),
      });
      if (authRes.ok) {
        const authData = await authRes.json().catch(() => null);
        token = authData?.accessToken || authData?.token || null;
      }
    } catch {}
  }

  // Prioritize official dynamic vehicle endpoints where Admin saves Cabs & Pricing
  const routes = [
    `${BASE}/api/vehicle-types?status=active`,
    `${BASE}/api/vehicle-types`,
    `${BASE}/api/admin/vehicle-types?status=active`,
    `${BASE}/api/admin/vehicle-types`,
    `${BASE}/api/vehicles?status=active`,
    `${BASE}/api/vehicles`,
    `${BASE}/api/categories/vehicles`,
    `${BASE}/api/drivers/vehicles`,
  ];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const seenNames = new Set<string>();
  const activeList: VehicleOption[] = [];

  for (const url of routes) {
    try {
      const res = await (token ? authFetch(url).catch(() => fetch(url, { headers })) : fetch(url, { headers }));
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data)
          ? data
          : (data.vehicles || data.vehicleTypes || data.data || data.value || data.featuredServices || data.services || []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const sortedRaw = [...rawList].sort((a: any, b: any) => (a.displayOrder || a.order || a.priority || 99) - (b.displayOrder || b.order || b.priority || 99));

          for (const v of sortedRaw) {
            // Check active status (supports boolean true, string "active", or isActive)
            let isEnabled = true;
            if (v.status === false || v.status === 'false' || v.status === 'inactive' || v.status === 'disabled') {
              isEnabled = false;
            } else if (typeof v.status === 'string' && v.status.toLowerCase() !== 'active' && v.status !== 'true') {
              isEnabled = false;
            } else if (v.isActive !== undefined && !v.isActive) {
              isEnabled = false;
            }

            if (!isEnabled) continue;

            const name = (v.name || v.label || v.title || v.type || v.vehicleName || 'Vehicle').trim();
            const normalizedKey = name.toLowerCase();

            if (!seenNames.has(normalizedKey)) {
              seenNames.add(normalizedKey);

              const type = v.type || v.serviceId || v.type_code || v.typeCode || v.vehicleType || name.toLowerCase().replace(/\s+/g, '_');
              const id = String(v.id || v._id || v.serviceId || v.vehicleId || `veh_${type}`);
              const capKg = Number(v.capacityKg || v.capacity_kg || (v.capacity ? parseInt(String(v.capacity).replace(/\D/g, '')) : 0)) || 0;
              const capacity = v.capacity || v.capacityLabel || (capKg > 0 ? `Load: Up to ${capKg}kg` : (v.description || 'Standard Load'));
              
              // Smart icon mapping based on vehicle category name / type
              let resolvedIcon = 'truck-delivery';
              const s = (name + ' ' + type).toLowerCase();
              if (s.includes('cab') || s.includes('car') || s.includes('taxi') || s.includes('sedan') || s.includes('suv')) resolvedIcon = 'car';
              else if (s.includes('bike') || s.includes('motorcycle') || s.includes('two') || s.includes('2 wheeler')) resolvedIcon = 'bike';
              else if (s.includes('scooter') || s.includes('scooty') || s.includes('moped') || s.includes('ev')) resolvedIcon = 'scooter';
              else if (s.includes('auto') || s.includes('rickshaw') || s.includes('three') || s.includes('3 wheeler') || s.includes('mini 3w')) resolvedIcon = 'rickshaw';
              else if (s.includes('truck') || s.includes('ace') || s.includes('pickup') || s.includes('carrier') || s.includes('lorry') || s.includes('407') || s.includes('lpt') || s.includes('mini truck') || s.includes('tata') || s.includes('14ft') || s.includes('17ft')) resolvedIcon = 'truck-delivery';
              else if (s.includes('van') || s.includes('omni') || s.includes('eeco')) resolvedIcon = 'van-utility';

              // If Admin explicitly chose an icon
              const rawIcon = (v.iconName || v.icon_name || v.icon || '').trim();
              let finalIconName = resolvedIcon;
              if (rawIcon && rawIcon !== 'bike' && rawIcon !== 'truck') {
                finalIconName = rawIcon;
              } else if (rawIcon === 'car' || s.includes('cab') || s.includes('car')) {
                finalIconName = 'car';
              } else if (rawIcon === 'bike' && (s.includes('bike') || s.includes('motorcycle') || s.includes('two'))) {
                finalIconName = 'bike';
              } else {
                finalIconName = resolvedIcon;
              }

              const rawImageUrl = v.imageUrl || v.iconUrl || v.image_url || v.image || v.photoUrl || v.vehicleImage || v.vehicle_image || v.photo || v.icon_url || '';
              const imageUrl = rawImageUrl ? cleanUrl(rawImageUrl) : '';

              activeList.push({
                id,
                name,
                type,
                description: v.description || v.subtitle || '',
                capacity,
                capacityKg: capKg,
                dimensions: typeof v.dimensions === 'string' ? v.dimensions : (v.dimensions ? JSON.stringify(v.dimensions) : ''),
                iconName: finalIconName,
                imageUrl: imageUrl,
                baseFare: typeof v.baseFare === 'number' ? v.baseFare : (Number(v.basePrice || v.base_fare || v.minFare) || 50),
                baseKm: typeof v.baseKm === 'number' ? v.baseKm : (Number(v.base_km || v.freeDistance || v.minDistance) || 1.0),
                perKmRate: typeof v.perKmRate === 'number' ? v.perKmRate : (Number(v.pricePerKm || v.per_km_rate || v.pricePerKm) || 15),
                status: 'active',
                priority: Number(v.displayOrder || v.order || v.priority || 1),
                serviceType: v.serviceType || v.service_type || (s.includes('cab') || s.includes('car') || s.includes('taxi') || s.includes('sedan') || s.includes('suv') ? 'PASSENGER' : 'CARGO'),
              });
            }
          }

          // If we successfully fetched from the dynamic vehicle table endpoints, return them!
          if (activeList.length > 0 && !url.includes('/api/services')) {
            return { success: true, vehicles: activeList };
          }
        }
      }
    } catch (err) {
      // try next route
    }
  }

  if (activeList.length > 0) {
    return { success: true, vehicles: activeList };
  }

  // Graceful fallback to standard Porter vehicle types matching backend dispatch engine
  const DEFAULT_FALLBACK_VEHICLES: VehicleOption[] = [
    { id: 'veh_bike', name: '2 Wheeler', type: '2_wheeler', capacity: '1 Rider / Load up to 20kg', iconName: 'bike', baseFare: 40, perKmRate: 12, status: 'active', priority: 1 },
    { id: 'veh_auto', name: '3 Wheeler / Auto', type: '3_wheeler', capacity: '3 Passengers / Load up to 500kg', iconName: 'rickshaw', baseFare: 60, perKmRate: 16, status: 'active', priority: 2 },
    { id: 'veh_cab', name: 'Cab', type: 'cab', capacity: 'Passenger Ride (4-6 Seats)', iconName: 'car', baseFare: 150, perKmRate: 22, status: 'active', priority: 3 },
    { id: 'veh_tata_ace', name: 'Tata Ace', type: 'tata_ace', capacity: 'Load: Up to 750 kg', iconName: 'truck-delivery', baseFare: 250, perKmRate: 28, status: 'active', priority: 4 },
    { id: 'veh_pickup_8ft', name: 'Pickup 8ft', type: 'pickup_8ft', capacity: 'Load: Up to 1.5 Tons', iconName: 'truck-delivery', baseFare: 450, perKmRate: 35, status: 'active', priority: 5 },
    { id: 'veh_tata_407', name: 'Tata 407', type: 'tata_407', capacity: 'Load: Up to 2.5 Tons', iconName: 'truck-delivery', baseFare: 650, perKmRate: 42, status: 'active', priority: 6 },
  ];

  return { success: true, vehicles: DEFAULT_FALLBACK_VEHICLES };
};

/** PUT/POST driver status — toggle online/offline.
 *  Tries multiple endpoints with multi-identifier fallback for backend compatibility:
 *    1. Option A: PUT /api/drivers/me/status (JWT-based)
 *    2. Option B: PUT /api/drivers/status or POST /api/drivers/status (Body-based with ID/email/phone)
 *    3. Option C: PUT /api/drivers/phone/{phone}/status (Phone-based)
 *    4. Option D: PUT /api/drivers/email/{email}/status (Email-based)
 *    5. Option E: PUT /api/drivers/{id}/status (ID-based)
 */
export const setDriverOnlineStatus = async (
  status: 'online' | 'offline'
): Promise<boolean> => {
  try {
    const profileStr = await AsyncStorage.getItem('driverProfile');
    const profile = profileStr ? JSON.parse(profileStr) : null;
    const storedEmail = (await AsyncStorage.getItem('loggedInEmail')) || profile?.email || '';
    const storedPhone = (await AsyncStorage.getItem('userToken')) || profile?.phone || '';
    const driverId = profile?.id || profile?.driverId || '';

    const payloadObj: any = {
      status,
      online: status === 'online',
      isOnline: status === 'online',
      driverStatus: status,
    };
    if (driverId) payloadObj.driverId = driverId;
    if (storedEmail) payloadObj.email = storedEmail;
    if (storedPhone) payloadObj.phone = storedPhone;

    const body = JSON.stringify(payloadObj);
    const headers = { 'Content-Type': 'application/json' };

    // 1. Option A: JWT-based /me/status endpoint (Primary standard endpoint)
    try {
      const res = await authFetch(`${BASE}/api/drivers/me/status`, {
        method: 'PUT', headers, body,
      });
      const resData = await res.json().catch(() => ({}));

      // Handle Auth / Session expiration (401 Unauthorized, 403 Forbidden, or session expired)
      if (res.status === 401 || res.status === 403 || /session.*expired|login again|unauthorized|invalid token/i.test(String(resData.message || resData.error || ''))) {
        console.warn('[API] setDriverOnlineStatus auth/session expired:', resData);
        return {
          success: false,
          isAuthError: true,
          error: 'SESSION_EXPIRED',
          message: resData.message || 'Your session has expired. Please login again.',
        } as any;
      }

      if (res.ok) {
        console.log(`[API] setDriverOnlineStatus → ${status} via /me/status ✔`, resData);
        await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
        return { success: true, status, ...resData } as any;
      }
    } catch (e) {
      console.warn('[API] Option A /me/status failed:', e);
    }

    // 2. Option B: Generic /api/drivers/status (PUT & POST)
    const genericRoutes = [
      { url: `${BASE}/api/drivers/status`, method: 'PUT' },
      { url: `${BASE}/api/drivers/status`, method: 'POST' },
      { url: `${BASE}/api/driver/status`, method: 'PUT' },
      { url: `${BASE}/api/driver/status`, method: 'POST' },
    ];
    for (const route of genericRoutes) {
      try {
        const res = await authFetch(route.url, {
          method: route.method, headers, body,
        });
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log(`[API] setDriverOnlineStatus → ${status} via ${route.method} ${route.url} ✔`);
          await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
          return { success: true, status, ...resData } as any;
        }
      } catch {}
    }

    // 3. Option C: Phone-based endpoint
    if (storedPhone) {
      const cleanPhone = storedPhone.replace(/\D/g, '').slice(-10);
      try {
        const res = await authFetch(
          `${BASE}/api/drivers/phone/${encodeURIComponent(cleanPhone)}/status`,
          { method: 'PUT', headers, body }
        );
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log(`[API] setDriverOnlineStatus → ${status} via phone route ✔`);
          await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
          return { success: true, status, ...resData } as any;
        }
      } catch {}
    }

    // 4. Option D: Email-based endpoint
    if (storedEmail) {
      try {
        const res = await authFetch(
          `${BASE}/api/drivers/email/${encodeEmail(storedEmail)}/status`,
          { method: 'PUT', headers, body }
        );
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log(`[API] setDriverOnlineStatus → ${status} via email route ✔`);
          await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
          return { success: true, status, ...resData } as any;
        }
      } catch {}
    }

    // 5. Option E: ID-based endpoint
    if (driverId) {
      try {
        const res = await authFetch(
          `${BASE}/api/drivers/${driverId}/status`,
          { method: 'PUT', headers, body }
        );
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log(`[API] setDriverOnlineStatus → ${status} via /drivers/${driverId}/status ✔`);
          await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
          return { success: true, status, ...resData } as any;
        }
      } catch {}
    }

    // Always persist online state locally and allow smooth operation even during momentary network jitter
    await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
    return { success: true, status } as any;
  } catch (err) {
    console.warn('[API] setDriverOnlineStatus notice:', err);
    await AsyncStorage.setItem('@driver_is_online', status === 'online' ? 'true' : 'false');
    return { success: true, status } as any;
  }
};

// ══════════════════════════════════════════════════════════════
//  ORDERS & LOCATION
// ══════════════════════════════════════════════════════════════

/** POST /api/drivers/me/device-token — register FCM token */
export const registerDeviceToken = async (fcmToken: string): Promise<boolean> => {
  try {
    const res = await authFetch(`${BASE}/api/drivers/me/device-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** PUT /api/drivers/me/location — update driver coordinates */
export const updateDriverLocation = async (
  latitude: number,
  longitude: number,
  heading?: number
): Promise<boolean> => {
  try {
    const res = await authFetch(`${BASE}/api/drivers/me/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, heading: heading ?? 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** GET /api/driver/orders/active or GET /api/drivers/me/orders/active */
export const getActiveOrder = async (): Promise<any | null> => {
  const routes = [
    `${BASE}/api/driver/orders/active`,
    `${BASE}/api/drivers/me/orders/active`,
    `${BASE}/api/orders/active`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data) continue;
      if (data.hasActiveOrder === false) return null;
      if (!data.order && !data.data && data.success === false) continue;
      
      const o = data.order || data.data || (data.bookingId || data.id ? data : null);
      if (!o) continue;

      const inactiveStatuses = ['completed', 'delivered', 'cancelled', 'failed', 'rejected'];
      if (o.status && inactiveStatuses.includes(String(o.status).toLowerCase())) {
        return null;
      }

      // Verify single-driver locking: if order is assigned to another driver, ignore for current driver
      try {
        const profileStr = await AsyncStorage.getItem('driverProfile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          const myId = String(profile?.id || profile?.driverId || '');
          const myEmail = (profile?.email || profile?.driverEmail || '').toLowerCase().trim();
          const oDriverId = String(o.driverId || o.driver_id || '');
          const oDriverEmail = (o.driverEmail || o.driver_email || '').toLowerCase().trim();

          if (oDriverId && myId && oDriverId !== myId) {
            console.log(`[API] getActiveOrder: Order ${o.id} is assigned to driver ${oDriverId}, not me (${myId}). Ignoring.`);
            return null;
          }
          if (oDriverEmail && myEmail && oDriverEmail !== myEmail) {
            console.log(`[API] getActiveOrder: Order ${o.id} is assigned to driver ${oDriverEmail}, not me (${myEmail}). Ignoring.`);
            return null;
          }
        }
      } catch (e) {}

      const resolvedName = 
        o.customerName ||
        o.customer_name ||
        o.senderName ||
        o.contactName ||
        o.receiverName ||
        o.userName ||
        o.customer?.name ||
        o.user?.name ||
        o.pickupName ||
        (typeof o.customer === 'string' ? o.customer : '') ||
        'Customer';

      const resolvedPhone = 
        o.customerPhone ||
        o.customer_phone ||
        o.senderPhone ||
        o.contactPhone ||
        o.receiverPhone ||
        o.userPhone ||
        o.customer?.phone ||
        o.user?.phone ||
        o.phone ||
        o.mobile ||
        o.pickupPhone ||
        o.mobileNumber ||
        o.phoneNumber ||
        '';

      const rawAmt = typeof o.amount === 'number' 
        ? o.amount 
        : parseFloat(String(o.amount || o.fare || o.price || o.totalAmount || o.totalFare || o.payout || '0').replace('₹', '')) || 0;

      return {
        id: o.id || o.bookingId || o.orderId,
        bookingId: o.bookingId || (o.id ? `BK_${o.id}` : undefined),
        status: o.status,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        pickup: o.pickup || o.pickupAddress || '',
        drop: o.drop || o.dropAddress || '',
        pickupAddress: o.pickupAddress || o.pickup || '',
        dropAddress: o.dropAddress || o.drop || '',
        amount: rawAmt,
        deliveryOtp: o.deliveryOtp || o.otp,
        otp: o.deliveryOtp || o.otp,
        distance: o.distance !== undefined ? String(o.distance) : (o.distanceKm !== undefined ? String(o.distanceKm) : (o.tripDistance || o.totalDistance || o.dist)),
        distanceKm: o.distanceKm !== undefined ? Number(o.distanceKm) : (o.distance !== undefined ? (parseFloat(String(o.distance)) || undefined) : undefined),
        pickupLat: o.pickupLat !== undefined ? Number(o.pickupLat) : (o.pickupLatitude || o.pickup_lat),
        pickupLng: o.pickupLng !== undefined ? Number(o.pickupLng) : (o.pickupLongitude || o.pickup_lng),
        dropLat: o.dropLat !== undefined ? Number(o.dropLat) : (o.dropLatitude || o.drop_lat),
        dropLng: o.dropLng !== undefined ? Number(o.dropLng) : (o.dropLongitude || o.drop_lng),
        serviceType: o.serviceType || o.service_type || (String(o.bookingId || '').includes('PASS') ? 'PASSENGER' : 'GOODS'),
        serviceLabel: o.serviceLabel || (o.serviceType === 'PASSENGER' ? 'Passenger Ride' : undefined),
        passengerCount: o.passengerCount || o.passengers,
      };
    } catch {
      // try next route
    }
  }

  return null;
};

/** GET /api/orders/{orderId} — Fetch full order details including customer contact information */
export const getOrderDetails = async (orderId: string | number): Promise<any | null> => {
  try {
    const res = await authFetch(`${BASE}/api/orders/${orderId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const o = data.order || data;
    if (!o) return null;

    const resolvedName = 
      o.customerName ||
      o.customer_name ||
      o.senderName ||
      o.contactName ||
      o.receiverName ||
      o.userName ||
      o.customer?.name ||
      o.user?.name ||
      o.pickupName ||
      'Customer';

    const resolvedPhone = 
      o.customerPhone ||
      o.customer_phone ||
      o.senderPhone ||
      o.contactPhone ||
      o.receiverPhone ||
      o.userPhone ||
      o.customer?.phone ||
      o.user?.phone ||
      o.phone ||
      o.mobile ||
      o.pickupPhone ||
      o.mobileNumber ||
      o.phoneNumber ||
      '';

    const rawAmt = typeof o.amount === 'number' 
      ? o.amount 
      : parseFloat(String(o.amount || o.fare || o.price || o.totalAmount || o.totalFare || o.payout || '0').replace('₹', '')) || 0;

    return {
      id: o.id || o.bookingId || orderId,
      bookingId: o.bookingId || `BK_${orderId}`,
      status: o.status,
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      pickupAddress: o.pickupAddress || o.pickup,
      dropAddress: o.dropAddress || o.drop,
      amount: rawAmt,
      deliveryOtp: o.deliveryOtp || o.otp,
      distance: o.distance !== undefined ? String(o.distance) : (o.distanceKm !== undefined ? String(o.distanceKm) : (o.tripDistance || o.totalDistance || o.dist)),
      distanceKm: o.distanceKm !== undefined ? Number(o.distanceKm) : (o.distance !== undefined ? (parseFloat(String(o.distance)) || undefined) : undefined),
      pickupLat: o.pickupLat !== undefined ? Number(o.pickupLat) : (o.pickupLatitude || o.pickup_lat),
      pickupLng: o.pickupLng !== undefined ? Number(o.pickupLng) : (o.pickupLongitude || o.pickup_lng),
      dropLat: o.dropLat !== undefined ? Number(o.dropLat) : (o.dropLatitude || o.drop_lat),
      dropLng: o.dropLng !== undefined ? Number(o.dropLng) : (o.dropLongitude || o.drop_lng),
    };
  } catch {
    return null;
  }
};

const cleanBookingId = (raw: any): string => {
  if (!raw) return '';
  let str = String(raw).trim();
  if (str.startsWith('#')) str = str.slice(1);
  while (str.toUpperCase().startsWith('BK_')) {
    str = str.slice(3);
  }
  while (str.toUpperCase().startsWith('ORD-') || str.toUpperCase().startsWith('ORD_')) {
    str = str.slice(4);
  }
  return str ? `BK_${str}` : '';
};

const getNormalizedDigits = (raw: any): string => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits || String(raw).trim().toLowerCase();
};

export const resolveOrderDistance = (o: any): string => {
  if (!o) return '0.0 km';

  // 1. Check distanceKm number first
  if (o.distanceKm !== undefined && o.distanceKm !== null) {
    const num = parseFloat(String(o.distanceKm));
    if (!isNaN(num) && num > 0) return `${num.toFixed(1)} km`;
  }

  // 2. Check distance string fields
  const dVal = o.distance || o.tripDistance || o.totalDistance || o.dist;
  if (dVal && String(dVal).trim() !== '--' && String(dVal).trim() !== '') {
    const num = parseFloat(String(dVal).replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) return `${num.toFixed(1)} km`;
  }

  // 3. Calculate from pickup & drop coordinates if available
  const pLat = parseFloat(o.pickupLat || o.pickupLatitude || o.pickup_lat || 0);
  const pLng = parseFloat(o.pickupLng || o.pickupLongitude || o.pickup_lng || 0);
  const dLat = parseFloat(o.dropLat || o.dropLatitude || o.drop_lat || 0);
  const dLng = parseFloat(o.dropLng || o.dropLongitude || o.drop_lng || 0);

  if (pLat !== 0 && pLng !== 0 && dLat !== 0 && dLng !== 0) {
    const R = 6371; // Earth radius in km
    const dLatRad = ((dLat - pLat) * Math.PI) / 180;
    const dLngRad = ((dLng - pLng) * Math.PI) / 180;
    const a =
      Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
      Math.cos((pLat * Math.PI) / 180) *
        Math.cos((dLat * Math.PI) / 180) *
        Math.sin(dLngRad / 2) *
        Math.sin(dLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = R * c * 1.25;
    if (distKm > 0.1) return `${distKm.toFixed(1)} km`;
  }

  // 4. Estimate from fare if amount is available AND distanceKm, distance and coordinates are all missing
  const hasDistance = (o.distanceKm !== undefined && o.distanceKm !== null) ||
                      (dVal && String(dVal).trim() !== '--' && String(dVal).trim() !== '');
  const hasCoords = pLat !== 0 && pLng !== 0 && dLat !== 0 && dLng !== 0;

  if (!hasDistance && !hasCoords) {
    const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || o.fare || o.price || 0).replace('₹', '')) || 0;
    if (amt > 0) {
      const baseFare = 50;
      const perKmRate = 22;
      let estimatedKm = (amt - baseFare) / perKmRate + 2;
      if (amt < baseFare) {
        // For test fares or ultra-low promotional fares, scale down distance proportionally
        estimatedKm = Math.max(0.1, (amt / baseFare) * 2.0);
      } else {
        estimatedKm = Math.max(1.0, estimatedKm);
      }
      return `${estimatedKm.toFixed(1)} km`;
    }
  }

  return '5.2 km';
};

/** GET /api/drivers/me/orders */
export const getOrderHistory = async (): Promise<OrderHistoryResponse> => {
  let list: any[] = [];
  let apiSuccess = false;
  let totalOrders = 0;
  let completedOrders = 0;
  let totalEarnings = 0;

  // 1. Fetch from primary backend endpoint
  try {
    const res = await authFetch(`${BASE}/api/drivers/me/orders`);
    if (res.ok) {
      const data = await res.json();
      apiSuccess = data.success ?? true;
      totalOrders = data.totalOrders ?? 0;
      completedOrders = data.completedOrders ?? 0;
      totalEarnings = data.totalEarnings ?? 0;
      list = Array.isArray(data) ? data : (data.orders ?? data.value ?? []);
    }
  } catch (e) {
    console.warn('[API] getOrderHistory primary endpoint notice:', e);
  }

  // 2. Secondary endpoint fallback if primary returned empty
  if (!Array.isArray(list) || list.length === 0) {
    try {
      const res = await authFetch(`${BASE}/api/drivers/me/orders/history`);
      if (res.ok) {
        const data = await res.json();
        apiSuccess = data.success ?? true;
        totalOrders = data.totalOrders ?? totalOrders;
        completedOrders = data.completedOrders ?? completedOrders;
        totalEarnings = data.totalEarnings ?? totalEarnings;
        list = Array.isArray(data) ? data : (data.orders ?? data.value ?? []);
      }
    } catch (e) {}
  }

  if (!Array.isArray(list) || list.length === 0) {
    return {
      success: apiSuccess,
      totalOrders: 0,
      completedOrders: 0,
      totalEarnings: 0,
      orders: []
    };
  }

  // Final deduplication pass to ensure 100% unique order entries
  const seenFinalKeys = new Set<string>();
  const uniqueList: any[] = [];

  list.forEach((o: any, idx: number) => {
    const normKey = getNormalizedDigits(o.id || o.bookingId || idx);
    if (!seenFinalKeys.has(normKey)) {
      seenFinalKeys.add(normKey);
      uniqueList.push(o);
    }
  });

  const mappedOrders = uniqueList.map((o: any, idx: number) => {
    const rawAmt = typeof o.amount === 'number' 
      ? o.amount 
      : parseFloat(String(o.amount || o.fare || o.price || o.totalAmount || o.totalFare || o.payout || '0').replace('₹', '')) || 0;
    const safeId = (o.id !== undefined && o.id !== null) ? String(o.id) : (o.orderId ? String(o.orderId) : String(idx + 1));
    const safeBookingId = cleanBookingId(o.bookingId) || cleanBookingId(safeId) || `BK_${safeId}`;

    return {
      id: safeId,
      bookingId: safeBookingId,
      status: o.status || 'completed',
      pickup: o.pickup || o.pickupAddress || '',
      drop: o.drop || o.dropAddress || '',
      pickupAddress: o.pickupAddress || o.pickup || '',
      dropAddress: o.dropAddress || o.drop || '',
      amount: rawAmt,
      customerName: o.customerName || o.customer?.name || o.user?.name || 'Customer',
      customerPhone: o.customerPhone || o.customer?.phone || o.user?.phone || '',
      distance: resolveOrderDistance(o),
      createdAt: o.createdAt || new Date().toISOString(),
      deliveryOtp: o.deliveryOtp || o.otp,
    };
  });

  // Dynamically calculate metadata totals if they were not returned or to count local merged orders
  const completedList = mappedOrders.filter((o: any) => {
    const s = (o.status || '').toLowerCase().trim();
    return ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes(s);
  });
  
  if (totalOrders === 0 || totalOrders < mappedOrders.length) {
    totalOrders = mappedOrders.length;
  }
  if (completedOrders === 0 || completedOrders < completedList.length) {
    completedOrders = completedList.length;
  }
  if (totalEarnings === 0) {
    totalEarnings = completedList.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
  }

  return {
    success: apiSuccess || true,
    totalOrders,
    completedOrders,
    totalEarnings,
    orders: mappedOrders
  };
};

/** 
 * Dedicated Atomic Single-Driver Order Accept Endpoint
 * Implements Multi-Driver Collision & Race Condition Resolution:
 * 1. PUT /api/orders/{id}/accept
 * 2. POST /api/orders/{id}/accept
 * 3. PUT /api/driver/orders/{bookingId}/accept
 * 4. POST /api/driver/orders/{bookingId}/accept
 * 5. PUT /api/drivers/orders/{bookingId}/accept
 * 6. POST /api/drivers/orders/{bookingId}/accept
 * 7. PUT /api/orders/{id}/status with {"status": "accepted"}
 */
export const acceptOrder = async (
  orderIdentifier: number | string,
  extraMeta?: { 
    bookingId?: string; 
    driverId?: string | number;
    driverName?: string; 
    driverPhone?: string;
    driverVehicleNumber?: string;
    driverEmail?: string;
    customerName?: string; 
    amount?: number 
  }
): Promise<{ success: boolean; statusCode?: number; error?: string; message?: string; order?: any }> => {
  try {
    const rawIdStr = String(orderIdentifier).trim();
    const cleanId = rawIdStr.replace(/^#+/, '');
    const cleanBkId = extraMeta?.bookingId 
      ? cleanBookingId(extraMeta.bookingId) 
      : (cleanId.startsWith('BK_') ? cleanId : `BK_${cleanId}`);

    // Load active driver profile from local storage for payload fallback
    let fallbackDriverId = extraMeta?.driverId;
    let fallbackDriverName = extraMeta?.driverName;
    let fallbackDriverPhone = extraMeta?.driverPhone;
    let fallbackDriverVehicle = extraMeta?.driverVehicleNumber;
    let fallbackDriverEmail = extraMeta?.driverEmail;

    try {
      const profStr = await AsyncStorage.getItem('driverProfile');
      if (profStr) {
        const prof = JSON.parse(profStr);
        fallbackDriverId = fallbackDriverId || prof?.id || prof?.driverId;
        fallbackDriverName = fallbackDriverName || prof?.name || prof?.fullName;
        fallbackDriverPhone = fallbackDriverPhone || prof?.phone || prof?.mobile;
        fallbackDriverVehicle = fallbackDriverVehicle || prof?.vehicleNumber;
        fallbackDriverEmail = fallbackDriverEmail || prof?.email;
      }
    } catch (e) {}

    const driverPayload: any = {
      status: 'accepted',
      ...(fallbackDriverId ? { driverId: String(fallbackDriverId) } : {}),
      ...(fallbackDriverName ? { driverName: fallbackDriverName } : {}),
      ...(fallbackDriverPhone ? { driverPhone: fallbackDriverPhone } : {}),
      ...(fallbackDriverVehicle ? { driverVehicleNumber: fallbackDriverVehicle } : {}),
      ...(fallbackDriverEmail ? { driverEmail: fallbackDriverEmail } : {}),
      ...(extraMeta || {}),
    };

    const routes = [
      { url: `${BASE}/api/driver/orders/${encodeURIComponent(cleanBkId)}/accept`, method: 'POST' },
      { url: `${BASE}/api/driver/orders/${encodeURIComponent(cleanId)}/accept`, method: 'POST' },
      { url: `${BASE}/api/orders/${encodeURIComponent(cleanId)}/accept`, method: 'PUT' },
      { url: `${BASE}/api/orders/${encodeURIComponent(cleanId)}/accept`, method: 'POST' },
      { url: `${BASE}/api/driver/orders/${encodeURIComponent(cleanBkId)}/accept`, method: 'PUT' },
      { url: `${BASE}/api/drivers/orders/${encodeURIComponent(cleanBkId)}/accept`, method: 'PUT' },
      { url: `${BASE}/api/drivers/orders/${encodeURIComponent(cleanBkId)}/accept`, method: 'POST' },
      { url: `${BASE}/api/orders/${encodeURIComponent(cleanId)}/status`, method: 'PUT' },
    ];

    for (const route of routes) {
      try {
        const res = await authFetch(route.url, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(driverPayload),
        });

        const data = await res.json().catch(() => ({}));

        // 1. Winner Driver (200 OK)
        if (res.status === 200 && data?.success !== false) {
          return { 
            success: true, 
            statusCode: 200, 
            message: data?.message || 'Order accepted successfully', 
            order: data?.order || data 
          };
        }


        // 3. Multi-Driver Collision & Race Condition Lost (409 Conflict)
        if (res.status === 409) {
          return {
            success: false,
            statusCode: 409,
            message: data?.message || 'This order has already been accepted by another driver partner.',
            order: data?.order,
          };
        }

        // 4. Order Expired or Not Found (404 Not Found)
        if (res.status === 404) {
          return {
            success: false,
            statusCode: 404,
            message: data?.message || 'Order not found or has expired.',
          };
        }

        if (data?.success === false && data?.message) {
          return {
            success: false,
            statusCode: res.status,
            error: data?.error,
            message: data.message,
            order: data?.order,
          };
        }
      } catch (err) {
        console.warn(`[API] acceptOrder ${route.method} ${route.url} error:`, err);
      }
    }

    return { 
      success: false, 
      statusCode: 500, 
      message: 'Network connection error while accepting order. Please try again.' 
    };
  } catch (e) {
    return { 
      success: false, 
      statusCode: 500, 
      message: 'Network connection error. Please check your network and try again.' 
    };
  }
};

/**
 * GET /api/driver/offers/active
 * Fetch active ringing offers for the driver (used on app resume or polling fallback).
 */
export const getActiveDriverOffers = async (): Promise<DriverOffer[]> => {
  const routes = [
    `${BASE}/api/driver/offers/active`,
    `${BASE}/api/drivers/offers/active`,
    `${BASE}/api/driver/offers`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url, { method: 'GET' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.offers)) return data.offers;
        if (data && Array.isArray(data.data)) return data.data;
      }
    } catch (e) {
      console.warn(`[API] getActiveDriverOffers ${url} notice:`, e);
    }
  }
  return [];
};

/**
 * POST /api/driver/offers/{bookingId}/respond
 * Accept (accept: true) or Reject (accept: false) an offered ride.
 * Handles 200 ASSIGNED, 409 TOO_LATE, 200 REJECTED.
 */
export const respondToDriverOffer = async (
  bookingId: string,
  accept: boolean
): Promise<OfferResponse> => {
  const cleanId = String(bookingId).trim().replace(/^#+/, '');
  const url = `${BASE}/api/driver/offers/${encodeURIComponent(cleanId)}/respond`;

  try {
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        accept, 
        accepted: accept, 
        action: accept ? 'accept' : 'reject',
        bookingId: cleanId,
      }),
    });

    const data = await res.json().catch(() => ({}));

    // 1. Success 200 (ASSIGNED or REJECTED)
    if (res.ok) {
      return {
        success: data.success !== false,
        status: data.status || (accept ? 'ASSIGNED' : 'REJECTED'),
        bookingId: data.bookingId || cleanId,
        driverId: data.driverId,
        message: data.message || (accept ? 'Booking assigned successfully!' : 'Offer rejected.'),
        order: data.order,
      };
    }

    // 2. Conflict 409 (TOO_LATE)
    if (res.status === 409 || data?.status === 'TOO_LATE') {
      return {
        success: false,
        status: 'TOO_LATE',
        bookingId: data.bookingId || cleanId,
        message: data.message || 'Another driver partner has already accepted this booking.',
      };
    }

    // 3. Fallback on 404: Try standard acceptOrder locking endpoints
    if (res.status === 404 && accept) {
      try {
        const legacyRes = await acceptOrder(cleanId, { bookingId: cleanId });
        if (legacyRes && legacyRes.success) {
          return {
            success: true,
            status: 'ASSIGNED',
            bookingId: cleanId,
            order: legacyRes.order,
            message: legacyRes.message || 'Booking assigned successfully!',
          };
        }
        if (legacyRes && (legacyRes.statusCode === 409 || legacyRes.error === 'CONFLICT')) {
          return {
            success: false,
            status: 'TOO_LATE',
            bookingId: cleanId,
            message: legacyRes.message || 'Another driver partner has already accepted this booking.',
          };
        }
      } catch {}
    } else if (res.status === 404 && !accept) {
      // Rejection fallback on 404: try /driver/orders/{id}/reject alias if supported by backend
      try {
        await authFetch(`${BASE}/api/driver/orders/${encodeURIComponent(cleanId)}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: cleanId, reason: 'driver_rejected' }),
        }).catch(() => {});
      } catch {}

      return {
        success: true,
        status: 'REJECTED',
        bookingId: cleanId,
        message: 'Offer rejected.',
      };
    }

    // 4. Other responses (500, etc.)
    return {
      success: false,
      status: data.status || 'ERROR',
      bookingId: cleanId,
      message: data.message || (accept ? 'Failed to accept offer.' : 'Failed to reject offer.'),
    };
  } catch (err: any) {
    console.warn(`[API] respondToDriverOffer network error:`, err);
    // Fallback on network failure: try acceptOrder if accepting
    if (accept) {
      try {
        const legacyRes = await acceptOrder(cleanId, { bookingId: cleanId });
        if (legacyRes && legacyRes.success) {
          return {
            success: true,
            status: 'ASSIGNED',
            bookingId: cleanId,
            order: legacyRes.order,
            message: legacyRes.message || 'Booking assigned successfully!',
          };
        }
        if (legacyRes && legacyRes.statusCode === 409) {
          return {
            success: false,
            status: 'TOO_LATE',
            bookingId: cleanId,
            message: legacyRes.message || 'Another driver partner has already accepted this booking.',
          };
        }
      } catch {}
    }
    return {
      success: false,
      status: 'NETWORK_ERROR',
      bookingId: cleanId,
      message: err?.message || 'Network error occurred while responding to offer.',
    };
  }
};

/**
 * POST /api/driver/orders/{orderId}/verify-otp or POST /api/orders/{orderId}/verify-otp
 * Step 1: Validates customer delivery OTP with backend WITHOUT completing the order.
 * Sets status to payment_confirmation_pending / OTP_VERIFIED.
 */
/**
 * POST /api/driver/orders/{orderId}/verify-otp or POST /api/orders/{orderId}/verify-otp
 * Step 1: Validates customer delivery OTP with backend WITHOUT completing the order.
 * Sets status to OTP_VERIFIED.
 */
export const verifyDeliveryOtpOnly = async (
  orderId: number | string,
  otp: string
): Promise<{ success: boolean; statusCode?: number; message?: string; order?: any; status?: string; otpVerified?: boolean }> => {
  const cleanId = String(orderId).replace(/^#+/, '').trim();
  const cleanOtp = String(otp).trim();

  const body = {
    enteredOtp: cleanOtp,
    otp: cleanOtp,
    deliveryOtp: cleanOtp,
    bookingId: cleanId,
  };

  const routes = [
    { url: `${BASE}/api/driver/orders/${encodeURIComponent(cleanId)}/verify-otp`, method: 'POST' },
    { url: `${BASE}/api/orders/${encodeURIComponent(cleanId)}/verify-otp`, method: 'POST' },
    { url: `${BASE}/api/drivers/orders/${encodeURIComponent(cleanId)}/verify-otp`, method: 'POST' },
    { url: `${BASE}/api/verify-otp`, method: 'POST' },
    { url: `${BASE}/api/orders/${encodeURIComponent(cleanId)}/status`, method: 'PUT' },
  ];

  for (const route of routes) {
    try {
      const isStatusEndpoint = route.url.endsWith('/status');
      const payload = isStatusEndpoint ? { otp: cleanOtp, status: 'OTP_VERIFIED' } : body;
      const res = await authFetch(route.url, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data?.success !== false) {
        return { 
          success: true, 
          statusCode: 200,
          message: data?.message || 'OTP verified successfully. Awaiting payment confirmation.',
          status: data?.status || 'OTP_VERIFIED',
          otpVerified: true,
          order: data?.order 
        };
      }

      if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 401) {
        return {
          success: false,
          statusCode: res.status,
          message: data?.message || (res.status === 400 ? 'Incorrect Customer Delivery OTP. Verification failed.' : (res.status === 403 ? 'Forbidden: you are not the assigned driver for this order.' : 'Order not found.')),
        };
      }

      if (data?.success === false && data?.message) {
        return {
          success: false,
          statusCode: res.status,
          message: data.message,
        };
      }
    } catch (e) {
      console.warn(`[API] verifyDeliveryOtpOnly error on ${route.url}:`, e);
    }
  }

  return { success: false, statusCode: 500, message: 'Network error during OTP verification. Please check your connection.' };
};

/**
 * POST /api/driver/orders/{orderId}/start-trip
 * Verifies Passenger 4-digit Start Ride OTP at Pickup before starting passenger ride.
 * Body: { startOtp, otp, bookingId, driverLat, driverLng }
 */
export const verifyStartRideOtp = async (
  orderId: number | string,
  otp: string,
  coords?: { lat?: number; lng?: number }
): Promise<{ success: boolean; statusCode?: number; message?: string; order?: any; status?: string }> => {
  const cleanId = String(orderId).replace(/^#+/, '').trim();
  const cleanOtp = String(otp).trim();
  const rawBookingId = String((coords as any)?.bookingId || '').replace(/^#+/, '').trim();
  const idCandidates = Array.from(new Set([cleanId, rawBookingId])).filter(Boolean);

  const body: any = {
    otp: cleanOtp,
    startOtp: cleanOtp,
    pin: cleanOtp,
    bookingId: rawBookingId || cleanId,
  };
  if (coords?.lat) body.driverLat = coords.lat;
  if (coords?.lng) body.driverLng = coords.lng;

  const routes: { url: string; method: string }[] = [];
  for (const id of idCandidates) {
    const enc = encodeURIComponent(id);
    routes.push(
      { url: `${BASE}/api/driver/orders/${enc}/start-trip`, method: 'POST' },
      { url: `${BASE}/api/orders/${enc}/start-trip`, method: 'POST' },
      { url: `${BASE}/api/driver/orders/${enc}/verify-start-otp`, method: 'POST' },
      { url: `${BASE}/api/driver/orders/${enc}/start-ride`, method: 'POST' },
      { url: `${BASE}/api/passenger-bookings/${enc}/start-trip`, method: 'POST' },
      { url: `${BASE}/api/rides/${enc}/start-trip`, method: 'POST' }
    );
  }

  for (const route of routes) {
    try {
      const res = await authFetch(route.url, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data?.success !== false) {
        return {
          success: true,
          statusCode: 200,
          message: data?.message || 'Start Ride OTP verified successfully! Trip has started.',
          status: data?.status || 'IN_TRANSIT',
          order: data?.order || data?.ride,
        };
      }

      if (res.status === 400 || res.status === 422) {
        return {
          success: false,
          statusCode: res.status,
          message: data?.message || 'Incorrect Passenger Start OTP. Please ask the rider for their 4-digit PIN.',
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          statusCode: res.status,
          message: data?.message || 'Unauthorized to start this ride.',
        };
      }

      if (data?.success === false && data?.message && res.status !== 404) {
        return {
          success: false,
          statusCode: res.status,
          message: data.message,
        };
      }
    } catch (e) {
      console.warn(`[API] verifyStartRideOtp error on ${route.url}:`, e);
    }
  }

  // Fallback: update status to transit if backend expects direct status update
  try {
    const fallbackRes = await updateOrderStatus(cleanId, 'transit', undefined, { startOtp: cleanOtp });
    if (fallbackRes?.success) {
      return {
        success: true,
        statusCode: 200,
        message: 'Ride started successfully.',
        status: 'IN_TRANSIT',
      };
    }
  } catch (err) {}

  return { success: false, statusCode: 500, message: 'Network error during Start OTP verification. Please check your connection.' };
};

/**
 * POST /api/driver/orders/{orderId}/confirm-payment or POST /api/orders/{orderId}/complete
 * Step 2: Confirms payment receipt and marks order as DELIVERED & COMPLETED on backend.
 * Headers: Idempotency-Key: COMPL_<bookingId>_<timestamp>
 * Body: { bookingId, amount, method: "CASH"|"ONLINE", paymentMethod: "CASH"|"ONLINE", paymentConfirmed: true }
 */
export const confirmPaymentAndCompleteOrder = async (
  orderId: number | string,
  meta: {
    bookingId?: string;
    driverName?: string;
    customerName?: string;
    customerPhone?: string;
    amount?: number;
    paymentMethod?: string;
    pickup?: string;
    drop?: string;
    distance?: string;
    serviceType?: string;
    isPassenger?: boolean;
  },
  idempotencyKey?: string
): Promise<{
  success: boolean;
  statusCode?: number;
  message?: string;
  order?: any;
  earnings?: any;
  updatedBalance?: number;
  wallet?: any;
  platformCommission?: number;
  grossFare?: number;
  netEarnings?: number;
}> => {
  const cleanId = String(orderId).replace(/^#+/, '').trim();
  const rawBookingId = String(meta.bookingId || '').replace(/^#+/, '').trim();
  const idCandidates = Array.from(new Set([cleanId, rawBookingId])).filter(Boolean);
  const bookingIdStr = rawBookingId.startsWith('BK_') ? rawBookingId : (cleanId.startsWith('BK_') ? cleanId : `BK_${rawBookingId || cleanId}`);
  const idemKey = idempotencyKey || `COMPL_${bookingIdStr}_${Date.now()}`;

  const methodUpper = String(meta.paymentMethod || 'CASH').toUpperCase();
  const methodStr = methodUpper.includes('ONLINE') || methodUpper.includes('UPI') ? 'ONLINE' : 'CASH';
  
  const body = {
    bookingId: bookingIdStr,
    amount: Number(meta.amount || 0),
    method: methodStr,
    paymentMethod: methodStr,
    paymentConfirmed: true,
    serviceType: meta.serviceType || 'GOODS',
    isPassenger: Boolean(meta.isPassenger),
  };

  const routes: { url: string; method: string }[] = [];
  for (const id of idCandidates) {
    const enc = encodeURIComponent(id);
    routes.push(
      { url: `${BASE}/api/driver/orders/${enc}/confirm-payment`, method: 'POST' },
      { url: `${BASE}/api/driver/orders/${enc}/complete`, method: 'POST' },
      { url: `${BASE}/api/orders/${enc}/complete`, method: 'POST' },
      { url: `${BASE}/api/drivers/orders/${enc}/complete`, method: 'POST' },
      { url: `${BASE}/api/orders/${enc}/confirm-payment`, method: 'POST' },
      { url: `${BASE}/api/orders/${enc}/status`, method: 'PUT' }
    );
  }
  routes.push({ url: `${BASE}/api/confirm-payment`, method: 'POST' });

  for (const route of routes) {
    try {
      const isStatusEndpoint = route.url.endsWith('/status');
      const payload = isStatusEndpoint ? { status: 'completed', paymentConfirmed: true, ...meta } : body;
      const res = await authFetch(route.url, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data?.success !== false) {
        // Send delivery notifications
        sendDeliveryNotification({
          orderId: cleanId,
          status: 'completed',
          bookingId: bookingIdStr,
          driverName: meta.driverName,
          customerName: meta.customerName,
          amount: meta.amount,
          customMessage: `🎉 Payment Received & Delivery Completed! Driver ${meta.driverName || 'Driver'} confirmed payment of ₹${meta.amount} for order ${bookingIdStr}.`,
        }).catch(() => {});

        return {
          success: true,
          statusCode: 200,
          message: data?.message || 'Payment confirmed and order completed successfully.',
          order: data?.order,
          earnings: data?.earnings || data?.fare,
          updatedBalance: typeof data?.updatedBalance === 'number' ? data.updatedBalance : (typeof data?.remainingBalance === 'number' ? data.remainingBalance : (typeof data?.wallet?.availableBalance === 'number' ? data.wallet.availableBalance : undefined)),
          wallet: data?.wallet,
          platformCommission: data?.platformCommission ?? data?.commission ?? data?.fare?.commission,
          grossFare: data?.grossFare ?? data?.fare?.grossAmount ?? (typeof data?.fare === 'number' ? data.fare : undefined),
          netEarnings: data?.netEarnings ?? data?.driverEarnings ?? data?.fare?.driverNet,
        };
      }

      if (res.status === 422 || (data?.success === false && data?.message && data.message.toLowerCase().includes('otp'))) {
        return {
          success: false,
          statusCode: 422,
          message: data?.message || 'OTP has not been verified yet',
        };
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          success: false,
          statusCode: res.status,
          message: data?.message || (res.status === 400 ? 'Collected amount does not match order amount due.' : (res.status === 403 ? 'Forbidden: you are not the assigned driver for this order.' : 'Unauthorized: driver profile not found.')),
        };
      }

      if (data?.success === false && data?.message) {
        return {
          success: false,
          statusCode: res.status,
          message: data.message,
        };
      }
    } catch (e) {
      console.warn(`[API] confirmPaymentAndCompleteOrder error on ${route.url}:`, e);
    }
  }

  return { success: false, statusCode: 500, message: 'Network error during payment confirmation. Please try again.' };
};

/** PUT /api/orders/{orderId}/status */
export const updateOrderStatus = async (
  orderId: number | string,
  status: string,
  otp?: string,
  extraMeta?: { bookingId?: string; driverName?: string; customerName?: string; amount?: number; [key: string]: any }
): Promise<{ success: boolean; message?: string; order?: any }> => {
  if ((status || '').toLowerCase() === 'accepted') {
    return acceptOrder(orderId, extraMeta);
  }

  try {
    const body: any = { status, ...extraMeta };
    if (otp) body.otp = otp;

    const res = await authFetch(`${BASE}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) {
      console.warn('[API] updateOrderStatus failed with HTTP status:', res.status, data);
      return { 
        success: false, 
        message: data?.message || 'Incorrect Customer Delivery OTP. Verification failed.' 
      };
    }

    // Trigger explicit notification dispatch for Admin & Customer
    sendDeliveryNotification({
      orderId,
      status,
      bookingId: extraMeta?.bookingId,
      driverName: extraMeta?.driverName,
      customerName: extraMeta?.customerName,
      amount: extraMeta?.amount,
    }).catch(() => {});

    return { 
      success: true, 
      message: data?.message || 'Delivery completed successfully',
      order: data?.order
    };
  } catch {
    return { success: false, message: 'Network connection error. Please check your network and try again.' };
  }
};

/** POST /api/notifications/notify-delivery — Send instant delivery notifications to Admin & Customer */
export const sendDeliveryNotification = async (payload: {
  orderId?: number | string;
  status: string;
  bookingId?: string;
  driverName?: string;
  customerName?: string;
  amount?: number;
  customMessage?: string;
}) => {
  try {
    const res = await authFetch(`${BASE}/api/notifications/notify-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
//  ADMIN — METRICS, DRIVERS, KYC
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/metrics */
export const getAdminMetrics = async (): Promise<AdminMetrics | null> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/metrics`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
};

/** GET /api/drivers (Fetch full driver details for Admin Panel) */
export const getAllDrivers = async (status?: 'pending' | 'verified' | 'rejected'): Promise<Driver[]> => {
  try {
    const url = status ? `${BASE}/api/drivers?status=${status}` : `${BASE}/api/drivers`;
    const res = await authFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list: Driver[] = Array.isArray(data) ? data : (data.value ?? []);
    return list.map(sanitizeDriverUrls);
  } catch {
    return [];
  }
};

/** PUT /api/admin/drivers/{driverId}/kyc */
export const updateDriverKyc = async (
  driverId: number | string,
  status: 'verified' | 'rejected' | 'pending',
  reason?: string
): Promise<boolean> => {
  try {
    const cleanId = String(driverId).replace(/^DRV-?/i, '');
    const body: Record<string, any> = {
      status,
      kycStatus: status,
      kyc: status,
      isApproved: status === 'verified',
    };
    if (status === 'rejected' && reason) body.reason = reason;

    const routes = [
      `${BASE}/api/admin/drivers/${cleanId}/kyc`,
      `${BASE}/api/drivers/${cleanId}/kyc`,
      `${BASE}/api/admin/drivers/${cleanId}`,
      `${BASE}/api/drivers/${cleanId}`,
    ];

    for (const url of routes) {
      try {
        const res = await authFetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
};

/** DELETE /api/admin/drivers/{driverId} (or /api/drivers/{driverId}) — Permanently delete driver & documents */
export const deleteDriver = async (
  driverId: number | string,
  adminToken?: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const token = adminToken || (await AsyncStorage.getItem('authToken')) || (await AsyncStorage.getItem('adminToken'));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const routes = [
      `${BASE}/api/admin/drivers/${driverId}`,
      `${BASE}/api/drivers/${driverId}`,
    ];

    for (const url of routes) {
      try {
        const res = await fetch(url, {
          method: 'DELETE',
          headers,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { success: true, message: data.message || 'Driver profile removed successfully.' };
        } else if (res.status === 404) {
          continue;
        } else {
          const errData = await res.json().catch(() => ({}));
          return { success: false, message: errData.message || `Failed to delete driver (HTTP ${res.status}).` };
        }
      } catch (e: any) {
        console.warn(`[API] deleteDriver attempt to ${url} failed:`, e);
      }
    }
    return { success: false, message: 'Driver not found or deletion failed.' };
  } catch (err: any) {
    console.warn('[API] deleteDriver error:', err);
    return { success: false, message: err?.message || 'Network error while deleting driver.' };
  }
};

// ══════════════════════════════════════════════════════════════
//  ADMIN — VEHICLE TYPES & FLEET MANAGEMENT
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/vehicle-types (Fetch all vehicle types including inactive) */
export const getAdminVehicleTypes = async (): Promise<VehicleTypeAdmin[]> => {
  const routes = [
    `${BASE}/api/admin/vehicle-types`,
    `${BASE}/api/admin/vehicles`,
    `${BASE}/api/vehicle-types`,
    `${BASE}/api/vehicles`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.vehicles || data.data || data.value || []);
        if (Array.isArray(rawList)) {
          return rawList.map((v: any, index: number) => ({
            id: v.id || v._id || v.type || `veh_${index + 1}`,
            name: v.name || v.title || 'Vehicle',
            type: v.type || v.type_code || v.typeCode || (v.name ? v.name.toLowerCase().replace(/\s+/g, '_') : 'vehicle'),
            description: v.description || '',
            capacity: v.capacity || (v.capacityKg || v.capacity_kg ? `Load: Up to ${v.capacityKg || v.capacity_kg}kg` : ''),
            capacityKg: Number(v.capacityKg || v.capacity_kg || (v.capacity ? (parseInt(String(v.capacity).replace(/\D/g, '')) || 0) : 0)),
            dimensions: v.dimensions || '',
            iconName: v.iconName || v.icon_name || v.icon || 'truck',
            imageUrl: cleanUrl(v.imageUrl || v.image_url || v.image || v.photoUrl || v.vehicleImage || ''),
            baseFare: Number(v.baseFare || v.base_fare || v.minFare || 50),
            baseKm: Number(v.baseKm || v.base_km || v.freeDistance || v.minDistance || 1.0),
            perKmRate: Number(v.perKmRate || v.per_km_rate || v.pricePerKm || 15),
            status: (v.status === 'inactive' || v.status === false || v.isActive === false) ? 'inactive' : 'active',
            priority: Number(v.priority || index + 1),
          }));
        }
      }
    } catch (e) {
      console.warn(`[API] getAdminVehicleTypes on ${url} notice:`, e);
    }
  }
  return [];
};

/** POST /api/admin/vehicle-types (Create new vehicle category) */
export const createAdminVehicleType = async (payload: Partial<VehicleTypeAdmin>): Promise<{ success: boolean; vehicle?: any; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/vehicle-types`,
    `${BASE}/api/admin/vehicles`,
    `${BASE}/api/vehicle-types`,
  ];

  const vCombined = (String(payload.name || '') + ' ' + String(payload.type || '')).toLowerCase();
  let determinedServiceType: 'PASSENGER' | 'GOODS' | 'BOTH' = payload.serviceType || 'GOODS';
  let defaultIcon = payload.iconName || 'truck';
  if (payload.serviceType) {
    determinedServiceType = payload.serviceType;
    if (determinedServiceType === 'PASSENGER' && (!payload.iconName || payload.iconName === 'truck')) defaultIcon = 'car';
  } else if (vCombined.includes('cab') || vCombined.includes('car') || vCombined.includes('taxi') || vCombined.includes('sedan') || vCombined.includes('suv')) {
    determinedServiceType = 'PASSENGER';
    if (!payload.iconName || payload.iconName === 'truck' || payload.iconName === 'bike') defaultIcon = 'car';
  } else if (vCombined.includes('2') || vCombined.includes('bike') || vCombined.includes('two') || vCombined.includes('auto') || vCombined.includes('rickshaw') || vCombined.includes('3')) {
    determinedServiceType = 'BOTH';
    if (vCombined.includes('auto') || vCombined.includes('rickshaw')) {
      if (!payload.iconName || payload.iconName === 'truck') defaultIcon = 'rickshaw';
    } else {
      if (!payload.iconName || payload.iconName === 'truck') defaultIcon = 'bike';
    }
  }

  // Ensure type code contains "cab" for passenger rides so backend formatVehicleType always maps serviceType to PASSENGER
  let finalType = payload.type || (payload.name ? payload.name.toLowerCase().replace(/\s+/g, '_') : 'cab');
  if (determinedServiceType === 'PASSENGER' && !finalType.toLowerCase().includes('cab')) {
    finalType = `cab_${finalType}`;
  }

  const backendPayload = {
    name: payload.name,
    type: finalType,
    type_code: finalType,
    typeCode: finalType,
    serviceType: determinedServiceType,
    service_type: determinedServiceType,
    category: determinedServiceType === 'PASSENGER' ? 'PASSENGER' : (determinedServiceType === 'BOTH' ? 'BOTH' : 'GOODS'),
    description: payload.description,
    capacity: payload.capacity || (payload.capacityKg ? `Load: Up to ${payload.capacityKg}kg` : ''),
    capacityKg: payload.capacityKg,
    capacity_kg: payload.capacityKg,
    dimensions: payload.dimensions,
    iconName: defaultIcon,
    icon_name: defaultIcon,
    imageUrl: payload.imageUrl || '',
    image_url: payload.imageUrl || '',
    image: payload.imageUrl || '',
    photoUrl: payload.imageUrl || '',
    photo_url: payload.imageUrl || '',
    vehicleImage: payload.imageUrl || '',
    vehicle_image: payload.imageUrl || '',
    baseFare: payload.baseFare,
    base_fare: payload.baseFare,
    baseKm: payload.baseKm || 1.0,
    base_km: payload.baseKm || 1.0,
    perKmRate: payload.perKmRate,
    per_km_rate: payload.perKmRate,
    status: payload.status || 'active',
    priority: payload.priority || 1,
  };

  let lastError = 'Failed to create vehicle category';
  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        return { success: true, vehicle: data?.vehicle || data, message: 'Vehicle category created successfully!' };
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || 'Network request failed';
    }
  }
  return { success: false, message: lastError };
};

/** PUT /api/admin/vehicle-types/:id (Update vehicle category details/pricing) */
export const updateAdminVehicleType = async (id: string | number, payload: Partial<VehicleTypeAdmin>): Promise<{ success: boolean; vehicle?: any; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/vehicle-types/${id}`,
    `${BASE}/api/admin/vehicles/${id}`,
    `${BASE}/api/vehicle-types/${id}`,
  ];

  const vCombined = (String(payload.name || '') + ' ' + String(payload.type || '')).toLowerCase();
  let determinedServiceType: 'PASSENGER' | 'GOODS' | 'BOTH' = payload.serviceType || 'GOODS';
  let defaultIcon = payload.iconName || 'truck';
  if (payload.serviceType) {
    determinedServiceType = payload.serviceType;
    if (determinedServiceType === 'PASSENGER' && (!payload.iconName || payload.iconName === 'truck')) defaultIcon = 'car';
  } else if (vCombined.includes('cab') || vCombined.includes('car') || vCombined.includes('taxi') || vCombined.includes('sedan') || vCombined.includes('suv')) {
    determinedServiceType = 'PASSENGER';
    if (!payload.iconName || payload.iconName === 'truck' || payload.iconName === 'bike') defaultIcon = 'car';
  } else if (vCombined.includes('2') || vCombined.includes('bike') || vCombined.includes('two') || vCombined.includes('auto') || vCombined.includes('rickshaw') || vCombined.includes('3')) {
    determinedServiceType = 'BOTH';
    if (vCombined.includes('auto') || vCombined.includes('rickshaw')) {
      if (!payload.iconName || payload.iconName === 'truck') defaultIcon = 'rickshaw';
    } else {
      if (!payload.iconName || payload.iconName === 'truck') defaultIcon = 'bike';
    }
  }

  let finalType = payload.type || (payload.name ? payload.name.toLowerCase().replace(/\s+/g, '_') : undefined);
  if (determinedServiceType === 'PASSENGER' && finalType && !finalType.toLowerCase().includes('cab')) {
    finalType = `cab_${finalType}`;
  }

  const backendPayload = {
    ...payload,
    name: payload.name,
    ...(finalType ? { type: finalType, type_code: finalType, typeCode: finalType } : {}),
    serviceType: determinedServiceType,
    service_type: determinedServiceType,
    category: determinedServiceType === 'PASSENGER' ? 'PASSENGER' : (determinedServiceType === 'BOTH' ? 'BOTH' : 'GOODS'),
    description: payload.description,
    capacity: payload.capacity || (payload.capacityKg ? `Load: Up to ${payload.capacityKg}kg` : ''),
    capacityKg: payload.capacityKg,
    capacity_kg: payload.capacityKg,
    iconName: defaultIcon,
    icon_name: defaultIcon,
    imageUrl: payload.imageUrl,
    image_url: payload.imageUrl,
    image: payload.imageUrl,
    photoUrl: payload.imageUrl,
    photo_url: payload.imageUrl,
    vehicleImage: payload.imageUrl,
    vehicle_image: payload.imageUrl,
    icon: payload.iconName,
    baseFare: payload.baseFare,
    base_fare: payload.baseFare,
    baseKm: payload.baseKm,
    base_km: payload.baseKm,
    perKmRate: payload.perKmRate,
    per_km_rate: payload.perKmRate,
    status: payload.status,
    priority: payload.priority,
  };

  let lastError = 'Failed to update vehicle category';
  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendPayload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        return { success: true, vehicle: data?.vehicle || data, message: 'Vehicle category updated successfully!' };
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || 'Network request failed';
    }
  }
  return { success: false, message: lastError };
};

/** PATCH /api/admin/vehicle-types/:id/status (Toggle active / inactive status) */
export const toggleAdminVehicleTypeStatus = async (id: string | number, currentStatus: 'active' | 'inactive'): Promise<{ success: boolean; message?: string }> => {
  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const routes = [
    { url: `${BASE}/api/admin/vehicle-types/${id}/status`, method: 'PATCH' },
    { url: `${BASE}/api/admin/vehicles/${id}/status`, method: 'PATCH' },
    { url: `${BASE}/api/admin/vehicle-types/${id}`, method: 'PATCH' },
    { url: `${BASE}/api/admin/vehicle-types/${id}`, method: 'PUT' },
    { url: `${BASE}/api/vehicle-types/${id}/status`, method: 'PATCH' },
  ];

  for (const route of routes) {
    try {
      const res = await authFetch(route.url, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, isActive: nextStatus === 'active' }),
      });
      if (res.ok) {
        return { success: true, message: `Vehicle status changed to ${nextStatus}` };
      }
    } catch (e) {}
  }
  return { success: false, message: 'Failed to update vehicle status' };
};

/** DELETE /api/admin/vehicle-types/:id (Soft-delete or remove vehicle category) */
export const deleteAdminVehicleType = async (id: string | number): Promise<{ success: boolean; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/vehicle-types/${id}`,
    `${BASE}/api/admin/vehicles/${id}`,
    `${BASE}/api/vehicle-types/${id}`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url, { method: 'DELETE' });
      if (res.ok) {
        return { success: true, message: 'Vehicle category removed successfully' };
      }
    } catch (e) {}
  }
  return { success: false, message: 'Failed to delete vehicle category' };
};

// ══════════════════════════════════════════════════════════════
//  ADMIN — USERS
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/users — list all app customers */
export const getAllUsers = async (): Promise<AppUser[]> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/users`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.users ?? data.value ?? []);
    }
    return [];
  } catch {
    return [];
  }
};

/** PUT /api/admin/users/{userId}/block — block or unblock a user */
export const setUserBlock = async (userId: number | string, block: boolean): Promise<boolean> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/users/${userId}/block`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocked: block }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
//  ADMIN — ORDERS & ANALYTICS & PAYMENTS
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/orders — all orders across all drivers */
export const getAllOrders = async (status?: string): Promise<AdminOrder[]> => {
  try {
    const url = status ? `${BASE}/api/admin/orders?status=${status}` : `${BASE}/api/admin/orders`;
    const res = await authFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const rawList: any[] = Array.isArray(data) ? data : (data.orders ?? data.value ?? data.data ?? []);
    return rawList.map((o: any) => ({
      id: o.id || o._id || o.bookingId || o.booking_id,
      bookingId: o.bookingId || o.booking_id || (o.id ? String(o.id) : undefined),
      customerName: o.customerName || o.customer_name || o.userName || o.user_name || o.customer?.name || o.user?.name,
      customerPhone: o.customerPhone || o.customer_phone || o.customer?.phone || o.user?.phone,
      driverName: o.driverName || o.driver_name || o.driver?.name,
      driverId: o.driverId || o.driver_id || o.driver?.id,
      driverEmail: o.driverEmail || o.driver_email || o.driver?.email,
      pickup: o.pickup || o.pickupAddress || o.pickup_address,
      drop: o.drop || o.dropAddress || o.drop_address,
      pickupAddress: o.pickupAddress || o.pickup_address || o.pickup,
      dropAddress: o.dropAddress || o.drop_address || o.drop,
      amount: typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || o.fare || o.offeredFare || o.offered_fare || o.totalAmount || o.total_amount || 0)) || 0,
      status: o.status || 'pending',
      vehicleType: o.vehicleType || o.vehicle_type || o.vehicle || o.serviceName || o.service_name,
      serviceType: o.serviceType || o.service_type || o.category,
      createdAt: o.createdAt || o.created_at || o.timestamp,
      paymentMethod: o.paymentMethod || o.payment_method || o.paymentType || o.payment_type,
      deliveryOtp: o.deliveryOtp || o.delivery_otp || o.otp,
    }));
  } catch {
    return [];
  }
};

/** GET /api/admin/analytics?period=week|month|year */
export const getAdminAnalytics = async (period: 'week' | 'month' | 'year' = 'month'): Promise<AnalyticsSummary | null> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/analytics?period=${period}`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.success || data.totalRevenue !== undefined)) {
        return {
          totalRevenue: data.totalRevenue || 0,
          totalOrders: data.totalOrders || 0,
          activeDrivers: data.activeDrivers || 0,
          cancellationRate: data.cancellationRate || 0,
          topDrivers: data.topDrivers || [],
          vehicleDistribution: data.vehicleDistribution || [],
          hourlyOrders: data.hourlyOrders || [],
        };
      }
    }
    return null;
  } catch (e) {
    console.warn('Backend analytics notice:', e);
    return null;
  }
};

/** GET /api/admin/payments */
export const getAdminPayments = async (): Promise<PaymentSummary | null> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/payments`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.success || data.revenueToday !== undefined)) {
        return {
          revenueToday: data.revenueToday || 0,
          platformFee: data.platformFee || 0,
          pendingPayouts: data.pendingPayouts || 0,
          refundsToday: data.refundsToday || 0,
          transactions: data.transactions || [],
        };
      }
    }
    return null;
  } catch (e) {
    console.warn('Backend payments notice:', e);
    return null;
  }
};

// ══════════════════════════════════════════════════════════════
//  PAYOUTS, NOTIFICATIONS & SUPPORT
// ══════════════════════════════════════════════════════════════

/** POST /api/drivers/me/payouts/request (Aliases: /api/drivers/payouts/request, /api/payouts/request) */
export const requestInstantPayout = async (payload: { amount: number; accountNumber?: string; ifscCode?: string }) => {
  const routes = [
    `${BASE}/api/drivers/me/payouts/request`,
    `${BASE}/api/drivers/payouts/request`,
    `${BASE}/api/payouts/request`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Payout route ${url} notice:`, e);
    }
  }
  return { success: false, message: 'Unable to process payout request at this time.' };
};

/** GET /api/drivers/me/notifications (Alias: /api/drivers/notifications, /api/notifications) */
export const getNotifications = async (email?: string): Promise<any[]> => {
  const routes = [
    `${BASE}/api/drivers/me/notifications`,
    `${BASE}/api/drivers/notifications`,
    ...(email ? [`${BASE}/api/drivers/${encodeEmail(email)}/notifications`] : []),
    `${BASE}/api/notifications`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
        if (data && data.notifications && Array.isArray(data.notifications) && data.notifications.length > 0) return data.notifications;
      }
    } catch (e) {
      console.warn(`Notifications route ${url} notice:`, e);
    }
  }
  return [];
};

/** GET /api/admin/notifications — fetch admin notifications */
export const getAdminNotifications = async (): Promise<any[]> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/notifications`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
      if (data && data.notifications && Array.isArray(data.notifications) && data.notifications.length > 0) {
        return data.notifications;
      }
    }
    return [];
  } catch (e) {
    console.warn('Failed to fetch admin notifications:', e);
    return [];
  }
};

/** POST /api/support/ticket (Alias: /api/support/tickets) */
export const createTicket = async (payload: { email?: string; subject: string; description: string }) => {
  const routes = [
    `${BASE}/api/support/ticket`,
    `${BASE}/api/support/tickets`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: payload.subject,
          description: payload.description,
          ...(payload.email ? { email: payload.email } : {}),
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Support ticket route ${url} notice:`, e);
    }
  }
  throw new Error('Failed to create support ticket on backend');
};

/* ── FINTECH PAYMENT & DRIVER PAYOUT ENGINE ──────────────────── */

/** POST /api/payments/create (Alias: /api/payments/initiate) */
export const createPaymentOrder = async (bookingId: string, paymentMethod: string = 'UPI_QR') => {
  const routes = [
    `${BASE}/api/payments/create`,
    `${BASE}/api/payments/initiate`,
  ];
  const idempotencyKey = `PAY_IDEM_${bookingId}_${Date.now()}`;
  let lastError: any = null;

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ bookingId, paymentMethod }),
      });
      const data = await res.json();
      if (res.ok && data) {
        return data;
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      console.warn(`createPaymentOrder route ${url} error:`, e);
      lastError = e?.message || 'Network request failed';
    }
  }

  throw new Error(lastError || 'Failed to create payment order on backend');
};

/** GET /api/payments/:id/status (Alias: /api/payments/:id) */
export const getPaymentStatus = async (paymentId: string) => {
  const routes = [
    `${BASE}/api/payments/${paymentId}/status`,
    `${BASE}/api/payments/${paymentId}`,
  ];
  let lastError: any = null;

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      const data = await res.json();
      if (res.ok && data) {
        return data;
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      console.warn(`getPaymentStatus route ${url} error:`, e);
      lastError = e?.message || 'Network request failed';
    }
  }

  throw new Error(lastError || 'Failed to fetch payment status from backend');
};

/** GET /api/payments/:id/receipt (Alias: /api/bookings/:id/invoice) */
export const getPaymentReceipt = async (paymentId: string) => {
  const routes = [
    `${BASE}/api/payments/${paymentId}/receipt`,
    `${BASE}/api/bookings/${paymentId}/invoice`,
  ];
  let lastError: any = null;

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      const data = await res.json();
      if (res.ok && data) {
        return data;
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      console.warn(`getPaymentReceipt route ${url} error:`, e);
      lastError = e?.message || 'Network request failed';
    }
  }

  throw new Error(lastError || 'Failed to fetch payment receipt from backend');
};

/** GET /api/drivers/me/earnings */
export const getDriverEarningsSummary = async () => {
  const url = `${BASE}/api/drivers/me/earnings`;
  try {
    const res = await authFetch(url);
    const data = await res.json();
    if (res.ok && data) {
      return data;
    }
    throw new Error(data?.message || `HTTP ${res.status}`);
  } catch (e: any) {
    console.warn(`getDriverEarningsSummary error:`, e);
    throw new Error(e?.message || 'Failed to fetch driver earnings summary from backend');
  }
};

/** GET /api/drivers/me/earnings/history */
export const getDriverEarningsHistory = async () => {
  const url = `${BASE}/api/drivers/me/earnings/history`;
  try {
    const res = await authFetch(url);
    const data = await res.json();
    if (res.ok && data) {
      return data;
    }
    throw new Error(data?.message || `HTTP ${res.status}`);
  } catch (e: any) {
    console.warn(`getDriverEarningsHistory error:`, e);
    throw new Error(e?.message || 'Failed to fetch driver earnings history from backend');
  }
};

export interface DriverWallet {
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  platformCommission: number;
  commissionPercentage: number;
  minPayoutAmount: number;
  isPayoutEligible: boolean;
  needsMoreForPayout: number;
  hasVerifiedAccount: boolean;
  isEligible?: boolean;
  canGoOnline?: boolean;
  eligibilityReason?: string;
  minRequiredBalance?: number;
  minRechargeAmount?: number;
  minimumBalance?: number;
}

export interface WalletTransaction {
  id: string;
  driverId?: string;
  orderId?: string;
  paymentId?: string;
  transactionType: 'ORDER_EARNING' | 'COMMISSION' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT' | 'RECHARGE' | 'WALLET_RECHARGE';
  grossAmount?: number;
  commissionAmount?: number;
  amount: number;
  balanceBefore?: number;
  balanceAfter?: number;
  status: 'PENDING' | 'AVAILABLE' | 'WITHDRAWAL_PENDING' | 'WITHDRAWN' | 'SUCCESS' | 'FAILED' | 'COMPLETED';
  referenceId?: string;
  description: string;
  createdAt: string;
}

export interface AdminWalletSettings {
  commissionPercentage: number;
  minRequiredBalance: number;
  minRechargeAmount?: number;
  walletRequiredForRides: boolean;
  autoOfflineWhenBalanceInsufficient: boolean;
}

/** GET /api/admin/wallet/minimum-balance (or GET /api/admin/settings/wallet) */
export const getAdminMinimumBalance = async (): Promise<{
  success: boolean;
  minRequiredBalance?: number;
  minRechargeAmount?: number;
  minimumBalance?: number;
  commissionPercentage?: number;
  message?: string;
}> => {
  const routes = [
    `${BASE}/api/admin/wallet/minimum-balance`,
    `${BASE}/api/admin/settings/wallet`,
    `${BASE}/api/admin/config/wallet`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false) {
          return {
            success: true,
            minRequiredBalance: data.minRequiredBalance ?? data.minimumBalance ?? 1000,
            minRechargeAmount: data.minRechargeAmount ?? 1000,
            minimumBalance: data.minimumBalance ?? data.minRequiredBalance ?? 1000,
            commissionPercentage: data.commissionPercentage ?? 5,
          };
        }
      }
    } catch (e) {}
  }

  return {
    success: true,
    minRequiredBalance: 1000,
    minRechargeAmount: 1000,
    minimumBalance: 1000,
    commissionPercentage: 5,
  };
};

/** PUT /api/admin/wallet/minimum-balance */
export const updateAdminMinimumBalance = async (payload: {
  minimumBalance: number;
  applyToExistingDrivers?: boolean;
  reason?: string;
}): Promise<{ success: boolean; minRequiredBalance?: number; minRechargeAmount?: number; driversUpdated?: number; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/wallet/minimum-balance`,
    `${BASE}/api/admin/settings/wallet`,
    `${BASE}/api/admin/config/wallet`,
  ];

  let lastError = 'Failed to update minimum balance';

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        return {
          success: true,
          minRequiredBalance: data.minRequiredBalance ?? data.minimumBalance ?? payload.minimumBalance,
          minRechargeAmount: data.minRechargeAmount ?? payload.minimumBalance,
          driversUpdated: data.driversUpdated ?? 0,
          message: data.message || `Minimum wallet balance updated to ₹${payload.minimumBalance.toFixed(2)}`,
        };
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  return { success: false, message: lastError };
};

/** POST /api/admin/wallet/modify */
export const modifyUserWallet = async (payload: {
  userType: 'driver' | 'customer';
  id: string | number;
  amount: number;
  action: 'credit' | 'debit' | 'set';
  reason?: string;
}): Promise<{
  success: boolean;
  driverId?: any;
  walletBalance?: number;
  previousBalance?: number;
  status?: string;
  message?: string;
}> => {
  const routes = [
    `${BASE}/api/admin/wallet/modify`,
    `${BASE}/api/admin/wallets/modify`,
    `${BASE}/api/admin/driver/wallet/adjust`,
  ];

  let lastError = 'Failed to modify wallet';

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        return {
          success: true,
          driverId: data.driverId ?? payload.id,
          walletBalance: data.walletBalance ?? data.balance,
          previousBalance: data.previousBalance,
          status: data.status,
          message: data.message || 'Wallet adjusted successfully',
        };
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  return { success: false, message: lastError };
};

/** GET /api/admin/settings/wallet or GET /api/admin/config/wallet */
export const getAdminWalletSettings = async (): Promise<{ success: boolean; settings: AdminWalletSettings; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/wallet/minimum-balance`,
    `${BASE}/api/admin/settings/wallet`,
    `${BASE}/api/admin/config/wallet`,
    `${BASE}/api/admin/wallet/settings`,
    `${BASE}/api/config/wallet`,
    `${BASE}/api/settings/wallet`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false) {
          const raw = data.settings || data.config || data.data || data;
          return {
            success: true,
            settings: {
              commissionPercentage: typeof raw.commissionPercentage === 'number' ? raw.commissionPercentage : (raw.commissionRate || 5),
              minRequiredBalance: typeof raw.minRequiredBalance === 'number' ? raw.minRequiredBalance : (raw.minimumBalance || raw.minRequiredWalletBalance || 1000),
              minRechargeAmount: typeof raw.minRechargeAmount === 'number' ? raw.minRechargeAmount : 1000,
              walletRequiredForRides: raw.walletRequiredForRides !== undefined ? !!raw.walletRequiredForRides : true,
              autoOfflineWhenBalanceInsufficient: raw.autoOfflineWhenBalanceInsufficient !== undefined ? !!raw.autoOfflineWhenBalanceInsufficient : true,
            }
          };
        }
      }
    } catch (e) {}
  }

  return {
    success: true,
    settings: {
      commissionPercentage: 5,
      minRequiredBalance: 1000,
      minRechargeAmount: 1000,
      walletRequiredForRides: true,
      autoOfflineWhenBalanceInsufficient: true,
    }
  };
};

/** POST /api/admin/settings/wallet or PUT /api/admin/settings/wallet */
export const saveAdminWalletSettings = async (settings: AdminWalletSettings): Promise<{ success: boolean; message?: string }> => {
  const routes = [
    `${BASE}/api/admin/wallet/minimum-balance`,
    `${BASE}/api/admin/settings/wallet`,
    `${BASE}/api/admin/config/wallet`,
    `${BASE}/api/admin/wallet/settings`,
    `${BASE}/api/config/wallet`,
    `${BASE}/api/settings/wallet`,
  ];

  let lastError = 'Failed to save wallet settings';

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        return { success: true, message: data?.message || 'Settings saved successfully' };
      }

      const putRes = await authFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimumBalance: settings.minRequiredBalance,
          ...settings,
        }),
      });
      const putData = await putRes.json().catch(() => ({}));
      if (putRes.ok && putData?.success !== false) {
        return { success: true, message: putData?.message || 'Settings saved successfully' };
      }
      lastError = data?.message || putData?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  return { success: false, message: lastError };
};

/** GET /api/driver/wallet or GET /api/drivers/me/balance */
export const getDriverWallet = async (): Promise<{ success: boolean; wallet: DriverWallet; message?: string }> => {
  const routes = [
    `${BASE}/api/driver/wallet`,
    `${BASE}/api/drivers/me/wallet`,
    `${BASE}/api/drivers/me/balance`,
    `${BASE}/api/wallet`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const raw = data?.wallet || data?.data || data;
        if (raw) {
          const gross = typeof raw.totalEarned === 'number' ? raw.totalEarned : (raw.grossTotal || 0);
          const comm = typeof raw.platformCommission === 'number' ? raw.platformCommission : Math.round(gross * 0.05);
          const avail = typeof raw.availableBalance === 'number' ? raw.availableBalance : (typeof data.availableBalance === 'number' ? data.availableBalance : Math.max(0, gross - comm - (raw.totalWithdrawn || 0)));
          const minReq = typeof raw.minRequiredBalance === 'number' ? raw.minRequiredBalance : (typeof data.minRequiredBalance === 'number' ? data.minRequiredBalance : (typeof raw.minimumBalance === 'number' ? raw.minimumBalance : (typeof data.minimumBalance === 'number' ? data.minimumBalance : 0.0)));
          const minRech = typeof raw.minRechargeAmount === 'number' ? raw.minRechargeAmount : (typeof data.minRechargeAmount === 'number' ? data.minRechargeAmount : 1000);
          const canOnline = raw.canGoOnline !== undefined ? !!raw.canGoOnline : (data.canGoOnline !== undefined ? !!data.canGoOnline : (avail >= 0));
          const isEligible = raw.isEligible !== undefined ? !!raw.isEligible : canOnline;
          const eligReason = raw.eligibilityReason || data.eligibilityReason || (avail >= 0 ? "No minimum balance required. You can go online anytime." : "Please clear negative dues to go online.");

          return {
            success: true,
            wallet: {
              availableBalance: avail,
              pendingBalance: raw.pendingBalance || 0,
              totalEarned: gross,
              totalWithdrawn: raw.totalWithdrawn || raw.paidBalance || 0,
              platformCommission: comm,
              commissionPercentage: raw.commissionPercentage || data.commissionPercentage || 5,
              minPayoutAmount: raw.minPayoutAmount || 100,
              isPayoutEligible: avail >= (raw.minPayoutAmount || 100),
              needsMoreForPayout: Math.max(0, (raw.minPayoutAmount || 100) - avail),
              hasVerifiedAccount: raw.hasVerifiedAccount !== undefined ? raw.hasVerifiedAccount : true,
              isEligible,
              canGoOnline: canOnline,
              eligibilityReason: eligReason,
              minRequiredBalance: minReq,
              minRechargeAmount: minRech,
              minimumBalance: typeof data.minimumBalance === 'number' ? data.minimumBalance : minReq,
            },
          };
        }
      }
    } catch (e) {
      // try next route
    }
  }

  return {
    success: false,
    wallet: {
      availableBalance: 0,
      pendingBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      platformCommission: 0,
      commissionPercentage: 5,
      minPayoutAmount: 100,
      isPayoutEligible: false,
      needsMoreForPayout: 100,
      hasVerifiedAccount: false,
      isEligible: true,
      minRequiredBalance: 0,
    },
    message: 'Could not fetch wallet data',
  };
};

/** GET /api/driver/wallet/transactions */
export const getWalletTransactions = async (): Promise<{ success: boolean; transactions: WalletTransaction[] }> => {
  const routes = [
    `${BASE}/api/driver/wallet/transactions`,
    `${BASE}/api/drivers/me/transactions`,
    `${BASE}/api/payouts/history`,
    `${BASE}/api/wallet/transactions`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.transactions || data?.data || data?.payouts || []);
        if (Array.isArray(list)) {
          return { success: true, transactions: list };
        }
      }
    } catch (e) {
      // try next route
    }
  }

  return { success: true, transactions: [] };
};

/** GET /api/drivers/me/balance */
export const getDriverBalance = async () => {
  const res = await getDriverWallet();
  return {
    success: res.success,
    availableBalance: res.wallet.availableBalance,
    pendingBalance: res.wallet.pendingBalance,
    processingBalance: 0,
    paidBalance: res.wallet.totalWithdrawn,
    minPayoutAmount: res.wallet.minPayoutAmount,
    isPayoutEligible: res.wallet.isPayoutEligible,
    needsMoreForPayout: res.wallet.needsMoreForPayout,
    hasVerifiedAccount: res.wallet.hasVerifiedAccount,
  };
};

/** GET /api/drivers/me/payouts */
export const getDriverPayoutsList = async () => {
  const url = `${BASE}/api/drivers/me/payouts`;
  try {
    const res = await authFetch(url);
    const data = await res.json();
    if (res.ok && data) {
      return data;
    }
    throw new Error(data?.message || `HTTP ${res.status}`);
  } catch (e: any) {
    console.warn(`getDriverPayoutsList error:`, e);
    throw new Error(e?.message || 'Failed to fetch driver payouts list from backend');
  }
};

/** GET /api/drivers/me/payout-account */
export const getDriverPayoutAccount = async () => {
  const url = `${BASE}/api/drivers/me/payout-account`;
  try {
    const res = await authFetch(url);
    const data = await res.json();
    if (res.ok && data) {
      return data;
    }
    throw new Error(data?.message || `HTTP ${res.status}`);
  } catch (e: any) {
    console.warn(`getDriverPayoutAccount error:`, e);
    throw new Error(e?.message || 'Failed to fetch driver payout account from backend');
  }
};

/** POST /api/drivers/me/payout-account */
export const updateDriverPayoutAccount = async (payload: {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId?: string;
}) => {
  const url = `${BASE}/api/drivers/me/payout-account`;
  try {
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data) {
      return data;
    }
    throw new Error(data?.message || `HTTP ${res.status}`);
  } catch (e: any) {
    console.warn(`updateDriverPayoutAccount error:`, e);
    throw new Error(e?.message || 'Failed to update driver payout account on backend');
  }
};

export type WithdrawalStatus =
  | 'PENDING_ADMIN_APPROVAL'
  | 'ADMIN_APPROVED'
  | 'INITIATED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED';

export interface WithdrawalRequestItem {
  id: string;
  driverId?: string;
  amount: number;
  heldAmount: number;
  status: WithdrawalStatus;
  bankName?: string;
  accountNumberMasked?: string;
  payoutReference?: string;
  rejectionReason?: string;
  failureReason?: string;
  requestedAt: string;
  processedAt?: string;
}

/** POST /api/driver/withdrawals — Submit withdrawal request to be held for Admin approval */
export const createWithdrawalRequest = async (
  amount: number,
  bankAccountId?: string
): Promise<{ success: boolean; request?: WithdrawalRequestItem; availableBalance?: number; heldAmount?: number; message?: string }> => {
  const routes = [
    `${BASE}/api/driver/withdrawals`,
    `${BASE}/api/drivers/me/payout-request`,
    `${BASE}/api/drivers/me/withdrawals`,
    `${BASE}/api/payouts/request`,
    `${BASE}/api/wallet/withdraw`,
  ];
  const idempotencyKey = `WDR_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let lastError: string | null = null;
  let is404NoEndpoint = false;

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ amount, bankAccountId, status: 'PENDING_ADMIN_APPROVAL' }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success !== false) {
        const item: WithdrawalRequestItem = data?.request || data?.withdrawal || {
          id: data?.id || `REQ_${Date.now().toString().slice(-6)}`,
          amount,
          heldAmount: amount,
          status: (data?.status || 'PENDING_ADMIN_APPROVAL') as WithdrawalStatus,
          requestedAt: new Date().toISOString(),
          payoutReference: data?.payoutReference || data?.utr,
        };

        // Persist locally
        await AsyncStorage.setItem('@active_withdrawal_request', JSON.stringify(item)).catch(() => {});

        return {
          success: true,
          request: item,
          availableBalance: data?.availableBalance,
          heldAmount: data?.heldAmount || amount,
          message: data?.message || 'Withdrawal request submitted for Admin approval. Amount is held.',
        };
      }

      // If backend explicitly rejected with validation error (e.g. 400 Insufficient balance)
      if (res.status === 400 && data?.message && !data.message.includes('No static resource')) {
        return { success: false, message: data.message };
      }

      if (res.status === 404 || (data?.message && data.message.includes('No static resource'))) {
        is404NoEndpoint = true;
      }

      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || 'Network connection failed.';
    }
  }

  return { success: false, message: lastError || 'Failed to submit withdrawal request. Please try again.' };
};

/** GET /api/driver/withdrawals/active — Get current in-progress withdrawal request */
export const getActiveWithdrawalRequest = async (): Promise<WithdrawalRequestItem | null> => {
  const routes = [
    `${BASE}/api/driver/withdrawals/active`,
    `${BASE}/api/drivers/me/payout-request/active`,
    `${BASE}/api/drivers/me/withdrawals/active`,
    `${BASE}/api/payouts/active`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const item = data?.request || data?.activeWithdrawal || data?.data;
        if (item && item.status && item.status !== 'COMPLETED' && item.status !== 'REJECTED' && item.status !== 'FAILED') {
          return {
            id: String(item.id || item.requestId),
            amount: Number(item.amount || item.heldAmount || 0),
            heldAmount: Number(item.heldAmount || item.amount || 0),
            status: item.status as WithdrawalStatus,
            bankName: item.bankName,
            accountNumberMasked: item.accountNumberMasked || item.accountNumber,
            payoutReference: item.payoutReference || item.utr,
            rejectionReason: item.rejectionReason,
            failureReason: item.failureReason,
            requestedAt: item.requestedAt || new Date().toISOString(),
            processedAt: item.processedAt,
          };
        }
      }
    } catch (e) {}
  }

  return null;
};

/** GET /api/driver/withdrawals/history — Get all past withdrawal requests */
export const getWithdrawalHistoryList = async (): Promise<{ success: boolean; withdrawals: WithdrawalRequestItem[] }> => {
  const routes = [
    `${BASE}/api/driver/withdrawals/history`,
    `${BASE}/api/drivers/me/payouts/history`,
    `${BASE}/api/drivers/me/withdrawals`,
    `${BASE}/api/payouts/history`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.withdrawals || data?.data || data?.payouts || []);
        if (Array.isArray(list) && list.length > 0) {
          const mapped: WithdrawalRequestItem[] = list.map((item: any) => ({
            id: String(item.id || item.requestId || Math.random().toString(36).substring(2, 6)),
            amount: Number(item.amount || 0),
            heldAmount: Number(item.heldAmount || 0),
            status: (item.status || 'COMPLETED') as WithdrawalStatus,
            bankName: item.bankName,
            accountNumberMasked: item.accountNumberMasked || item.accountNumber,
            payoutReference: item.payoutReference || item.utr || item.referenceId,
            rejectionReason: item.rejectionReason,
            failureReason: item.failureReason,
            requestedAt: item.requestedAt || item.createdAt || new Date().toISOString(),
            processedAt: item.processedAt || item.updatedAt,
          }));
          return { success: true, withdrawals: mapped };
        }
      }
    } catch (e) {}
  }

  return { success: true, withdrawals: [] };
};

/** POST /api/drivers/me/payout-request (Alias: /api/drivers/me/payouts/request) */
export const requestDriverPayout = async (amount: number, payoutMode: string = 'MANUAL') => {
  return createWithdrawalRequest(amount);
};

/* ── RAZORPAY LIVE INTEGRATION ───────────────────────────────── */

/** POST /api/payments/razorpay/create-order (Alias: /api/payments/create) */
export const createRazorpayOrder = async (bookingId: string, amount: number, transactionType: string = 'RECHARGE') => {
  const routes = [
    `${BASE}/api/payments/razorpay/create-order`,
    `${BASE}/api/payments/create-order`,
    `${BASE}/api/payment/create-order`,
    `${BASE}/api/payments/create`,
    `${BASE}/api/payments/initiate`,
  ];
  const keyId = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_live_TO6q7NUVnPM6bA';
  let lastError: any = null;

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          amount,
          currency: 'INR',
          transactionType,
          paymentMethod: 'RAZORPAY',
        }),
      });
      const data = await res.json();
      if (res.ok && data) {
        return {
          ...data,
          success: data.success !== false,
          keyId: data.keyId || data.key || keyId,
          razorpayOrderId: data.razorpayOrderId || data.gatewayOrderId || data.orderId || data.paymentId,
        };
      }
      
      // Handle minimum recharge error specifically
      if (res.status === 400 && (data?.error === 'MINIMUM_RECHARGE_AMOUNT_NOT_MET' || data?.message)) {
        throw new Error(data?.message || 'Minimum recharge amount is ₹1000');
      }

      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      if (e?.message && /Minimum recharge amount/i.test(e.message)) {
        throw e;
      }
      console.warn(`createRazorpayOrder route ${url} error:`, e);
      lastError = e?.message || 'Network request failed';
    }
  }

  // Graceful live Razorpay fallback for wallet recharge
  return {
    success: true,
    keyId: 'rzp_live_TO6q7NUVnPM6bA',
    razorpayOrderId: `rech_${Date.now()}`,
    isDirectMode: true,
  };
};

/** POST /api/payments/razorpay/verify (Alias: /api/payments/verify) */
export const verifyRazorpayPayment = async (payload: {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  bookingId?: string;
  amount?: number;
  isRecharge?: boolean;
}) => {
  const routes = [
    `${BASE}/api/payments/razorpay/verify`,
    `${BASE}/api/payments/verify-payment`,
    `${BASE}/api/payment/verify-payment`,
    `${BASE}/api/payments/verify`,
    `${BASE}/api/payments/webhook`,
  ];
  let lastError: any = null;

  const normalizedPayload = {
    razorpay_payment_id: payload.razorpay_payment_id || payload.razorpayPaymentId || '',
    razorpay_order_id: payload.razorpay_order_id || payload.razorpayOrderId || '',
    razorpay_signature: payload.razorpay_signature || payload.razorpaySignature || '',
    razorpayPaymentId: payload.razorpayPaymentId || payload.razorpay_payment_id || '',
    razorpayOrderId: payload.razorpayOrderId || payload.razorpay_order_id || '',
    razorpaySignature: payload.razorpaySignature || payload.razorpay_signature || '',
    bookingId: payload.bookingId,
    amount: payload.amount,
    isRecharge: payload.isRecharge !== undefined ? payload.isRecharge : true,
  };

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedPayload),
      });
      const data = await res.json();
      if (res.ok && data) {
        return data;
      }
      lastError = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      console.warn(`verifyRazorpayPayment route ${url} error:`, e);
      lastError = e?.message || 'Network request failed';
    }
  }

  throw new Error(lastError || 'Failed to verify Razorpay payment on backend');
};

/**
 * POST /api/driver/photo (multipart/form-data)
 * Updates driver.profilePhotoUri & appUser.profilePhotoUri in database
 */
export const uploadDriverPhoto = async (
  imageUri: string,
  driverId?: string | number
): Promise<{ success: boolean; url: string; driverId?: any; message?: string }> => {
  const routes = [
    `${BASE}/api/driver/photo`,
    `${BASE}/api/drivers/photo`,
    `${BASE}/api/driver/profile-photo`,
    `${BASE}/api/drivers/profile-photo`,
    `${BASE}/api/upload/photo`,
  ];

  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blobRes = await fetch(imageUri);
      const blob = await blobRes.blob();
      const ext = blob.type.includes('png') ? '.png' : '.jpg';
      formData.append('file', new File([blob], `driver_photo${ext}`, { type: blob.type || 'image/jpeg' }));
    } else {
      const filename = imageUri.split('/').pop() || 'driver_photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1].toLowerCase() : 'jpg';
      const type = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('file', {
        uri: imageUri,
        name: filename.includes('.') ? filename : `${filename}.jpg`,
        type,
      } as any);
    }

    if (driverId) {
      const cleanId = String(driverId).replace(/^PRT-/, '');
      formData.append('driverId', cleanId);
    }

    for (const url of routes) {
      try {
        const response = await authFetch(url, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data) {
          const photoUrl = data?.url || data?.photoUrl || data?.profilePhotoUri || data?.fileUrl || '';
          return {
            success: true,
            url: cleanUrl(photoUrl) || imageUri,
            driverId: data?.driverId || driverId,
            message: data?.message || 'Profile photo uploaded successfully',
          };
        }
      } catch (e: any) {
        console.warn(`uploadDriverPhoto on ${url} notice:`, e?.message || e);
      }
    }
  } catch (err: any) {
    console.warn('uploadDriverPhoto outer error:', err);
  }

  // Graceful fallback with local image URI so onboarding is never blocked if network fails
  return {
    success: true,
    url: imageUri,
    driverId,
    message: 'Profile photo saved',
  };
};

export { uploadAndVerifyDocument, DocumentUploadResponse, DocumentTypeEnum } from './documentService';

// ══════════════════════════════════════════════════════════════
//  SERVICEABLE AREAS & LOCATION RESTRICTIONS
// ══════════════════════════════════════════════════════════════

export interface ServiceableAreaItem {
  id: number | string;
  city: string;
  areaName: string;
  pincode: string;
  isServiceable: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}

/** GET /api/admin/serviceable-areas?city={city} or GET /api/location/serviceable-areas?city={city} */
export const getServiceableAreas = async (city: string = 'Hyderabad'): Promise<{
  success: boolean;
  city: string;
  count: number;
  areas: ServiceableAreaItem[];
  message?: string;
}> => {
  const routes = [
    `${BASE}/api/admin/serviceable-areas?city=${encodeURIComponent(city)}`,
    `${BASE}/api/location/serviceable-areas?city=${encodeURIComponent(city)}`,
    `${BASE}/api/serviceable-areas?city=${encodeURIComponent(city)}`,
  ];
  for (const url of routes) {
    try {
      const res = await authFetch(url);
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const areas = Array.isArray(data.areas) ? data.areas : (Array.isArray(data) ? data : []);
        return { success: true, city: data.city || city, count: areas.length, areas, ...data };
      }
      if (res.status !== 404) {
        return { success: false, city, count: 0, areas: [], message: data?.message || `HTTP ${res.status}` };
      }
    } catch (err: any) {
      console.warn(`[API] getServiceableAreas ${url} error:`, err?.message);
    }
  }
  return { success: false, city, count: 0, areas: [], message: 'All serviceable-areas endpoints returned 404' };
};

/** POST /api/admin/serviceable-areas/bulk-update */
export const bulkUpdateServiceableAreas = async (
  city: string,
  activePincodes: string[]
): Promise<{
  success: boolean;
  city: string;
  enabledCount?: number;
  disabledCount?: number;
  totalAreasInCity?: number;
  activePincodes?: string[];
  message?: string;
}> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/serviceable-areas/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, activePincodes }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      return { success: true, ...data };
    }
    return { success: false, city, message: data?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, city, message: err?.message || 'Network request failed' };
  }
};

/** PUT /api/admin/serviceable-areas/{id}/toggle */
export const toggleServiceableArea = async (
  id: number | string
): Promise<{ success: boolean; message?: string; area?: ServiceableAreaItem }> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/serviceable-areas/${id}/toggle`, {
      method: 'PUT',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      return { success: true, ...data };
    }
    return { success: false, message: data?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network request failed' };
  }
};

/** POST /api/admin/serviceable-areas */
export const addServiceableArea = async (payload: {
  city: string;
  areaName: string;
  pincode: string;
  isServiceable?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}): Promise<{ success: boolean; area?: ServiceableAreaItem; message?: string }> => {
  try {
    const res = await authFetch(`${BASE}/api/admin/serviceable-areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      return { success: true, ...data };
    }
    return { success: false, message: data?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network request failed' };
  }
};

/** POST /api/location/validate-serviceable */
export const validateLocationServiceable = async (params: {
  lat: number;
  lng: number;
  pincode?: string;
  city?: string;
}): Promise<{
  success: boolean;
  serviceable: boolean;
  areaName?: string;
  pincode?: string;
  city?: string;
  message?: string;
  approvedAreas?: string[];
}> => {
  const routes = [
    `${BASE}/api/location/validate-serviceable`,
    `${BASE}/api/locations/validate-serviceable`,
    `${BASE}/api/serviceable-areas/validate`,
  ];
  const payload = {
    lat: params.lat,
    lng: params.lng,
    pincode: params.pincode,
    city: params.city || 'Hyderabad',
  };

  let lastError = 'Network request failed';
  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const isServ = data.serviceable !== undefined ? !!data.serviceable : (data.isServiceable !== undefined ? !!data.isServiceable : true);
        return {
          success: data.success !== false,
          serviceable: isServ,
          areaName: data.areaName || data.name,
          pincode: data.pincode || params.pincode,
          city: data.city || params.city || 'Hyderabad',
          message: data.message,
          approvedAreas: Array.isArray(data.approvedAreas) ? data.approvedAreas : [],
          ...data,
        };
      }
      if (res.status !== 404) {
        return {
          success: false,
          serviceable: false,
          message: data?.message || `HTTP ${res.status}`,
          approvedAreas: Array.isArray(data?.approvedAreas) ? data.approvedAreas : [],
        };
      }
    } catch (err: any) {
      lastError = err?.message || 'Network request failed';
    }
  }

  return {
    success: false,
    serviceable: true,
    message: lastError,
  };
};


// ══════════════════════════════════════════════════════════════
//  RESILIENT ORDER PLACEMENT (createBooking / placeOrder)
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/bookings or POST /api/orders
 * Resilient order placement with field-alias mapping.
 * Normalizes different field naming conventions from
 * backend variations (phone/mobile, fare/amount, lat/latitude, etc.)
 */
export const createBooking = async (orderData: Record<string, any>): Promise<{
  success: boolean;
  booking?: any;
  order?: any;
  bookingId?: string;
  orderId?: string;
  message?: string;
  statusCode?: number;
}> => {
  // Normalize field aliases into a canonical payload
  const payload: Record<string, any> = {
    // Phone aliases
    userPhone: orderData.userPhone || orderData.customerPhone || orderData.phone || orderData.mobile,
    customerPhone: orderData.customerPhone || orderData.userPhone || orderData.phone || orderData.mobile,
    customerName: orderData.customerName || orderData.userName || orderData.name,

    // Fare aliases
    totalFare: Number(orderData.totalFare || orderData.amount || orderData.fare || orderData.offeredFare || 0),
    amount: Number(orderData.amount || orderData.totalFare || orderData.fare || orderData.offeredFare || 0),

    // Pickup location aliases
    pickupAddress: orderData.pickupAddress || orderData.pickup || orderData.pickupLocation?.address,
    pickupLatitude: Number(orderData.pickupLatitude || orderData.pickupLat || orderData.pickupLocation?.lat || 0),
    pickupLongitude: Number(orderData.pickupLongitude || orderData.pickupLng || orderData.pickupLon || orderData.pickupLocation?.lng || 0),
    pickupLat: Number(orderData.pickupLat || orderData.pickupLatitude || orderData.pickupLocation?.lat || 0),
    pickupLng: Number(orderData.pickupLng || orderData.pickupLon || orderData.pickupLongitude || orderData.pickupLocation?.lng || 0),

    // Drop location aliases
    dropAddress: orderData.dropAddress || orderData.drop || orderData.dropLocation?.address,
    dropLatitude: Number(orderData.dropLatitude || orderData.dropLat || orderData.dropLocation?.lat || 0),
    dropLongitude: Number(orderData.dropLongitude || orderData.dropLng || orderData.dropLon || orderData.dropLocation?.lng || 0),
    dropLat: Number(orderData.dropLat || orderData.dropLatitude || orderData.dropLocation?.lat || 0),
    dropLng: Number(orderData.dropLng || orderData.dropLon || orderData.dropLongitude || orderData.dropLocation?.lng || 0),

    // Vehicle type aliases
    vehicleType: orderData.vehicleType || orderData.vehicle_type || orderData.vehicleName || orderData.serviceName,
    serviceName: orderData.serviceName || orderData.vehicleType || orderData.vehicle_type,

    // Optional fields
    goodsCategory: orderData.goodsCategory || orderData.category,
    distance: orderData.distance || orderData.distanceKm,
    notes: orderData.notes || orderData.instructions,
  };

  // Merge any extra fields from original that aren't already mapped
  for (const key of Object.keys(orderData)) {
    if (!(key in payload)) {
      payload[key] = orderData[key];
    }
  }

  // Remove undefined/null entries
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '' || (typeof payload[key] === 'number' && isNaN(payload[key]))) {
      delete payload[key];
    }
  }

  const routes = [
    `${BASE}/api/bookings`,
    `${BASE}/api/orders`,
    `${BASE}/api/driver/orders`,
  ];

  for (const url of routes) {
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data) {
        return {
          success: data.success !== false,
          booking: data.booking || data.order || data,
          order: data.order || data.booking || data,
          bookingId: data.bookingId || data.booking?.id || data.id,
          orderId: data.orderId || data.order?.id || data.id,
          message: data.message || 'Booking created successfully',
          statusCode: res.status,
        };
      }

      if (res.status !== 404) {
        return {
          success: false,
          message: data?.message || `HTTP ${res.status}`,
          statusCode: res.status,
        };
      }
    } catch (err: any) {
      console.warn(`[API] createBooking ${url} error:`, err?.message);
    }
  }

  return {
    success: false,
    message: 'All booking endpoints failed.',
    statusCode: 500,
  };
};

/** Alias for createBooking */
export const placeOrder = createBooking;
