import React, { createContext, useContext, useEffect, useState } from 'react';
import socket from '../lib/socket';
import { useAuth } from './AuthContext';

interface SocketContextType {
  isConnected: boolean;
  onlineUsers: any[];
  typingUsers: { [key: number]: string };
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ [key: number]: string }>({});
  const { user } = useAuth();

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      if (user) {
        socket.emit('identify', { userId: user.id });
      }
      onPresenceUpdate();
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onPresenceUpdate() {
      fetch('/api/users/online')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setOnlineUsers(data);
          } else {
            console.error('Expected an array of online users, got:', data);
            setOnlineUsers([]);
          }
        })
        .catch(err => {
          console.error('Failed to fetch online users', err);
          setOnlineUsers([]);
        });
    }

    function onUserTyping({ userId, username, isTyping }: { userId: number, username: string, isTyping: boolean }) {
      setTypingUsers(prev => {
        const next = { ...prev };
        if (isTyping) {
          next[userId] = username;
        } else {
          delete next[userId];
        }
        return next;
      });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence_update', onPresenceUpdate);
    socket.on('status_update', onPresenceUpdate);
    socket.on('user_typing', onUserTyping);

    if (socket.connected && user) {
      socket.emit('identify', { userId: user.id });
      onPresenceUpdate();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence_update', onPresenceUpdate);
      socket.off('status_update', onPresenceUpdate);
      socket.off('user_typing', onUserTyping);
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ isConnected, onlineUsers, typingUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
