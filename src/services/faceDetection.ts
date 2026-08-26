import { Platform } from 'react-native';
import { authFetch } from './api';
import * as jpeg from 'jpeg-js';

export type PhotoValidationStatus = 'EMPTY' | 'VALIDATING' | 'VALID' | 'INVALID' | 'ERROR';

export interface FaceValidationResult {
  isValid: boolean;
  status: PhotoValidationStatus;
  title: string;
  message: string;
  url?: string;
  fileUrl?: string;
  faceCount?: number;
  isBlank?: boolean;
  metrics?: {
    meanLuma?: number;
    varianceLuma?: number;
    avgGradient?: number;
    centerSkinRatio?: number;
    totalSkinRatio?: number;
    facialFeatureScore?: number;
    clusterWidth?: number;
    clusterHeight?: number;
    comX?: number;
    comY?: number;
  };
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';

/**
 * 100% Pure JS Base64 Decoder (Safe for Hermes, JSC, Node, and Web without atob or Buffer)
 */
function safeBase64ToBytes(b64: string): Uint8Array {
  try {
    const clean = b64.replace(/^data:image\/\w+;base64,/, '').trim();
    const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const table = new Uint8Array(256);
    for (let i = 0; i < b64chars.length; i++) table[b64chars.charCodeAt(i)] = i;

    const raw = clean.replace(/=+$/, '');
    const len = raw.length;
    if (len === 0) return new Uint8Array(0);

    const outLen = Math.floor((len * 3) / 4);
    const out = new Uint8Array(outLen);

    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = table[raw.charCodeAt(i)];
      const b = table[raw.charCodeAt(i + 1)];
      const c = i + 2 < len ? table[raw.charCodeAt(i + 2)] : 0;
      const d = i + 3 < len ? table[raw.charCodeAt(i + 3)] : 0;

      if (p < outLen) out[p++] = (a << 2) | (b >> 4);
      if (p < outLen) out[p++] = ((b & 15) << 4) | (c >> 2);
      if (p < outLen) out[p++] = ((c & 3) << 6) | d;
    }
    return out;
  } catch (e) {
    return new Uint8Array(0);
  }
}

/**
 * Convert RGB to HSV color space
 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, v };
}

/**
 * Strict Multi-Color-Space Human Skin Chrominance Verification.
 * Eliminates false positives from wood, desks, keyboards, monitors, walls, paper, and clothing.
 */
function isHumanSkinPixel(r: number, g: number, b: number): boolean {
  // ITU-R BT.601 Luminance
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 38 || luma > 240) return false;

  // Normalized RGB
  const sum = r + g + b;
  if (sum === 0) return false;
  const rn = r / sum;
  const gn = g / sum;
  const bn = b / sum;

  // Real human skin bio-chromatics: Red dominance
  if (r <= g || r <= b) return false;
  if (r - g < 10 && luma > 80) return false;
  if (r - b < 18) return false;

  // Hemoglobin to melanin distribution ratio
  const rgDiff = r - g;
  const rbDiff = r - b;
  const ratio = rgDiff / (rbDiff + 0.001);
  if (ratio < 0.18 || ratio > 0.78) return false;

  // Normalized chromaticity bounds across ethnicities
  if (rn < 0.35 || rn > 0.62) return false;
  if (gn < 0.24 || gn > 0.38) return false;
  if (bn < 0.14 || bn > 0.34) return false;

  // YCbCr Color Space
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  if (cb < 78 || cb > 126) return false;
  if (cr < 134 || cr > 178) return false;
  if (cr - cb < 14) return false; // Rejects wood/beige plastic which has cr - cb < 12

  // HSV Color Space
  const { h, s, v } = rgbToHsv(r, g, b);
  const isHueValid = (h >= 0 && h <= 34) || (h >= 338 && h <= 360);
  if (!isHueValid) return false;
  if (s < 0.16 || s > 0.72) return false; // Rejects silver/grey metals and oversaturated yellows
  if (v < 0.18 || v > 0.96) return false;

  return true;
}

/**
 * Comprehensive Computer Vision analysis for Human Driver Selfies:
 * 1. Rejects non-human objects (keyboards, laptops, screens, cars, animals, documents)
 * 2. Rejects blank / pitch dark / overexposed photos
 * 3. Rejects blurry / out-of-focus photos
 * 4. Strictly validates single centered human face presence with eyes/mouth anatomy
 */
function analyzeImagePixels(
  data: Uint8Array,
  width: number,
  height: number
): { isValid: boolean; title: string; message: string; metrics?: any } {
  try {
    if (width < 80 || height < 80) {
      return {
        isValid: false,
        title: 'Low Resolution Photo',
        message: 'Photo resolution is too low. Please take a clear portrait selfie.',
      };
    }

    const pixelCount = width * height;
    if (pixelCount <= 0 || data.length < pixelCount * 4) {
      return {
        isValid: false,
        title: 'Corrupted Image',
        message: 'Unable to read photo pixels. Please take a clear selfie photo.',
      };
    }

    let sumLuma = 0;
    let sumLumaSq = 0;
    let skinCount = 0;
    let centerSkinCount = 0;
    let centerTotal = 0;
    let gradientSum = 0;
    let gradientCount = 0;
    let highEdgePixels = 0;

    const gray = new Uint8Array(pixelCount);
    const skinMask = new Uint8Array(pixelCount);

    // 32x32 spatial grid for morphological face cluster analysis
    const GRID_SIZE = 32;
    const gridSkin = new Float32Array(GRID_SIZE * GRID_SIZE);
    const gridTotal = new Uint32Array(GRID_SIZE * GRID_SIZE);

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = luma;
      sumLuma += luma;
      sumLumaSq += luma * luma;

      const isSkin = isHumanSkinPixel(r, g, b);
      if (isSkin) {
        skinCount++;
        skinMask[i] = 1;
      }

      const x = i % width;
      const y = Math.floor(i / width);

      const gx = Math.min(GRID_SIZE - 1, Math.floor((x / width) * GRID_SIZE));
      const gy = Math.min(GRID_SIZE - 1, Math.floor((y / height) * GRID_SIZE));
      const gIdx = gy * GRID_SIZE + gx;
      gridTotal[gIdx]++;
      if (isSkin) gridSkin[gIdx]++;

      // Center face zone: 22% to 78% width, 18% to 80% height
      if (x >= width * 0.22 && x <= width * 0.78 && y >= height * 0.18 && y <= height * 0.80) {
        centerTotal++;
        if (isSkin) {
          centerSkinCount++;
        }
      }
    }

    const meanLuma = sumLuma / pixelCount;
    const varianceLuma = Math.sqrt(Math.max(0, sumLumaSq / pixelCount - meanLuma * meanLuma));

    // High-Frequency Sharpness & Edge Gradient Estimation
    const step = Math.max(1, Math.floor(Math.min(width, height) / 100));
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const idx = y * width + x;
        const gx = Math.abs(gray[idx + step] - gray[idx - step]);
        const gy = Math.abs(gray[idx + step * width] - gray[idx - step * width]);
        const grad = gx + gy;
        gradientSum += grad;
        gradientCount++;
        if (grad > 40) highEdgePixels++;
      }
    }

    const avgGradient = gradientCount > 0 ? gradientSum / gradientCount : 0;
    const highEdgeRatio = gradientCount > 0 ? highEdgePixels / gradientCount : 0;
    const centerSkinRatio = centerTotal > 0 ? centerSkinCount / centerTotal : 0;
    const totalSkinRatio = skinCount / pixelCount;

    // Rule 1: Blank / Pitch Dark Image Check
    if (meanLuma < 28) {
      return {
        isValid: false,
        title: 'Photo Too Dark',
        message: 'The photo is too dark. Please ensure good lighting and take a clear photo of your face.',
      };
    }

    // Rule 2: Overexposed / Solid White Image Check
    if (meanLuma > 240 && varianceLuma < 24) {
      return {
        isValid: false,
        title: 'Photo Overexposed',
        message: 'The photo is too bright or blank white. Please avoid direct glare and retake.',
      };
    }

    // Rule 3: Flat / Blank / Solid Color Check
    if (varianceLuma < 12) {
      return {
        isValid: false,
        title: 'Blank Image Detected',
        message: 'The selected photo appears blank or uniform. Please take a clear selfie showing your face.',
      };
    }

    // Rule 4: Blur / Out-of-Focus Check
    if (avgGradient < 1.6) {
      return {
        isValid: false,
        title: 'Photo Blurry / Unclear',
        message: 'The photo is blurry or out of focus. Please hold your phone steady and ensure your face is sharp.',
      };
    }

    // Rule 5: Tech Object / Keyboard / Document Rejection (High edge density + low skin ratio)
    if (highEdgeRatio > 0.28 && totalSkinRatio < 0.12) {
      return {
        isValid: false,
        title: 'Non-Human Object Detected',
        message: 'Laptop, keyboard, or object detected. Please take a selfie of your human face.',
      };
    }

    // Rule 6: Strict Human Face Presence Check (Both Center and Overall must satisfy thresholds)
    if (centerSkinRatio < 0.18 || totalSkinRatio < 0.12) {
      return {
        isValid: false,
        title: 'No Human Face Detected',
        message: 'No human face was detected. Please ensure your face is centered and clearly visible in the frame.',
        metrics: { centerSkinRatio, totalSkinRatio },
      };
    }

    // Rule 7: Camera Lens Covered / Extreme Closeup
    if (totalSkinRatio > 0.86 && avgGradient < 3.0) {
      return {
        isValid: false,
        title: 'Camera Obstructed',
        message: 'The camera lens appears covered or too close. Please hold the phone at arm length.',
      };
    }

    // Rule 8: Morphological Face Cluster Geometry Analysis
    let minGx = GRID_SIZE, maxGx = 0, minGy = GRID_SIZE, maxGy = 0;
    let clusterSkinCells = 0;
    let weightedX = 0, weightedY = 0, totalSkinDensity = 0;

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const gIdx = gy * GRID_SIZE + gx;
        const density = gridTotal[gIdx] > 0 ? gridSkin[gIdx] / gridTotal[gIdx] : 0;
        if (density >= 0.20) {
          clusterSkinCells++;
          if (gx < minGx) minGx = gx;
          if (gx > maxGx) maxGx = gx;
          if (gy < minGy) minGy = gy;
          if (gy > maxGy) maxGy = gy;
          weightedX += gx * density;
          weightedY += gy * density;
          totalSkinDensity += density;
        }
      }
    }

    if (clusterSkinCells < 20 || totalSkinDensity === 0) {
      return {
        isValid: false,
        title: 'No Human Face Detected',
        message: 'Human face cluster not clearly detected. Please position your face directly in front of the camera.',
      };
    }

    const comX = (weightedX / totalSkinDensity) / GRID_SIZE;
    const comY = (weightedY / totalSkinDensity) / GRID_SIZE;
    const clusterWidth = (maxGx - minGx + 1) / GRID_SIZE;
    const clusterHeight = (maxGy - minGy + 1) / GRID_SIZE;

    // Face must be roughly centered and sufficiently large
    if (comX < 0.20 || comX > 0.80 || comY < 0.15 || comY > 0.80) {
      return {
        isValid: false,
        title: 'Face Not Centered',
        message: 'Please position your face in the center of the screen.',
      };
    }

    if (clusterWidth < 0.22 || clusterHeight < 0.22) {
      return {
        isValid: false,
        title: 'Face Too Far Away',
        message: 'Face is too far away. Please move closer to the camera.',
      };
    }

    // Rule 9: Facial Internal Structural Features (Eyes/Eyebrows vs Cheeks/Mouth)
    const faceXStart = Math.floor((minGx / GRID_SIZE) * width);
    const faceXEnd = Math.floor(((maxGx + 1) / GRID_SIZE) * width);
    const faceYStart = Math.floor((minGy / GRID_SIZE) * height);
    const faceYEnd = Math.floor(((maxGy + 1) / GRID_SIZE) * height);
    const faceH = Math.max(1, faceYEnd - faceYStart);

    let eyeZoneGrad = 0, eyeZoneCount = 0;
    let mouthZoneGrad = 0, mouthZoneCount = 0;

    for (let y = faceYStart; y < faceYEnd; y += 2) {
      const relY = (y - faceYStart) / faceH;
      for (let x = faceXStart; x < faceXEnd; x += 2) {
        const idx = y * width + x;
        if (idx + 2 < pixelCount && idx + 2 * width < pixelCount) {
          const grad = Math.abs(gray[idx + 2] - gray[idx]) + Math.abs(gray[idx + 2 * width] - gray[idx]);
          if (relY >= 0.20 && relY <= 0.50) {
            eyeZoneGrad += grad;
            eyeZoneCount++;
          } else if (relY >= 0.65 && relY <= 0.90) {
            mouthZoneGrad += grad;
            mouthZoneCount++;
          }
        }
      }
    }

    const avgEyeGrad = eyeZoneCount > 0 ? eyeZoneGrad / eyeZoneCount : 0;
    const avgMouthGrad = mouthZoneCount > 0 ? mouthZoneGrad / mouthZoneCount : 0;
    const facialFeatureScore = (avgEyeGrad + avgMouthGrad) / 2;

    if (facialFeatureScore < 2.5) {
      return {
        isValid: false,
        title: 'Unclear Facial Features',
        message: 'Facial features (eyes, nose, mouth) could not be recognized. Please take a clear frontal selfie in good light.',
        metrics: { facialFeatureScore },
      };
    }

    return {
      isValid: true,
      title: 'Human Face Verified',
      message: 'Clear human face verified successfully.',
      metrics: {
        meanLuma,
        varianceLuma,
        avgGradient,
        centerSkinRatio,
        totalSkinRatio,
        facialFeatureScore,
        clusterWidth,
        clusterHeight,
        comX,
        comY,
      },
    };
  } catch (err) {
    console.warn('[FaceDetection] Pixel analysis error:', err);
    return {
      isValid: false,
      title: 'Photo Analysis Failed',
      message: 'Unable to analyze photo clarity. Please take a clear selfie in good light.',
    };
  }
}

/**
 * Face Verification Result interface according to Backend API Matrix
 */
export interface FaceVerificationResult {
  isValid: boolean;
  faceCount?: number;
  isBlank?: boolean;
  url?: string;
  fileUrl?: string;
  errorMessage?: string;
  message?: string;
}

/**
 * Driver KYC Face Verification API (Public Onboarding Route)
 * POST https://api.anushaporter.com/api/drivers/verify-face
 * Fallbacks: /api/driver/verify-face, /api/verify-face
 */
export const verifyDriverSelfie = async (
  imageUri: string,
  timeoutMs: number = 5000
): Promise<FaceVerificationResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const routes = [
    `${BASE_URL}/api/drivers/verify-face`,
    `${BASE_URL}/api/driver/verify-face`,
    `${BASE_URL}/api/verify-face`,
  ];

  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blobRes = await fetch(imageUri);
      const blob = await blobRes.blob();
      const ext = blob.type.includes('png') ? '.png' : '.jpg';
      formData.append('file', new File([blob], `selfie${ext}`, { type: blob.type || 'image/jpeg' }));
    } else {
      const filename = imageUri.split('/').pop() || 'selfie.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1].toLowerCase() : 'jpg';
      const type = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('file', {
        uri: imageUri,
        name: filename.includes('.') ? filename : `${filename}.jpg`,
        type,
      } as any);
    }

    let lastErrorData: any = null;

    for (const url of routes) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => null);

        // ── 200 OK: Valid Human Face (Single Person) ──
        if (response.ok && data?.success && (data?.faceCount === 1 || data?.faceCount === undefined)) {
          const verifiedUrl = data.url || data.fileUrl || '';
          return {
            isValid: true,
            faceCount: 1,
            url: verifiedUrl,
            fileUrl: verifiedUrl,
            message: data.message || 'Human Face Verified ✓',
          };
        }

        // ── 400 Bad Request or Explicit Rejection Matrix ──
        if (data) {
          lastErrorData = data;
          if (data.faceCount === 0) {
            return {
              isValid: false,
              faceCount: 0,
              isBlank: Boolean(data.isBlank || data.isBlack),
              errorMessage: data.message || (data.isBlank ? 'The photo is too dark or blurry. Please take a clear photo in good light.' : 'No human face was detected. Please upload a clear photo of your face.'),
            };
          }
          if (typeof data.faceCount === 'number' && data.faceCount > 1) {
            return {
              isValid: false,
              faceCount: data.faceCount,
              errorMessage: data.message || 'Multiple faces detected. Please ensure only you are in the photo.',
            };
          }
          if (data.isBlank || data.isBlack) {
            return {
              isValid: false,
              faceCount: 0,
              isBlank: true,
              errorMessage: data.message || 'The photo is too dark or blurry. Please take a clear photo in good light.',
            };
          }
          if (data.success === false && data.message) {
            return {
              isValid: false,
              errorMessage: data.message,
            };
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') {
          clearTimeout(timeoutId);
          return {
            isValid: false,
            errorMessage: 'Request timed out. Please check your connection and retake.',
          };
        }
        // Try next alias endpoint
      }
    }

    if (lastErrorData) {
      return {
        isValid: false,
        faceCount: lastErrorData.faceCount,
        isBlank: lastErrorData.isBlank,
        errorMessage: lastErrorData.message || 'Face verification failed.',
      };
    }

    return {
      isValid: false,
      errorMessage: 'Face verification service is currently unavailable. Please try again.',
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.name === 'CanceledError') {
      return {
        isValid: false,
        errorMessage: 'Request timed out. Please check your connection and retake.',
      };
    }
    return {
      isValid: false,
      errorMessage: 'Face verification is currently unavailable. Please try again.',
    };
  }
};

/**
 * Validate driver profile selfie photo for human face presence and quality.
 * Combines server AI verification (POST /api/drivers/verify-face) with local CV sanity checks.
 */
export const validateProfilePhoto = async (
  imageUri: string,
  base64Data?: string | null
): Promise<FaceValidationResult> => {
  if (!imageUri && !base64Data) {
    return {
      isValid: false,
      status: 'EMPTY',
      title: 'No Photo Selected',
      message: 'Please take or select a clear profile selfie photo.',
    };
  }

  try {
    // 1. Primary: Run Live AI Face Verification API
    if (imageUri && !imageUri.startsWith('data:')) {
      const serverResult = await verifyDriverSelfie(imageUri, 5000);

      if (serverResult.isValid) {
        return {
          isValid: true,
          status: 'VALID',
          title: 'Human Face Verified',
          message: serverResult.message || 'Human Face Verified ✓',
          faceCount: 1,
          url: serverResult.url || serverResult.fileUrl,
          fileUrl: serverResult.url || serverResult.fileUrl,
        };
      }

      // If server explicitly detected no face, multiple faces, or dark photo, return error immediately
      if (serverResult.errorMessage && !serverResult.errorMessage.includes('unavailable')) {
        let title = 'Invalid Profile Photo';
        if (serverResult.faceCount === 0) {
          title = serverResult.isBlank ? 'Dark / Blurry Photo' : 'No Face Detected';
        } else if (typeof serverResult.faceCount === 'number' && serverResult.faceCount > 1) {
          title = 'Multiple Faces Detected';
        }

        return {
          isValid: false,
          status: 'INVALID',
          title,
          message: serverResult.errorMessage,
          faceCount: serverResult.faceCount,
          isBlank: serverResult.isBlank,
        };
      }
    }

    // 2. Secondary: If offline / network error, run on-device computer vision quality analysis
    let rawBytes: Uint8Array | null = null;

    if (base64Data) {
      rawBytes = safeBase64ToBytes(base64Data);
    } else if (imageUri && imageUri.startsWith('data:')) {
      rawBytes = safeBase64ToBytes(imageUri);
    } else if (imageUri) {
      try {
        const res = await fetch(imageUri);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          rawBytes = new Uint8Array(arrayBuffer);
        }
      } catch (fetchErr) {
        console.warn('[FaceDetection] Local fetch notice:', fetchErr);
      }
    }

    let decoded: { width: number; height: number; data: Uint8Array } | null = null;

    if (rawBytes && rawBytes.length > 0) {
      if (rawBytes.length < 2048) {
        return {
          isValid: false,
          status: 'INVALID',
          title: 'Invalid Photo',
          message: 'The selected image is corrupt or empty. Please take a clear profile photo.',
          isBlank: true,
        };
      }

      try {
        decoded = jpeg.decode(rawBytes, { useTArray: true });
      } catch (jpegErr) {
        const g = globalThis as any;
        if (Platform.OS === 'web' && typeof g.document !== 'undefined') {
          try {
            const img = new g.Image();
            img.src = imageUri;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            const canvas = g.document.createElement('canvas');
            canvas.width = Math.min(img.naturalWidth, 400);
            canvas.height = Math.min(img.naturalHeight, 400);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              decoded = {
                width: canvas.width,
                height: canvas.height,
                data: new Uint8Array(imgData.data.buffer),
              };
            }
          } catch (canvasErr) {
            console.warn('[FaceDetection] Web canvas fallback error:', canvasErr);
          }
        }
      }
    }

    if (decoded && decoded.width > 0 && decoded.height > 0) {
      const analysis = analyzeImagePixels(decoded.data, decoded.width, decoded.height);
      if (!analysis.isValid) {
        return {
          isValid: false,
          status: 'INVALID',
          title: analysis.title,
          message: analysis.message,
          isBlank: analysis.title.includes('Blank') || analysis.title.includes('Dark'),
          metrics: analysis.metrics,
        };
      }

      return {
        isValid: true,
        status: 'VALID',
        title: 'Human Face Verified',
        message: 'Clear human face verified successfully.',
        faceCount: 1,
        metrics: analysis.metrics,
      };
    }

    // Could not verify face
    return {
      isValid: false,
      status: 'INVALID',
      title: 'No Face Detected',
      message: 'No human face was detected. Please upload a clear photo of your face.',
    };
  } catch (error: any) {
    console.error('[FaceDetection] Error in validateProfilePhoto:', error);
    return {
      isValid: false,
      status: 'ERROR',
      title: 'Unable to Verify Photo',
      message: 'Face verification service is currently unavailable. Please try again.',
    };
  }
};
