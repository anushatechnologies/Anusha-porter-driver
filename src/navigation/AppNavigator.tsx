import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Colors from '../theme/colors';

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

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import DriverManagementScreen from '../screens/admin/DriverManagementScreen';
import OrderManagementScreen from '../screens/admin/OrderManagementScreen';
import PaymentManagementScreen from '../screens/admin/PaymentManagementScreen';
import AnalyticsScreen from '../screens/admin/AnalyticsScreen';

export type RootStackParamList = {
  Splash: undefined;
  RoleSelect: undefined;
  Login: { role: 'driver' | 'admin' };
  DriverRegistration: undefined;
  DriverTabs: undefined;
  IncomingOrder: undefined;
  ActiveOrder: undefined;
  AdminTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const DriverTab = createBottomTabNavigator();
const AdminTab = createBottomTabNavigator();

const DriverTabNavigator = () => {
  return (
    <DriverTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 65,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: focused ? 'speedometer' : 'speedometer-outline',
            Earnings: focused ? 'cash' : 'cash-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name] || 'home'} size={22} color={color} />;
        },
      })}
    >
      <DriverTab.Screen name="Dashboard" component={DriverDashboardScreen} />
      <DriverTab.Screen name="Earnings" component={DriverEarningsScreen} />
      <DriverTab.Screen name="Profile" component={DriverProfileScreen} />
    </DriverTab.Navigator>
  );
};

const AdminTabNavigator = () => {
  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 65,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: focused ? 'home' : 'home-outline',
            Users: focused ? 'people' : 'people-outline',
            Drivers: focused ? 'car' : 'car-outline',
            Orders: focused ? 'receipt' : 'receipt-outline',
            Analytics: focused ? 'bar-chart' : 'bar-chart-outline',
          };
          return <Ionicons name={icons[route.name] || 'home'} size={20} color={color} />;
        },
      })}
    >
      <AdminTab.Screen name="Home" component={AdminDashboardScreen} />
      <AdminTab.Screen name="Users" component={UserManagementScreen} />
      <AdminTab.Screen name="Drivers" component={DriverManagementScreen} />
      <AdminTab.Screen name="Orders" component={OrderManagementScreen} />
      <AdminTab.Screen name="Analytics" component={AnalyticsScreen} />
    </AdminTab.Navigator>
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
        <Stack.Screen name="DriverTabs" component={DriverTabNavigator} />
        <Stack.Screen
          name="IncomingOrder"
          component={IncomingOrderScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="ActiveOrder"
          component={ActiveOrderScreen}
        />
        <Stack.Screen name="AdminTabs" component={AdminTabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
