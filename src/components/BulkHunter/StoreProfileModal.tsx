import React, { useState } from 'react';
import { Settings, Plus, Trash2, Check, Store, Copy, Star } from 'lucide-react';
import { StoreProfile, StoreCategory, BulkLocationOverride } from '../../types/tcg';
import {
  saveStoreProfile,
  duplicateStoreProfile,
  setDefaultStoreProfile,
  deleteStoreProfile,
} from '../../services/api';

interface StoreProfileModalProps {
  storeProfile: StoreProfile;
  allCards: any[];
  onClose: () => void;
  onSaveSuccess: () => void;
}

export const StoreProfileModal: React.FC<StoreProfileModalProps> = ({
  storeProfile,
  allCards,
  onClose,
  onSaveSuccess,
}) => {
  const [profileName, setProfileName] = useState(storeProfile.name);
  const [categories, setCategories] = useState<StoreCategory[]>(storeProfile.categories || []);
  const [overrides, setOverrides] = useState<BulkLocationOverride[]>(storeProfile.overrides || []);

  // New Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // New Override Form
  const [overrideCardId, setOverrideCardId] = useState('');
  const [overrideSupertype, setOverrideSupertype] = useState('');
  const [overrideRarity, setOverrideRarity] = useState('');
  const [targetCategoryId, setTargetCategoryId] = useState(categories[0]?.id || '');

  const [loading, setLoading] = useState(false);

  const handleAddCategory = () => {
    if (!newCatName) return;
    const newCat: StoreCategory = {
      id: `cat_${Date.now()}`,
      name: newCatName,
      description: newCatDesc,
      sortOrder: categories.length + 1,
    };
    setCategories([...categories, newCat]);
    if (!targetCategoryId) setTargetCategoryId(newCat.id);
    setNewCatName('');
    setNewCatDesc('');
  };

  const handleRemoveCategory = (catId: string) => {
    setCategories(categories.filter((c) => c.id !== catId));
    setOverrides(overrides.filter((o) => o.categoryId !== catId));
  };

  const handleAddOverride = () => {
    if (!targetCategoryId) return;
    if (!overrideCardId && !overrideSupertype && !overrideRarity) return;

    const newOv: BulkLocationOverride = {
      id: `ov_${Date.now()}`,
      storeProfileId: storeProfile.id,
      cardId: overrideCardId || undefined,
      supertype: (overrideSupertype as any) || undefined,
      rarity: (overrideRarity as any) || undefined,
      categoryId: targetCategoryId,
    };

    setOverrides([...overrides, newOv]);
    setOverrideCardId('');
    setOverrideSupertype('');
    setOverrideRarity('');
  };

  const handleRemoveOverride = (ovId: string) => {
    setOverrides(overrides.filter((o) => o.id !== ovId));
  };

  const handleDuplicate = async () => {
    setLoading(true);
    await duplicateStoreProfile(storeProfile.id);
    setLoading(false);
    onSaveSuccess();
    onClose();
  };

  const handleSetDefault = async () => {
    setLoading(true);
    await setDefaultStoreProfile(storeProfile.id);
    setLoading(false);
    onSaveSuccess();
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete store profile "${storeProfile.name}"?`)) {
      setLoading(true);
      await deleteStoreProfile(storeProfile.id);
      setLoading(false);
      onSaveSuccess();
      onClose();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await saveStoreProfile({
      id: storeProfile.id,
      name: profileName,
      categories,
      overrides,
    });
    setLoading(false);
    onSaveSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-4 border-indigo-900 rounded-[32px] max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-700 stroke-[2.5]" />
            <h2 className="text-base font-black italic uppercase tracking-tight text-slate-900">
              Configure Store Bulk Layout & Overrides
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-black text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Store Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-slate-700">Store Profile Name:</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            />
          </div>

          {/* Categories List & Form */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-900">Physical Box Categories ({categories.length})</h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex justify-between items-center text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-700 text-white font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900">{cat.name}</span>
                      {cat.description && <span className="text-slate-500 text-[11px] block">{cat.description}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <input
                type="text"
                placeholder="Category Name (e.g. Trainers Box)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
              />
              <input
                type="text"
                placeholder="Description / Box #"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-black text-xs uppercase rounded-xl py-2 flex items-center justify-center space-x-1"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Box Category</span>
              </button>
            </div>
          </div>

          {/* Bulk Location Overrides Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-black uppercase text-slate-900">Custom Location Overrides ({overrides.length})</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Force specific cards, rarities, or supertypes directly into custom store box categories.
            </p>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {overrides.map((ov) => {
                const targetCat = categories.find((c) => c.id === ov.categoryId);
                const targetCard = allCards.find((c) => c.id === ov.cardId);

                return (
                  <div key={ov.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900">
                        {targetCard ? targetCard.name : ov.rarity ? `${ov.rarity} Rarity` : ov.supertype ? `${ov.supertype} Supertype` : 'Rule'}
                      </span>
                      <span className="text-indigo-700 font-bold ml-2">→ {targetCat?.name || 'Category'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveOverride(ov.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
              <select
                value={overrideCardId}
                onChange={(e) => setOverrideCardId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:outline-none"
              >
                <option value="">By Specific Card...</option>
                {allCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={overrideRarity}
                onChange={(e) => setOverrideRarity(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:outline-none"
              >
                <option value="">By Rarity...</option>
                <option value="Common">Common</option>
                <option value="Uncommon">Uncommon</option>
                <option value="Rare">Rare</option>
                <option value="Double Rare">Double Rare</option>
                <option value="ACE SPEC">ACE SPEC</option>
              </select>

              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:outline-none"
              >
                <option value="">Target Box Category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddOverride}
                className="bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-xs uppercase rounded-xl py-2 flex items-center justify-center space-x-1"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Apply Override</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200">
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleDuplicate}
                title="Duplicate this store layout"
                className="inline-flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate Preset</span>
              </button>

              <button
                type="button"
                onClick={handleSetDefault}
                title="Set as primary store layout"
                className={`inline-flex items-center space-x-1 px-3 py-2 text-xs font-bold rounded-xl border transition ${
                  storeProfile.isDefault
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>{storeProfile.isDefault ? 'Default Store' : 'Set Default'}</span>
              </button>

              <button
                type="button"
                onClick={handleDelete}
                title="Delete this store layout"
                className="p-2 bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-500 rounded-xl border border-slate-200 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 text-xs font-black uppercase rounded-2xl shadow-md transition"
              >
                {loading ? 'Saving Layout...' : 'Save Store Profile'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
