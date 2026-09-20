import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeContext';
import { OrderDispatchProvider } from './src/context/OrderDispatchContext';
import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';

export default function App() {

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GlobalErrorBoundary>
        <ThemeProvider>
          <OrderDispatchProvider>
            <AppNavigator />
          </OrderDispatchProvider>
        </ThemeProvider>
      </GlobalErrorBoundary>
    </GestureHandlerRootView>
  );
}
