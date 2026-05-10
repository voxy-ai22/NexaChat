/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Auth from './components/Auth';
import ChatRoom from './components/ChatRoom';
import { Loader2 } from 'lucide-react';

const AppContent = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-neon-purple animate-spin" />
        <p className="text-zinc-500 font-medium animate-pulse">Initializing Voxify...</p>
      </div>
    );
  }

  return user ? <ChatRoom /> : <Auth />;
};

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}
