// Draw common terminal graphics across the entire cell, independent of fallback fonts.
const boxPaths: Record<string, string> = {
  "─": "M0 1H2", "│": "M1 0V2",
  "┌": "M1 2V1H2", "┐": "M0 1H1V2", "└": "M1 0V1H2", "┘": "M0 1H1V0",
  "├": "M1 0V2M1 1H2", "┤": "M1 0V2M0 1H1", "┬": "M0 1H2M1 1V2",
  "┴": "M0 1H2M1 0V1", "┼": "M0 1H2M1 0V2",
};

export function TerminalGlyph({ text }: { text: string }) {
  const point = text.codePointAt(0)!;
  const block = point >= 0x2580 && point <= 0x2590;
  const path = boxPaths[text];
  const rectangle = { x: 0, y: 0, width: 2, height: 2 };
  if (point === 0x2580) rectangle.height = 1;
  else if (point >= 0x2581 && point <= 0x2587) {
    rectangle.height = (point - 0x2580) / 4;
    rectangle.y = 2 - rectangle.height;
  } else if (point >= 0x2589 && point <= 0x258f) rectangle.width = (0x2590 - point) / 4;
  else if (point === 0x2590) { rectangle.x = 1; rectangle.width = 1; }
  return <span data-terminal-wide="true" data-terminal-glyph={text}
    style={{ display: "inline-block", width: `${text.length * 2}ch`, height: "1.2em", verticalAlign: "top", textAlign: "center", position: "relative" }}>
    {path || block ? <>
      <span style={{ opacity: 0 }}>{text}</span>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 2 2" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {path ? <path d={path} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          : <rect {...rectangle} fill="currentColor" />}
      </svg>
    </> : text}
  </span>;
}
