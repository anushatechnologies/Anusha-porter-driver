# 🌐 COMPLETE END-TO-END BACKEND API AUDIT REPORT

**Project:** Anusha Porter Driver App & Admin Ecosystem  
**Target Base URL:** `https://api.anushaporter.com`  
**Date:** 2026-08-20  
**Status:** Complete Audit & Actionable Checklist for Backend Team  

---

## 1. EXECUTIVE AUDIT SUMMARY

We performed an end-to-end audit of all **24+ API endpoints** used by the Driver App across Authentication, Onboarding, Real-Time Tracking, Order Fulfillment, Fintech/Wallet, and Admin Operations.

### ⚠️ Top 4 Backend Vulnerabilities & Fixes:

| # | Endpoint / Feature | Bug / Gap Identified | Required Backend Fix |
|---|---|---|---|
| 1 | **Driver Profile (`GET /api/drivers`)** | Database has `vehicle: null` while `vehicleType: "Scooter"`, causing "Unregistered Vehicle" in Admin. | Run 1-line DB migration to set `vehicle = vehicleType` and save both fields on `POST /api/drivers/register`. |
| 2 | **Image Upload URL (`POST /api/upload/image`)** | Duplicate prefix bug where backend prepends base URL to an already absolute S3 URL (`https://api.anushaporter.comhttps://poteranusha.s3.amazonaws.com/...`). | Return clean, single absolute S3 URL (`https://poteranusha.s3.amazonaws.com/...`). |
| 3 | **Two-Step Delivery Completion (`verify-otp` & `confirm-payment`)** | If driver verifies OTP first and collects cash second, backend must separate OTP verification from payment confirmation. | Support `POST /api/driver/orders/:id/verify-otp` (status: `OTP_VERIFIED`) followed by `POST /api/driver/orders/:id/confirm-payment` (status: `completed`). |
| 4 | **Single Driver Order Locking (`PUT /api/orders/:id/accept`)** | If two drivers accept the same order simultaneously, race condition occurs. | Return `HTTP 409 Conflict` with `{ "success": false, "message": "Order already accepted by another driver" }` on duplicate acceptance. |

---

## 2. MODULE-BY-MODULE API AUDIT SPECIFICATION

---

### MODULE 1: AUTHENTICATION & ONBOARDING

#### 1.1. Verify OTP (Firebase / Phone Login)
- **Method & Route:** `POST /api/auth/verify-otp`
- **Request Body:**
  ```json
  {
    "firebaseIdToken": "eyJhbGciOiJSUzI1NiIs...",
    "mode": "login", // or "signup"
    "role": "driver"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "token": "JWT_AUTH_TOKEN_HERE",
    "driver": {
      "id": 1,
      "name": "Supriya",
      "phone": "9014397044",
      "kyc": "verified"
    }
  }
  ```

---

#### 1.2. Phone Number Pre-check
- **Method & Route:** `GET /api/drivers/check-phone?phone=9014397044` (or `GET /api/drivers/phone/9014397044`)
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "exists": true,
    "phone": "9014397044"
  }
  ```

---

#### 1.3. S3 KYC Document Upload
- **Method & Route:** `POST /api/upload/image`
- **Content-Type:** `multipart/form-data`
- **Form Fields:**
  - `file`: `[Binary Image Data]`
  - `category`: `"profile"` | `"aadhaar"` | `"license"` | `"rc"` | `"bankpassbook"`
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "url": "https://poteranusha.s3.amazonaws.com/profile/ddeb5a91.jpeg"
  }
  ```
  *(⚠️ Critical: Do NOT prepend `https://api.anushaporter.com` to S3 URLs).*

---

#### 1.4. Dynamic Vehicle Types Selection
- **Method & Route:** `GET /api/vehicle-types?status=active` (or `GET /api/vehicles?status=active`)
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "vehicles": [
      { "id": "1", "name": "2 Wheeler", "type": "two_wheeler", "capacity": "Up to 20kg", "status": "active" },
      { "id": "2", "name": "3 Wheeler", "type": "auto_rickshaw", "capacity": "Up to 500kg", "status": "active" },
      { "id": "3", "name": "Tata Ace", "type": "tata_ace", "capacity": "Up to 750kg", "status": "active" }
    ]
  }
  ```

---

#### 1.5. Driver Registration
- **Method & Route:** `POST /api/drivers/register`
- **Request Body:**
  ```json
  {
    "name": "Supriya",
    "email": "supriya@example.com",
    "phone": "9014397044",
    "dob": "17/05/1999",
    "gender": "Female",
    "addressLine1": "Kurichedu Rd",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "523304",
    "vehicle": "Scooter",
    "vehicleType": "Scooter",
    "vehicle_type": "Scooter",
    "vehicleName": "Scooter",
    "vehicleNumber": "TG63737383882",
    "rcNumber": "RC5363728929299",
    "aadhaarNumber": "5555 8896 6665",
    "licenseNumber": "DL63737382882828",
    "bankName": "SBI",
    "accountHolderName": "Supriya",
    "accountNumber": "488446646494949499",
    "ifscCode": "SBI67889998",
    "documents": {
      "profilePhotoUrl": "https://poteranusha.s3.amazonaws.com/profile/ddeb5a91.jpeg",
      "aadhaarUrl": "https://poteranusha.s3.amazonaws.com/aadhaar/ddeb5a91.jpeg",
      "licenseUrl": "https://poteranusha.s3.amazonaws.com/license/f7b03e9a.jpeg",
      "rcUrl": "https://poteranusha.s3.amazonaws.com/rc/112f9e25.jpeg",
      "bankPassbookUrl": "https://poteranusha.s3.amazonaws.com/bankpassbook/c2ba1026.jpeg"
    }
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Driver registered successfully",
    "driverId": 1,
    "kycStatus": "pending"
  }
  ```

---

### MODULE 2: DRIVER STATUS, TELEMETRY & PROFILE

#### 2.1. Driver Online / Offline Toggle
- **Method & Route:** `PUT /api/drivers/me/status` (or `PUT /api/drivers/status`)
- **Request Body:**
  ```json
  {
    "status": "online", // or "offline"
    "online": true,
    "driverId": 1,
    "phone": "9014397044"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  { "success": true, "status": "online" }
  ```

---

#### 2.2. Live Location Telemetry (GPS Tracking)
- **Method & Route:** `PUT /api/drivers/me/location`
- **Request Body:**
  ```json
  {
    "latitude": 17.385044,
    "longitude": 78.486671,
    "heading": 90.0
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  { "success": true }
  ```

---

#### 2.3. FCM Push Notification Token Registration
- **Method & Route:** `POST /api/drivers/me/device-token`
- **Request Body:**
  ```json
  { "fcmToken": "f78Kjd92...example_token" }
  ```
- **Expected Response (`200 OK`):**
  ```json
  { "success": true }
  ```

---

### MODULE 3: ORDER LIFECYCLE & DELIVERY

#### 3.1. Active Order Query
- **Method & Route:** `GET /api/drivers/me/orders/active`
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "order": {
      "id": 501,
      "bookingId": "BK_501",
      "status": "accepted", // "accepted" | "picked_up" | "arrived" | "OTP_VERIFIED"
      "customerName": "Rahul Sharma",
      "customerPhone": "9876543210",
      "pickupAddress": "Madhapur, Hyderabad",
      "dropAddress": "Gachibowli, Hyderabad",
      "pickupLat": 17.4483,
      "pickupLng": 78.3915,
      "dropLat": 17.4401,
      "dropLng": 78.3489,
      "amount": 250.00,
      "distance": "5.4 km",
      "deliveryOtp": "4921"
    }
  }
  ```

---

#### 3.2. Order Acceptance (With Anti-Collision Locking)
- **Method & Route:** `PUT /api/orders/:id/accept` (or `POST /api/orders/:id/accept`)
- **Success (`200 OK`):**
  ```json
  { "success": true, "message": "Order accepted successfully" }
  ```
- **If already accepted by another driver (`409 Conflict`):**
  ```json
  { "success": false, "message": "Order has already been accepted by another driver partner." }
  ```

---

#### 3.3. Step 1: Customer Delivery OTP Validation
- **Method & Route:** `POST /api/driver/orders/:id/verify-otp` (or `POST /api/orders/:id/verify-otp`)
- **Request Body:**
  ```json
  {
    "otp": "4921",
    "deliveryOtp": "4921",
    "bookingId": "BK_501"
  }
  ```
- **Success (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "OTP verified successfully. Awaiting payment confirmation.",
    "status": "OTP_VERIFIED"
  }
  ```
- **Incorrect OTP (`400 Bad Request`):**
  ```json
  {
    "success": false,
    "message": "Invalid Delivery OTP. Please ask the customer for the correct 4-digit code."
  }
  ```

---

#### 3.4. Step 2: Payment Confirmation & Trip Completion
- **Method & Route:** `POST /api/driver/orders/:id/confirm-payment` (or `POST /api/orders/:id/complete`)
- **Headers:** `Idempotency-Key: COMPL_BK_501_1724145600000`
- **Request Body:**
  ```json
  {
    "bookingId": "BK_501",
    "amount": 250.00,
    "method": "CASH", // or "ONLINE"
    "paymentMethod": "CASH",
    "paymentConfirmed": true
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Order delivered and completed successfully.",
    "grossFare": 250.00,
    "platformCommission": 12.50,
    "netEarnings": 237.50,
    "updatedBalance": 1240.00
  }
  ```

---

#### 3.5. Order History
- **Method & Route:** `GET /api/drivers/me/orders` (or `GET /api/drivers/:email/orders/history`)
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "totalOrders": 15,
    "completedOrders": 14,
    "totalEarnings": 3450.00,
    "orders": [
      {
        "id": 501,
        "bookingId": "BK_501",
        "status": "completed",
        "pickup": "Madhapur",
        "drop": "Gachibowli",
        "amount": 250.00,
        "distance": "5.4 km",
        "customerName": "Rahul Sharma",
        "createdAt": "2026-08-20T10:30:00Z"
      }
    ]
  }
  ```

---

### MODULE 4: FINTECH, DRIVER WALLET & PAYOUTS

#### 4.1. Driver Wallet Balance & Earnings
- **Method & Route:** `GET /api/driver/wallet` (or `GET /api/drivers/me/wallet`)
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "wallet": {
      "availableBalance": 1240.00,
      "pendingBalance": 0.00,
      "totalEarned": 5000.00,
      "totalWithdrawn": 3500.00,
      "platformCommission": 260.00,
      "commissionPercentage": 5,
      "minPayoutAmount": 100.00,
      "isPayoutEligible": true,
      "minRequiredBalance": 0.00
    }
  }
  ```

---

#### 4.2. Submit Instant Withdrawal Request (For Admin Approval)
- **Method & Route:** `POST /api/driver/withdrawals` (or `POST /api/drivers/me/payout-request`)
- **Request Body:**
  ```json
  {
    "amount": 500.00,
    "status": "PENDING_ADMIN_APPROVAL"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Withdrawal request submitted. Amount is held for Admin approval.",
    "availableBalance": 740.00,
    "heldAmount": 500.00,
    "request": {
      "id": "WDR_984712",
      "amount": 500.00,
      "status": "PENDING_ADMIN_APPROVAL",
      "requestedAt": "2026-08-20T11:00:00Z"
    }
  }
  ```

---

#### 4.3. Driver Payout Account Management
- **Method & Route:** `GET /api/drivers/me/payout-account` & `POST /api/drivers/me/payout-account`
- **Request Body:**
  ```json
  {
    "accountHolderName": "Supriya Bollipelli",
    "bankName": "State Bank of India",
    "accountNumber": "488446646494949499",
    "ifscCode": "SBIN0001234",
    "upiId": "supriya@upi"
  }
  ```

---

### MODULE 5: ADMIN DASHBOARD & MANAGEMENT

#### 5.1. Admin Metrics Summary
- **Method & Route:** `GET /api/admin/metrics`
- **Expected Response (`200 OK`):**
  ```json
  {
    "totalDrivers": 42,
    "pendingKyc": 3,
    "activeOrders": 8,
    "activeDrivers": 15,
    "totalOrdersToday": 64,
    "revenueToday": 14200.00
  }
  ```

---

#### 5.2. Admin Driver KYC Verification / Rejection
- **Method & Route:** `PUT /api/admin/drivers/:driverId/kyc`
- **Request Body:**
  ```json
  {
    "status": "verified" // or "rejected"
    // "reason": "Driving license photo is blurry" (required if rejected)
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  { "success": true, "message": "Driver KYC status updated" }
  ```

---

#### 5.3. Admin Wallet & Platform Commission Settings
- **Method & Route:** `GET /api/admin/settings/wallet` & `POST /api/admin/settings/wallet`
- **Request Body:**
  ```json
  {
    "commissionPercentage": 5,
    "minRequiredBalance": 0,
    "walletRequiredForRides": true,
    "autoOfflineWhenBalanceInsufficient": true
  }
  ```

---

## 3. SUMMARY CHECKLIST FOR BACKEND TEAM

1. [ ] **1-Time DB Query**: Run `UPDATE drivers SET vehicle = vehicleType WHERE vehicle IS NULL;`
2. [ ] **S3 URLs**: Ensure `POST /api/upload/image` returns pure S3 URLs (`https://poteranusha.s3.amazonaws.com/...`) without prepending base URL.
3. [ ] **Dynamic Vehicles**: Ensure `GET /api/vehicle-types?status=active` returns active vehicle rows.
4. [ ] **Delivery Step 1 & Step 2**: Support `POST /api/driver/orders/:id/verify-otp` and `POST /api/driver/orders/:id/confirm-payment`.
5. [ ] **Order Locking**: Return `HTTP 409` if an order has already been taken by another driver.
