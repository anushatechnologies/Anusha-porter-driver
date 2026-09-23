import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, StatusBar, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { getNotifications, markNotificationsAsRead, normalizeTimestamp } from '../../services/api';
import AsyncStorage from '../../services/asyncStorageShim';

interface NotificationItem {
  id: string;
  type: 'order' | 'payout' | 'announcement';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const getStorageKeys = async () => {
  const storedEmail = (await AsyncStorage.getItem('loggedInEmail')) || 'driver';
  const sanitized = storedEmail.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    email: storedEmail,
    readIdsKey: `@driver_read_notifs_${sanitized}`,
    readAllTimeKey: `@driver_notifs_read_all_time_${sanitized}`,
  };
};

const safeParseJsonArray = (str: string | null): string[] => {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const NotificationsScreen = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLiveNotifications = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const { email, readIdsKey, readAllTimeKey } = await getStorageKeys();

      const [savedIdsRaw, savedTimeRaw, rawList] = await Promise.all([
        AsyncStorage.getItem(readIdsKey),
        AsyncStorage.getItem(readAllTimeKey),
        getNotifications(email),
      ]);

      const readIdsSet = new Set<string>(safeParseJsonArray(savedIdsRaw));
      const readAllTime = savedTimeRaw ? Number(savedTimeRaw) : 0;

      // Filter out legacy static sample items from backend
      const filteredList = (Array.isArray(rawList) ? rawList : []).filter((item: any) => {
        const title = String(item.title || item.name || '').toLowerCase();
        const body = String(item.message || item.body || '').toLowerCase();
        const isDummy = title.includes('payout processed') ||
                        title.includes('new trip bonus') ||
                        body.includes('1,250') ||
                        body.includes('complete 5 trips');
        return !isDummy;
      });

      const formatted: NotificationItem[] = filteredList.map((item: any, idx: number) => {
        // Build deterministic stable ID
        const stableId = String(
          item.id ||
          item._id ||
          item._ID ||
          `notif_${item.title || 'item'}_${item.createdAt || item.time || item.message || item.body || idx}`
        );

        const itemTime = item.createdAt ? new Date(normalizeTimestamp(item.createdAt)).getTime() : 0;
        const isRead =
          item.readStatus === true ||
          item.read === true ||
          readIdsSet.has(stableId) ||
          (readAllTime > 0 && itemTime > 0 && itemTime <= readAllTime);

        return {
          id: stableId,
          type: item.type || 'announcement',
          title: item.title || 'Notification',
          body: item.message || item.body || '',
          time: item.createdAt ? new Date(normalizeTimestamp(item.createdAt)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : 'Recently',
          read: isRead,
        };
      });

      setNotifications(formatted);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveNotifications(true);
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchLiveNotifications(false);
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh notifications. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'order':
        return { name: 'bicycle', color: colors.primary };
      case 'payout':
        return { name: 'wallet', color: colors.success };
      case 'announcement':
        return { name: 'megaphone', color: colors.info };
      default:
        return { name: 'notifications', color: colors.gray };
    }
  };

  const markAllAsRead = async () => {
    try {
      // 1. Immediately update UI
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));

      const { email, readIdsKey, readAllTimeKey } = await getStorageKeys();
      const now = Date.now();

      // 2. Collect current IDs & combine with existing read IDs
      const allIds = notifications.map(n => n.id);
      const savedIdsRaw = await AsyncStorage.getItem(readIdsKey);
      const readIdsSet = new Set<string>(safeParseJsonArray(savedIdsRaw));
      allIds.forEach(id => readIdsSet.add(id));

      // 3. Persist to AsyncStorage
      await Promise.all([
        AsyncStorage.setItem(readIdsKey, JSON.stringify(Array.from(readIdsSet))),
        AsyncStorage.setItem(readAllTimeKey, String(now)),
      ]);

      // 4. Best-effort background sync to backend
      markNotificationsAsRead(email, allIds).catch(() => {});
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    }
  };

  const markSingleAsRead = async (id: string) => {
    try {
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      const { readIdsKey } = await getStorageKeys();
      const savedIdsRaw = await AsyncStorage.getItem(readIdsKey);
      const readIdsSet = new Set<string>(safeParseJsonArray(savedIdsRaw));
      readIdsSet.add(id);
      await AsyncStorage.setItem(readIdsKey, JSON.stringify(Array.from(readIdsSet)));
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  };

  const hasUnread = notifications.some(n => !n.read);

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const icon = getIcon(item.type);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => !item.read && markSingleAsRead(item.id)}
        style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: colors.border }, !item.read && [styles.unreadBorder, { borderLeftColor: colors.primary }]]}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          <Ionicons name={icon.name as any} size={22} color={icon.color} />
        </View>
        <View style={styles.textContainer}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }, !item.read && styles.unreadTitle]}>{item.title}</Text>
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>{item.time}</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{item.body}</Text>
        </View>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity
          onPress={markAllAsRead}
          disabled={!hasUnread}
          style={{ opacity: hasUnread ? 1 : 0.4 }}
        >
          <Text style={[styles.readAllText, { color: hasUnread ? colors.primary : colors.textSecondary }]}>
            {hasUnread ? 'Read All' : 'All Read'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={60} color={colors.gray} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  readAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    position: 'relative',
  },
  unreadBorder: {
    borderLeftWidth: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  cardTime: {
    fontSize: 11,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 16,
    right: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default NotificationsScreen;
