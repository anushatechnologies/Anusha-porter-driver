import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, StatusBar, Platform, Dimensions, KeyboardAvoidingView, Linking, Modal } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { createTicket } from '../../services/api';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';
import Animated, { FadeInDown, FadeInUp, Layout, ZoomIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const SupportHeaderBackground = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={isDark ? '#0F172A' : '#10B981'} />
            <Stop offset="100%" stopColor={isDark ? '#1E293B' : '#047857'} />
          </LinearGradient>
          <LinearGradient id="glowGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#34D399" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#10B981" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bgGrad)" />
        
        {/* Soft floating background blobs */}
        <Circle cx="50" cy="50" r="100" fill="url(#glowGrad)" />
        <Circle cx="350" cy="200" r="150" fill="url(#glowGrad)" opacity="0.5" />
        
        <Path 
          d="M0 250 C150 300, 250 200, 400 280 L400 0 L0 0 Z" 
          fill="rgba(255,255,255,0.05)" 
        />
      </Svg>
    </View>
  );
};

const SupportScreen = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [ticketId, setTicketId] = useState<string>('');

  const isDark = theme === 'dark';

  const handleCall = () => {
    Linking.openURL('tel:6309981444').catch(() => {
      Alert.alert('Calling Support', 'Dial +91 63099 81444 for Anusha Porter Driver Support.');
    });
  };

  const handleChat = async () => {
    try {
      let driverIdentifier = '';
      try {
        const storedEmail = await AsyncStorage.getItem('loggedInEmail');
        if (storedEmail) {
          driverIdentifier = storedEmail;
        } else {
          const storedProfile = await AsyncStorage.getItem('driverProfile');
          if (storedProfile) {
            const parsed = JSON.parse(storedProfile);
            driverIdentifier = parsed.name
              ? `${parsed.name} (${parsed.phone || parsed.email || ''})`
              : (parsed.phone || parsed.email || '');
          }
        }
      } catch (e) {
        console.warn('Driver profile fetch notice for support:', e);
      }

      const defaultMessage = driverIdentifier
        ? `Hello Anusha Porter Support, I am a driver partner: ${driverIdentifier.trim()}. I need assistance with my driver app.`
        : `Hello Anusha Porter Support, I am a registered driver partner and I need assistance with my driver app.`;

      const whatsappUrl = `https://wa.me/916309981444?text=${encodeURIComponent(defaultMessage)}`;
      await Linking.openURL(whatsappUrl);
    } catch (err) {
      Alert.alert('Live Chat', 'Contact support on WhatsApp at +91 63099 81444.');
    }
  };

  const handleSubmitTicket = async () => {
    if (!subject || !description) {
      Alert.alert('Missing Fields', 'Please fill in both subject and description.');
      return;
    }
    setSubmitting(true);
    try {
      let driverEmail = '';
      try {
        driverEmail = (await AsyncStorage.getItem('loggedInEmail')) || '';
        if (!driverEmail) {
          const storedProfile = await AsyncStorage.getItem('driverProfile');
          if (storedProfile) {
            const parsed = JSON.parse(storedProfile);
            driverEmail = parsed.email || '';
          }
        }
      } catch (e) {
        console.warn('Could not read stored driver email:', e);
      }

      let generatedId = `TK-${Math.floor(100000 + Math.random() * 900000)}`;
      let success = false;
      try {
        const res = await createTicket({ email: driverEmail, subject, description });
        if (res) {
          success = true;
          if (res.ticketId || res.id) generatedId = String(res.ticketId || res.id);
        }
      } catch (backendErr) {
        console.warn('Backend createTicket notice:', backendErr);
        // Fallback: save ticket locally in AsyncStorage so it is never lost
        try {
          const localTicketsRaw = await AsyncStorage.getItem('@offline_support_tickets');
          const localTickets = localTicketsRaw ? JSON.parse(localTicketsRaw) : [];
          localTickets.push({
            id: generatedId,
            email: driverEmail,
            subject,
            description,
            createdAt: new Date().toISOString(),
          });
          await AsyncStorage.setItem('@offline_support_tickets', JSON.stringify(localTickets));
          success = true;
        } catch (storageErr) {
          console.warn('Storage ticket err:', storageErr);
        }
      }

      if (success) {
        setTicketId(generatedId);
        setShowSuccessModal(true);
        setSubject('');
        setDescription('');
      } else {
        Alert.alert('Submission Error', 'Failed to submit support ticket. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred while submitting your ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Premium Header Region */}
        <View style={styles.headerContainer}>
          <SupportHeaderBackground />
          
          <View style={styles.headerTop}>
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Help Center</Text>
            <View style={{ width: 44 }} />
          </View>

          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.heroContent}>
            <View style={styles.iconCircle}>
              <Ionicons name="headset" size={40} color="#10B981" />
            </View>
            <Text style={styles.heroText}>How can we help you today?</Text>
            <Text style={styles.heroSubText}>Our support team is active 24/7</Text>
          </Animated.View>
        </View>

        {/* Main Content Area */}
        <View style={styles.content}>
          
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Connect</Text>
            
            <View style={styles.quickConnectGrid}>
              <TouchableOpacity 
                activeOpacity={0.8} 
                style={[styles.actionCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF', borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE' }]}
                onPress={handleCall}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="call" size={22} color="#FFF" />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={[styles.actionTitle, { color: isDark ? '#FFF' : '#1E293B' }]}>Call Support</Text>
                  <Text style={[styles.actionSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>+91 63099 81444</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
              </TouchableOpacity>

              <TouchableOpacity 
                activeOpacity={0.8} 
                style={[styles.actionCard, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5', borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }]}
                onPress={handleChat}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="chatbubbles" size={22} color="#FFF" />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={[styles.actionTitle, { color: isDark ? '#FFF' : '#1E293B' }]}>Live Chat</Text>
                  <Text style={[styles.actionSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>Usually replies in 2m</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#10B981" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Raise a Ticket</Text>
            
            <View style={[
              styles.ticketForm, 
              { backgroundColor: colors.card, borderColor: colors.border },
              !isDark && styles.shadowLight
            ]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Issue Category</Text>
                <View style={[
                  styles.inputWrapper, 
                  { backgroundColor: colors.background, borderColor: focusedInput === 'subject' ? '#10B981' : colors.border }
                ]}>
                  <Ionicons name="list" size={18} color={focusedInput === 'subject' ? '#10B981' : colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g., Payment Delay, Missing Order"
                    placeholderTextColor={colors.gray}
                    value={subject}
                    onChangeText={setSubject}
                    onFocus={() => setFocusedInput('subject')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Detailed Description</Text>
                <View style={[
                  styles.textAreaWrapper, 
                  { backgroundColor: colors.background, borderColor: focusedInput === 'desc' ? '#10B981' : colors.border }
                ]}>
                  <TextInput
                    style={[styles.textArea, { color: colors.text }]}
                    placeholder="Please explain your issue in detail so our team can resolve it faster..."
                    placeholderTextColor={colors.gray}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    value={description}
                    onChangeText={setDescription}
                    onFocus={() => setFocusedInput('desc')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.submitBtn, submitting && styles.disabledBtn]}
                onPress={handleSubmitTicket}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <View style={StyleSheet.absoluteFill}>
                  <Svg width="100%" height="100%" preserveAspectRatio="none">
                    <Defs>
                      <LinearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0%" stopColor="#10B981" />
                        <Stop offset="100%" stopColor="#047857" />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#btnGrad)" />
                  </Svg>
                </View>
                {submitting ? (
                  <Text style={styles.submitText}>Raising Ticket...</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.submitText}>Submit Ticket</Text>
                    <Ionicons name="paper-plane" size={18} color="#FFF" style={{ marginLeft: 8 }} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>

        </View>
      </ScrollView>

      {/* Professional Success Popup Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(250)} style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalIconOuter}>
              <Ionicons name="checkmark-circle" size={54} color="#10B981" />
            </View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>Ticket Raised Successfully!</Text>

            <View style={styles.ticketBadge}>
              <Text style={styles.ticketBadgeLabel}>Ticket Reference:</Text>
              <Text style={styles.ticketBadgeVal}>#{ticketId}</Text>
            </View>

            <View style={styles.modalMessageCard}>
              <Ionicons name="headset" size={20} color="#10B981" style={{ marginRight: 8 }} />
              <Text style={[styles.modalMessageText, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
                Our team will contact you shortly!
              </Text>
            </View>

            <Text style={[styles.modalSubText, { color: colors.textSecondary }]}>
              Your support request has been registered. Our dedicated support team is reviewing it and will reach out to you directly to assist.
            </Text>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Got it, Thanks!</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    height: 320,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  heroContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  heroText: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  heroSubText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.8)',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 16,
  },
  quickConnectGrid: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  actionSub: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  ticketForm: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 20,
  },
  shadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
  },
  inputGroup: {
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  textAreaWrapper: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  textArea: {
    height: 120,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    lineHeight: 22,
  },
  submitBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  ticketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  ticketBadgeLabel: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginRight: 4,
  },
  ticketBadgeVal: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '700',
  },
  modalMessageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  modalMessageText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  modalConfirmBtn: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default SupportScreen;
