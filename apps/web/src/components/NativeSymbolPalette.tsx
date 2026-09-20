import { NATIVE_SYMBOL_GROUPS } from "../lib/nativeSymbols";

export function NativeSymbolPalette({ groupIndex, onGroupChange, onSelect, disabled = false }: {
  groupIndex: number;
  onGroupChange: (index: number) => void;
  onSelect: (symbol: string) => void;
  disabled?: boolean;
}) {
  return <div role="group" aria-label="內建表情符號"
    style={{ flexBasis: "100%", minWidth: 0, padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
    <div role="group" aria-label="符號分類" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
      {NATIVE_SYMBOL_GROUPS.map((group, index) => <button key={group.name} type="button" disabled={disabled} aria-pressed={groupIndex === index}
        onMouseDown={(event) => event.preventDefault()} onClick={() => onGroupChange(index)}
        style={{ border: 0, borderRadius: 7, height: 32, padding: "0 8px", cursor: disabled ? "default" : "pointer", fontSize: 13, background: groupIndex === index ? "var(--accent-dim)" : "transparent", color: groupIndex === index ? "var(--accent-ink)" : "var(--text-muted)" }}>{group.name}</button>)}
    </div>
    <div key={groupIndex} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))", gap: 4, maxHeight: 200, overflowY: "auto" }}>
      {Array.from(NATIVE_SYMBOL_GROUPS[groupIndex].symbols).map((symbol) => <button key={symbol} type="button" disabled={disabled} aria-label={`插入 ${symbol}`}
        onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(symbol)}
        style={{ border: 0, borderRadius: 7, width: "100%", height: 36, fontSize: 22, background: "transparent", color: "var(--text-muted)", cursor: disabled ? "default" : "pointer" }}>{symbol}</button>)}
    </div>
  </div>;
}
