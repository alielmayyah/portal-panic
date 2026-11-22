/** Five-digit, zero-padded score text (as in the old HUD). */
export const scoreText = (value: number): string => String(Math.max(0, Math.floor(value))).padStart(5, '0');
