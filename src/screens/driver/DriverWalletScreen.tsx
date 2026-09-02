import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
// @ts-ignore
import RazorpayCheckout from 'react-native-razorpay';
import { useTheme } from '../../theme/ThemeContext';
import {
  getDriverWallet,
  getWalletTransactions,
  getOrderHistory,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getDriverProfile,
  setDriverOnlineStatus,
  DriverWallet,
  WalletTransaction,
} from '../../services/api';

const { width } = Dimensions.get('window');

interface RechargePerkOption {
  amount: number;
  extra?: number;
  isMostPopular?: boolean;
}

const RECHARGE_OPTIONS: RechargePerkOption[] = [
  { amount: 10 },
  { amount: 20 },
  { amount: 50 },
  { amount: 100 },
  { amount: 200 },
  { amount: 500, extra: 25, isMostPopular: true },
  { amount: 1000, extra: 50 },
  { amount: 2000, extra: 200 },
  { amount: 3000, extra: 300 },
  { amount: 4000, extra: 480 },
  { amount: 8000, extra: 960 },
  { amount: 15000, extra: 2250 },
  { amount: 20000, extra: 3000 },
  { amount: 50000, extra: 10000 },
];

const DriverWalletScreen = () => {
  const navigation = useNavigation();
  const { colors, theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Selection states (Strictly minimum ₹10)
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [customAmountInput, setCustomAmountInput] = useState<string>('10');

  // Razorpay Checkout Modal State: 'none' | 'success'
  const [checkoutModal, setCheckoutModal] = useState<'none' | 'success'>('none');
  const [processingOrder, setProcessingOrder] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

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

      // 1. Add direct wallet transactions from backend (strictly Recharges & Commission Deductions from Admin DB)
      if (txnsRes && Array.isArray(txnsRes.transactions) && txnsRes.transactions.length > 0) {
        for (const t of txnsRes.transactions) {
          const rawT = (t.transactionType || (t as any).type || '').toUpperCase();
          // Exclude order earnings (fares belong to Driver Earnings, not prepaid wallet)
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
        // 2. Fallback ONLY if backend transactions list is completely empty
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

  const handleSelectPerk = (opt: RechargePerkOption) => {
    setSelectedAmount(opt.amount);
    setCustomAmountInput(String(opt.amount));
  };

  const handleCustomAmountChange = (text: string) => {
    setCustomAmountInput(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && parsed >= 10) {
      setSelectedAmount(parsed);
    }
  };

  const handleProceedToPay = async () => {
    const amt = parseFloat(customAmountInput.trim());
    if (isNaN(amt) || amt < 10) {
      Alert.alert(
        'Minimum Recharge is ₹10',
        'The minimum wallet recharge amount is ₹10. Please enter ₹10 or select a perk above to proceed.'
      );
      return;
    }

    setProcessingOrder(true);
    try {
      const bookingId = `RECH_${Date.now()}`;
      
      // Step 1: Create real Razorpay order on live backend
      const orderRes = await createRazorpayOrder(bookingId, amt);
      const razorpayOrderId = orderRes?.razorpayOrderId;
      const keyId = orderRes?.keyId || 'rzp_live_TO6q7NUVnPM6bA';

      if (!razorpayOrderId) {
        throw new Error('Backend failed to create Razorpay Order. Please try again.');
      }

      // Fetch driver profile for prefilling Razorpay checkout
      const driverProfile = await getDriverProfile().catch(() => null);

      const options: any = {
        description: `Driver Wallet Recharge - ₹${amt}`,
        image: 'https://api.anushaporter.com/logo.png',
        currency: 'INR',
        key: keyId,
        amount: Math.round(amt * 100).toString(), // in paise
        name: 'Anusha Porter',
        prefill: {
          email: driverProfile?.email || 'driver@anushaporter.com',
          contact: driverProfile?.phone || '9999999999',
          name: driverProfile?.name || 'Driver Partner',
        },
        theme: { color: '#0052FF' },
      };

      if (razorpayOrderId && String(razorpayOrderId).startsWith('order_')) {
        options.order_id = razorpayOrderId;
      }

      setProcessingOrder(false);

      // Step 2: Launch Real Native Razorpay Checkout (UPI / GPay / PhonePe / Card / Netbanking)
      if (Platform.OS === 'web') {
        // Fallback for Web browser testing
        Alert.alert('Razorpay Checkout', `Initiating live payment for ₹${amt} with Order ID ${razorpayOrderId}`);
        return;
      }

      RazorpayCheckout.open(options).then(async (data: any) => {
        console.log('[RAZORPAY] Live Payment Succeeded:', data);
        setVerifyingPayment(true);
        try {
          // Step 3: Verify real HMAC SHA256 signature with backend
          const verifyRes = await verifyRazorpayPayment({
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_order_id: data.razorpay_order_id,
            razorpay_signature: data.razorpay_signature,
            bookingId,
            amount: amt,
          });

          if (verifyRes && verifyRes.success !== false) {
            setSelectedAmount(amt);
            setCheckoutModal('success');
            try {
              await setDriverOnlineStatus('online');
            } catch (e) {
              console.warn('Auto-online on recharge notice:', e);
            }
            fetchWalletData(false);
          } else {
            Alert.alert('Verification Failed', verifyRes?.message || 'Payment signature could not be verified by server.');
          }
        } catch (vErr: any) {
          Alert.alert('Notice', vErr?.message || 'Payment recorded. Updating wallet balance.');
          try {
            await setDriverOnlineStatus('online');
          } catch (e) {}
          fetchWalletData(false);
        } finally {
          setVerifyingPayment(false);
        }
      }).catch((error: any) => {
        console.warn('[RAZORPAY] Payment cancelled or error:', error);
        setVerifyingPayment(false);
        if (error && error.code !== 0 && error.code !== 2) {
          Alert.alert('Payment Incomplete', error?.description || error?.message || 'Payment was cancelled or could not be completed.');
        }
      });

    } catch (err: any) {
      setProcessingOrder(false);
      Alert.alert('Payment Error', err?.message || 'Failed to initiate Razorpay checkout. Please check your internet connection.');
    }
  };

  const availableBalance = wallet?.availableBalance ?? 0;
  const platformCommission = wallet?.platformCommission ?? 0;
  const totalRecharged = Math.max(availableBalance + platformCommission, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />

      {/* ── TOP RED HEADER ─────────────────────────────────── */}
      <View style={styles.redHeader}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Operational Wallet Recharge</Text>
        <TouchableOpacity style={styles.headerRefreshBtn} onPress={handleRefresh}>
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#DC2626" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading wallet balance...</Text>
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
            {/* ── AVAILABLE BALANCE SECTION ───────────────────── */}
            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.balanceHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.balanceLabelText, { color: colors.textSecondary }]}>
                    CURRENT WALLET BALANCE
                  </Text>
                  <Text style={styles.balanceMainValue}>
                    ₹{availableBalance.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.statusBadgePill, { backgroundColor: availableBalance >= 10 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)' }]}>
                  <Text style={[styles.statusBadgePillText, { color: availableBalance >= 10 ? '#10B981' : '#EF4444' }]}>
                    {availableBalance >= 10 ? '● ONLINE READY' : '● RECHARGE REQ.'}
                  </Text>
                </View>
              </View>

              <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />

              <View style={styles.balanceFooterRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.metaFooterLabel, { color: colors.textMuted }]}>Platform Commission</Text>
                  <Text style={[styles.metaFooterVal, { color: colors.text }]}>5% Deducted Per Ride</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.metaFooterLabel, { color: colors.textMuted }]}>Min. to Go Online</Text>
                  <Text style={[styles.metaFooterVal, { color: '#10B981' }]}>₹10.00</Text>
                </View>
              </View>
            </View>

            {/* ── RECHARGE WALLET SECTION ─────────────────────── */}
            <View style={styles.rechargeSection}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>Add Funds to Operational Wallet</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                Choose from available recharge perks (Minimum ₹10)
              </Text>

              {/* Amount Input Box */}
              <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Enter Amount In INR (Min. ₹10)"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={customAmountInput}
                  onChangeText={handleCustomAmountChange}
                />
              </View>

              {/* 3-Column Perks Grid */}
              <View style={styles.gridContainer}>
                {RECHARGE_OPTIONS.map(opt => {
                  const isSelected = selectedAmount === opt.amount && customAmountInput === String(opt.amount);

                  return (
                    <TouchableOpacity
                      key={opt.amount}
                      style={[
                        styles.perkCard,
                        {
                          backgroundColor: isSelected ? '#15803D' : colors.card,
                          borderColor: isSelected ? '#15803D' : colors.border,
                        },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleSelectPerk(opt)}
                    >
                      {/* Most Popular Badge on Top */}
                      {opt.isMostPopular && (
                        <View style={styles.mostPopularBadge}>
                          <Text style={styles.mostPopularText}>🔥 MOST POPULAR</Text>
                        </View>
                      )}

                      {/* Main Amount */}
                      <Text
                        style={[
                          styles.perkAmountText,
                          { color: isSelected ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        ₹{opt.amount}
                      </Text>

                      {/* Extra Perk Sub-Pill */}
                      {opt.extra !== undefined && (
                        <View
                          style={[
                            styles.extraPerkPill,
                            { backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#DCFCE7' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.extraPerkText,
                              { color: isSelected ? '#FFFFFF' : '#15803D' },
                            ]}
                          >
                            ₹ {opt.extra} Extra
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── RECENT TRANSACTIONS (Activity Feed) ─────────── */}
            <View style={styles.txnsSection}>
              <Text style={[styles.txnsHeading, { color: colors.text }]}>Recent Activity</Text>

              {transactions.length === 0 ? (
                <View style={[styles.emptyTxnBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
                  <Text style={[styles.emptyTxnText, { color: colors.textSecondary }]}>No recent wallet transactions</Text>
                </View>
              ) : (
                transactions.slice(0, 8).map((txn, idx) => {
                  const rawType = (txn.transactionType || (txn as any).type || '').toUpperCase();
                  const isCommission = rawType === 'COMMISSION' || rawType === 'COMMISSION_DEDUCTION' || rawType === 'PLATFORM_FEE';
                  const isCredit = (rawType === 'RECHARGE' || rawType === 'WALLET_RECHARGE') || (!isCommission && (txn.amount || 0) > 0);
                  const absAmt = Math.abs(txn.amount || 0);
                  const refId = txn.orderId || (txn as any).orderRef || (txn as any).referenceId;

                  let title = 'Transaction';
                  let subtext = txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
                  
                  if (isCommission) {
                    title = 'Ride Commission (5%)';
                    const fareText = txn.orderFare ? ` • Fare: ₹${Number(txn.orderFare).toFixed(0)}` : '';
                    subtext = `${refId ? `Order #${refId}` : 'Ride Fee'}${fareText} • ${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today'}`;
                  } else if (rawType === 'ORDER_EARNING') {
                    title = 'Ride Fare Collected';
                    subtext = `${refId ? `Order #${refId} • ` : ''}Cash in Hand`;
                  } else if (rawType === 'RECHARGE' || rawType === 'WALLET_RECHARGE' || isCredit) {
                    title = 'Wallet Recharge (UPI)';
                    subtext = `Prepaid Balance Added • ${txn.createdAt ? new Date(txn.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today'}`;
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

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* ── STICKY BOTTOM FOOTER BAR ─────────────────────── */}
          <View style={[styles.bottomFooter, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={styles.footerAmountBox}>
              <Text style={[styles.footerTotalAmountText, { color: colors.text }]}>₹{selectedAmount}</Text>
              <Text style={[styles.footerTotalLabel, { color: colors.textMuted }]}>Total Amount</Text>
            </View>

            <TouchableOpacity
              style={[styles.proceedBtn, processingOrder && { opacity: 0.7 }]}
              onPress={handleProceedToPay}
              disabled={processingOrder}
            >
              {processingOrder ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.proceedBtnText}>Proceed To Pay</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── PAYMENT SUCCESS MODAL ─────────────────────────── */}
      <Modal visible={checkoutModal === 'success'} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ width: '100%', alignItems: 'center', paddingVertical: 14 }}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={44} color="#FFFFFF" />
              </View>
              <Text style={[styles.successModalTitle, { color: colors.text }]}>Recharge Successful 🎉</Text>
              <Text style={[styles.successModalSub, { color: colors.textSecondary }]}>
                ₹{selectedAmount.toFixed(2)} has been credited to your wallet balance.
              </Text>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setCheckoutModal('none')}
              >
                <Text style={styles.doneBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── VERIFYING OVERLAY ─────────────────────────── */}
      <Modal visible={verifyingPayment} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 24 }]}>
            <ActivityIndicator size="large" color="#DC2626" />
            <Text style={[styles.successModalTitle, { color: colors.text, fontSize: 16, marginTop: 16 }]}>Verifying Payment...</Text>
            <Text style={[styles.successModalSub, { color: colors.textSecondary }]}>
              Securing transaction with Razorpay & Bank
            </Text>
          </View>
        </View>
      </Modal>
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
  rechargeSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 14,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
    marginBottom: 16,
  },
  textInput: {
    fontSize: 15,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  perkCard: {
    width: '31%',
    minHeight: 68,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    position: 'relative',
  },
  mostPopularBadge: {
    position: 'absolute',
    top: -9,
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 2,
  },
  mostPopularText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  perkAmountText: {
    fontSize: 16,
    fontWeight: '900',
  },
  extraPerkPill: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  extraPerkText: {
    fontSize: 10,
    fontWeight: '800',
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
  bottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  footerAmountBox: {
    flex: 1,
  },
  footerTotalAmountText: {
    fontSize: 22,
    fontWeight: '900',
  },
  footerTotalLabel: {
    fontSize: 12,
    marginTop: 1,
  },
  proceedBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 4,
  },
  razorpayBrandBox: {
    backgroundColor: '#0C2340',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  razorpayBrandTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  razorpayBrandSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6,
  },
  razorpayBrandAmount: {
    color: '#38BDF8',
    fontSize: 24,
    fontWeight: '900',
  },
  selectMethodTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  methodList: {
    gap: 8,
    width: '100%',
    marginBottom: 16,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  methodItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  methodItemSub: {
    fontSize: 10,
    marginTop: 1,
  },
  payNowBtn: {
    backgroundColor: '#15803D',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  payNowBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  successModalSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  doneBtn: {
    backgroundColor: '#15803D',
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
