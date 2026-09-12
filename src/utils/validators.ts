/**
 * src/utils/validators.ts
 * ─────────────────────────────────────────────────────────────
 * Centralized, production-grade validation for Anusha Porter
 * Driver App registration and login forms.
 *
 * Each validator returns { isValid, error }.
 * All validators are pure functions — no side effects.
 * ─────────────────────────────────────────────────────────────
 */

// ── Result type ───────────────────────────────────────────────
export interface ValidationResult {
  isValid: boolean;
  error: string;
}

const OK: ValidationResult = { isValid: true, error: '' };
const fail = (msg: string): ValidationResult => ({ isValid: false, error: msg });

// ── Helper: Collapse multiple consecutive spaces into one ─────
const collapseSpaces = (s: string) => s.replace(/\s{2,}/g, ' ');

// ══════════════════════════════════════════════════════════════
//  NAME FIELDS (Full Name, Account Holder Name, Bank Name)
// ══════════════════════════════════════════════════════════════

/**
 * Validate a person's name (Full Name, Account Holder Name, etc.)
 * - Alphabets and single spaces only
 * - 2–50 characters after trimming
 * - No numbers, emojis, special characters, URLs, emails
 */
export const validateName = (value: string, fieldLabel = 'Name'): ValidationResult => {
  const trimmed = collapseSpaces(value.trim());

  if (!trimmed) {
    return fail(`Please enter your ${fieldLabel.toLowerCase()}.`);
  }

  if (trimmed.length < 2) {
    return fail(`${fieldLabel} must be at least 2 characters.`);
  }

  if (trimmed.length > 50) {
    return fail(`${fieldLabel} must not exceed 50 characters.`);
  }

  // Reject if it contains any digit
  if (/\d/.test(trimmed)) {
    return fail(`${fieldLabel} should contain letters only — no numbers allowed.`);
  }

  // Reject emojis and non-ASCII symbols (allow basic Latin + accented chars)
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u007F\u00C0-\u024F\s]/.test(trimmed)) {
    return fail(`${fieldLabel} should contain letters only — no emojis or symbols.`);
  }

  // Reject special characters: @#$%^&*()!+={}[]|\\:;"'<>,?/~\`_-
  if (/[^a-zA-Z\s]/.test(trimmed)) {
    return fail(`${fieldLabel} should contain letters and spaces only.`);
  }

  // Reject if it looks like a URL or email
  if (/@/.test(trimmed) || /https?:\/\//i.test(trimmed) || /www\./i.test(trimmed)) {
    return fail(`Please enter a valid ${fieldLabel.toLowerCase()}.`);
  }

  return OK;
};

/**
 * Validate bank name — allows alphabets and spaces, 3–50 characters.
 */
export const validateBankName = (value: string): ValidationResult => {
  const trimmed = collapseSpaces(value.trim());

  if (!trimmed) {
    return fail('Please enter your bank name.');
  }

  if (trimmed.length < 3) {
    return fail('Bank name must be at least 3 characters.');
  }

  if (trimmed.length > 50) {
    return fail('Bank name must not exceed 50 characters.');
  }

  if (/[^a-zA-Z\s]/.test(trimmed)) {
    return fail('Bank name should contain letters only.');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  MOBILE NUMBER
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian mobile number — exactly 10 digits, starts with 6-9.
 */
export const validateMobile = (value: string): ValidationResult => {
  const cleaned = value.replace(/\D/g, '');

  if (!cleaned) {
    return fail('Please enter your mobile number.');
  }

  if (cleaned.length < 10) {
    return fail('Mobile number must be 10 digits.');
  }

  if (cleaned.length > 10) {
    return fail('Mobile number must be exactly 10 digits.');
  }

  if (!/^[6-9]/.test(cleaned)) {
    return fail('Mobile number must start with 6, 7, 8, or 9.');
  }

  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    return fail('Please enter a valid 10-digit mobile number.');
  }

  // Reject obviously invalid repeated patterns (e.g. 9999999999)
  if (/^(\d)\1{9}$/.test(cleaned)) {
    return fail('Please enter a valid mobile number — repeated digits are not allowed.');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  EMAIL
// ══════════════════════════════════════════════════════════════

/**
 * Validate email address — standard RFC-like validation.
 */
export const validateEmail = (value: string): ValidationResult => {
  const trimmed = value.trim();

  if (!trimmed) {
    return fail('Please enter your email address.');
  }

  // Reject spaces
  if (/\s/.test(trimmed)) {
    return fail('Email address must not contain spaces.');
  }

  // Reject multiple @ symbols
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount === 0) {
    return fail('Please enter a valid email with @ symbol (e.g., name@example.com).');
  }
  if (atCount > 1) {
    return fail('Email must contain only one @ symbol.');
  }

  // Split at @
  const [localPart, domainPart] = trimmed.split('@');

  if (!localPart || localPart.length === 0) {
    return fail('Please enter text before the @ symbol.');
  }

  if (!domainPart || domainPart.length === 0) {
    return fail('Please enter a domain after the @ symbol (e.g., gmail.com).');
  }

  // Domain must have at least one dot
  if (!domainPart.includes('.')) {
    return fail('Email domain must include a dot (e.g., gmail.com).');
  }

  // Domain TLD must be 2+ chars
  const domainParts = domainPart.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return fail('Please enter a valid email domain (e.g., gmail.com).');
  }

  // Full regex validation
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return fail('Please enter a valid email address (e.g., name@example.com).');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  DATE OF BIRTH
// ══════════════════════════════════════════════════════════════

/**
 * Validate date of birth in DD/MM/YYYY format.
 * - Valid calendar date (correct days per month)
 * - Not in the future
 * - Age between 18 and 80
 */
export const validateDOB = (value: string): ValidationResult => {
  const trimmed = value.trim();

  if (!trimmed) {
    return fail('Please enter your date of birth.');
  }

  if (trimmed.length !== 10) {
    return fail('Date of birth must be in DD/MM/YYYY or YYYY-MM-DD format.');
  }

  const parts = trimmed.split(/[/.-]/);
  if (parts.length !== 3) {
    return fail('Date of birth must be in DD/MM/YYYY or YYYY-MM-DD format.');
  }

  let day: number, month: number, year: number;
  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return fail('Please enter a valid date.');
  }

  // Month validation
  if (month < 1 || month > 12) {
    return fail('Month must be between 01 and 12.');
  }

  // Day validation per month
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Leap year check
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    daysInMonth[1] = 29;
  }
  const maxDay = daysInMonth[month - 1];
  if (day < 1 || day > maxDay) {
    return fail(`Day must be between 01 and ${maxDay} for the selected month.`);
  }

  // Year range validation
  const today = new Date();
  const currentYear = today.getFullYear();

  if (year < 1940) {
    return fail('Please enter a valid year (1940 or later).');
  }

  if (year > currentYear) {
    return fail('Date of birth cannot be in the future.');
  }

  // Construct date and verify it's valid
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return fail('Please enter a valid date.');
  }

  // Future date check
  if (birthDate > today) {
    return fail('Date of birth cannot be in the future.');
  }

  // Age calculation
  let age = currentYear - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }

  if (age < 18) {
    return fail('Driver must be at least 18 years old.');
  }

  if (age > 80) {
    return fail('Please enter a valid date of birth (age must be under 80).');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  ADDRESS FIELDS
// ══════════════════════════════════════════════════════════════

/**
 * Validate address line — allows letters, numbers, common punctuation.
 * Min 5, max 200 characters.
 */
export const validateAddress = (value: string, fieldLabel = 'Address'): ValidationResult => {
  const trimmed = collapseSpaces(value.trim());

  if (!trimmed) {
    return fail(`Please enter your ${fieldLabel.toLowerCase()}.`);
  }

  if (trimmed.length < 5) {
    return fail(`${fieldLabel} must be at least 5 characters.`);
  }

  if (trimmed.length > 200) {
    return fail(`${fieldLabel} must not exceed 200 characters.`);
  }

  return OK;
};

/**
 * Validate city name — alphabets and spaces, 2-30 chars.
 */
export const validateCity = (value: string): ValidationResult => {
  const trimmed = collapseSpaces(value.trim());

  if (!trimmed) {
    return fail('Please enter your city.');
  }

  if (trimmed.length < 2) {
    return fail('City name must be at least 2 characters.');
  }

  if (trimmed.length > 30) {
    return fail('City name must not exceed 30 characters.');
  }

  if (!/^[a-zA-Z\s]+$/.test(trimmed)) {
    return fail('City name should contain letters only.');
  }

  return OK;
};

/**
 * Validate state name — alphabets and spaces, 2-30 chars.
 */
export const validateState = (value: string): ValidationResult => {
  const trimmed = collapseSpaces(value.trim());

  if (!trimmed) {
    return fail('Please enter your state.');
  }

  if (trimmed.length < 2) {
    return fail('State name must be at least 2 characters.');
  }

  if (trimmed.length > 30) {
    return fail('State name must not exceed 30 characters.');
  }

  if (!/^[a-zA-Z\s]+$/.test(trimmed)) {
    return fail('State name should contain letters only.');
  }

  return OK;
};

/**
 * Validate Indian PIN code — exactly 6 digits, first digit 1-9.
 */
export const validatePincode = (value: string): ValidationResult => {
  const cleaned = value.replace(/\D/g, '');

  if (!cleaned) {
    return fail('Please enter your 6-digit pincode.');
  }

  if (cleaned.length < 6) {
    return fail('Pincode must be exactly 6 digits.');
  }

  if (cleaned.length > 6) {
    return fail('Pincode must be exactly 6 digits.');
  }

  if (!/^[1-9]\d{5}$/.test(cleaned)) {
    return fail('Please enter a valid Indian pincode (first digit 1-9).');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  KYC DOCUMENTS
// ══════════════════════════════════════════════════════════════

/**
 * Validate Aadhaar number — exactly 12 digits, first digit 2-9.
 */
export const validateAadhaar = (value: string): ValidationResult => {
  const cleaned = value.replace(/\D/g, '');

  if (!cleaned) {
    return fail('Please enter your 12-digit Aadhaar number.');
  }

  if (cleaned.length < 12) {
    return fail('Aadhaar number must be exactly 12 digits.');
  }

  if (cleaned.length > 12) {
    return fail('Aadhaar number must be exactly 12 digits.');
  }

  // Aadhaar numbers issued by UIDAI start with 2-9 (not 0 or 1)
  if (/^[01]/.test(cleaned)) {
    return fail('Aadhaar number cannot start with 0 or 1.');
  }

  if (!/^\d{12}$/.test(cleaned)) {
    return fail('Aadhaar number must contain only digits.');
  }

  // Reject all-same-digit patterns
  if (/^(\d)\1{11}$/.test(cleaned)) {
    return fail('Please enter a valid Aadhaar number.');
  }

  return OK;
};

/**
 * Validate PAN card number — ABCDE1234F format.
 */
export const validatePAN = (value: string): ValidationResult => {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!cleaned) {
    return fail('Please enter your PAN card number.');
  }

  if (cleaned.length < 10) {
    return fail('PAN number must be exactly 10 characters (e.g., ABCDE1234F).');
  }

  if (cleaned.length > 10) {
    return fail('PAN number must be exactly 10 characters.');
  }

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned)) {
    return fail('PAN format: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F).');
  }

  return OK;
};

export const validatePan = validatePAN;

/**
 * Validate Driving License number.
 * - Allowed characters: Only letters (a-z, A-Z) and numbers (0-9).
 * - Forbidden: Spaces, hyphens, slashes, and special characters.
 * - Length: 1 to 100 characters.
 */
export const validateDrivingLicense = (value: string): ValidationResult => {
  const clean = value ? value.trim() : '';

  if (!clean) {
    return fail('Driving licence number is required');
  }

  // Accepts only letters and numbers, maximum 100 characters
  if (clean.length > 100 || !/^[a-zA-Z0-9]{1,100}$/.test(clean)) {
    return fail('Driving licence must contain only numbers and alphabets (up to 100 characters)');
  }

  return OK;
};

/** Alias for validateDrivingLicense to match integration specification */
export const validateLicenseNumber = validateDrivingLicense;

/**
 * Validate vehicle type — dynamic check to ensure a vehicle has been selected.
 */
export const validateVehicleType = (value: string): ValidationResult => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return fail('Please select a delivery vehicle category.');
  }

  if (value.trim().length < 2) {
    return fail('Please select a valid vehicle category.');
  }

  return OK;
};

/**
 * Validate vehicle registration number (license plate).
 * Accepts any alphanumeric registration plate without strict character limits.
 */
export const validateVehicleNumber = (value: string): ValidationResult => {
  const cleaned = (value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!cleaned) {
    return fail('Please enter your vehicle registration number.');
  }

  if (cleaned.length < 2) {
    return fail('Vehicle number must be at least 2 characters.');
  }

  return OK;
};

/**
 * Validate RC (Registration Certificate) number — alphanumeric, 8-15 chars.
 */
export const validateRCNumber = (value: string): ValidationResult => {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!cleaned) {
    return fail('Please enter your vehicle RC number.');
  }

  if (cleaned.length < 8) {
    return fail('RC number must be at least 8 characters.');
  }

  if (cleaned.length > 15) {
    return fail('RC number must not exceed 15 characters.');
  }

  if (!/^[A-Z0-9]+$/.test(cleaned)) {
    return fail('RC number must contain only letters and digits.');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  BANK DETAILS
// ══════════════════════════════════════════════════════════════

/**
 * Validate bank account number — 9 to 18 digits only.
 */
export const validateAccountNumber = (value: string): ValidationResult => {
  const cleaned = value.replace(/\D/g, '');

  if (!cleaned) {
    return fail('Please enter your bank account number.');
  }

  if (cleaned.length < 9) {
    return fail('Account number must be at least 9 digits.');
  }

  if (cleaned.length > 18) {
    return fail('Account number must not exceed 18 digits.');
  }

  if (!/^\d+$/.test(cleaned)) {
    return fail('Account number must contain digits only.');
  }

  // Reject all-same-digit patterns
  if (/^(\d)\1+$/.test(cleaned)) {
    return fail('Please enter a valid account number.');
  }

  return OK;
};

/**
 * Validate Indian IFSC code — exactly 11 chars: 4 letters + 0 + 6 alphanumeric.
 */
export const validateIFSC = (value: string): ValidationResult => {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!cleaned) {
    return fail('Please enter the IFSC code.');
  }

  if (cleaned.length < 11) {
    return fail('IFSC code must be exactly 11 characters (e.g., SBIN0001234).');
  }

  if (cleaned.length > 11) {
    return fail('IFSC code must be exactly 11 characters.');
  }

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleaned)) {
    return fail('IFSC format: 4 letters + 0 + 6 alphanumeric (e.g., SBIN0001234).');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  SELECTION FIELDS
// ══════════════════════════════════════════════════════════════

const VALID_GENDERS = ['Male', 'Female', 'Other'];

/**
 * Validate gender — must be one of predefined values.
 */
export const validateGender = (value: string): ValidationResult => {
  if (!value) {
    return fail('Please select your gender.');
  }

  if (!VALID_GENDERS.includes(value)) {
    return fail('Please select a valid gender option.');
  }

  return OK;
};

// ══════════════════════════════════════════════════════════════
//  PROFILE PHOTO
// ══════════════════════════════════════════════════════════════

/**
 * Validate profile photo state.
 */
export const validateProfilePhoto = (
  photoUri: string | null,
  _validationStatus?: string
): ValidationResult => {
  if (!photoUri) {
    return fail('A profile photo is required to continue.');
  }

  // Accepts any photo! No strict rules or human face restrictions.
  return OK;
};

// ══════════════════════════════════════════════════════════════
//  DOCUMENT UPLOAD VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Validate that a required document has been uploaded.
 */
export const validateDocumentUploaded = (
  isUploaded: boolean,
  docLabel: string
): ValidationResult => {
  if (!isUploaded) {
    return fail(`${docLabel} is required. Please upload a clear photo.`);
  }
  return OK;
};

// ══════════════════════════════════════════════════════════════
//  INPUT SANITIZATION
// ══════════════════════════════════════════════════════════════

/**
 * Sanitize a field value before API submission.
 * Trims, normalizes whitespace, and applies field-specific formatting.
 */
export const sanitizeField = (key: string, value: string): string => {
  let sanitized = value;

  // Remove control characters (except normal whitespace)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  switch (key) {
    case 'fullName':
    case 'accountHolderName':
      // Trim, collapse spaces, capitalize properly
      sanitized = collapseSpaces(sanitized.trim());
      break;

    case 'mobile':
    case 'pincode':
    case 'accountNumber':
      // Strip all non-digits
      sanitized = sanitized.replace(/\D/g, '');
      break;

    case 'email':
      // Trim and lowercase
      sanitized = sanitized.trim().toLowerCase();
      break;

    case 'aadhaarNumber':
      // Remove spaces for storage (display may have spaces)
      sanitized = sanitized.replace(/\s/g, '');
      break;

    case 'panNumber':
    case 'vehicleNumber':
    case 'rcNumber':
    case 'ifscCode':
      // Strip special chars and uppercase
      sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      break;

    case 'licenseNumber':
      // Allow any characters, just trim and uppercase
      sanitized = sanitized.trim().toUpperCase();
      break;

    case 'bankName':
    case 'city':
    case 'state':
      // Trim and collapse spaces
      sanitized = collapseSpaces(sanitized.trim());
      break;

    case 'addressLine1':
      // Just trim and collapse spaces
      sanitized = collapseSpaces(sanitized.trim());
      break;

    default:
      sanitized = sanitized.trim();
  }

  return sanitized;
};

/**
 * Sanitize the entire form before API submission.
 */
export const sanitizeForm = (form: Record<string, string>): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const key of Object.keys(form)) {
    sanitized[key] = sanitizeField(key, form[key]);
  }
  return sanitized;
};

// ══════════════════════════════════════════════════════════════
//  FIELD-LEVEL VALIDATION DISPATCHER
// ══════════════════════════════════════════════════════════════

/**
 * Validate a single field by key. Useful for on-blur validation.
 */
export const validateField = (key: string, value: string): ValidationResult => {
  switch (key) {
    case 'fullName':
      return validateName(value, 'Full Name');
    case 'accountHolderName':
      return validateName(value, 'Account Holder Name');
    case 'mobile':
      return validateMobile(value);
    case 'email':
      return validateEmail(value);
    case 'dob':
      return validateDOB(value);
    case 'gender':
      return validateGender(value);
    case 'addressLine1':
      return validateAddress(value, 'Address Line 1');
    case 'city':
      return validateCity(value);
    case 'state':
      return validateState(value);
    case 'pincode':
      return validatePincode(value);
    case 'vehicleType':
      return validateVehicleType(value);
    case 'vehicleNumber':
      return validateVehicleNumber(value);
    case 'rcNumber':
      return validateRCNumber(value);
    case 'aadhaarNumber':
      return validateAadhaar(value);
    case 'panNumber':
      return validatePAN(value);
    case 'licenseNumber':
      return validateDrivingLicense(value);
    case 'bankName':
      return validateBankName(value);
    case 'accountNumber':
      return validateAccountNumber(value);
    case 'ifscCode':
      return validateIFSC(value);
    default:
      return value.trim() ? OK : fail('This field is required.');
  }
};

// ══════════════════════════════════════════════════════════════
//  FULL-FORM STEP VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Validate all fields for a given registration step.
 * Returns a map of field key → error message.
 */
export const validateRegistrationStep = (
  step: number,
  form: Record<string, string>,
  uploadedDocs: Record<string, { uploaded: boolean }>,
  profilePhoto: string | null,
  photoValidationStatus: string
): Record<string, string> => {
  const errors: Record<string, string> = {};

  const addError = (key: string, result: ValidationResult) => {
    if (!result.isValid) {
      errors[key] = result.error;
    }
  };

  if (step === 0) {
    // Personal Details
    addError('profilePhoto', validateProfilePhoto(profilePhoto, photoValidationStatus));
    addError('fullName', validateName(form.fullName, 'Full Name'));
    addError('mobile', validateMobile(form.mobile));
    addError('email', validateEmail(form.email));
    addError('dob', validateDOB(form.dob));
    addError('gender', validateGender(form.gender));
  } else if (step === 1) {
    // Address Details
    addError('addressLine1', validateAddress(form.addressLine1, 'Address Line 1'));
    addError('city', validateCity(form.city));
    addError('state', validateState(form.state));
    addError('pincode', validatePincode(form.pincode));
  } else if (step === 2) {
    // Vehicle Details
    addError('vehicleType', validateVehicleType(form.vehicleType));
    addError('vehicleNumber', validateVehicleNumber(form.vehicleNumber));
    addError('rcNumber', validateRCNumber(form.rcNumber));
  } else if (step === 3) {
    // Documents & KYC
    addError('aadhaarNumber', validateAadhaar(form.aadhaarNumber));
    addError('panNumber', validatePAN(form.panNumber));
    addError('licenseNumber', validateDrivingLicense(form.licenseNumber));
    addError('aadhaarDoc', validateDocumentUploaded(!!uploadedDocs.aadhaar?.uploaded, 'Aadhaar Card copy'));
    addError('panDoc', validateDocumentUploaded(!!uploadedDocs.pan?.uploaded, 'PAN Card copy'));
    addError('licenseDoc', validateDocumentUploaded(!!uploadedDocs.license?.uploaded, 'Driving License copy'));
    addError('rcDoc', validateDocumentUploaded(!!uploadedDocs.rc?.uploaded, 'Vehicle RC copy'));
  } else if (step === 4) {
    // Bank Details
    addError('bankName', validateBankName(form.bankName));
    addError('accountHolderName', validateName(form.accountHolderName, 'Account Holder Name'));
    addError('accountNumber', validateAccountNumber(form.accountNumber));
    addError('ifscCode', validateIFSC(form.ifscCode));
    addError('bankPassbookDoc', validateDocumentUploaded(!!uploadedDocs.bankPassbook?.uploaded, 'Bank passbook / cheque photo'));
  }

  return errors;
};

/**
 * Validate ALL steps at once (used before final submission on Review step).
 */
export const validateAllRegistrationFields = (
  form: Record<string, string>,
  uploadedDocs: Record<string, { uploaded: boolean }>,
  profilePhoto: string | null,
  photoValidationStatus: string
): Record<string, string> => {
  let allErrors: Record<string, string> = {};

  for (let step = 0; step <= 4; step++) {
    const stepErrors = validateRegistrationStep(step, form, uploadedDocs, profilePhoto, photoValidationStatus);
    allErrors = { ...allErrors, ...stepErrors };
  }

  return allErrors;
};
