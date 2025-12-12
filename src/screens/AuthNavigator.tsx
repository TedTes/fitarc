import React, { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

type AuthView = 'login' | 'register' | 'forgot-password';

export const AuthNavigator: React.FC = () => {
  const [currentView, setCurrentView] = useState<AuthView>('login');

  switch (currentView) {
    case 'register':
      return (
        <RegisterScreen onNavigateToLogin={() => setCurrentView('login')} />
      );
    case 'forgot-password':
      return (
        <ForgotPasswordScreen onNavigateBack={() => setCurrentView('login')} />
      );
    case 'login':
    default:
      return (
        <LoginScreen
          onNavigateToRegister={() => setCurrentView('register')}
          onNavigateToForgotPassword={() => setCurrentView('forgot-password')}
        />
      );
  }
};