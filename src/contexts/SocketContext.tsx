import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

// Vercel serverless = no persistent WebSocket
// Strategy: HTTP polling for messages + users, with socket.io fallback when available

interface SocketContextType {
  isConnected: boolean;
  onlineUsers: any[];
  typingUsers: { [key: number]: string };
  sendMessage: (data: any) => void;
  addReaction: (data: { messageId: number; userId: number; emoji: string }) => void;
  sendTyping: (isTyping: boolean) => void;
  messages: any[];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ [key: number]: string }>({});
  const [messages, setMessages] = useState<any[]>([]);
  const socketRef = useRef<any>(null);
  const pollRef = useRef<any>(null);
  const lastMsgIdRef = useRef<number>(0);

  // ── Fetch all users ──────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users/online');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setOnlineUsers(data);
    } catch { /* noop */ }
  }, []);

  // ── Fetch messages (polling) ─────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
        if (data.length > 0) {
          lastMsgIdRef.current = Math.max(...data.map((m: any) => m.id));
        }
      }
    } catch { /* noop */ }
  }, []);

  // ── Try Socket.io (graceful fallback to polling) ─────────────────
  useEffect(() => {
    if (!user) return;

    let socket: any = null;
    let socketWorking = false;

    const trySocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        socket = io(window.location.origin, {
          transports: ['polling', 'websocket'],
          timeout: 5000,
          reconnectionAttempts: 3,
        });

        socket.on('connect', () => {
          socketWorking = true;
          setIsConnected(true);
          socket.emit('identify', { userId: user.id });
          fetchUsers();
          fetchMessages();
          // Stop polling if socket works
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        });

        socket.on('connect_error', () => {
          if (!socketWorking) startPolling();
        });

        socket.on('disconnect', () => {
          setIsConnected(false);
          startPolling(); // fallback to polling
        });

        socket.on('new_message', (msg: any) => {
          setMessages(prev => {
            const exists = prev.some(m => m.id === msg.id);
            if (exists) return prev;
            return [...prev, msg];
          });
        });

        socket.on('reaction_update', ({ messageId, userId, emoji }: any) => {
          setMessages(prev => prev.map(m => {
            if (m.id !== messageId) return m;
            const reactions = { ...m.reactions };
            if (!reactions[emoji]) reactions[emoji] = [];
            if (!reactions[emoji].includes(userId)) reactions[emoji] = [...reactions[emoji], userId];
            return { ...m, reactions };
          }));
        });

        socket.on('online_users', (users: any[]) => {
          if (Array.isArray(users)) setOnlineUsers(users);
        });

        socket.on('presence_update', () => fetchUsers());
        socket.on('status_update', () => fetchUsers());

        socket.on('user_typing', ({ userId, username, isTyping }: any) => {
          setTypingUsers(prev => {
            const next = { ...prev };
            if (isTyping) next[userId] = username;
            else delete next[userId];
            return next;
          });
        });

        socketRef.current = socket;
      } catch {
        startPolling();
      }
    };

    const startPolling = () => {
      if (pollRef.current) return; // already polling
      setIsConnected(true); // treat poll as "connected"
      fetchMessages();
      fetchUsers();
      pollRef.current = setInterval(() => {
        fetchMessages();
        fetchUsers();
      }, 3000); // poll every 3s
    };

    trySocket();

    // Timeout: if no socket in 4s, start polling
    const socketTimeout = setTimeout(() => {
      if (!socketWorking) startPolling();
    }, 4000);

    return () => {
      clearTimeout(socketTimeout);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (socket) socket.disconnect();
    };
  }, [user]);

  // ── sendMessage ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (data: any) => {
    if (!token) return;

    // Try socket first
    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', { ...data, senderId: user?.id });
      return;
    }

    // Fallback: HTTP POST
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...data, senderId: user?.id })
      });
      if (res.ok) {
        const msg = await res.json();
        msg.senderUsername = user?.username;
        if (!msg.reactions) msg.reactions = {};
        setMessages(prev => {
          const exists = prev.some(m => m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
      }
    } catch (err) { console.error('sendMessage HTTP:', err); }
  }, [token, user]);

  // ── addReaction ──────────────────────────────────────────────────
  const addReaction = useCallback(async ({ messageId, userId, emoji }: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('add_reaction', { messageId, userId, emoji });
      return;
    }
    try {
      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ messageId, emoji })
      });
      // Optimistic update
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        if (!reactions[emoji].includes(userId)) reactions[emoji] = [...reactions[emoji], userId];
        return { ...m, reactions };
      }));
    } catch { /* noop */ }
  }, [token]);

  // ── sendTyping ───────────────────────────────────────────────────
  const sendTyping = useCallback((isTyping: boolean) => {
    if (socketRef.current?.connected && user) {
      socketRef.current.emit('typing', { userId: user.id, username: user.username, isTyping });
    }
    // No HTTP fallback for typing — not critical
  }, [user]);

  return (
    <SocketContext.Provider value={{
      isConnected, onlineUsers, typingUsers,
      sendMessage, addReaction, sendTyping, messages
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};
