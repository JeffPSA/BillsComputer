/**
 * Utility functions for reliable TCG card image resolution and fallbacks.
 */

import type { SyntheticEvent } from 'react';

export const DEFAULT_CARD_IMAGE = 'https://images.pokemontcg.io/sv1/1_hires.png';

/**
 * Returns a valid, non-empty image URL for a card printing or card, with intelligent fallback.
 */
export function getImageUrl(printing?: any, card?: any): string {
  if (printing?.imageUrl && typeof printing.imageUrl === 'string' && printing.imageUrl.trim().length > 0) {
    return printing.imageUrl.trim();
  }

  // Try defaultPrinting on card if available
  if (card?.printings && Array.isArray(card.printings) && card.printings.length > 0) {
    const firstWithImage = card.printings.find((p: any) => p.imageUrl && p.imageUrl.trim().length > 0);
    if (firstWithImage) {
      return firstWithImage.imageUrl.trim();
    }
  }

  // Construct URL from set code and card number if possible
  const setCode = printing?.setCode || card?.printings?.[0]?.setCode;
  const cardNumber = printing?.cardNumber || card?.printings?.[0]?.cardNumber;

  if (setCode && cardNumber) {
    const cleanSet = setCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanNum = cardNumber.replace(/[^0-9]/g, '');
    if (cleanSet && cleanNum) {
      return `https://images.pokemontcg.io/${cleanSet}/${cleanNum}_hires.png`;
    }
  }

  return DEFAULT_CARD_IMAGE;
}

/**
 * Image error handler callback for <img> tags to safely set fallback on broken URLs.
 */
export function handleImageError(e: SyntheticEvent<HTMLImageElement, Event>) {
  const target = e.currentTarget;
  if (target.src !== DEFAULT_CARD_IMAGE) {
    target.src = DEFAULT_CARD_IMAGE;
  }
}
