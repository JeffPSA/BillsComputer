import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { DeckList } from './components/DeckBuilder/DeckList';
import { DeckEditor } from './components/DeckBuilder/DeckEditor';
import { CollectionManager } from './components/Collection/CollectionManager';
import { DatabaseCardBrowser } from './components/CardBrowser/DatabaseCardBrowser';
import { AllocationsDashboard } from './components/Allocations/AllocationsDashboard';
import { AssembleDeckView } from './components/AssembleDeck/AssembleDeckView';
import { BulkHunterView } from './components/BulkHunter/BulkHunterView';
import { ShoppingAssistant } from './components/Shopping/ShoppingAssistant';
import { WishlistManager } from './components/Wishlist/WishlistManager';
import { AdminPortal } from './components/Admin/AdminPortal';
import { ImportLimitlessModal } from './components/ImportLimitlessModal';
import { QuickAddCollectionModal } from './components/QuickAddCollectionModal';
import { LoginModal } from './components/LoginModal';
import {
  fetchDecks,
  fetchCollection,
  fetchCards,
  saveDeck,
  deleteDeck,
  autoAllocateDeck,
  updateCollectionItem,
  createCustomCard,
  checkAuth,
  logout,
  fetchCurrencySettings
} from './services/api';
import { setUsdToZarRate } from './utils/currency';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [bulkHunterDeckId, setBulkHunterDeckId] = useState<string>('ALL');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const [decks, setDecks] = useState<any[]>([]);
  const [collection, setCollection] = useState<any[]>([]);
  const [allCards, setAllCards] = useState<any[]>([]);
  const [allCardsLoaded, setAllCardsLoaded] = useState(false);
  const [allCardsLoading, setAllCardsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [, setCurrencyRateVersion] = useState(0);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  // Check auth on mount
  useEffect(() => {
    const checkAuthentication = async () => {
      const isValid = await checkAuth();
      setIsAuthenticated(isValid);
      setAuthLoading(false);
      if (!isValid) {
        setShowLoginModal(true);
      }
    };
    checkAuthentication();
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setShowLoginModal(false);
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setShowLoginModal(true);
    setDecks([]);
    setCollection([]);
    setAllCards([]);
    setAllCardsLoaded(false);
    setAllCardsLoading(false);
    setLoading(false);
  };

  const refreshAllData = async () => {
    try {
      const [dList, cList, currencySettings] = await Promise.all([
        fetchDecks(),
        fetchCollection(),
        fetchCurrencySettings().catch(() => null),
      ]);
      if (currencySettings?.usdToZarRate) {
        setUsdToZarRate(Number(currencySettings.usdToZarRate));
        setCurrencyRateVersion((version) => version + 1);
      }
      setDecks(dList || []);
      setCollection(cList || []);
      setLoading(false);
    } catch (err) {
      console.error('Error refreshing app data:', err);
      setDecks([]);
      setCollection([]);
      setLoading(false);
    }
  };

  const loadAllCardsData = async () => {
    if (allCardsLoaded || allCardsLoading) return;

    setAllCardsLoading(true);
    try {
      const cardList = await fetchCards();
      setAllCards(cardList || []);
      setAllCardsLoaded(true);
    } catch (err) {
      console.error('Error loading card catalog:', err);
      setAllCards([]);
    } finally {
      setAllCardsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshAllData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'bulk-hunter' || activeTab === 'shopping' || activeTab === 'wishlist') {
      loadAllCardsData();
    }
  }, [activeTab, isAuthenticated]);

  // Handlers
  const handleAutoAllocate = async (deckId: string) => {
    await autoAllocateDeck(deckId);
    await refreshAllData();
  };

  const handleAutoAllocateAll = async () => {
    for (const d of decks) {
      if (d.status === 'Active') {
        await autoAllocateDeck(d.id);
      }
    }
    await refreshAllData();
  };

  const handleDeleteDeck = async (deckId: string): Promise<void> => {
    if (window.confirm('Delete this deck list? Physical card allocations will be released back to collection.')) {
      try {
        const response = await deleteDeck(deckId);
        if (!response.success) {
          throw new Error(response.error || 'Failed to delete deck');
        }
        if (selectedDeckId === deckId) {
          setSelectedDeckId(null);
        }
        await refreshAllData();
      } catch (error) {
        console.error('Failed to delete deck:', error);
        alert('Unable to delete deck. Please try again.');
        throw error; // Re-throw to allow caller to handle
      }
    }
  };

  const handleToggleDeckStatus = async (deckId: string, newStatus: string) => {
    await saveDeck({ id: deckId, status: newStatus as any });
    await refreshAllData();
  };

  const handleCreateNewDeck = async () => {
    const newDeck = await saveDeck({
      name: `New Pokémon Deck #${decks.length + 1}`,
      version: 'v1.0',
      format: 'Standard',
      status: 'Active',
      isPermanentlyAssembled: false,
    });
    await refreshAllData();
    setSelectedDeckId(newDeck.id);
    setActiveTab('decks');
  };

  const handleUpdateDeckReq = async (
    reqId: string,
    quantity: number,
    mode?: any,
    preferredPrintingId?: string
  ) => {
    const currentDeck = decks.find((d) => d.id === selectedDeckId);
    if (!currentDeck) return;

    const existingReqs = currentDeck.requirements.map((r: any) => {
      if (r.requirement.id === reqId) {
        return {
          id: r.requirement.id,
          cardId: r.card.id,
          quantity,
          requirementMode: mode || r.requirement.requirementMode,
          preferredPrintingId: preferredPrintingId !== undefined ? preferredPrintingId : r.requirement.preferredPrintingId,
        };
      }
      return {
        id: r.requirement.id,
        cardId: r.card.id,
        quantity: r.requirement.quantity,
        requirementMode: r.requirement.requirementMode,
        preferredPrintingId: r.requirement.preferredPrintingId,
      };
    });

    await saveDeck({ id: currentDeck.id, requirements: existingReqs });
    await refreshAllData();
  };

  const handleAddCardToDeck = async (cardId: string, quantity: number) => {
    const currentDeck = decks.find((d) => d.id === selectedDeckId);
    if (!currentDeck) return;

    const existingReqs = currentDeck.requirements.map((r: any) => ({
      id: r.requirement.id,
      cardId: r.card.id,
      quantity: r.requirement.quantity,
      requirementMode: r.requirement.requirementMode,
      preferredPrintingId: r.requirement.preferredPrintingId,
    }));

    const existingIndex = existingReqs.findIndex((r: any) => r.cardId === cardId);
    if (existingIndex !== -1) {
      existingReqs[existingIndex].quantity += quantity;
    } else {
      existingReqs.push({
        cardId,
        quantity,
        requirementMode: 'ANY_PRINTING',
      });
    }

    await saveDeck({ id: currentDeck.id, requirements: existingReqs });
    await refreshAllData();
  };

  const handleRemoveRequirement = async (reqId: string) => {
    const currentDeck = decks.find((d) => d.id === selectedDeckId);
    if (!currentDeck) return;

    const filteredReqs = currentDeck.requirements
      .filter((r: any) => r.requirement.id !== reqId)
      .map((r: any) => ({
        id: r.requirement.id,
        cardId: r.card.id,
        quantity: r.requirement.quantity,
        requirementMode: r.requirement.requirementMode,
        preferredPrintingId: r.requirement.preferredPrintingId,
      }));

    await saveDeck({ id: currentDeck.id, requirements: filteredReqs });
    await refreshAllData();
  };

  const handleUpdateCollectionItem = async (item: any) => {
    try {
      const response = await updateCollectionItem(item);
      if (response && response.error) {
        throw new Error(response.error);
      }
      await refreshAllData();
    } catch (error: any) {
      console.error('Failed to update collection item:', error);
      alert(error.message || 'Unable to update collection item. Please try again.');
    }
  };

  const activeSelectedDeck = decks.find((d) => d.id === selectedDeckId);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-yellow-400 selection:text-indigo-950 ${theme === 'dark' ? 'dark-theme' : ''}`}>
      {authLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-indigo-700 font-bold">Loading...</div>
        </div>
      ) : (
        <>
          <Navbar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              if (tab !== 'decks') {
                setSelectedDeckId(null);
              }
            }}
            onOpenImportModal={() => setShowImportModal(true)}
            onOpenQuickAddCollection={() => setShowQuickAddModal(true)}
            onLogout={handleLogout}
            isAuthenticated={isAuthenticated}
            theme={theme}
            onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
          />

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {loading && (
              <div className="py-20 text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading physical collection and deck manager...
              </div>
            )}

            {!loading && isAuthenticated && (
              <>
                {activeTab === 'dashboard' && (
                  <Dashboard
                    decks={decks}
                    collection={collection}
                    setActiveTab={setActiveTab}
                    onSelectDeck={(deckId) => {
                      setSelectedDeckId(deckId);
                      setActiveTab('decks');
                    }}
                    onOpenImportModal={() => setShowImportModal(true)}
                    onOpenQuickAddCollection={() => setShowQuickAddModal(true)}
                  />
                )}

                {activeTab === 'decks' && (
              <>
                {!activeSelectedDeck ? (
                  <DeckList
                    decks={decks}
                    onSelectDeck={(deckId) => setSelectedDeckId(deckId)}
                    onCreateNewDeck={handleCreateNewDeck}
                    onDeleteDeck={handleDeleteDeck}
                    onAutoAllocate={handleAutoAllocate}
                    onOpenImportModal={() => setShowImportModal(true)}
                    onDeckDeleted={refreshAllData}
                    onHuntMissingCards={(deckId) => {
                      setBulkHunterDeckId(deckId);
                      setActiveTab('bulk-hunter');
                    }}
                  />
                ) : (
                  <DeckEditor
                    deck={activeSelectedDeck}
                    allCards={allCards}
                    onBack={() => setSelectedDeckId(null)}
                    onUpdateDeckRequirement={handleUpdateDeckReq}
                    onAddCardToDeck={handleAddCardToDeck}
                    onRemoveRequirement={handleRemoveRequirement}
                    onAutoAllocate={handleAutoAllocate}
                    onHuntMissingCards={(deckId) => {
                      setBulkHunterDeckId(deckId);
                      setActiveTab('bulk-hunter');
                    }}
                  />
                )}
              </>
            )}

            {activeTab === 'collection' && (
              <CollectionManager
                collection={collection}
                allCards={allCards}
                onUpdateItem={handleUpdateCollectionItem}
                onOpenQuickAdd={() => setShowQuickAddModal(true)}
              />
            )}

            {activeTab === 'browser' && (
              <DatabaseCardBrowser onCollectionChanged={refreshAllData} />
            )}

            {activeTab === 'allocations' && (
              <AllocationsDashboard
                decks={decks}
                collection={collection}
                onAutoAllocateAll={handleAutoAllocateAll}
                onToggleDeckStatus={handleToggleDeckStatus}
                onRefreshAllData={refreshAllData}
              />
            )}

            {activeTab === 'assemble' && (
              <AssembleDeckView
                decks={decks}
                selectedDeckId={selectedDeckId}
                onSelectDeck={setSelectedDeckId}
              />
            )}

            {activeTab === 'bulk-hunter' && (
              <BulkHunterView
                decks={decks}
                allCards={allCards}
                initialDeckId={bulkHunterDeckId}
                onRefreshCollection={refreshAllData}
              />
            )}

            {activeTab === 'shopping' && <ShoppingAssistant allCards={allCards} />}

            {activeTab === 'wishlist' && (
              <WishlistManager
                allCards={allCards}
                onNavigateToBulk={() => setActiveTab('bulk-hunter')}
                onNavigateToShopping={() => setActiveTab('shopping')}
              />
            )}

            {activeTab === 'admin' && <AdminPortal />}
              </>
            )}
          </main>

      {/* Modals */}
      {showImportModal && (
        <ImportLimitlessModal
          onClose={() => setShowImportModal(false)}
          onImportSuccess={(newDeck) => {
            setShowImportModal(false);
            refreshAllData();
            setSelectedDeckId(newDeck.id);
            setActiveTab('decks');
          }}
        />
      )}

      {showQuickAddModal && (
        <QuickAddCollectionModal
          allCards={allCards}
          onClose={() => setShowQuickAddModal(false)}
          onSuccess={() => refreshAllData()}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
        </>
      )}
    </div>
  );
}
