import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// Auth Screens
import SplashScreen from '../screens/auth/SplashScreen';
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import LoginScreen from '../screens/auth/LoginScreen';

// Driver Screens
import DriverRegistrationScreen from '../screens/driver/DriverRegistrationScreen';
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import IncomingOrderScreen from '../screens/driver/IncomingOrderScreen';
import ActiveOrderScreen from '../screens/driver/ActiveOrderScreen';
import DriverEarningsScreen from '../screens/driver/DriverEarningsScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';
import ApprovalPendingScreen from '../screens/driver/ApprovalPendingScreen';
import NotificationsScreen from '../screens/driver/NotificationsScreen';
import OrderHistoryScreen from '../screens/driver/OrderHistoryScreen';
import SupportScreen from '../screens/driver/SupportScreen';
import PayoutHistoryScreen from '../screens/driver/PayoutHistoryScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import DriverManagementScreen from '../screens/admin/DriverManagementScreen';
import OrderManagementScreen from '../screens/admin/OrderManagementScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import PaymentManagementScreen from '../screens/admin/PaymentManagementScreen';
import AnalyticsScreen from '../screens/admin/AnalyticsScreen';

export type ActiveOrderData = {
  id: number;
  status: string;
  pickup: string;
  drop: string;
  pickupAddress?: string;
  dropAddress?: string;
  amount: number;
  distance?: string;
  customerName?: string;
  customerPhone?: string;
};

export type RootStackParamList = {
  Splash: undefined;
  RoleSelect: undefined;
  Login: { role?: 'driver' | 'admin'; phone?: string; mobile?: string } | undefined;
  DriverRegistration: { mobile?: string; firebaseIdToken?: string; fullName?: string } | undefined;
  ApprovalPending: undefined;
  DriverTabs: undefined;
  IncomingOrder: { order: ActiveOrderData } | undefined;
  ActiveOrder: { order?: ActiveOrderData } | undefined;
  Notifications: undefined;
  OrderHistory: undefined;
  Support: undefined;
  PayoutHistory: undefined;
  PrivacyPolicy: undefined;
  AdminDashboard: undefined;
  DriverManagement: undefined;
  OrderManagement: undefined;
  UserManagement: undefined;
  PaymentManagement: undefined;
  Analytics: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const DriverTab = createBottomTabNavigator();

const DriverTabNavigator = () => {
  const { colors } = useTheme();

  return (
    <DriverTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 65,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: focused ? 'speedometer' : 'speedometer-outline',
            Tasks: focused ? 'checkbox' : 'checkbox-outline',
            Earnings: focused ? 'cash' : 'cash-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name] || 'home'} size={22} color={color} />;
        },
      })}
    >
      <DriverTab.Screen name="Dashboard" component={DriverDashboardScreen} />
      <DriverTab.Screen name="Tasks" component={OrderHistoryScreen} />
      <DriverTab.Screen name="Earnings" component={DriverEarningsScreen} />
      <DriverTab.Screen name="Profile" component={DriverProfileScreen} />
    </DriverTab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="DriverRegistration" component={DriverRegistrationScreen} />
        <Stack.Screen name="ApprovalPending" component={ApprovalPendingScreen} />
        <Stack.Screen name="DriverTabs" component={DriverTabNavigator} />
        
        {/* Admin Stack Screens */}
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="DriverManagement" component={DriverManagementScreen} />
        <Stack.Screen name="OrderManagement" component={OrderManagementScreen} />
        <Stack.Screen name="UserManagement" component={UserManagementScreen} />
        <Stack.Screen name="PaymentManagement" component={PaymentManagementScreen} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        
        {/* Modals & Stack Screens */}
        <Stack.Screen
          name="IncomingOrder"
          component={IncomingOrderScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="ActiveOrder" component={ActiveOrderScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="PayoutHistory" component={PayoutHistoryScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
