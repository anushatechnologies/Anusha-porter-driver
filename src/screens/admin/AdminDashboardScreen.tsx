import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '../../theme/colors';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { getAdminMetrics, getAllOrders, getAdminNotifications, AdminMetrics } from '../../services/api';
import { Modal, FlatList } from 'react-native';

const AdminDashboardScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      const loadAdminData = async () => {
        try {
          const [data, ordersList, notifs] = await Promise.all([
            getAdminMetrics(),
            getAllOrders(),
            getAdminNotifications()
          ]);
          if (!isMounted) return;
          if (data) setMetrics(data);
          if (Array.isArray(notifs)) setAdminNotifications(notifs);
          if (Array.isArray(ordersList)) {
            const mappedRecent = ordersList.slice(0, 5).map((o: any) => {
              let formattedTime = 'Today';
              try {
                if (o.createdAt) {
                  formattedTime = new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
              } catch (e) {}
              const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
              return {
                id: o.bookingId || `#BK_${o.id}`,
                customer: o.customerName || 'Customer',
                driver: o.driverName || 'Driver Partner',
                amount: `₹${amt}`,
                status: (o.status || 'pending').toLowerCase(),
                time: formattedTime,
              };
            });
            setRecentOrders(mappedRecent);
          }
        } catch (e) {
          console.warn('Failed to load admin metrics:', e);
        }
      };
      loadAdminData();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const cards = [
    { label: 'Total Orders', value: metrics?.totalOrdersToday ? metrics.totalOrdersToday.toLocaleString() : '0', icon: 'package-variant-closed', iconType: 'MaterialCommunityIcons', color: Colors.primary, change: '', trend: 'up' },
    { label: 'Active Orders', value: metrics?.activeOrders !== undefined ? metrics.activeOrders.toString() : '0', icon: 'flash-outline', iconType: 'Ionicons', color: Colors.success, change: '', trend: 'up' },
    { label: 'Total Drivers', value: metrics?.totalDrivers !== undefined ? metrics.totalDrivers.toString() : '0', icon: 'bike', iconType: 'MaterialCommunityIcons', color: Colors.info, change: '', trend: 'up' },
    { label: 'Revenue', value: metrics?.revenueToday ? `₹${metrics.revenueToday.toLocaleString()}` : '₹0', icon: 'cash-outline', iconType: 'Ionicons', color: Colors.warning, change: '', trend: 'up' },
    { label: 'Pending KYC', value: metrics?.pendingKyc !== undefined ? metrics.pendingKyc.toString() : '0', icon: 'clock-outline', iconType: 'MaterialCommunityIcons', color: Colors.error, change: 'Action', trend: 'down' },
    { label: 'Avg. Rating', value: metrics?.avgRating !== undefined ? `${metrics.avgRating.toFixed(1)}★` : '—', icon: 'star', iconType: 'Ionicons', color: '#FFD700', change: '', trend: 'up' },
  ];

  const statusColor: Record<string, string> = {
    active: Colors.primary,
    completed: Colors.success,
    pending: Colors.warning,
    cancelled: Colors.error,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Admin Panel</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowNotifModal(true)}>
            <Ionicons name="notifications-outline" size={22} color={Colors.white} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
          <View style={styles.adminAvatar}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.info} />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Live Stats */}
        <View style={styles.liveBanner}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live • System Status: Operational</Text>
          <Text style={styles.liveTime}>Updated just now</Text>
        </View>

        {/* Cards Grid */}
        <View style={styles.cardsGrid}>
          {cards.map(card => (
            <TouchableOpacity
              key={card.label}
              style={styles.dashCard}
              activeOpacity={0.8}
              onPress={() => {
                if (card.label === 'Total Drivers' || card.label === 'Pending KYC') {
                  navigation.navigate('DriverManagement');
                } else if (card.label === 'Total Orders' || card.label === 'Active Orders') {
                  navigation.navigate('OrderManagement');
                } else if (card.label === 'Revenue') {
                  navigation.navigate('PaymentManagement');
                }
              }}
            >
              <View style={styles.cardTop}>
                {card.iconType === 'Ionicons' ? (
                  <Ionicons name={card.icon as any} size={24} color={card.color} />
                ) : (
                  <MaterialCommunityIcons name={card.icon as any} size={24} color={card.color} />
                )}
                <View style={[
                  styles.changeBadge,
                  { backgroundColor: card.trend === 'up' ? 'rgba(0,200,150,0.2)' : 'rgba(255,71,87,0.2)' },
                ]}>
                  <Ionicons
                    name={card.trend === 'up' ? 'trending-up' : 'trending-down'}
                    size={10}
                    color={card.trend === 'up' ? Colors.success : Colors.error}
                  />
                  <Text style={[
                    styles.changeText,
                    { color: card.trend === 'up' ? Colors.success : Colors.error },
                  ]}>
                    {card.change}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text>
              <Text style={styles.cardLabel}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue Chart Placeholder */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Revenue Overview</Text>
            <View style={styles.chartPeriod}>
              <Text style={styles.chartPeriodText}>Monthly</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.gray} />
            </View>
          </View>
          <View style={styles.chartArea}>
            {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
              <View key={i} style={styles.chartBarCol}>
                <View style={[styles.chartBar, { height: `${h}%`, backgroundColor: i === 11 ? Colors.primary : Colors.surface }]} />
              </View>
            ))}
          </View>
          <View style={styles.chartMonths}>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
              <Text key={m} style={styles.chartMonth}>{m}</Text>
            ))}
          </View>
        </View>

        {/* Recent Orders */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {recentOrders.map(order => (
            <View key={order.id} style={styles.orderRow}>
              <View style={styles.orderLeft}>
                <View style={[styles.orderStatusDot, { backgroundColor: statusColor[order.status] }]} />
                <View>
                  <View style={styles.orderTopRow}>
                    <Text style={styles.orderId}>{order.id}</Text>
                    <Text style={styles.orderTime}>{order.time}</Text>
                  </View>
                  <Text style={styles.orderCustomer}>{order.customer}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.orderDriver}>{order.driver}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderAmount}>{order.amount}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor[order.status]}22` }]}>
                  <Text style={[styles.statusText, { color: statusColor[order.status] }]}>
                    {order.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {[
              { icon: 'people-outline', route: 'DriverManagement', label: 'Drivers', color: Colors.primary },
              { icon: 'package-variant-closed', route: 'OrderManagement', label: 'Orders', color: Colors.info },
              { icon: 'cash-outline', route: 'PaymentManagement', label: 'Payments', color: Colors.success },
              { icon: 'person-outline', route: 'UserManagement', label: 'Users', color: Colors.warning },
              { icon: 'bar-chart-outline', route: 'Analytics', label: 'Analytics', color: Colors.error },
            ].map(action => (
              <TouchableOpacity key={action.label} style={styles.actionCard} onPress={() => navigation.navigate(action.route as any)}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Admin Notifications Modal */}
      <Modal visible={showNotifModal} animationType="slide" transparent onRequestClose={() => setShowNotifModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications" size={24} color={Colors.primary} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.white }}>System Notifications</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotifModal(false)}>
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={adminNotifications}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: Colors.surface, padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: Colors.white }}>{item.title}</Text>
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 16 }}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={40} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, marginTop: 8 }}>No notifications yet</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  adminAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(52,152,219,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.info,
  },
  adminAvatarText: {
    fontSize: 20,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,200,150,0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.3)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    flex: 1,
    fontSize: 13,
    color: Colors.success,
    fontWeight: '600',
  },
  liveTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dashCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIcon: {
    fontSize: 24,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  chartPeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartPeriodText: {
    fontSize: 13,
    color: Colors.gray,
  },
  chartArea: {
    flexDirection: 'row',
    height: 80,
    alignItems: 'flex-end',
    gap: 3,
  },
  chartBarCol: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '80%',
    borderRadius: 3,
    minHeight: 4,
  },
  chartMonths: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 3,
  },
  chartMonth: {
    flex: 1,
    fontSize: 8,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  seeAll: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  orderStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  orderTopRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  orderTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  orderCustomer: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  orderDriver: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  orderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  quickActions: {
    gap: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default AdminDashboardScreen;
