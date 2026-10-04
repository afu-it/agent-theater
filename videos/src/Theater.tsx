import type { Scene } from "../../plugins/agent-theater/types";
import { cellRows, EMPTY_SCENE, type PaintOptions } from "../../plugins/agent-theater/hooks/stage";
import { mono } from "./tokens";

const DEFAULT = 0x01000000;
const UPPER_HALF = 0x2580;
const LOWER_HALF = 0x2584;

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

// The mod's own frames, drawn cell for cell: half blocks become two square
// pixels, every other glyph is text on its background.
export function Theater({
  scene,
  tick,
  options,
  cell,
}: {
  scene: Partial<Scene> & Pick<Scene, "action">;
  tick: number;
  options: PaintOptions;
  cell: number;
}) {
  const rows = cellRows({ ...EMPTY_SCENE, ...scene }, tick, options);
  const width = rows[0]!.length * cell;
  const height = rows.length * cell * 2;
  const h = cell * 2;
  const rects: React.ReactNode[] = [];
  const glyphs: React.ReactNode[] = [];
  rows.forEach((row, r) =>
    row.forEach(([codePoint, fg, bg], c) => {
      const x = c * cell;
      const y = r * h;
      const key = `${r}-${c}`;
      if (codePoint === UPPER_HALF || codePoint === LOWER_HALF) {
        const top = codePoint === UPPER_HALF ? fg : bg;
        const bottom = codePoint === UPPER_HALF ? bg : fg;
        if (top !== DEFAULT) rects.push(<rect key={`${key}t`} x={x} y={y} width={cell + 0.5} height={cell + 0.5} fill={css(top)} />);
        if (bottom !== DEFAULT) rects.push(<rect key={`${key}b`} x={x} y={y + cell} width={cell + 0.5} height={cell + 0.5} fill={css(bottom)} />);
        return;
      }
      if (bg !== DEFAULT) rects.push(<rect key={`${key}g`} x={x} y={y} width={cell + 0.5} height={h + 0.5} fill={css(bg)} />);
      if (codePoint !== 0x20)
        glyphs.push(
          <text key={`${key}c`} x={x + cell / 2} y={y + h * 0.72} fill={css(fg)} textAnchor="middle" fontSize={cell * 1.55} fontFamily={mono}>
            {String.fromCodePoint(codePoint)}
          </text>,
        );
    }),
  );
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", shapeRendering: "crispEdges" }}>
      {rects}
      {glyphs}
    </svg>
  );
}
