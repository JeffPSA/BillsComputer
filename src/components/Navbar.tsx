import React from 'react';
import {
  Layers,
  Box,
  Share2,
  Compass,
  ShoppingBag,
  Bookmark,
  LayoutDashboard,
  Plus,
  LogOut,
  Database,
  Moon,
  Sun
} from 'lucide-react';



export type ActiveTab =
  | 'dashboard'
  | 'decks'
  | 'collection'
  | 'allocations'
  | 'assemble'
  | 'bulk-hunter'
  | 'shopping'
  | 'wishlist'
  | 'admin';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenImportModal: () => void;
  onOpenQuickAddCollection: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenImportModal,
  onOpenQuickAddCollection,
  onLogout,
  isAuthenticated,
  theme,
  onToggleTheme,
}: NavbarProps) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'decks', label: 'Decks', icon: <Layers className="w-4 h-4" /> },
    { id: 'collection', label: 'Collection', icon: <Box className="w-4 h-4" /> },
    { id: 'allocations', label: 'Allocations', icon: <Share2 className="w-4 h-4" /> },
    { id: 'bulk-hunter', label: 'Bulk Hunter', icon: <Compass className="w-4 h-4" />, badge: 'Mobile' },
    { id: 'shopping', label: 'Shopping', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'wishlist', label: 'Wishlist', icon: <Bookmark className="w-4 h-4" /> },
    { id: 'admin', label: 'Admin', icon: <Database className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-indigo-700 border-b border-indigo-900 sticky top-0 z-40 text-white shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-9 h-9 shadow-md flex items-center">
              <img
                src="/android-chrome-192x192.png"
                alt=""
                className="w-8 h-8 object-contain"
              />
            </div>
            <div>
              <span className="font-black text-xl italic uppercase tracking-tighter text-white">
                Bill's PC
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] px-2.5 py-0.5 bg-indigo-900 text-yellow-300 rounded-full font-bold uppercase tracking-wider border border-indigo-500">
                Limitless + Inventory
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleTheme}
              className="inline-flex h-8 w-8 items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 stroke-[2.5]" /> : <Moon className="w-3.5 h-3.5 stroke-[2.5]" />}
            </button>
            <button
              onClick={onOpenQuickAddCollection}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Add Cards</span>
            </button>
            <button
              onClick={onOpenImportModal}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-900/30 transition"
            >
              <Layers className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Import Limitless Deck</span>
            </button>
            {isAuthenticated && onLogout && (
              <button
                onClick={onLogout}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-bold rounded-xl border border-red-500/30 transition"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex space-x-1.5 overflow-x-auto pb-2 scrollbar-none border-t border-indigo-600/60 pt-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 text-xs rounded-2xl whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-white text-indigo-700 font-black shadow-lg shadow-indigo-950/20 scale-105'
                    : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                      isActive ? 'bg-yellow-400 text-indigo-950' : 'bg-indigo-900/80 text-indigo-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
