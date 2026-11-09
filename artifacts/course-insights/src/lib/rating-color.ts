type RGB = readonly [number, number, number];

const RED: RGB = [239, 68, 68];
const YELLOW: RGB = [234, 179, 8];
const GREEN: RGB = [34, 197, 94];

function blend(from: RGB, to: RGB, amount: number): string {
  const channels = from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * amount),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function ratingBarColor(rating: number): string {
  if (!Number.isFinite(rating) || rating <= 3) return '#ef4444';
  if (rating < 4) return blend(RED, YELLOW, rating - 3);
  if (rating < 4.8) return blend(YELLOW, GREEN, (rating - 4) / 0.8);
  return '#22c55e';
}

export function recentProfessorScoreColor(rating: number): string {
  if (rating < 4) return 'hsl(276 55% 78%)';
  if (!Number.isFinite(rating)) return '#ef4444';
  if (rating < 4.5) return 'hsl(276 50% 52%)';
  return 'hsl(276 70% 30%)';
}

export function ratingBarFillPercent(rating: number): number {
  if (!Number.isFinite(rating)) return 10;
  return Math.min(100, Math.max(10, ((rating - 3) / 2) * 100));
}
