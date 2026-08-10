import React, { useState } from 'react';
import { Lock, X, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Please enter a password');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        onLoginSuccess();
      } else {
        setErrorMsg(data.error || 'Invalid password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border-4 border-indigo-900">
        {/* Header */}
        <div className="bg-indigo-700 px-6 py-4 rounded-t-2xl border-b-4 border-indigo-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-full border-2 border-indigo-900 flex items-center justify-center">
              <Lock className="w-4 h-4 text-indigo-950" />
            </div>
            <h2 className="text-lg font-black italic uppercase tracking-tight text-white">
              Bill's Computer
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
              disabled={loading}
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black uppercase text-sm py-3 rounded-2xl shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>

          <p className="text-xs text-slate-500 text-center font-medium">
            Enter your password to access Bill's Computer
          </p>
        </div>
      </div>
    </div>
  );
};
