import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { formatAddressString } from '../utils/urlHelpers';

interface OrderItem {
  id?: string | number;
  bookingId?: string;
  orderId?: string | number;
  serviceName?: string;
  vehicleType?: string;
  pickup?: string;
  pickupAddress?: string;
  drop?: string;
  dropAddress?: string;
  fare?: number;
  amount?: number;
  offeredFare?: number;
  distanceKm?: number;
  pickupDistanceKm?: number;
  [key: string]: any;
}

interface AvailableOrdersFeedProps {
  orders: OrderItem[];
  onAccept: (bookingId: string, order: OrderItem) => Promise<any>;
  onReject: (bookingId: string) => Promise<void>;
}

export const AvailableOrdersFeed: React.FC<AvailableOrdersFeedProps> = ({
  orders,
  onAccept,
  onReject,
}) => {
  const { colors } = useTheme();
  // Distinct loading states for Accept vs Reject actions
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [rejectingIds, setRejectingIds] = useState<Set<string>>(new Set());

  const setAccepting = (id: string, val: boolean) =>
    setAcceptingIds((prev) => {
      const s = new Set(prev);
      val ? s.add(id) : s.delete(id);
      return s;
    });

  const setRejecting = (id: string, val: boolean) =>
    setRejectingIds((prev) => {
      const s = new Set(prev);
      val ? s.add(id) : s.delete(id);
      return s;
    });

  const isAccepting = (id: string) => acceptingIds.has(id);
  const isRejecting = (id: string) => rejectingIds.has(id);

  if (!orders || orders.length === 0) return null;

  const handleAcceptPress = async (order: OrderItem) => {
    const rawId = String(order.bookingId || order.orderId || order.id || '').replace(/^#+/, '');
    if (!rawId || acceptingIds.has(rawId) || rejectingIds.has(rawId)) return;

    setAccepting(rawId, true);
    try {
      await onAccept(rawId, order);
    } finally {
      setAccepting(rawId, false);
    }
  };

  const handleRejectPress = async (order: OrderItem) => {
    const rawId = String(order.bookingId || order.orderId || order.id || '').replace(/^#+/, '');
    if (!rawId || acceptingIds.has(rawId) || rejectingIds.has(rawId)) return;

    setRejecting(rawId, true);
    try {
      await onReject(rawId);
    } finally {
      setRejecting(rawId, false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithBadge}>
          <View style={[styles.pulseDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Available Orders ({orders.length})
          </Text>
        </View>
        <Text style={[styles.sortedNotice, { color: colors.textSecondary }]}>
          Sorted by nearest pickup
        </Text>
      </View>

      <View style={styles.listContainer}>
        {orders.map((item, index) => {
          const bookingId = String(item.bookingId || item.orderId || item.id || `order-${index}`).replace(/^#+/, '');
          const fareVal = item.offeredFare ?? item.fare ?? item.amount ?? 0;
          const service = item.serviceName || item.vehicleType || item.vehicleLabel || 'Standard Delivery';
          const pickupDist = item.pickupDistanceKm !== undefined ? Number(item.pickupDistanceKm) : null;
          const tripDist = item.distanceKm !== undefined ? Number(item.distanceKm) : null;
          const pickupAddr = formatAddressString(item.pickupAddress || item.pickup, 'Pickup Address');
          const dropAddr = formatAddressString(item.dropAddress || item.drop, 'Drop Address');
          const isAcceptingThis = isAccepting(bookingId);
          const isRejectingThis = isRejecting(bookingId);

          return (
            <View
              key={bookingId}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: index === 0 ? colors.primary : colors.border,
                  borderWidth: index === 0 ? 1.5 : 1,
                },
              ]}
            >
              {/* Card Header: Service badge, pickup distance, fare */}
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <View style={[styles.serviceBadge, { backgroundColor: `${colors.primary}15` }]}>
                    <MaterialCommunityIcons name="truck-fast-outline" size={14} color={colors.primary} />
                    <Text style={[styles.serviceText, { color: colors.primary }]}>{service}</Text>
                  </View>

                  {pickupDist !== null && (
                    <View style={[styles.distancePill, { backgroundColor: `${colors.success}15` }]}>
                      <Ionicons name="navigate" size={11} color={colors.success} />
                      <Text style={[styles.distanceText, { color: colors.success }]}>
                        {pickupDist.toFixed(1)} km to pickup
                      </Text>
                    </View>
                  )}

                  {tripDist !== null && tripDist > 0 && (
                    <View style={[styles.distancePill, { backgroundColor: `${colors.primary}15` }]}>
                      <Ionicons name="map-outline" size={11} color={colors.primary} />
                      <Text style={[styles.distanceText, { color: colors.primary }]}>
                        Trip {tripDist.toFixed(1)} km
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.fareContainer}>
                  <Text style={[styles.fareAmount, { color: colors.text }]}>₹{fareVal}</Text>
                </View>
              </View>

              {/* Route Details */}
              <View style={styles.routeSection}>
                {/* Pickup Row */}
                <View style={styles.locationRow}>
                  <View style={[styles.pinDot, { backgroundColor: colors.success }]} />
                  <View style={styles.addressWrapper}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>PICKUP</Text>
                    <Text style={[styles.addressText, { color: colors.text }]} numberOfLines={1}>
                      {pickupAddr}
                    </Text>
                  </View>
                </View>

                {/* Connector Line */}
                <View style={styles.connectorContainer}>
                  <View style={[styles.connectorLine, { backgroundColor: colors.border }]} />
                  {tripDist !== null && (
                    <Text style={[styles.tripDistText, { color: colors.textSecondary }]}>
                      {tripDist.toFixed(1)} km trip
                    </Text>
                  )}
                </View>

                {/* Drop Row */}
                <View style={styles.locationRow}>
                  <View style={[styles.pinDot, { backgroundColor: colors.error || '#EF4444' }]} />
                  <View style={styles.addressWrapper}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>DROP</Text>
                    <Text style={[styles.addressText, { color: colors.text }]} numberOfLines={1}>
                      {dropAddr}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons: Decline / Accept */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.declineBtn, { borderColor: colors.border }]}
                  onPress={() => handleRejectPress(item)}
                  disabled={isAcceptingThis || isRejectingThis}
                  activeOpacity={0.7}
                >
                  {isRejectingThis ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Text style={[styles.declineText, { color: colors.textSecondary }]}>Decline</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleAcceptPress(item)}
                  disabled={isAcceptingThis || isRejectingThis}
                  activeOpacity={0.8}
                >
                  {isAcceptingThis ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.acceptText}>Accept Order</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sortedNotice: {
    fontSize: 11,
    fontWeight: '500',
  },
  listContainer: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  serviceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fareContainer: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  routeSection: {
    paddingVertical: 6,
    marginBottom: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  addressWrapper: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  addressText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  connectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginVertical: 4,
    gap: 10,
  },
  connectorLine: {
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  tripDistText: {
    fontSize: 10,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
