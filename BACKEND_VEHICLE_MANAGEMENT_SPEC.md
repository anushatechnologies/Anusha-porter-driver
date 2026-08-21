# BACKEND & ADMIN API SPECIFICATION: VEHICLE MANAGEMENT & DRIVER PROFILE FIX

**Project:** Porter App Ecosystem (Driver App, Customer App, Admin Web Dashboard, Backend API)  
**Date:** 2026-08-20  
**Version:** 1.0  
**Status:** Ready for Implementation  

---

## 1. EXECUTIVE SUMMARY & OBJECTIVES

1. **Fix Driver Profile Vehicle Display**:
   - In the Admin Panel and Database, some drivers show `vehicle: null`, causing the Admin dashboard to display "Unregistered Vehicle", even though the driver selected a vehicle (`vehicleType: "Scooter"`) during registration.
2. **Remove Hardcoded Vehicle Types**:
   - Move from static vehicle lists to dynamic, Admin-configured vehicle categories across both Driver App (onboarding) and Customer App (booking/pricing).

---

## 2. ROOT CAUSE ANALYSIS

### Current State (Observed in `GET /api/drivers`):
```json
[
  {
    "id": 1,
    "name": "Supriya",
    "phone": "9014397044",
    "vehicle": null,                 // ❌ ROOT CAUSE: Null field in database
    "vehicleType": "Scooter",        // ✅ ACTUAL VALUE: Captured during registration
    "vehicleNumber": "TG63737383882",
    "rcNumber": "RC5363728929299",
    "kyc": "verified"
  }
]
```

### The Breakdown:
- The Backend driver table/schema has two fields: `vehicle` and `vehicleType`.
- During driver registration (`POST /api/drivers/register`), `vehicleType` was saved, but `vehicle` remained `null`.
- The Admin Web UI queries `driver.vehicle`, reading `null` and displaying **"Unregistered Vehicle"**.

---

## 3. REQUIRED BACKEND CHANGES

### 3.1. Database Migration / Data Patch (1-Time Run)

To immediately resolve all existing registered drivers without requiring them to re-register:

#### For SQL (PostgreSQL / MySQL):
```sql
-- Sync vehicle column from vehicleType for all existing driver records
UPDATE drivers 
SET vehicle = vehicleType 
WHERE (vehicle IS NULL OR vehicle = '') AND vehicleType IS NOT NULL;
```

#### For MongoDB (Mongoose):
```javascript
db.drivers.updateMany(
  { $or: [{ vehicle: null }, { vehicle: "" }], vehicleType: { $ne: null } },
  [ { $set: { vehicle: "$vehicleType" } } ]
);
```

---

### 3.2. Driver Registration API (`POST /api/drivers/register`)

#### Endpoint Details:
- **URL:** `POST /api/drivers/register`
- **Auth:** Optional / Bearer Token

#### Incoming Payload from Driver App:
```json
{
  "name": "Supriya Bollipelli",
  "email": "bollipellisupriya123@gmail.com",
  "phone": "9014397044",
  "dob": "17/05/1999",
  "gender": "Female",
  "addressLine1": "Kurichedu - Avulamanda Rd",
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

#### Backend Controller Logic:
```javascript
exports.registerDriver = async (req, res) => {
  try {
    const {
      name, email, phone, dob, gender,
      addressLine1, city, state, pincode,
      vehicle, vehicleType, vehicle_type, vehicleName,
      vehicleNumber, rcNumber, aadhaarNumber, licenseNumber,
      bankName, accountHolderName, accountNumber, ifscCode,
      documents
    } = req.body;

    // Resolve unified vehicle string
    const resolvedVehicle = vehicle || vehicleType || vehicle_type || vehicleName || 'Vehicle';

    const driverRecord = {
      name,
      email,
      phone,
      dob,
      gender,
      addressLine1,
      city,
      state,
      pincode,
      vehicle: resolvedVehicle,        // ✅ Populates 'vehicle'
      vehicleType: resolvedVehicle,    // ✅ Populates 'vehicleType'
      vehicleNumber,
      rcNumber,
      aadhaarNumber,
      licenseNumber,
      bankName,
      accountHolderName,
      accountNumber,
      ifscCode,
      documents,
      kyc: 'pending',
      status: 'offline',
      rating: 5.0,
      trips: 0
    };

    const savedDriver = await DriverModel.create(driverRecord);
    return res.status(201).json({
      success: true,
      message: 'Driver profile created successfully',
      driverId: savedDriver.id || savedDriver._id,
      driver: savedDriver
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
```

---

### 3.3. Driver Fetch APIs (`GET /api/drivers` & `GET /api/drivers/:id`)

When returning driver records to the Admin Web Dashboard, ensure the serializer handles backward compatibility:

```javascript
exports.getAllDrivers = async (req, res) => {
  const drivers = await DriverModel.find().lean();
  
  const formattedDrivers = drivers.map(d => ({
    ...d,
    vehicle: d.vehicle || d.vehicleType || 'Vehicle',
    vehicleType: d.vehicleType || d.vehicle || 'Vehicle',
  }));

  return res.status(200).json(formattedDrivers);
};
```

---

## 4. DYNAMIC VEHICLE TYPES API SPECIFICATION

This API allows the **Admin** to dynamically create, edit, activate, or deactivate vehicle categories. The **Driver App** (onboarding) and **User App** (booking) consume this endpoint in real-time.

### 4.1. Database Model (`VehicleType`)

#### SQL Schema:
```sql
CREATE TABLE vehicle_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,               -- e.g. "2 Wheeler", "Tata Ace", "Pickup 8ft"
    type_code VARCHAR(50) UNIQUE NOT NULL,     -- e.g. "two_wheeler", "tata_ace", "pickup_8ft"
    description VARCHAR(255),                  -- e.g. "Best for documents & small packages"
    capacity_kg INT NOT NULL,                  -- e.g. 20, 500, 750, 1200
    dimensions VARCHAR(100),                   -- e.g. "5.5ft x 4.5ft x 4ft"
    icon_name VARCHAR(50) DEFAULT 'bike',      -- e.g. "bike", "scooter", "rickshaw", "truck-delivery"
    image_url VARCHAR(500),                    -- S3/CDN Image URL
    base_fare DECIMAL(10, 2) NOT NULL,         -- e.g. 50.00
    base_km DECIMAL(10, 2) DEFAULT 1.0,        -- e.g. 1.0 km
    per_km_rate DECIMAL(10, 2) NOT NULL,       -- e.g. 15.00
    status VARCHAR(20) DEFAULT 'active',       -- 'active' | 'inactive'
    priority INT DEFAULT 1,                    -- Sorting order (1, 2, 3...)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### 4.2. API Endpoints List

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/vehicle-types?status=active` | Public / Apps | Fetch active vehicles for Driver & User apps |
| **GET** | `/api/admin/vehicle-types` | Admin Auth | Fetch all vehicles (active + inactive) |
| **POST** | `/api/admin/vehicle-types` | Admin Auth | Create a new vehicle category |
| **PUT** | `/api/admin/vehicle-types/:id` | Admin Auth | Update vehicle category pricing/details |
| **PATCH**| `/api/admin/vehicle-types/:id/status` | Admin Auth | Toggle active / inactive status |
| **DELETE**| `/api/admin/vehicle-types/:id` | Admin Auth | Soft-delete / Remove vehicle category |

---

### 4.3. Client Fetch Contract: `GET /api/vehicle-types?status=active`

#### Response (`200 OK`):
```json
{
  "success": true,
  "vehicles": [
    {
      "id": "1",
      "name": "2 Wheeler",
      "type": "two_wheeler",
      "capacity": "Load: Up to 20kg",
      "capacityKg": 20,
      "dimensions": "Ideal for documents & food parcels",
      "iconName": "bike",
      "imageUrl": "https://poteranusha.s3.amazonaws.com/vehicles/bike.png",
      "baseFare": 40.00,
      "perKmRate": 12.00,
      "status": "active",
      "priority": 1
    },
    {
      "id": "2",
      "name": "3 Wheeler / Auto",
      "type": "auto_rickshaw",
      "capacity": "Load: Up to 500kg",
      "capacityKg": 500,
      "dimensions": "5ft x 3.5ft x 3.5ft",
      "iconName": "rickshaw",
      "imageUrl": "https://poteranusha.s3.amazonaws.com/vehicles/auto.png",
      "baseFare": 120.00,
      "perKmRate": 20.00,
      "status": "active",
      "priority": 2
    },
    {
      "id": "3",
      "name": "Tata Ace",
      "type": "tata_ace",
      "capacity": "Load: Up to 750kg",
      "capacityKg": 750,
      "dimensions": "7ft x 4ft x 5ft",
      "iconName": "truck-delivery",
      "imageUrl": "https://poteranusha.s3.amazonaws.com/vehicles/tata_ace.png",
      "baseFare": 250.00,
      "perKmRate": 30.00,
      "status": "active",
      "priority": 3
    }
  ]
}
```

---

## 5. ADMIN WEB PANEL FRONTEND FIX

In the Admin Web Dashboard repository (React / Vue / Angular / Next.js):

Search for where the driver's vehicle column is rendered and replace:
```javascript
// ❌ Old (shows 'Unregistered' when vehicle is null)
<td>{driver.vehicle || 'Unregistered Vehicle'}</td>

// ✅ New (checks vehicleType first with proper fallbacks)
<td>{driver.vehicleType || driver.vehicle || driver.vehicle_type || 'Unspecified'}</td>
```

---

## 6. VERIFICATION CHECKLIST

- [ ] 1. Run the database update script to fix existing driver rows.
- [ ] 2. Update `POST /api/drivers/register` to save both `vehicle` and `vehicleType`.
- [ ] 3. Deploy `GET /api/vehicle-types?status=active` endpoint.
- [ ] 4. Check Admin Panel: Verify that all drivers show their vehicle type ("Scooter", "Bike", "Tata Ace", etc.).
- [ ] 5. Test Driver App Registration: Complete a test driver registration and confirm the selected vehicle saves and displays in the Admin panel.
