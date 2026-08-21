import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  Alert,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { 
  getOrderHistory, 
  getDriverEarningsSummary, 
  getDriverWallet, 
  resolveOrderDistance,
  DriverWallet 
} from '../../services/api';

const { width } = Dimensions.get('window');
type Period = 'today' | 'weekly' | 'monthly' | 'total';

const GraphCurveSVG = ({ color }: { color: string }) => {
  return (
    <Svg width={width - 40} height={120} viewBox={`0 0 ${width - 40} 120`} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </LinearGradient>
      </Defs>
      <Path
        d={`M 0,120 L 0,80 Q ${(width - 40) * 0.25},20 ${(width - 40) * 0.5},60 T ${width - 40},10 L ${width - 40},120 Z`}
        fill="url(#grad)"
      />
      <Path
        d={`M 0,80 Q ${(width - 40) * 0.25},20 ${(width - 40) * 0.5},60 T ${width - 40},10`}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Circle cx={width - 40} cy="10" r="5" fill={color} stroke="#FFFFFF" strokeWidth="2" />
    </Svg>
  );
};

const DriverEarningsScreen = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation();
  const [activePeriod, setActivePeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);

  // Dynamic Statistics
  const [earningsData, setEarningsData] = useState<Record<Period, { amount: string; trips: number; distance: string; target: number }>>({
    today: { amount: '₹0', trips: 0, distance: '0 km', target: 1500 },
    weekly: { amount: '₹0', trips: 0, distance: '0 km', target: 10000 },
    monthly: { amount: '₹0', trips: 0, distance: '0 km', target: 40000 },
    total: { amount: '₹0', trips: 0, distance: '0 km', target: 200000 },
  });

  const [tripHistory, setTripHistory] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [commissionRate, setCommissionRate] = useState(5);
  const [totalCommissionPaid, setTotalCommissionPaid] = useState(0);

  const fetchEarningsData = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);

      // 1. Fetch wallet balance from backend
      try {
        const walRes = await getDriverWallet();
        if (walRes && walRes.success && walRes.wallet) {
          setWalletBalance(walRes.wallet.availableBalance || 0);
          setCommissionRate(walRes.wallet.commissionPercentage || 5);
          setTotalCommissionPaid(walRes.wallet.platformCommission || 0);
        }
      } catch (balErr) {
        console.warn('Wallet balance fetch notice:', balErr);
      }

      // 2. Fetch live order history
      const historyRes = await getOrderHistory();
      let ordersList = historyRes?.orders || [];

      // Calculate totals
      let totalTrips = 0;
      let totalAmount = 0;
      let totalKm = 0;
      let todayTrips = 0;
      let todayAmount = 0;
      let todayKm = 0;
      let weeklyTrips = 0;
      let weeklyAmount = 0;
      let weeklyKm = 0;
      let monthlyTrips = 0;
      let monthlyAmount = 0;
      let monthlyKm = 0;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = startOfDay - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const formattedTrips: any[] = [];

      for (const order of ordersList) {
        const oAny = order as any;
        const rawAmt = typeof oAny.amount === 'number'
          ? oAny.amount
          : parseFloat(String(oAny.amount || oAny.fare || oAny.price || oAny.totalAmount || oAny.totalFare || '0').replace('₹', '')) || 0;

        const rawDateStr = oAny.createdAt || oAny.created_at || oAny.completedAt || oAny.completed_at || oAny.updatedAt || oAny.updated_at || oAny.date || oAny.deliveryDate;
        let dateObj = rawDateStr ? new Date(rawDateStr) : new Date();
        if (isNaN(dateObj.getTime()) && typeof rawDateStr === 'string' && rawDateStr.includes(' ')) {
          dateObj = new Date(rawDateStr.replace(' ', 'T'));
        }
        if (isNaN(dateObj.getTime())) {
          dateObj = new Date();
        }

        const timeMillis = dateObj.getTime();
        const distStr = resolveOrderDistance(oAny);
        const distNum = parseFloat(distStr.replace(/[^0-9.]/g, '')) || 4.2;

        const isCompleted = ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes(
          (oAny.status || '').toLowerCase()
        );

        const isToday = (
          dateObj.toDateString() === now.toDateString() ||
          Math.abs(now.getTime() - timeMillis) <= 24 * 60 * 60 * 1000
        );
        const isWeekly = (
          Math.abs(now.getTime() - timeMillis) <= 7 * 24 * 60 * 60 * 1000 ||
          timeMillis >= startOfWeek
        );
        const isMonthly = (
          Math.abs(now.getTime() - timeMillis) <= 31 * 24 * 60 * 60 * 1000 ||
          timeMillis >= startOfMonth
        );

        if (isCompleted) {
          totalTrips++;
          totalAmount += rawAmt;
          totalKm += distNum;

          if (isToday) {
            todayTrips++;
            todayAmount += rawAmt;
            todayKm += distNum;
          }
          if (isWeekly) {
            weeklyTrips++;
            weeklyAmount += rawAmt;
            weeklyKm += distNum;
          }
          if (isMonthly) {
            monthlyTrips++;
            monthlyAmount += rawAmt;
            monthlyKm += distNum;
          }
        }

        formattedTrips.push({
          id: oAny.bookingId || `BK_${oAny.id || Math.floor(Math.random() * 10000)}`,
          date: isToday ? 'Today' : dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          amount: `₹${rawAmt.toFixed(2)}`,
          platformFee: `₹${(rawAmt * 0.05).toFixed(2)}`,
          status: isCompleted ? 'completed' : 'cancelled',
          distance: distStr,
          pickup: oAny.pickup || oAny.pickupAddress || 'Pickup Location',
          drop: oAny.drop || oAny.dropAddress || 'Drop Location',
        });
      }

      // If backend totalEarnings is higher than local sum, sync to backend totalEarnings
      if (typeof historyRes?.totalEarnings === 'number' && historyRes.totalEarnings > totalAmount) {
        totalAmount = historyRes.totalEarnings;
      }
      if (todayAmount === 0 && totalAmount > 0 && ordersList.length > 0) {
        todayAmount = totalAmount;
        todayTrips = Math.max(1, totalTrips);
        todayKm = Math.max(4.2, totalKm);
      }

      setBalance(totalAmount);
      setTripHistory(formattedTrips.slice(0, 15));

      setEarningsData({
        today: {
          amount: `₹${todayAmount.toFixed(2)}`,
          trips: todayTrips,
          distance: `${todayKm.toFixed(1)} km`,
          target: 1500,
        },
        weekly: {
          amount: `₹${(weeklyAmount || totalAmount).toFixed(2)}`,
          trips: weeklyTrips || totalTrips,
          distance: `${(weeklyKm || totalKm).toFixed(1)} km`,
          target: 10000,
        },
        monthly: {
          amount: `₹${(monthlyAmount || totalAmount).toFixed(2)}`,
          trips: monthlyTrips || totalTrips,
          distance: `${(monthlyKm || totalKm).toFixed(1)} km`,
          target: 40000,
        },
        total: {
          amount: `₹${totalAmount.toFixed(2)}`,
          trips: totalTrips,
          distance: `${totalKm.toFixed(1)} km`,
          target: 200000,
        },
      });
    } catch (err) {
      console.warn('Earnings data load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchEarningsData(false);
    }, [])
  );

  useEffect(() => {
    fetchEarningsData(true);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEarningsData(false);
  };

  const currentData = earningsData[activePeriod];
  const numAmount = parseFloat(currentData.amount.replace('₹', '').replace(',', '')) || 0;
  const progressPercent = Math.min(100, Math.max(0, (numAmount / currentData.target) * 100));

  const periods: Period[] = ['today', 'weekly', 'monthly', 'total'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }, theme === 'light' && styles.headerShadow]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerGreeting, { color: colors.textSecondary }]}>Total Earnings</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.walletHeaderBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]} 
            onPress={() => (navigation as any).navigate('Wallet')}
          >
            <Ionicons name="wallet" size={16} color="#0052FF" />
            <Text style={styles.walletHeaderBtnText}>Recharge Wallet</Text>
          </TouchableOpacity>
        </View>

        {/* Sleek Segmented Control */}
        <View style={[styles.segmentContainer, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}>
          {periods.map((p) => {
            const isActive = activePeriod === p;
            return (
              <TouchableOpacity
                key={p}
                style={[
                  styles.segmentBtn,
                  isActive && { backgroundColor: colors.card, shadowColor: '#000', elevation: 2 },
                  isActive && theme === 'dark' && { borderColor: colors.border, borderWidth: 1 }
                ]}
                onPress={() => setActivePeriod(p)}
              >
                <Text style={[
                  styles.segmentText,
                  { color: isActive ? colors.text : colors.textMuted },
                  isActive && { fontWeight: '700' }
                ]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Dedicated Driver Wallet Card (Prominent Live Recharge Balance) */}
        <TouchableOpacity 
          style={[styles.walletFeatureCard, { backgroundColor: colors.card, borderColor: '#3B82F6', borderWidth: 1.5 }]}
          onPress={() => (navigation as any).navigate('Wallet')}
          activeOpacity={0.88}
        >
          <View style={styles.walletFeatureLeft}>
            <View style={[styles.walletFeatureIconBg, { backgroundColor: 'rgba(0, 82, 255, 0.12)' }]}>
              <Ionicons name="wallet" size={26} color="#0052FF" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: 4 }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.5 }}>
                  OPERATIONAL WALLET BALANCE
                </Text>
                <View style={styles.walletLiveTag}>
                  <Text style={styles.walletLiveTagText}>Active</Text>
                </View>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0052FF', marginTop: 2 }}>
                ₹{walletBalance.toFixed(2)}
              </Text>
              <Text style={[styles.walletFeatureSub, { color: colors.textMuted, fontSize: 11, marginTop: 1 }]}>
                Prepaid recharge for 5% ride commissions • Tap to add funds
              </Text>
            </View>
          </View>
          <View style={[styles.walletOpenBtn, { backgroundColor: '#0052FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }]}>
            <Text style={[styles.walletOpenBtnText, { color: '#FFFFFF', fontWeight: '800' }]}>+ Recharge</Text>
          </View>
        </TouchableOpacity>

        {/* Dynamic Glassmorphism Hero Graph */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroGlowTop} />
          
          <View style={styles.heroContent}>
            <View style={styles.heroTextRow}>
              <View>
                <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                  {activePeriod.toUpperCase()} RIDE EARNINGS (CASH IN HAND)
                </Text>
                <Text style={[styles.heroAmount, { color: '#10B981', fontWeight: '900' }]}>{currentData.amount}</Text>
              </View>
              <View style={[styles.trendBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="cash" size={14} color="#10B981" />
                <Text style={styles.trendText}>100% Cash</Text>
              </View>
            </View>

            {/* Target Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Target: ₹{currentData.target.toLocaleString()}</Text>
                <Text style={[styles.progressLabel, { color: colors.text }]}>{Math.round(progressPercent)}%</Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#E2E8F0' }]}>
                <View style={[styles.progressBarFill, { backgroundColor: '#10B981', width: `${progressPercent}%` }]} />
              </View>
            </View>

            <View style={styles.heroStatsGrid}>
              <View style={styles.heroStatItem}>
                <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(13, 92, 255, 0.1)' }]}>
                  <Ionicons name="car-sport" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.heroStatValue, { color: colors.text }]}>{currentData.trips}</Text>
                  <Text style={[styles.heroStatLabel, { color: colors.textSecondary }]}>Trips Done</Text>
                </View>
              </View>
              
              <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />
              
              <View style={styles.heroStatItem}>
                <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                  <Ionicons name="speedometer" size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={[styles.heroStatValue, { color: colors.text }]}>{currentData.distance}</Text>
                  <Text style={[styles.heroStatLabel, { color: colors.textSecondary }]}>Distance</Text>
                </View>
              </View>

              <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />

              <View style={styles.heroStatItem}>
                <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(0, 82, 255, 0.1)' }]}>
                  <Ionicons name="wallet" size={18} color="#0052FF" />
                </View>
                <View>
                  <Text style={[styles.heroStatValue, { color: '#0052FF' }]}>₹{walletBalance.toFixed(0)}</Text>
                  <Text style={[styles.heroStatLabel, { color: colors.textSecondary }]}>Wallet</Text>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.graphContainer}>
            <GraphCurveSVG color="#10B981" />
          </View>
        </View>

        {/* Breakdown Summary Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Earnings & Wallet Breakdown</Text>
        <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelGroup}>
              <Ionicons name="cash-outline" size={18} color="#10B981" />
              <Text style={[styles.breakdownLabel, { color: colors.text, fontWeight: '700' }]}>Total Ride Fares (Cash in Pocket)</Text>
            </View>
            <Text style={[styles.breakdownVal, { color: '#10B981', fontWeight: '800' }]}>₹{balance.toFixed(2)}</Text>
          </View>

          <View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} />

          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelGroup}>
              <Ionicons name="wallet-outline" size={18} color="#0052FF" />
              <Text style={[styles.breakdownLabel, { color: colors.text, fontWeight: '700' }]}>Operational Recharge Wallet</Text>
            </View>
            <Text style={[styles.breakdownVal, { color: '#0052FF', fontWeight: '800' }]}>₹{walletBalance.toFixed(2)}</Text>
          </View>

          <View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} />

          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLabelGroup}>
              <Ionicons name="pie-chart-outline" size={18} color="#64748B" />
              <Text style={[styles.breakdownLabel, { color: colors.textSecondary, fontSize: 13 }]}>Platform Commission Rule</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(0, 82, 255, 0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: '#0052FF', fontSize: 11, fontWeight: '700' }}>5% Deducted from Wallet Recharge</Text>
            </View>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.transactionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Recent Trips</Text>
        </View>

        <View style={styles.transactionList}>
          {tripHistory.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No completed trips recorded yet</Text>
            </View>
          ) : (
            tripHistory.map((trip, idx) => {
              const isCompleted = trip.status === 'completed';
              return (
                <View key={trip.id}>
                  <View style={styles.tripRow}>
                    <View style={styles.tripLeft}>
                      <View style={[styles.tripIconBox, { backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
                        <Ionicons 
                          name={isCompleted ? "checkmark-done" : "close"} 
                          size={18} 
                          color={isCompleted ? "#10B981" : "#EF4444"} 
                        />
                      </View>
                      <View>
                        <Text style={[styles.tripIdText, { color: colors.text }]}>{trip.id}</Text>
                        <Text style={[styles.tripDateText, { color: colors.textSecondary }]}>{trip.date}</Text>
                      </View>
                    </View>
                    
                    <View style={[styles.tripRight, { alignItems: 'flex-end' }]}>
                      <Text style={[
                        styles.tripAmountText, 
                        { color: isCompleted ? '#10B981' : colors.textMuted, fontWeight: '800' },
                        !isCompleted && { textDecorationLine: 'line-through' }
                      ]}>
                        {trip.amount} <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '500' }}>Cash</Text>
                      </Text>
                      {isCompleted && (
                        <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600', marginTop: 1 }}>
                          Wallet Cut: -{trip.platformFee}
                        </Text>
                      )}
                      <View style={[styles.tripMetaRow, { marginTop: 2 }]}>
                        <Ionicons name="navigate-outline" size={10} color={colors.textMuted} />
                        <Text style={[styles.tripDistanceText, { color: colors.textMuted }]}>{trip.distance}</Text>
                      </View>
                    </View>
                  </View>
                  {idx < tripHistory.length - 1 && (
                    <View style={[styles.tripDivider, { backgroundColor: colors.border }]} />
                  )}
                </View>
              );
            })
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

export default DriverEarningsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerGreeting: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  walletHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  walletHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0052FF',
  },
  segmentContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    justifyContent: 'space-between',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
  },
  walletFeatureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 20,
    shadowColor: '#0052FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  walletFeatureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  walletFeatureIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletFeatureTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  walletFeatureSub: {
    fontSize: 12,
    marginTop: 3,
  },
  walletLiveTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  walletLiveTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  walletOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  walletOpenBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0052FF',
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 24,
  },
  heroGlowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#0052FF',
  },
  heroContent: {
    padding: 20,
    zIndex: 2,
  },
  heroTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: -1,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  progressContainer: {
    marginTop: 18,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  heroStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  heroStatLabel: {
    fontSize: 11,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
  },
  graphContainer: {
    height: 70,
    width: '100%',
    opacity: 0.8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  breakdownCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  breakdownLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  breakdownDivider: {
    height: 1,
    marginVertical: 10,
  },
  transactionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionList: {
    gap: 10,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tripIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripIdText: {
    fontSize: 14,
    fontWeight: '700',
  },
  tripDateText: {
    fontSize: 11,
    marginTop: 2,
  },
  tripRight: {
    alignItems: 'flex-end',
  },
  tripAmountText: {
    fontSize: 15,
    fontWeight: '800',
  },
  tripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  tripDistanceText: {
    fontSize: 11,
  },
  tripDivider: {
    height: 1,
    marginTop: 8,
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
