import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '../../theme/colors';
import { getAllOrders, AdminOrder } from '../../services/api';

type FilterStatus = 'all' | 'active' | 'completed' | 'pending' | 'cancelled';

const statusColor: Record<string, string> = {
  active: Colors.primary,
  completed: Colors.success,
  pending: Colors.warning,
  cancelled: Colors.error,
};

const OrderManagementScreen = () => {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllOrders();
      setOrders(list);
    } catch (e) {
      console.warn('Failed to load orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts: Record<FilterStatus, number> = {
    all: orders.length,
    active: orders.filter(o => o.status === 'active').length,
    completed: orders.filter(o => o.status === 'completed').length,
    pending: orders.filter(o => o.status === 'pending').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const formatTime = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  const renderVehicleIcon = (type?: string) => {
    if (!type) return null;
    const t = type.toLowerCase();
    if (t.includes('bike') || t.includes('scooter'))
      return <MaterialCommunityIcons name="bike" size={18} color={Colors.primary} />;
    if (t.includes('auto'))
      return <MaterialCommunityIcons name="rickshaw" size={18} color={Colors.info} />;
    if (t.includes('truck') || t.includes('tata') || t.includes('mini'))
      return <MaterialCommunityIcons name="truck-delivery" size={18} color={Colors.warning} />;
    return null;
  };

  const renderOrder = ({ item }: { item: AdminOrder }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderIdRow}>
          <Text style={styles.orderId}>#{item.id}</Text>
          {renderVehicleIcon(item.vehicleType)}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor[item.status] || Colors.gray}22` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor[item.status] || Colors.gray }]} />
          <Text style={[styles.statusText, { color: statusColor[item.status] || Colors.gray }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={styles.routeSection}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.pickupAddress || item.pickup || '—'}
          </Text>
        </View>
        <View style={[styles.routeConnector, { marginLeft: 6 }]} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: Colors.error }]} />
          <Text style={styles.routeText} numberOfLines={1}>
            {item.dropAddress || item.drop || '—'}
          </Text>
        </View>
      </View>

      <View style={styles.orderMeta}>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>CUSTOMER</Text>
          <Text style={styles.metaValue} numberOfLines={1}>{item.customerName || '—'}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>DRIVER</Text>
          <Text style={styles.metaValue} numberOfLines={1}>{item.driverName || 'Unassigned'}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>FARE</Text>
          <Text style={[styles.metaValue, { color: Colors.success }]}>
            {item.amount ? `₹${item.amount}` : '—'}
          </Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>TIME</Text>
          <Text style={styles.metaValue}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Order Management</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={fetchOrders}>
          <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {(['all', 'active', 'pending', 'completed', 'cancelled'] as FilterStatus[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && { backgroundColor: statusColor[f] || Colors.primary, borderColor: statusColor[f] || Colors.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Loading orders...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
            No {filter === 'all' ? '' : filter} orders found
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderOrder}
          ListFooterComponent={<View style={{ height: 20 }} />}
          onRefresh={fetchOrders}
          refreshing={loading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white },
  exportBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)' },
  filterScroll: { maxHeight: 50, marginBottom: 16 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  filterText: { color: Colors.gray, fontWeight: '600', fontSize: 12 },
  filterTextActive: { color: Colors.white },
  list: { paddingHorizontal: 20, gap: 14 },
  orderCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: 16, fontWeight: '800', color: Colors.white },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  routeSection: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 14 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { fontSize: 13, color: Colors.white, fontWeight: '500', flex: 1 },
  routeConnector: { width: 2, height: 10, backgroundColor: Colors.border, marginVertical: 3 },
  orderMeta: { flexDirection: 'row', marginBottom: 6 },
  metaCol: { flex: 1, gap: 3 },
  metaLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  metaValue: { fontSize: 12, color: Colors.white, fontWeight: '600' },
});

export default OrderManagementScreen;
