# 🔒 BACKEND SPECIFICATION: ORDER ACCEPTANCE & CONCURRENT DRIVER LOCKING (RACE CONDITION FIX)

**Project:** Anusha Porter Logistics Ecosystem  
**Target:** Backend & Database Engineering Team  
**Date:** 2026-08-20  
**Version:** 1.0  
**Status:** Ready for Implementation  

---

## 1. PROBLEM STATEMENT (THE RACE CONDITION)

When a customer places a delivery order, the order is broadcasted or notified to multiple nearby online drivers simultaneously.

### Scenario:
1. **Driver A** and **Driver B** both receive the incoming order alert on their mobile screens.
2. **Driver A** taps **"ACCEPT RIDE"** at `10:00:00.100`.
3. **Driver B** taps **"ACCEPT RIDE"** at `10:00:00.150` (50 milliseconds later).

### Requirement:
- **Driver A** (first to arrive) must win the ride (`200 OK`).
- **Driver B** (second to arrive) must receive `409 Conflict` with message:  
  `"This order has already been accepted by another driver."`
- The order must **NEVER** be double-assigned to two drivers.

---

## 2. API CONTRACT SPECIFICATION

### Endpoint Details
- **Method:** `PUT /api/orders/:id/accept` (or `POST /api/orders/:id/accept`)
- **Headers:**
  - `Authorization: Bearer <DRIVER_JWT_TOKEN>`
  - `Content-Type: application/json`

---

### Response 1: Success (`200 OK`) — When First Driver Claims the Order
Returned to **Driver A**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Order accepted successfully",
  "order": {
    "id": 501,
    "bookingId": "BK_501",
    "status": "accepted",
    "driverId": "1",
    "driverName": "Supriya Bollipelli",
    "customerName": "Rahul Sharma",
    "customerPhone": "9876543210",
    "pickupAddress": "Madhapur, Hyderabad",
    "dropAddress": "Gachibowli, Hyderabad",
    "amount": 250.00,
    "deliveryOtp": "4921"
  }
}
```

---

### Response 2: Collision (`409 Conflict`) — When Order is Already Taken
Returned to **Driver B**:
```json
{
  "success": false,
  "statusCode": 409,
  "message": "This order has already been accepted by another driver partner.",
  "order": {
    "id": 501,
    "status": "accepted"
  }
}
```

---

### Response 3: Order Not Found (`404 Not Found`)
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Order not found or has expired."
}
```

---

## 3. PRODUCTION BACKEND CONTROLLER IMPLEMENTATION

### Option A: MongoDB / Mongoose (Atomic `findOneAndUpdate`)

Using atomic `findOneAndUpdate` with a condition on `status` prevents any database race conditions without complex locks:

```javascript
// PUT /api/orders/:id/accept
exports.acceptOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user?.id || req.body.driverId;
    const driverName = req.user?.name || req.body.driverName;

    // ATOMIC UPDATE: Only updates if status is currently 'pending' or 'searching'
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ['pending', 'searching', 'created', 'broadcasted'] }
      },
      {
        $set: {
          status: 'accepted',
          driverId: driverId,
          driverName: driverName,
          acceptedAt: new Date()
        }
      },
      { new: true } // Return the updated document
    );

    // If no document matched, it means another driver already accepted it!
    if (!updatedOrder) {
      const existingOrder = await Order.findById(id).lean();
      
      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.'
        });
      }

      // Check if this same driver already accepted it previously
      if (String(existingOrder.driverId) === String(driverId)) {
        return res.status(200).json({
          success: true,
          message: 'You have already accepted this order.',
          order: existingOrder
        });
      }

      return res.status(409).json({
        success: false,
        message: 'This order has already been accepted by another driver partner.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Order accepted successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Error in acceptOrder:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
```

---

### Option B: SQL / PostgreSQL / MySQL (Row-Level Locking Transaction)

```javascript
// Using Sequelize / Knex / Raw SQL with row-level transaction
exports.acceptOrderSQL = async (req, res) => {
  const { id } = req.params;
  const driverId = req.user?.id || req.body.driverId;

  const t = await sequelize.transaction();

  try {
    // Lock row for update
    const order = await Order.findOne({
      where: { id },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending' && order.status !== 'searching') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'This order has already been accepted by another driver partner.'
      });
    }

    order.status = 'accepted';
    order.driverId = driverId;
    order.acceptedAt = new Date();
    await order.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: 'Order accepted successfully',
      order
    });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
```

---

## 4. DRIVER APP FRONTEND BEHAVIOR (ALREADY IMPLEMENTED)

The Driver Mobile App already has the following complete error handling active:

1. When `HTTP 409` or `{ success: false }` is returned:
   - The siren alarm sound is immediately stopped.
   - A modal alert is shown: `"Order Already Claimed: This order has already been accepted by another driver."`
   - The popup closes and the driver is returned to the dashboard to receive the next order without any app freezing.

---

## 5. BACKEND VERIFICATION CHECKLIST

- [ ] 1. Ensure `PUT /api/orders/:id/accept` uses atomic status filtering (`$in: ['pending', 'searching']`).
- [ ] 2. Test concurrent requests: Send two simultaneous requests for the same `orderId` using different `driverId` tokens.
- [ ] 3. Verify that the 1st request gets `HTTP 200 OK` and the 2nd request gets `HTTP 409 Conflict`.
