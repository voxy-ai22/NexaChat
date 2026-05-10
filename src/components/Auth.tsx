import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, User, Mail, Lock, Loader2, MessageCircle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !acceptedTerms) { setError('Please accept the terms'); return; }
    setLoading(true); setError('');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body = isLogin ? { email, password } : { username, email, password };
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      login(data.user, data.token);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111b21] px-4 overflow-hidden">
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-10"
      >
        <div className="w-20 h-20 rounded-3xl bg-[#00a884] flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(0,168,132,0.3)]">
          <MessageCircle className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Nexa Global</h1>
        <p className="text-[#8696a0] text-sm mt-2">Connect with the world, privately.</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-[#202c33] rounded-2xl p-6 shadow-2xl border border-[#2a3942]"
      >
        {/* Tab switch */}
        <div className="flex rounded-xl bg-[#111b21] p-1 mb-6">
          {['Login', 'Register'].map((tab, i) => (
            <button
              key={tab}
              onClick={() => { setIsLogin(i === 0); setError(''); }}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                (isLogin ? i === 0 : i === 1) ? 'bg-[#00a884] text-white shadow' : 'text-[#8696a0] hover:text-white'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required={!isLogin}
                    className="w-full bg-[#2a3942] border border-[#2a3942] focus:border-[#00a884] rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none transition-colors placeholder:text-[#8696a0]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-[#2a3942] border border-[#2a3942] focus:border-[#00a884] rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none transition-colors placeholder:text-[#8696a0]"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#2a3942] border border-[#2a3942] focus:border-[#00a884] rounded-xl py-3 pl-10 pr-10 text-white text-sm outline-none transition-colors placeholder:text-[#8696a0]"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-white transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {!isLogin && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
                  acceptedTerms ? 'bg-[#00a884] border-[#00a884]' : 'border-[#8696a0] bg-transparent'
                )}>
                  {acceptedTerms && <ShieldCheck className="w-3 h-3 text-white" />}
                </div>
              </div>
              <span className="text-xs text-[#8696a0] leading-relaxed">
                I agree to the <span className="text-[#00a884]">Terms of Service</span> and confirm I'm not a bot.
              </span>
            </label>
          )}

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-red-400 text-xs text-center bg-red-400/10 py-2 px-3 rounded-lg">
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2',
              loading ? 'bg-[#00a884]/50 cursor-not-allowed' : 'bg-[#00a884] hover:bg-[#00a884]/90 active:scale-[0.98] shadow-lg shadow-[#00a884]/20'
            )}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#8696a0]">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="ml-1.5 text-[#00a884] font-semibold hover:underline">
            {isLogin ? 'Register' : 'Sign In'}
          </button>
        </p>
      </motion.div>

      <p className="mt-8 text-[#2a3942] text-xs text-center">
         Power By Nexa
      </p>
    </div>
  );
}
