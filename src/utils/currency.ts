const DEFAULT_USD_TO_ZAR_RATE = Number(import.meta.env?.VITE_USD_TO_ZAR_RATE || 18.5);
const STORAGE_KEY = 'usdToZarRate';

let runtimeUsdToZarRate = DEFAULT_USD_TO_ZAR_RATE;

function readStoredRate(): number | null {
  if (typeof window === 'undefined') return null;
  const storedRate = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(storedRate) && storedRate > 0 ? storedRate : null;
}

export function usdToZar(value: number): number {
  return Number(value || 0) * getUsdToZarRate();
}

export function formatZarFromUsd(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2,
  }).format(usdToZar(value));
}

export function getUsdToZarRate(): number {
  const storedRate = readStoredRate();
  return storedRate || runtimeUsdToZarRate;
}

export function setUsdToZarRate(rate: number): number {
  const nextRate = Number(rate);
  if (!Number.isFinite(nextRate) || nextRate <= 0) {
    return getUsdToZarRate();
  }

  runtimeUsdToZarRate = nextRate;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(nextRate));
    window.dispatchEvent(new CustomEvent('currency-rate-changed', { detail: { usdToZarRate: nextRate } }));
  }

  return nextRate;
}
