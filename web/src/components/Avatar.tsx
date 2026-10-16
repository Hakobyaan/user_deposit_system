const PALETTE = [
  ['#d4ff4f', '#8fe36a'],
  ['#9d8cff', '#c7a8ff'],
  ['#7cf5b4', '#4fd1e8'],
  ['#ffb86b', '#ff8f7a'],
  ['#8ec5ff', '#b4a4ff'],
  ['#ff9ecf', '#ffc28f'],
];

export function Avatar({ userId, size = 32 }: { userId: number; size?: number }) {
  const [a, b] = PALETTE[(userId - 1 + PALETTE.length) % PALETTE.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      U{userId}
    </span>
  );
}
