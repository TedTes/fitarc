import React, { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

type AuthView = 'login' | 'forgot-password';

export const AuthNavigator: React.FC = () => {
  const [currentView, setCurrentView] = useState<AuthView>('login');

  switch (currentView) {
    case 'forgot-password':
      return (
        <ForgotPasswordScreen onNavigateBack={() => setCurrentView('login')} />
      );
    case 'login':
    default:
      return (
        <LoginScreen
          onNavigateToForgotPassword={() => setCurrentView('forgot-password')}
        />
      );
  }
};
