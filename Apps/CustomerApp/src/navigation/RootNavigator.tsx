import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../features/auth/screens/AuthScreen';
import HomeScreen from '../features/home/screens/HomeScreen';
import ProductPassportScreen from '../features/productPassport/screens/ProductPassportScreen';
import ServiceRequestsScreen from '../features/serviceRequests/screens/ServiceRequestsScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Products" component={ProductPassportScreen} />
      <Tabs.Screen name="Requests" component={ServiceRequestsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Auth" component={AuthScreen} />}
    </Stack.Navigator>
  );
}
