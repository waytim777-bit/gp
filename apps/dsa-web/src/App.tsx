import type React from 'react';
import { useEffect } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BacktestPage from './pages/BacktestPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import ChatPage from './pages/ChatPage';
import PredictionReportsPage from './pages/PredictionReportsPage';
import SharedReportPage from './pages/SharedReportPage';
import ProfilePage from './pages/ProfilePage';
import { ApiErrorAlert, Shell } from './components/common';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAgentChatStore } from './stores/agentChatStore';
import './App.css';

const AppContent: React.FC = () => {
  const location = useLocation();
  const { loggedIn, currentUser, isLoading, loadError, refreshStatus } = useAuth();

  useEffect(() => {
    useAgentChatStore.getState().setCurrentRoute(location.pathname);
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan/20 border-t-cyan" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base px-4">
        <div className="w-full max-w-lg">
          <ApiErrorAlert error={loadError} />
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void refreshStatus()}
        >
          重试
        </button>
      </div>
    );
  }

  if (!loggedIn) {
    if (location.pathname.startsWith('/r/')) {
      return (
        <Routes>
          <Route path="/r/:token" element={<SharedReportPage />} />
        </Routes>
      );
    }
    if (location.pathname === '/login') {
      return <LoginPage />;
    }
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  const hasPermission = (menuKey: string) => {
    if (currentUser?.isAdmin) {
      return true;
    }
    const permissions = currentUser?.menuPermissions ?? [];
    if (menuKey === 'subscriptions') {
      return permissions.includes('subscriptions') || permissions.includes('settings');
    }
    return permissions.includes(menuKey);
  };

  const firstAllowedPath = [
    ['home', '/'],
    ['chat', '/chat'],
    ['backtest', '/backtest'],
    ['subscriptions', '/subscriptions'],
    ['prediction_reports', '/prediction-reports'],
    ['settings', '/settings'],
  ].find(([key]) => hasPermission(key))?.[1];

  const protectedElement = (menuKey: string, element: React.ReactElement) => (
    hasPermission(menuKey)
      ? element
      : firstAllowedPath
        ? <Navigate to={firstAllowedPath} replace />
        : <NotFoundPage />
  );

  return (
    <Routes>
      <Route path="/r/:token" element={<SharedReportPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={protectedElement('home', <HomePage />)} />
        <Route path="/chat" element={protectedElement('chat', <ChatPage />)} />
        <Route path="/portfolio" element={<Navigate to="/" replace />} />
        <Route path="/backtest" element={protectedElement('backtest', <BacktestPage />)} />
        <Route path="/subscriptions" element={protectedElement('subscriptions', <SubscriptionsPage />)} />
        <Route path="/prediction-reports" element={protectedElement('prediction_reports', <PredictionReportsPage />)} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={currentUser?.isAdmin ? protectedElement('settings', <SettingsPage />) : <Navigate to="/subscriptions" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
};

export default App;
