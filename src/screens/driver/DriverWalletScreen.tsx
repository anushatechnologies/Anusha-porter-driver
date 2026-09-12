import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  getDriverWallet,
  getWalletTransactions,
  getOrderHistory,
  DriverWallet,
} from '../../services/api';

const DriverWalletScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchWalletData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [walRes, txnsRes, ordersRes] = await Promise.all([
        getDriverWallet().catch(() => null),
        getWalletTransactions().catch(() => null),
        getOrderHistory().catch(() => null),
      ]);

      if (walRes && walRes.wallet) {
        setWallet(walRes.wallet);
      }

      const combinedList: any[] = [];
      const seenKeys = new Set<string>();

      // 1. Add direct wallet transactions from backend
      if (txnsRes && Array.isArray(txnsRes.transactions) && txnsRes.transactions.length > 0) {
        for (const t of txnsRes.transactions) {
          const rawT = (t.transactionType || (t as any).type || '').toUpperCase();
          if (rawT === 'ORDER_EARNING' || rawT === 'EARNING' || rawT === 'FARE_COLLECTED') {
            continue;
          }
          const rawRef = String(t.orderId || (t as any).orderRef || (t as any).referenceId || t.id || '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .replace(/^(bk|ord|txn|w)/, '');
          const key = `${t.id || ''}_${rawRef}_${Math.abs(Number(t.amount) || 0)}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            combinedList.push(t);
          }
        }
      } else if (ordersRes && Array.isArray(ordersRes.orders)) {
        // 2. Fallback if backend transactions list is empty
        for (const order of ordersRes.orders) {
          const oAny = order as any;
          const isDone = ['completed', 'delivered', 'done', 'finished'].includes(
            (oAny.status || '').toLowerCase()
          );
          if (isDone) {
            const rawAmt = typeof oAny.amount === 'number'
              ? oAny.amount
              : parseFloat(String(oAny.amount || oAny.fare || oAny.price || '0').replace('₹', '')) || 0;
            const commAmt = Math.round(rawAmt * 0.05 * 100) / 100;
            const bId = oAny.bookingId || oAny.id;
            
            if (commAmt > 0) {
              combinedList.push({
                id: `COMM_DED_${bId}`,
                orderId: bId,
                transactionType: 'COMMISSION_DEDUCTION',
                amount: -commAmt,
                orderFare: rawAmt,
                description: `5% Commission for Order #${bId}`,
                createdAt: oAny.createdAt || oAny.completedAt || oAny.updatedAt || new Date().toISOString(),
              });
            }
          }
        }
      }

      // Sort newest first
      combinedList.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setTransactions(combinedList);
    } catch (e) {
      console.warn('Wallet fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWalletData(false);
  };

  const availableBalance = wallet?.availableBalance ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />

      {/* ── TOP HEADER ─────────────────────────────────── */}
      <View style={styles.redHeader}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Driver Wallet</Text>
        <TouchableOpacity style={styles.headerRefreshBtn} onPress={handleRefresh}>
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading Wallet & Transactions...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#DC2626']} />
            }
          >
            {/* Balance Card */}
            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: availableBalance < 0 ? colors.error : colors.border }]}>
              <View style={styles.balanceHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.balanceLabelText, { color: colors.textSecondary }]}>
                    CURRENT WALLET BALANCE
                  </Text>
                  <Text style={[styles.balanceMainValue, { color: availableBalance < 0 ? colors.error : colors.text }]}>
                    {availableBalance < 0 ? `-₹${Math.abs(availableBalance).toFixed(2)}` : `₹${availableBalance.toFixed(2)}`}
                  </Text>
                </View>
                <View style={[styles.statusBadgePill, { backgroundColor: availableBalance < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)' }]}>
                  <Text style={[styles.statusBadgePillText, { color: availableBalance < 0 ? '#EF4444' : '#10B981' }]}>
                    {availableBalance < 0 ? '● DUES PENDING' : '● READY TO DRIVE'}
                  </Text>
                </View>
              </View>

              <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />

              <View style={styles.balanceFooterRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.metaFooterLabel, { color: colors.textMuted }]}>Platform Status</Text>
                  <Text style={[styles.metaFooterVal, { color: availableBalance < 0 ? colors.error : colors.text }]}>
                    {availableBalance < 0 ? 'Negative Dues (Action Required)' : 'No Minimum Balance Required'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.metaFooterLabel, { color: colors.textMuted }]}>Duty Eligibility</Text>
                  <Text style={[styles.metaFooterVal, { color: availableBalance < 0 ? colors.error : '#10B981' }]}>
                    {availableBalance < 0 ? 'Blocked Until Cleared' : 'Eligible for Orders'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Info Card: Zero Balance Policy or Negative Dues Warning */}
            {availableBalance < 0 ? (
              <View style={[styles.disabledNoticeCard, { backgroundColor: colors.card, borderColor: colors.error }]}>
                <View style={styles.disabledNoticeHeader}>
                  <Ionicons name="alert-circle" size={22} color={colors.error} />
                  <Text style={[styles.disabledNoticeTitle, { color: colors.error }]}>Clear Outstanding Balance</Text>
                </View>
                <Text style={[styles.disabledNoticeText, { color: colors.textSecondary }]}>
                  Your wallet has an unpaid negative balance of ₹{Math.abs(availableBalance).toFixed(2)}. Please settle this balance to toggle online and start receiving customer rides.
                </Text>
              </View>
            ) : (
              <View style={[styles.disabledNoticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.disabledNoticeHeader}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  <Text style={[styles.disabledNoticeTitle, { color: colors.text }]}>Zero-Balance Online Active</Text>
                </View>
                <Text style={[styles.disabledNoticeText, { color: colors.textSecondary }]}>
                  You can toggle online and receive deliveries freely with ₹0.00 wallet balance. No minimum balance is required.
                </Text>
              </View>
            )}

            {/* ── RECENT TRANSACTIONS (Activity Feed) ─────────── */}
            <View style={styles.txnsSection}>
              <Text style={[styles.txnsHeading, { color: colors.text }]}>Recent Activity</Text>

              {transactions.length === 0 ? (
                <View style={[styles.emptyTxnBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
                  <Text style={[styles.emptyTxnText, { color: colors.textSecondary }]}>No recent wallet transactions</Text>
                </View>
              ) : (
                transactions.slice(0, 10).map((txn, idx) => {
                  const rawType = (txn.transactionType || (txn as any).type || '').toUpperCase();
                  const isCommission = rawType === 'COMMISSION' || rawType === 'COMMISSION_DEDUCTION' || rawType === 'PLATFORM_FEE';
                  const isCredit = (rawType === 'RECHARGE' || rawType === 'WALLET_RECHARGE') || (!isCommission && (txn.amount || 0) > 0);
                  const absAmt = Math.abs(txn.amount || 0);
                  const refId = txn.orderId || (txn as any).orderRef || (txn as any).referenceId;

                  let title = 'Transaction';
                  let subtext = txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
                  
                  if (isCommission) {
                    title = 'Ride Commission';
                    const fareText = txn.orderFare ? ` • Fare: ₹${Number(txn.orderFare).toFixed(0)}` : '';
                    subtext = `${refId ? `Order #${refId}` : 'Ride Fee'}${fareText} • ${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today'}`;
                  } else if (rawType === 'ORDER_EARNING') {
                    title = 'Ride Fare Collected';
                    subtext = `${refId ? `Order #${refId} • ` : ''}Cash in Hand`;
                  } else if (rawType === 'RECHARGE' || rawType === 'WALLET_RECHARGE' || isCredit) {
                    title = 'Wallet Credit';
                    subtext = `Balance Added • ${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today'}`;
                  }

                  return (
                    <View
                      key={txn.id || String(idx)}
                      style={[styles.txnRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={[styles.txnIconDot, { backgroundColor: isCredit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                        <Ionicons
                          name={isCredit ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={isCredit ? '#10B981' : '#EF4444'}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.txnTitleText, { color: colors.text, fontWeight: '700' }]}>
                          {title}
                        </Text>
                        <Text style={[styles.txnDateText, { color: colors.textMuted }]}>
                          {subtext}
                        </Text>
                      </View>
                      <Text style={[styles.txnAmountText, { color: isCredit ? '#10B981' : '#EF4444', fontWeight: '800' }]}>
                        {isCredit ? '+' : '-'}₹{absAmt.toFixed(2)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default DriverWalletScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  redHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#DC2626',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerRefreshBtn: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  balanceCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  balanceHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabelText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceMainValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0052FF',
    marginTop: 4,
  },
  statusBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusBadgePillText: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  balanceDivider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  balanceFooterRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaFooterLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaFooterVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  disabledNoticeCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  disabledNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  disabledNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  disabledNoticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  txnsSection: {
    marginTop: 10,
    marginBottom: 10,
  },
  txnsHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  emptyTxnBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTxnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  txnRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  txnIconDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTitleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  txnDateText: {
    fontSize: 10,
    marginTop: 1,
  },
  txnAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
