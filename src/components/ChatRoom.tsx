import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import socket from '../lib/socket';
import {
  Send, Image as ImageIcon, Video, Mic, File as FileIcon, Smile,
  Menu, X, Plus, Play, Pause, Reply, Heart, Paperclip, LogOut,
  Users, Search, Hash, Eye, Camera, StopCircle, MicOff,
  ArrowDown, MessageCircle, Edit2, Check, ExternalLink,
  Settings, Sun, Moon, User, Bell, Lock, ChevronRight,
  Trash2, Download, MoreVertical, CheckCheck, Sticker,
  ThumbsUp, Star, Laugh, Angry, Sad, SkipForward, Upload,
  Music, Film, FileText, Volume2, Headphones, ChevronDown,
  AtSign, Phone, Globe, ArrowLeft, Pencil, Shield, Info,
  RefreshCw, Zap, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatTime, formatFileSize, cn } from '../lib/utils';
import EmojiPicker from 'emoji-picker-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Types ────────────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';
type ActivePanel = 'chat' | 'settings' | 'profile';
type EmojiReact = '❤️' | '👍' | '😂' | '😮' | '😢' | '😡' | '⭐';

const QUICK_REACTIONS: EmojiReact[] = ['❤️', '👍', '😂', '😮', '😢', '😡', '⭐'];

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const T = {
  dark: {
    bg: 'bg-[#111b21]',
    sidebar: 'bg-[#111b21]',
    sidebarBorder: 'border-[#2a3942]',
    header: 'bg-[#202c33]',
    input: 'bg-[#2a3942]',
    inputBorder: 'border-[#2a3942]',
    bubble_me: 'bg-[#005c4b]',
    bubble_other: 'bg-[#202c33]',
    bubble_text: 'text-[#e9edef]',
    text_primary: 'text-[#e9edef]',
    text_secondary: 'text-[#8696a0]',
    divider: 'border-[#2a3942]',
    hover: 'hover:bg-[#2a3942]',
    active_item: 'bg-[#2a3942]',
    icon: 'text-[#8696a0]',
    placeholder: 'placeholder:text-[#8696a0]',
    check: 'text-[#53bdeb]',
    online: 'bg-[#00a884]',
    reaction_bg: 'bg-[#1f2c33] border-[#2a3942]',
    scroll_bg: 'bg-[#0b141a]',
    modal_bg: 'bg-[#233138]',
    settings_bg: 'bg-[#111b21]',
    tag: 'bg-[#182229] border-[#2a3942]',
    reply_bar: 'border-l-[#00a884]',
    accent: '#00a884',
    accent_class: 'text-[#00a884]',
    accent_bg: 'bg-[#00a884]',
    search_bg: 'bg-[#202c33]',
  },
  light: {
    bg: 'bg-[#f0f2f5]',
    sidebar: 'bg-white',
    sidebarBorder: 'border-[#e9edef]',
    header: 'bg-[#f0f2f5]',
    input: 'bg-white',
    inputBorder: 'border-[#e9edef]',
    bubble_me: 'bg-[#d9fdd3]',
    bubble_other: 'bg-white',
    bubble_text: 'text-[#111b21]',
    text_primary: 'text-[#111b21]',
    text_secondary: 'text-[#54656f]',
    divider: 'border-[#e9edef]',
    hover: 'hover:bg-[#f5f6f6]',
    active_item: 'bg-[#f0f2f5]',
    icon: 'text-[#54656f]',
    placeholder: 'placeholder:text-[#8696a0]',
    check: 'text-[#53bdeb]',
    online: 'bg-[#00a884]',
    reaction_bg: 'bg-white border-[#e9edef]',
    scroll_bg: 'bg-[#efeae2]',
    modal_bg: 'bg-white',
    settings_bg: 'bg-[#f0f2f5]',
    tag: 'bg-[#f0f2f5] border-[#e9edef]',
    reply_bar: 'border-l-[#00a884]',
    accent: '#00a884',
    accent_class: 'text-[#00a884]',
    accent_bg: 'bg-[#00a884]',
    search_bg: 'bg-[#f0f2f5]',
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('nexa_theme') as Theme) || 'dark';
  });
  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('nexa_theme', next);
      return next;
    });
  };
  return { theme, toggleTheme, t: T[theme] };
}

function getInitials(name: string) {
  return name ? name[0].toUpperCase() : '?';
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 40, online = false }: { src?: string; name: string; size?: number; online?: boolean }) {
  const colors = ['#00a884', '#25d366', '#128c7e', '#075e54', '#34b7f1'];
  const colorIdx = name.charCodeAt(0) % colors.length;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center text-white font-semibold overflow-hidden"
        style={{ width: size, height: size, background: colors[colorIdx], fontSize: size * 0.4 }}
      >
        {src ? <img src={src} className="w-full h-full object-cover" /> : getInitials(name)}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#00a884] rounded-full border-2 border-[#111b21]" />
      )}
    </div>
  );
}

// ─── Voice Note Player (WhatsApp-style) ───────────────────────────────────────
function VoiceNotePlayer({ src, duration, isMe, theme }: { src: string; duration?: number; isMe: boolean; theme: Theme }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDur, setTotalDur] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const tot = isFinite(audioRef.current.duration) ? audioRef.current.duration : (duration || 0);
    setCurrentTime(cur);
    setTotalDur(tot);
    if (tot > 0) setProgress((cur / tot) * 100);
  };

  const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };

  const bars = 40;
  const t = T[theme];

  return (
    <div className="flex items-center gap-3 min-w-[220px] max-w-[280px] py-1">
      <audio ref={audioRef} src={src} onTimeUpdate={onTimeUpdate} onEnded={onEnded} preload="metadata" className="hidden" />

      {/* Play button */}
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
        style={{ background: isMe ? 'rgba(0,0,0,0.15)' : 'rgba(0,168,132,0.15)' }}
      >
        {isPlaying
          ? <Pause className="w-5 h-5" style={{ color: isMe ? '#e9edef' : '#00a884' }} />
          : <Play className="w-5 h-5 translate-x-0.5" style={{ color: isMe ? '#e9edef' : '#00a884' }} />
        }
      </button>

      {/* Waveform */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[2px] h-8">
          {Array.from({ length: bars }).map((_, i) => {
            const h = [30, 60, 80, 50, 90, 70, 40, 85, 55, 75, 45, 65, 90, 35, 70, 55, 80, 40, 90, 60,
              75, 50, 85, 40, 65, 80, 45, 70, 55, 90, 35, 75, 50, 85, 40, 65, 80, 45, 70, 55][i];
            const filled = (i / bars) * 100 <= progress;
            return (
              <motion.div
                key={i}
                animate={isPlaying && filled ? { scaleY: [1, 1.5, 0.8, 1.3, 1] } : { scaleY: 1 }}
                transition={{ repeat: Infinity, duration: 0.8 + (i % 5) * 0.1, delay: i * 0.02 }}
                className="rounded-full flex-1"
                style={{
                  height: `${h}%`,
                  background: filled
                    ? (isMe ? '#e9edef' : '#00a884')
                    : (isMe ? 'rgba(233,237,239,0.3)' : 'rgba(0,168,132,0.3)'),
                  transformOrigin: 'center'
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between">
          <span className="text-[11px]" style={{ color: isMe ? 'rgba(233,237,239,0.7)' : '#8696a0' }}>
            {isPlaying ? formatDuration(currentTime) : formatDuration(totalDur)}
          </span>
          <Headphones className="w-3 h-3" style={{ color: isMe ? 'rgba(233,237,239,0.5)' : '#8696a0' }} />
        </div>
      </div>
    </div>
  );
}

// ─── File bubble ──────────────────────────────────────────────────────────────
function FileBubble({ name, size, url, type, isMe }: { name: string; size: number; url: string; type: string; isMe: boolean }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, React.ReactNode> = {
    pdf: <FileText className="w-6 h-6 text-red-400" />,
    doc: <FileText className="w-6 h-6 text-blue-400" />,
    docx: <FileText className="w-6 h-6 text-blue-400" />,
    mp3: <Music className="w-6 h-6 text-purple-400" />,
    wav: <Music className="w-6 h-6 text-purple-400" />,
    mp4: <Film className="w-6 h-6 text-orange-400" />,
    xls: <FileText className="w-6 h-6 text-green-400" />,
    xlsx: <FileText className="w-6 h-6 text-green-400" />,
  };
  const icon = iconMap[ext] || <FileIcon className="w-6 h-6 text-gray-400" />;

  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 min-w-[200px] max-w-[280px] p-1 rounded-lg group"
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,168,132,0.1)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: isMe ? '#e9edef' : '#111b21' }}>{name}</p>
        <p className="text-xs mt-0.5" style={{ color: isMe ? 'rgba(233,237,239,0.6)' : '#8696a0' }}>
          {formatFileSize(size)} · {ext.toUpperCase()}
        </p>
      </div>
      <Download className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ color: isMe ? '#e9edef' : '#8696a0' }} />
    </a>
  );
}

// ─── Reaction Picker ──────────────────────────────────────────────────────────
function ReactionPicker({ onReact, onClose }: { onReact: (emoji: string) => void; onClose: () => void }) {
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.7, opacity: 0, y: 10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="absolute bottom-full mb-2 z-50 flex items-center gap-1 bg-white dark:bg-[#233138] rounded-full shadow-xl border border-[#e9edef] dark:border-[#2a3942] px-2 py-1.5"
      style={{ left: '50%', transform: 'translateX(-50%)' }}
    >
      {QUICK_REACTIONS.map((emoji, i) => (
        <motion.button
          key={emoji}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.03 }}
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => { onReact(emoji); onClose(); }}
          className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942] transition-colors"
        >
          {emoji}
        </motion.button>
      ))}
    </motion.div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({
  user, token, theme, toggleTheme, t, onClose, onUpdateProfile
}: {
  user: any; token: string | null; theme: Theme; toggleTheme: () => void; t: typeof T['dark'];
  onClose: () => void; onUpdateProfile: (data: any) => void;
}) {
  const [section, setSection] = useState<'main' | 'profile' | 'notifications' | 'privacy' | 'theme'>('main');
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status_message || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveProfile = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, status })
      });
      if (res.ok) {
        onUpdateProfile({ username, status_message: status });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally { setSaving(false); }
  };

  const menuItems = [
    { id: 'profile', icon: <User className="w-5 h-5" />, label: 'Profile', desc: 'Name, photo, status' },
    { id: 'theme', icon: theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />, label: 'Appearance', desc: 'Dark / Light mode' },
    { id: 'notifications', icon: <Bell className="w-5 h-5" />, label: 'Notifications', desc: 'Message alerts' },
    { id: 'privacy', icon: <Lock className="w-5 h-5" />, label: 'Privacy', desc: 'Account security' },
  ] as const;

  return (
    <div className={cn('flex flex-col h-full', t.settings_bg)}>
      {/* Header */}
      <div className={cn('flex items-center gap-4 px-4 py-4 border-b', t.header, t.divider)}>
        {section !== 'main' ? (
          <button onClick={() => setSection('main')} className={cn('p-2 -ml-2 rounded-full', t.hover)}>
            <ArrowLeft className={cn('w-5 h-5', t.icon)} />
          </button>
        ) : (
          <button onClick={onClose} className={cn('p-2 -ml-2 rounded-full', t.hover)}>
            <ArrowLeft className={cn('w-5 h-5', t.icon)} />
          </button>
        )}
        <h2 className={cn('text-lg font-semibold', t.text_primary)}>
          {section === 'main' ? 'Settings' : section === 'profile' ? 'Profile' : section === 'theme' ? 'Appearance' : section === 'notifications' ? 'Notifications' : 'Privacy'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {section === 'main' && (
            <motion.div key="main" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Profile Card */}
              <div
                className={cn('flex items-center gap-4 p-4 cursor-pointer border-b', t.hover, t.divider)}
                onClick={() => setSection('profile')}
              >
                <Avatar name={user?.username || ''} size={60} />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold text-base', t.text_primary)}>{user?.username}</p>
                  <p className={cn('text-sm truncate mt-0.5', t.text_secondary)}>{user?.status_message || 'Hey there! I am using Nexa.'}</p>
                </div>
                <ChevronRight className={cn('w-4 h-4', t.icon)} />
              </div>

              {/* Menu items */}
              <div className="mt-2">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => item.id === 'theme' ? toggleTheme() : setSection(item.id as any)}
                    className={cn('w-full flex items-center gap-4 px-4 py-4 transition-colors', t.hover)}
                  >
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', 'bg-[#00a884]/10')}>
                      <span className="text-[#00a884]">{item.icon}</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className={cn('text-sm font-medium', t.text_primary)}>{item.label}</p>
                      <p className={cn('text-xs mt-0.5', t.text_secondary)}>{item.desc}</p>
                    </div>
                    {item.id === 'theme' ? (
                      <div className={cn(
                        'w-12 h-6 rounded-full relative transition-colors',
                        theme === 'dark' ? 'bg-[#00a884]' : 'bg-[#ccd0d0]'
                      )}>
                        <div className={cn(
                          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                          theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
                        )} />
                      </div>
                    ) : (
                      <ChevronRight className={cn('w-4 h-4', t.icon)} />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {section === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-4 space-y-6">
              {/* Avatar upload */}
              <div className="flex flex-col items-center py-4">
                <div className="relative">
                  <Avatar name={username} size={96} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-[#00a884] rounded-full flex items-center justify-center shadow-lg"
                  >
                    <Pencil className="w-4 h-4 text-white" />
                  </button>
                  <input type="file" ref={fileRef} className="hidden" accept="image/*" />
                </div>
              </div>

              {/* Name */}
              <div className={cn('rounded-xl p-4 border', t.tag)}>
                <label className={cn('text-xs font-semibold uppercase tracking-wider', 'text-[#00a884]')}>Your Name</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={cn('w-full bg-transparent mt-2 text-base outline-none border-b pb-1', t.text_primary, t.divider)}
                  placeholder="Enter your name..."
                />
              </div>

              {/* Status */}
              <div className={cn('rounded-xl p-4 border', t.tag)}>
                <label className={cn('text-xs font-semibold uppercase tracking-wider', 'text-[#00a884]')}>Status / About</label>
                <textarea
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  rows={3}
                  className={cn('w-full bg-transparent mt-2 text-sm outline-none resize-none', t.text_primary, t.placeholder)}
                  placeholder="Hey there! I am using Nexa."
                />
              </div>

              {/* Email (read-only) */}
              <div className={cn('rounded-xl p-4 border', t.tag)}>
                <label className={cn('text-xs font-semibold uppercase tracking-wider', 'text-[#00a884]')}>Email</label>
                <p className={cn('mt-2 text-sm', t.text_secondary)}>{user?.email}</p>
              </div>

              <button
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all active:scale-[0.98]"
                style={{ background: '#00a884' }}
              >
                {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
              </button>
            </motion.div>
          )}

          {section === 'theme' && (
            <motion.div key="theme" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-4 space-y-4">
              <p className={cn('text-sm', t.text_secondary)}>Choose your preferred appearance</p>
              {(['dark', 'light'] as Theme[]).map(th => (
                <button
                  key={th}
                  onClick={() => { if (th !== theme) toggleTheme(); }}
                  className={cn(
                    'w-full flex items-center justify-between p-4 rounded-xl border transition-all',
                    th === theme ? 'border-[#00a884] bg-[#00a884]/10' : t.tag
                  )}
                >
                  <div className="flex items-center gap-3">
                    {th === 'dark' ? <Moon className="w-5 h-5 text-[#00a884]" /> : <Sun className="w-5 h-5 text-amber-500" />}
                    <span className={cn('font-medium', t.text_primary)}>{th === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                  {th === theme && <Check className="w-5 h-5 text-[#00a884]" />}
                </button>
              ))}
            </motion.div>
          )}

          {(section === 'notifications' || section === 'privacy') && (
            <motion.div key={section} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-8 flex flex-col items-center justify-center gap-3">
              <Info className={cn('w-12 h-12', t.text_secondary)} />
              <p className={cn('text-center text-sm', t.text_secondary)}>This section will be available in a future update.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Sticker Panel ────────────────────────────────────────────────────────────
function StickerPanel({ stickers, onSend, onAdd, theme, t }: {
  stickers: any[]; onSend: (url: string) => void; onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  theme: Theme; t: typeof T['dark'];
}) {
  const [stickerName, setStickerName] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={cn('absolute bottom-full mb-3 left-0 w-80 rounded-2xl shadow-2xl border overflow-hidden z-50', t.modal_bg, t.divider)}
    >
      {/* Tabs */}
      <div className={cn('flex border-b', t.divider)}>
        <button
          onClick={() => setTab('all')}
          className={cn('flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors',
            tab === 'all' ? 'text-[#00a884] border-b-2 border-[#00a884]' : t.text_secondary)}
        >
          All Stickers
        </button>
        <button
          onClick={() => setTab('mine')}
          className={cn('flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors',
            tab === 'mine' ? 'text-[#00a884] border-b-2 border-[#00a884]' : t.text_secondary)}
        >
          My Stickers
        </button>
      </div>

      {/* Add sticker */}
      <div className={cn('px-3 py-2 border-b flex items-center gap-2', t.divider)}>
        <label className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-colors text-[#00a884] hover:bg-[#00a884]/10')}>
          <Plus className="w-4 h-4" /> Add Sticker
          <input type="file" className="hidden" accept="image/*,image/gif,image/webp" onChange={onAdd} />
        </label>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-2 p-3 max-h-52 overflow-y-auto">
        {stickers.map(s => (
          <motion.button
            key={s.id}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSend(s.url)}
            className={cn('aspect-square rounded-xl flex items-center justify-center p-1 overflow-hidden transition-colors', t.hover)}
            title={s.name || 'Sticker'}
          >
            <img src={s.url} className="w-full h-full object-contain" />
          </motion.button>
        ))}
        {stickers.length === 0 && (
          <div className={cn('col-span-4 py-8 text-center text-sm', t.text_secondary)}>
            No stickers yet. Add your first one!
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Attachment Menu ──────────────────────────────────────────────────────────
function AttachMenu({ onSelect, t }: {
  onSelect: (type: 'image' | 'video' | 'audio' | 'document' | 'camera') => void;
  t: typeof T['dark'];
}) {
  const items = [
    { type: 'image' as const, icon: <ImageIcon className="w-5 h-5 text-white" />, label: 'Photo', bg: 'bg-[#bf59cf]' },
    { type: 'video' as const, icon: <Film className="w-5 h-5 text-white" />, label: 'Video', bg: 'bg-[#0063cb]' },
    { type: 'audio' as const, icon: <Music className="w-5 h-5 text-white" />, label: 'Audio', bg: 'bg-[#e06c2f]' },
    { type: 'document' as const, icon: <FileText className="w-5 h-5 text-white" />, label: 'Document', bg: 'bg-[#5157ae]' },
    { type: 'camera' as const, icon: <Camera className="w-5 h-5 text-white" />, label: 'Camera', bg: 'bg-[#d3396d]' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className={cn('absolute bottom-full mb-3 left-0 p-3 rounded-2xl shadow-2xl border z-50', t.modal_bg, t.divider)}
    >
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => (
          <motion.button
            key={item.type}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(item.type)}
            className="flex flex-col items-center gap-2"
          >
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shadow-lg', item.bg)}>
              {item.icon}
            </div>
            <span className={cn('text-xs font-medium', t.text_secondary)}>{item.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── View Once ────────────────────────────────────────────────────────────────
function ViewOnceContent({ onReveal, isMe }: { onReveal: () => void; isMe: boolean }) {
  return (
    <button
      onClick={onReveal}
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ background: isMe ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.05)' }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#00a884]/20">
        <Eye className="w-5 h-5 text-[#00a884]" />
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold" style={{ color: isMe ? '#e9edef' : '#111b21' }}>View once</p>
        <p className="text-xs" style={{ color: isMe ? 'rgba(233,237,239,0.6)' : '#8696a0' }}>Tap to open</p>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  msg, isMe, theme, t, onReply, onReact, onProfileClick
}: {
  msg: any; isMe: boolean; theme: Theme; t: typeof T['dark'];
  onReply: () => void; onReact: (emoji: string) => void; onProfileClick: () => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<any>(null);

  const reactions = msg.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;
  const reactionCount = Object.values(reactions).reduce((a: number, b: any) => a + b.length, 0);

  const handleLongPress = () => {
    timeoutRef.current = setTimeout(() => setShowReactions(true), 500);
  };
  const cancelLongPress = () => clearTimeout(timeoutRef.current);

  return (
    <motion.div
      id={`msg-${msg.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={cn('flex gap-2 group px-2', isMe ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar (only for others) */}
      {!isMe && (
        <div className="flex-shrink-0 self-end mb-1">
          <button onClick={onProfileClick}>
            <Avatar name={msg.senderUsername || '?'} size={32} />
          </button>
        </div>
      )}

      <div className={cn('flex flex-col max-w-[72%]', isMe ? 'items-end' : 'items-start')}>
        {/* Sender name (group chat) */}
        {!isMe && (
          <span className="text-xs font-semibold mb-1 px-1" style={{ color: '#00a884' }}>
            {msg.senderUsername}
          </span>
        )}

        <div className="relative">
          {/* Reaction Picker */}
          <AnimatePresence>
            {showReactions && (
              <ReactionPicker
                onReact={onReact}
                onClose={() => setShowReactions(false)}
              />
            )}
          </AnimatePresence>

          {/* Bubble */}
          <div
            className={cn(
              'relative rounded-2xl shadow-sm overflow-visible',
              isMe ? t.bubble_me : t.bubble_other,
              isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'
            )}
            onMouseDown={handleLongPress}
            onMouseUp={cancelLongPress}
            onTouchStart={handleLongPress}
            onTouchEnd={cancelLongPress}
          >
            {/* Reply reference */}
            {msg.parent_id && (
              <div
                className="px-3 pt-2 pb-1 cursor-pointer"
                onClick={() => {
                  const el = document.getElementById(`msg-${msg.parent_id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el?.classList.add('ring-2', 'ring-[#00a884]');
                  setTimeout(() => el?.classList.remove('ring-2', 'ring-[#00a884]'), 1500);
                }}
              >
                <div className={cn('border-l-4 pl-2 py-1 rounded-r-lg', isMe ? 'border-white/40 bg-black/10' : 'border-[#00a884] bg-[#00a884]/10')}>
                  <p className="text-xs font-semibold text-[#00a884]">{msg.parentSenderUsername || 'Message'}</p>
                  <p className="text-xs truncate opacity-70" style={{ color: isMe ? '#e9edef' : '#111b21' }}>
                    {msg.parentContent || '[Media]'}
                  </p>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="px-3 py-2">
              {msg.type === 'text' && (
                <div className="text-[14px] leading-relaxed break-words" style={{ color: isMe ? '#e9edef' : '#111b21' }}>
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer"
                          className="text-[#00a884] underline underline-offset-2 inline-flex items-center gap-1"
                          onClick={e => e.stopPropagation()}>
                          {props.children}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ),
                      p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>
                    }}
                  >
                    {msg.content}
                  </Markdown>
                </div>
              )}

              {msg.type === 'image' && (
                msg.view_once && !revealed ? (
                  <ViewOnceContent onReveal={() => setRevealed(true)} isMe={isMe} />
                ) : (
                  <div className="-mx-1 -mt-1 mb-1 rounded-xl overflow-hidden max-w-[260px]">
                    <img
                      src={msg.media_url}
                      className="w-full object-cover max-h-[320px] cursor-zoom-in"
                      loading="lazy"
                    />
                  </div>
                )
              )}

              {msg.type === 'video' && (
                msg.view_once && !revealed ? (
                  <ViewOnceContent onReveal={() => setRevealed(true)} isMe={isMe} />
                ) : (
                  <div className="-mx-1 -mt-1 mb-1 rounded-xl overflow-hidden max-w-[260px]">
                    <video src={msg.media_url} controls className="w-full max-h-[280px] bg-black" />
                  </div>
                )
              )}

              {msg.type === 'audio' && (
                <VoiceNotePlayer src={msg.media_url} duration={msg.duration} isMe={isMe} theme={theme} />
              )}

              {msg.type === 'sticker' && (
                <div className="-mx-1 -mt-1">
                  <img src={msg.media_url} alt="sticker" className="w-36 h-36 object-contain" />
                </div>
              )}

              {msg.type === 'file' && (
                <FileBubble name={msg.file_name || 'File'} size={msg.file_size || 0} url={msg.media_url} type={msg.type} isMe={isMe} />
              )}

              {/* Timestamp + Status */}
              <div className={cn('flex items-center gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
                <span className="text-[11px]" style={{ color: isMe ? 'rgba(233,237,239,0.6)' : '#8696a0' }}>
                  {formatTime(new Date(msg.created_at || Date.now()))}
                </span>
                {isMe && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />}
              </div>
            </div>
          </div>

          {/* Reactions display */}
          {hasReactions && (
            <div className={cn('flex flex-wrap gap-1 mt-1 px-1', isMe ? 'justify-end' : 'justify-start')}>
              {Object.entries(reactions).map(([emoji, users]: [string, any]) => (
                <motion.button
                  key={emoji}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  onClick={() => onReact(emoji)}
                  className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border shadow-sm', t.reaction_bg)}
                >
                  <span>{emoji}</span>
                  <span className={t.text_secondary}>{users.length}</span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (on hover) */}
      <div className={cn(
        'flex items-end gap-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity',
        isMe ? 'flex-row-reverse' : 'flex-row'
      )}>
        <button
          onClick={onReply}
          className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hover)}
          title="Reply"
        >
          <Reply className={cn('w-4 h-4', t.icon)} />
        </button>
        <button
          onClick={() => setShowReactions(v => !v)}
          className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hover)}
          title="React"
        >
          <Smile className={cn('w-4 h-4', t.icon)} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main ChatRoom ─────────────────────────────────────────────────────────────
export default function ChatRoom() {
  const { user, token, logout } = useAuth();
  const { onlineUsers, typingUsers } = useSocket();
  const { theme, toggleTheme, t } = useTheme();

  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [stickers, setStickers] = useState<any[]>([]);
  const [showStickers, setShowStickers] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [permError, setPermError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>('chat');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [localUser, setLocalUser] = useState(user);
  const [viewOnce, setViewOnce] = useState(false);

  // Camera
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Voice note
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<any>(null);
  const recStartRef = useRef(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputType = useRef<string>('*');
  const typingTimeoutRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages & stickers
  useEffect(() => {
    fetch('/api/messages').then(r => r.json()).then(setMessages).catch(() => {});
    fetch('/api/stickers').then(r => r.json()).then(setStickers).catch(() => {});

    socket.on('new_message', msg => setMessages(prev => [...prev, msg]));
    socket.on('reaction_update', ({ messageId, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...m.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        if (!reactions[emoji].includes(userId)) reactions[emoji] = [...reactions[emoji], userId];
        return { ...m, reactions };
      }));
    });
    return () => { socket.off('new_message'); socket.off('reaction_update'); };
  }, []);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 400) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Scroll button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fn = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBottom(dist > 600);
    };
    el.addEventListener('scroll', fn);
    return () => el.removeEventListener('scroll', fn);
  }, []);

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [content]);

  const handleContentChange = (val: string) => {
    setContent(val);
    socket.emit('typing', { userId: user.id, username: user.username, isTyping: val.length > 0 });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() =>
      socket.emit('typing', { userId: user.id, username: user.username, isTyping: false }), 2000);
  };

  const handleSend = () => {
    if (!content.trim()) return;
    socket.emit('send_message', {
      content, type: 'text', senderId: user.id, parentId: replyTo?.id || null
    });
    setContent('');
    setReplyTo(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    socket.emit('typing', { userId: user.id, username: user.username, isTyping: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const uploadFile = async (file: File, extra: Record<string, any> = {}) => {
    setIsUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      let type = extra.type || 'file';
      if (!extra.type) {
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
      }
      socket.emit('send_message', {
        type, mediaUrl: data.url, fileName: file.name,
        fileSize: file.size, senderId: user.id,
        viewOnce: viewOnce, parentId: replyTo?.id || null, ...extra
      });
      setReplyTo(null);
      setViewOnce(false);
    } catch (err) { console.error('Upload failed', err); }
    finally { setIsUploading(false); setUploadProgress(''); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const triggerFileInput = (accept: string, type?: string) => {
    fileInputType.current = type || accept;
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
    setShowAttach(false);
  };

  const handleAttachSelect = (type: 'image' | 'video' | 'audio' | 'document' | 'camera') => {
    setShowAttach(false);
    if (type === 'camera') { openCamera(); return; }
    const acceptMap = {
      image: 'image/*', video: 'video/*', audio: 'audio/*',
      document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar'
    };
    triggerFileInput(acceptMap[type]);
  };

  // Voice Note
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recStartRef.current = Date.now();

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const dur = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `vn-${Date.now()}.webm`, { type: 'audio/webm' });
        await uploadFile(file, { type: 'audio', duration: dur });
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recTimerRef.current = setInterval(() =>
        setRecordingDuration(Math.round((Date.now() - recStartRef.current) / 1000)), 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') setPermError('Microphone access denied.');
      else setPermError('Failed to start recording.');
      setTimeout(() => setPermError(null), 4000);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(recTimerRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    clearInterval(recTimerRef.current);
  };

  // Camera
  const openCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      setPermError('Camera access denied.');
      setShowCamera(false);
      setTimeout(() => setPermError(null), 4000);
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadFile(file, { type: 'image' });
      closeCamera();
    }, 'image/jpeg');
  };

  const handleSticker = (url: string) => {
    socket.emit('send_message', { type: 'sticker', mediaUrl: url, senderId: user.id });
    setShowStickers(false);
  };

  const handleAddSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/stickers', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
      const data = await res.json();
      setStickers(prev => [data, ...prev]);
    } catch (err) { console.error('Sticker add failed', err); }
  };

  const handleReaction = (messageId: number, emoji: string) => {
    socket.emit('add_reaction', { messageId, userId: user.id, emoji });
  };

  const typingList = Object.values(typingUsers).filter(Boolean) as string[];
  const filteredUsers = Array.isArray(onlineUsers)
    ? onlineUsers.filter(u => u.username?.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const closeAllPanels = () => {
    setShowStickers(false);
    setShowAttach(false);
    setShowEmojiPicker(false);
  };

  return (
    <div
      className={cn('flex h-screen overflow-hidden font-sans antialiased', t.bg)}
      onClick={closeAllPanels}
    >
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        'flex flex-col w-[340px] md:w-[340px] flex-shrink-0 border-r z-50 transition-transform duration-300',
        t.sidebar, t.sidebarBorder,
        'fixed md:relative inset-y-0 left-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        {/* Sidebar content switch */}
        {activePanel === 'settings' ? (
          <SettingsPanel
            user={localUser}
            token={token}
            theme={theme}
            toggleTheme={toggleTheme}
            t={t}
            onClose={() => setActivePanel('chat')}
            onUpdateProfile={(data) => setLocalUser((prev: any) => ({ ...prev, ...data }))}
          />
        ) : (
          <>
            {/* Header */}
            <div className={cn('flex items-center justify-between px-4 py-4', t.header)}>
              <h1 className={cn('text-xl font-bold', t.text_primary)}>Nexa</h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={e => { e.stopPropagation(); setActivePanel('settings'); }}
                  className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-colors', t.hover)}
                >
                  <Settings className={cn('w-5 h-5', t.icon)} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); logout(); }}
                  className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-colors', t.hover)}
                >
                  <LogOut className={cn('w-5 h-5', t.icon)} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className={cn('px-3 pb-3', t.header)}>
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-full', t.search_bg)}>
                <Search className={cn('w-4 h-4 flex-shrink-0', t.icon)} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search or start new chat"
                  className={cn('flex-1 bg-transparent text-sm outline-none', t.text_primary, t.placeholder)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Chat list (online users) */}
            <div className="flex-1 overflow-y-auto">
              {/* My Profile row */}
              <div
                className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer border-b', t.hover, t.divider)}
                onClick={() => setActivePanel('settings')}
              >
                <Avatar name={localUser?.username || ''} size={50} online />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold text-sm', t.text_primary)}>{localUser?.username} <span className={cn('text-xs font-normal ml-1', t.text_secondary)}>(You)</span></p>
                  <p className={cn('text-xs truncate', t.text_secondary)}>{localUser?.status_message || 'Hey there!'}</p>
                </div>
                <Settings className={cn('w-4 h-4', t.icon)} />
              </div>

              {/* Online users */}
              <div className={cn('px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider', t.text_secondary)}>
                Online — {filteredUsers.length}
              </div>
              {filteredUsers.map(u => (
                <motion.div
                  key={u.id}
                  layout
                  onClick={() => setSelectedProfileId(u.id)}
                  className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors', t.hover)}
                >
                  <Avatar name={u.username} size={48} online />
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-medium text-sm', t.text_primary)}>{u.username}</p>
                    <p className={cn('text-xs truncate', t.text_secondary)}>{u.status_message || 'Online'}</p>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00a884] flex-shrink-0" />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* ─── Chat Main ───────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Chat Header */}
        <header className={cn('flex items-center justify-between px-4 py-3 border-b z-30 flex-shrink-0', t.header, t.divider)}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className={cn('md:hidden w-9 h-9 rounded-full flex items-center justify-center', t.hover)}
            >
              <Menu className={cn('w-5 h-5', t.icon)} />
            </button>
            <div className="w-10 h-10 rounded-full bg-[#00a884]/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-[#00a884]" />
            </div>
            <div>
              <p className={cn('font-semibold text-[15px]', t.text_primary)}>Nexa Global</p>
              <p className={cn('text-xs', t.text_secondary)}>
                {Array.isArray(onlineUsers) ? onlineUsers.length : 0} members online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleTheme()}
              className={cn('w-9 h-9 rounded-full flex items-center justify-center', t.hover)}
            >
              {theme === 'dark' ? <Sun className={cn('w-5 h-5', t.icon)} /> : <Moon className={cn('w-5 h-5', t.icon)} />}
            </button>
          </div>
        </header>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className={cn('flex-1 overflow-y-auto py-4 space-y-1', t.scroll_bg)}
          style={{
            backgroundImage: theme === 'dark'
              ? 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
              : 'none'
          }}
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-30 select-none">
              <MessageCircle className={cn('w-16 h-16 mb-4', t.text_secondary)} />
              <p className={cn('text-base font-medium', t.text_secondary)}>No messages yet</p>
              <p className={cn('text-sm mt-1', t.text_secondary)}>Start the conversation!</p>
            </div>
          )}

          {messages.map(msg => {
            const isMe = msg.sender_id === user.id;
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMe={isMe}
                theme={theme}
                t={t}
                onReply={() => setReplyTo(msg)}
                onReact={emoji => handleReaction(msg.id, emoji)}
                onProfileClick={() => setSelectedProfileId(msg.sender_id)}
              />
            );
          })}

          {/* Upload progress */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center justify-end px-4"
              >
                <div className={cn('flex items-center gap-3 px-4 py-2 rounded-2xl text-sm', t.bubble_me)}>
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span className="text-[#e9edef] text-xs">{uploadProgress || 'Uploading...'}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="absolute right-6 bottom-28 w-12 h-12 bg-[#00a884] rounded-full flex items-center justify-center shadow-lg z-30"
            >
              <ChevronDown className="w-6 h-6 text-white" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ─── Input Area ──────────────────────────────────── */}
        <div className={cn('flex-shrink-0 px-3 py-3', t.header)}>
          {/* Permission error */}
          <AnimatePresence>
            {permError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 mb-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20"
              >
                <MicOff className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400">{permError}</span>
                <button onClick={() => setPermError(null)} className="ml-auto">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {typingList.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-2 mb-2 px-2"
              >
                <div className="flex gap-1">
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay }}
                      className="w-1.5 h-1.5 rounded-full bg-[#00a884]"
                    />
                  ))}
                </div>
                <span className={cn('text-xs', t.text_secondary)}>
                  {typingList.join(', ')} {typingList.length > 1 ? 'are' : 'is'} typing…
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reply preview */}
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn('flex items-center gap-3 mb-2 px-3 py-2 rounded-xl border-l-4', t.tag, t.reply_bar)}
                style={{ borderLeftColor: '#00a884' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#00a884]">{replyTo.senderUsername}</p>
                  <p className={cn('text-xs truncate', t.text_secondary)}>{replyTo.content || '[Media]'}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className={t.icon}>
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main input row */}
          <div className="flex items-end gap-2 relative" onClick={e => e.stopPropagation()}>
            {/* Emoji + Sticker + Attach */}
            <div className="flex items-center relative">
              {/* Sticker panel */}
              <AnimatePresence>
                {showStickers && (
                  <StickerPanel
                    stickers={stickers}
                    onSend={handleSticker}
                    onAdd={handleAddSticker}
                    theme={theme}
                    t={t}
                  />
                )}
              </AnimatePresence>

              {/* Attach menu */}
              <AnimatePresence>
                {showAttach && (
                  <AttachMenu onSelect={handleAttachSelect} t={t} />
                )}
              </AnimatePresence>

              <button
                onClick={() => { setShowEmojiPicker(v => !v); setShowStickers(false); setShowAttach(false); }}
                className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-colors', t.hover)}
              >
                <Smile className={cn('w-6 h-6', showEmojiPicker ? 'text-[#00a884]' : t.icon)} />
              </button>
            </div>

            {/* Emoji Picker */}
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full mb-3 left-0 z-50"
                  onClick={e => e.stopPropagation()}
                >
                  <EmojiPicker
                    theme={theme === 'dark' ? 'dark' : 'light'}
                    onEmojiClick={e => setContent(c => c + e.emoji)}
                    lazyLoadEmojis
                    height={380}
                    width={320}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Text input box */}
            <div className={cn('flex-1 flex items-end rounded-3xl px-4 py-2 relative', t.input, t.inputBorder, 'border')}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message"
                rows={1}
                className={cn(
                  'flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed max-h-[120px] overflow-y-auto',
                  t.text_primary, t.placeholder
                )}
                style={{ scrollbarWidth: 'none' }}
              />
              <div className="flex items-center gap-1 ml-2 self-end mb-0.5">
                <button
                  onClick={() => { setShowStickers(v => !v); setShowAttach(false); setShowEmojiPicker(false); }}
                  className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hover)}
                >
                  <Sticker className={cn('w-5 h-5', showStickers ? 'text-[#00a884]' : t.icon)} />
                </button>
                <button
                  onClick={() => { setShowAttach(v => !v); setShowStickers(false); setShowEmojiPicker(false); }}
                  className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hover)}
                >
                  <Paperclip className={cn('w-5 h-5', showAttach ? 'text-[#00a884]' : t.icon)} />
                </button>
              </div>
            </div>

            {/* Send / Mic button */}
            {content.trim() ? (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleSend}
                className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg flex-shrink-0"
                style={{ background: '#00a884' }}
              >
                <Send className="w-5 h-5 text-white" />
              </motion.button>
            ) : isRecording ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelRecording}
                  className={cn('w-11 h-11 rounded-full flex items-center justify-center border', t.tag, t.divider)}
                >
                  <X className="w-5 h-5 text-red-400" />
                </button>
                <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-red-500/10">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-red-400 tabular-nums">
                    {formatDuration(recordingDuration)}
                  </span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={stopRecording}
                  className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: '#00a884' }}
                >
                  <Check className="w-5 h-5 text-white" />
                </motion.button>
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={startRecording}
                className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg flex-shrink-0"
                style={{ background: '#00a884' }}
              >
                <Mic className="w-5 h-5 text-white" />
              </motion.button>
            )}
          </div>

          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        </div>
      </main>

      {/* ─── Camera UI ─────────────────────────────────────── */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center"
          >
            <div className="relative w-full max-w-lg aspect-video rounded-2xl overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center gap-8 mt-8">
              <button
                onClick={closeCamera}
                className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white"
              >
                <X className="w-7 h-7" />
              </button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={capturePhoto}
                className="w-20 h-20 rounded-full bg-white flex items-center justify-center"
              >
                <div className="w-16 h-16 rounded-full border-4 border-[#00a884]" />
              </motion.button>
              <div className="w-14 h-14" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
