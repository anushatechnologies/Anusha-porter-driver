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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { getOrderHistory, getDriverEarningsSummary, requestDriverPayout, getDriverBalance, getDriverPayoutAccount } from '../../services/api';

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

  // Bank Info State - loaded from driverProfile in AsyncStorage
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');

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

  // Segregated Balance Buckets & Payout Eligibility
  const [balanceData, setBalanceData] = useState<{
    availableBalance: number;
    pendingBalance: number;
    processingBalance: number;
    paidBalance: number;
    minPayoutAmount: number;
    isPayoutEligible: boolean;
    needsMoreForPayout: number;
    hasVerifiedAccount: boolean;
  }>({
    availableBalance: 0,
    pendingBalance: 0,
    processingBalance: 0,
    paidBalance: 0,
    minPayoutAmount: 100,
    isPayoutEligible: false,
    needsMoreForPayout: 100,
    hasVerifiedAccount: true,
  });

  const fetchEarningsAndBank = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      
      // 1. Fetch live balance buckets from GET /api/drivers/me/balance
      try {
        const balRes = await getDriverBalance();
        if (balRes && balRes.success) {
          setBalanceData({
            availableBalance: typeof balRes.availableBalance === 'number' ? balRes.availableBalance : 0,
            pendingBalance: typeof balRes.pendingBalance === 'number' ? balRes.pendingBalance : 0,
            processingBalance: typeof balRes.processingBalance === 'number' ? balRes.processingBalance : 0,
            paidBalance: typeof balRes.paidBalance === 'number' ? balRes.paidBalance : 0,
            minPayoutAmount: typeof balRes.minPayoutAmount === 'number' ? balRes.minPayoutAmount : 100,
            isPayoutEligible: balRes.isPayoutEligible !== undefined ? balRes.isPayoutEligible : true,
            needsMoreForPayout: typeof balRes.needsMoreForPayout === 'number' ? balRes.needsMoreForPayout : 0,
            hasVerifiedAccount: balRes.hasVerifiedAccount !== undefined ? balRes.hasVerifiedAccount : true,
          });
          setBalance(balRes.availableBalance || 0);
        }
      } catch (balErr) {
        console.warn('Live balance bucket notice:', balErr);
      }

      // 2. Fetch live masked payout account from GET /api/drivers/me/payout-account
      try {
        const accRes = await getDriverPayoutAccount();
        if (accRes && accRes.account) {
          if (accRes.account.bankName) setBankName(accRes.account.bankName);
          if (accRes.account.accountNumberMasked) setBankAccount(accRes.account.accountNumberMasked);
        }
      } catch (accErr) {
        console.warn('Live payout account notice:', accErr);
      }

      const orders = await getOrderHistory();
      const completed = orders.filter((o: any) => {
        const s = (o.status || '').toLowerCase().trim();
        return ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes(s);
      });
        
      const totalEarned = completed.reduce((sum: number, o: any) => {
        const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
        return sum + amt;
      }, 0);
      setBalance(totalEarned);

      const mappedHistory = completed.slice(0, 10).map((o: any) => {
        let formattedDate = 'Recent';
        try {
          if (o.createdAt) {
            formattedDate = new Date(o.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
        } catch (e) {}
        const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
        return {
          id: `#${String(o.bookingId || o.id || '1001').slice(-6)}`,
          date: formattedDate,
          amount: `₹${amt.toFixed(2)}`,
          distance: `${o.distance || '0'} km`,
          status: 'completed',
        };
      });
      setTripHistory(mappedHistory);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
      const startOfMonth = startOfToday - 30 * 24 * 60 * 60 * 1000;

      let todaySum = 0, todayTrips = 0;
      let weekSum = 0, weekTrips = 0;
      let monthSum = 0, monthTrips = 0;

      completed.forEach((o: any) => {
        let tripTime = now.getTime();
        if (o.createdAt) {
          const parsed = new Date(o.createdAt).getTime();
          if (!isNaN(parsed) && parsed > 0) tripTime = parsed;
        }
        const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
        if (tripTime >= startOfToday) {
          todaySum += amt;
          todayTrips++;
        }
        if (tripTime >= startOfWeek) {
          weekSum += amt;
          weekTrips++;
        }
        if (tripTime >= startOfMonth) {
          monthSum += amt;
          monthTrips++;
        }
      });

      setEarningsData({
        today: { amount: `₹${todaySum}`, trips: todayTrips, distance: `${(todayTrips * 4.5).toFixed(1)} km`, target: 1500 },
        weekly: { amount: `₹${weekSum}`, trips: weekTrips, distance: `${(weekTrips * 4.5).toFixed(1)} km`, target: 10000 },
        monthly: { amount: `₹${monthSum}`, trips: monthTrips, distance: `${(monthTrips * 4.5).toFixed(1)} km`, target: 40000 },
        total: { amount: `₹${totalEarned}`, trips: completed.length, distance: `${(completed.length * 4.5).toFixed(1)} km`, target: 200000 },
      });
    } catch (err) {
      console.warn('Failed loading real earnings history:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchEarningsAndBank(false);
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh earnings. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchEarningsAndBank(true);
    }, [])
  );

  const currentData = earningsData[activePeriod];
  const amountNumber = parseInt(currentData.amount.replace(/[^0-9]/g, '')) || 0;
  const progressPercent = Math.min((amountNumber / currentData.target) * 100, 100);

  const [requestingPayout, setRequestingPayout] = useState(false);

  const handleWithdraw = async () => {
    if (!balanceData.hasVerifiedAccount) {
      Alert.alert(
        'Bank Account Required',
        'Please register and verify your payout bank account first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Bank Account', onPress: () => (navigation as any).navigate('DriverProfile') }
        ]
      );
      return;
    }

    if (balanceData.availableBalance < balanceData.minPayoutAmount) {
      Alert.alert(
        'Minimum Withdrawal Required',
        `Minimum payout threshold is ₹${balanceData.minPayoutAmount}. You need ₹${balanceData.needsMoreForPayout} more in available balance to request a bank transfer.`
      );
      return;
    }

    const currentBank = bankName || 'Registered Bank';
    const currentAcc = bankAccount || 'XXXX XXXX 4582';

    Alert.alert(
      'Confirm Bank Settlement',
      `Withdraw ₹${balanceData.availableBalance.toFixed(2)} to ${currentBank} (${currentAcc})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Withdrawal',
          onPress: async () => {
            setRequestingPayout(true);
            try {
              const res = await requestDriverPayout(balanceData.availableBalance, 'MANUAL');
              if (res && res.success) {
                Alert.alert(
                  'Payout Successful! 🎉',
                  `₹${res.amount || balanceData.availableBalance} transferred to ${res.destination || currentBank}.\n\nUTR Reference: ${res.utr}`
                );
                fetchEarningsAndBank(false);
              } else {
                Alert.alert('Payout Request Failed', res?.message || 'Could not process bank settlement.');
              }
            } catch (err: any) {
              Alert.alert('Payout Error', err?.message || 'Network error while processing payout request.');
            } finally {
              setRequestingPayout(false);
            }
          }
        }
      ]
    );
  };

  const periods: Period[] = ['today', 'weekly', 'monthly', 'total'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Premium Header */}
      <View style={[styles.header, { backgroundColor: colors.card }, theme === 'light' && styles.headerShadow]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerGreeting, { color: colors.textSecondary }]}>Your Balance</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>₹{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.withdrawBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]} 
            onPress={handleWithdraw}
          >
            <Ionicons name="arrow-down-circle" size={18} color="#FFFFFF" />
            <Text style={styles.withdrawBtnText}>Withdraw</Text>
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
        {/* Segregated Financial Balance Buckets Card */}
        <View style={[styles.balanceBucketsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.balanceHeaderRow}>
            <View>
              <Text style={[styles.balanceHeaderLabel, { color: colors.textSecondary }]}>Available for Payout</Text>
              <Text style={[styles.balanceHeaderAmount, { color: colors.text }]}>₹{balanceData.availableBalance.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.withdrawMainBtn,
                { backgroundColor: balanceData.isPayoutEligible && balanceData.availableBalance >= balanceData.minPayoutAmount ? '#0052FF' : colors.border }
              ]}
              onPress={handleWithdraw}
              disabled={requestingPayout}
            >
              {requestingPayout ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.withdrawMainBtnText}>
                  {balanceData.availableBalance < balanceData.minPayoutAmount
                    ? `Need ₹${balanceData.needsMoreForPayout} More`
                    : 'Withdraw Earnings'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 3 Grid Metric Sub-Buckets */}
          <View style={styles.bucketGrid}>
            <View style={[styles.bucketItem, { backgroundColor: colors.surface }]}>
              <Text style={[styles.bucketItemLabel, { color: colors.textMuted }]}>Processing</Text>
              <Text style={[styles.bucketItemVal, { color: colors.text }]}>₹{balanceData.processingBalance.toFixed(2)}</Text>
            </View>

            <View style={[styles.bucketItem, { backgroundColor: colors.surface }]}>
              <Text style={[styles.bucketItemLabel, { color: colors.textMuted }]}>Total Paid Out</Text>
              <Text style={[styles.bucketItemVal, { color: '#10B981' }]}>₹{balanceData.paidBalance.toFixed(2)}</Text>
            </View>

            <View style={[styles.bucketItem, { backgroundColor: colors.surface }]}>
              <Text style={[styles.bucketItemLabel, { color: colors.textMuted }]}>Pending</Text>
              <Text style={[styles.bucketItemVal, { color: colors.textSecondary }]}>₹{balanceData.pendingBalance.toFixed(2)}</Text>
            </View>
          </View>

          {/* Registered Bank Account Banner */}
          <View style={[styles.bankBannerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="card" size={20} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.bankBannerName, { color: colors.text }]}>{bankName || 'Registered Bank Account'}</Text>
              <Text style={[styles.bankBannerAcc, { color: colors.textMuted }]}>{bankAccount || 'XXXX XXXX 4582'}</Text>
            </View>
            <View style={styles.verifiedTag}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
              <Text style={styles.verifiedTagText}>Verified</Text>
            </View>
          </View>
        </View>

        {/* Dynamic Glassmorphism Hero Graph */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroGlowTop} />
          
          <View style={styles.heroContent}>
            <View style={styles.heroTextRow}>
              <View>
                <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                  {activePeriod.toUpperCase()} EARNINGS
                </Text>
                <Text style={[styles.heroAmount, { color: colors.text }]}>{currentData.amount}</Text>
              </View>
              <View style={[styles.trendBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="trending-up" size={14} color="#10B981" />
                <Text style={styles.trendText}>+12%</Text>
              </View>
            </View>

            {/* Target Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Target: ₹{currentData.target.toLocaleString()}</Text>
                <Text style={[styles.progressLabel, { color: colors.text }]}>{Math.round(progressPercent)}%</Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#E2E8F0' }]}>
                <View style={[styles.progressBarFill, { backgroundColor: colors.primary, width: `${progressPercent}%` }]} />
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
            </View>
          </View>
          
          <View style={styles.graphContainer}>
            <GraphCurveSVG color={colors.primary} />
          </View>
        </View>

        {/* Digital Wallet Bank Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Payout Bank</Text>
        <View style={[styles.bankDigitalCard, { backgroundColor: theme === 'dark' ? '#1E293B' : '#0F172A' }]}>
          {/* Subtle Bank Watermark */}
          <Ionicons name="business" size={140} color="rgba(255,255,255,0.03)" style={styles.bankWatermark} />
          
          <View style={styles.bankTopRow}>
            <View style={styles.bankChip}>
              <View style={styles.chipLine} />
              <View style={styles.chipLine} />
              <View style={styles.chipLine} />
            </View>
            <MaterialCommunityIcons name="contactless-payment" size={24} color="rgba(255,255,255,0.6)" />
          </View>
          
          <View style={styles.bankMiddleRow}>
            <Text style={styles.bankAccountNumber}>{bankAccount.replace('•••• ', '••••  ••••  ••••  ')}</Text>
            <View style={styles.bankNameBadge}>
              <Text style={styles.bankNameText}>{bankName.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.bankBottomRow}>
            <View>
              <Text style={styles.bankLabel}>NEXT PAYOUT</Text>
              <Text style={styles.bankValue}>Tomorrow, 10 AM</Text>
            </View>
            <View>
              <Text style={styles.bankLabel}>AUTO-TRANSFER</Text>
              <Text style={styles.bankValue}>Enabled</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.historyActionBtn, { borderColor: colors.primary, backgroundColor: theme === 'dark' ? 'rgba(13,92,255,0.05)' : 'rgba(13,92,255,0.03)' }]}
          onPress={() => (navigation as any).navigate('PayoutHistory')}
        >
          <Text style={[styles.historyActionText, { color: colors.primary }]}>View Complete Settlement History</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* Recent Transactions */}
        <View style={styles.transactionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Recent Trips</Text>
          <TouchableOpacity>
            <Text style={[styles.viewAllText, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionList}>
          {tripHistory.map((trip, idx) => {
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
                  
                  <View style={styles.tripRight}>
                    <Text style={[
                      styles.tripAmountText, 
                      { color: isCompleted ? '#10B981' : colors.textMuted },
                      !isCompleted && { textDecorationLine: 'line-through' }
                    ]}>
                      {trip.amount}
                    </Text>
                    <View style={styles.tripMetaRow}>
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
          })}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerGreeting: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  withdrawBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 240,
  },
  heroGlowTop: {
    position: 'absolute',
    top: -50,
    left: '20%',
    width: 200,
    height: 100,
    backgroundColor: '#0D5CFF',
    opacity: 0.1,
    filter: 'blur(30px)',
  },
  heroContent: {
    padding: 24,
    zIndex: 2,
  },
  heroTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
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
  },
  heroStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  heroStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 16,
  },
  graphContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  bankDigitalCard: {
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  bankWatermark: {
    position: 'absolute',
    right: -20,
    bottom: -30,
    transform: [{ rotate: '-15deg' }],
  },
  bankTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  bankChip: {
    width: 38,
    height: 28,
    backgroundColor: '#FCD34D',
    borderRadius: 6,
    padding: 4,
    justifyContent: 'space-between',
  },
  chipLine: {
    width: '100%',
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  bankMiddleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  bankAccountNumber: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 2,
  },
  bankNameBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bankNameText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bankBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bankValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  historyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: -8,
  },
  historyActionText: {
    fontWeight: '700',
    fontSize: 14,
  },
  transactionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionList: {
    gap: 0,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  tripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tripIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripIdText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  tripDateText: {
    fontSize: 12,
  },
  tripRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tripAmountText: {
    fontSize: 16,
    fontWeight: '800',
  },
  tripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripDistanceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  tripDivider: {
    height: 1,
    width: '100%',
    opacity: 0.5,
  },
  balanceBucketsCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  balanceHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  balanceHeaderAmount: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  withdrawMainBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  withdrawMainBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bucketGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bucketItem: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  bucketItemLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  bucketItemVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  bankBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  bankBannerName: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankBannerAcc: {
    fontSize: 11,
    marginTop: 1,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  verifiedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
});

export default DriverEarningsScreen;
