export function Monogram({ name, size = 28 }: { name: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  const initials = (name || "?").slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        background: `oklch(0.42 0.10 ${hue})`,
        color: `oklch(0.95 0.04 ${hue})`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        letterSpacing: "-0.02em",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.06)",
        fontFamily: "var(--font)",
      }}
    >
      {initials}
    </div>
  );
}
