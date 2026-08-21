import { describe, it, expect } from 'vitest';
import { ComparisonEngine } from './comparison-engine.js';

// Same math as CanvasManager.normalizePathToCanvas, without the DOM
function makeCanvasManagerStub(width = 500, height = 500) {
  return {
    width,
    height,
    normalizePathToCanvas(path, padding = 40) {
      if (!path || path.length === 0) return [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of path) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      const pathWidth = maxX - minX || 1;
      const pathHeight = maxY - minY || 1;
      const availWidth = width - padding * 2;
      const availHeight = height - padding * 2;
      const scale = Math.min(availWidth / pathWidth, availHeight / pathHeight);
      const offsetX = padding + (availWidth - pathWidth * scale) / 2;
      const offsetY = padding + (availHeight - pathHeight * scale) / 2;
      return path.map(([x, y]) => [
        offsetX + (x - minX) * scale,
        offsetY + (y - minY) * scale,
      ]);
    },
  };
}

const makeDrawingEngineStub = (strokes) => ({ getStrokes: () => strokes });

const penStroke = (points, lineWidth = 3) => ({ points, color: '#000', lineWidth });
const eraserStroke = (points, lineWidth = 6) => ({ points, color: 'eraser', lineWidth });

// Closed square in the 0-100 "region path" coordinate space
const SQUARE_PATH = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

// Densely sample the scaled square outline as {x, y} points, as a user would draw it
function traceOfScaledSquare(cm, fraction = 1) {
  const scaled = cm.normalizePathToCanvas(SQUARE_PATH, 40).map(([x, y]) => ({ x, y }));
  const points = [];
  const segments = Math.floor((scaled.length - 1) * fraction) || 1;
  for (let s = 0; s < segments; s++) {
    const a = scaled[s];
    const b = scaled[s + 1];
    for (let i = 0; i < 50; i++) {
      const t = i / 50;
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return points;
}

describe('resamplePolygon', () => {
  it('returns the requested number of equally spaced points', () => {
    const engine = new ComparisonEngine();
    const out = engine.resamplePolygon(SQUARE_PATH, 60);
    expect(out).toHaveLength(60);
  });
});

describe('getEffectiveUserPoints', () => {
  it('removes points covered by a later eraser stroke', () => {
    const engine = new ComparisonEngine();
    const bad = penStroke([{ x: 10, y: 10 }, { x: 12, y: 10 }]);
    const erase = eraserStroke([{ x: 10, y: 10 }, { x: 12, y: 10 }]);
    const good = penStroke([{ x: 200, y: 200 }, { x: 210, y: 200 }]);
    const points = engine.getEffectiveUserPoints([bad, erase, good]);
    expect(points).toHaveLength(2);
    expect(points[0].x).toBe(200);
  });

  it('does not remove strokes drawn after the eraser pass', () => {
    const engine = new ComparisonEngine();
    const erase = eraserStroke([{ x: 10, y: 10 }]);
    const stroke = penStroke([{ x: 10, y: 10 }, { x: 11, y: 10 }]);
    expect(engine.getEffectiveUserPoints([erase, stroke])).toHaveLength(2);
  });
});

describe('compare', () => {
  it('scores 0 for an empty drawing', () => {
    const engine = new ComparisonEngine();
    const cm = makeCanvasManagerStub();
    const { score } = engine.compare(cm, makeDrawingEngineStub([]), SQUARE_PATH);
    expect(score).toBe(0);
  });

  it('scores near 100 for a perfect trace', () => {
    const engine = new ComparisonEngine();
    const cm = makeCanvasManagerStub();
    const de = makeDrawingEngineStub([penStroke(traceOfScaledSquare(cm))]);
    const { score } = engine.compare(cm, de, SQUARE_PATH);
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it('penalizes tracing only part of the border', () => {
    const engine = new ComparisonEngine();
    const cm = makeCanvasManagerStub();
    const full = engine.compare(
      cm,
      makeDrawingEngineStub([penStroke(traceOfScaledSquare(cm))]),
      SQUARE_PATH
    ).score;
    const partial = engine.compare(
      cm,
      makeDrawingEngineStub([penStroke(traceOfScaledSquare(cm, 0.25))]),
      SQUARE_PATH
    ).score;
    expect(partial).toBeLessThan(full - 20);
    expect(partial).toBeLessThan(75);
  });

  it('ignores strokes that were fully erased', () => {
    const engine = new ComparisonEngine();
    const cm = makeCanvasManagerStub();

    // A wild scribble in the corner, later erased, then a clean trace
    const scribblePts = Array.from({ length: 30 }, (_, i) => ({ x: 60 + i, y: 60 }));
    const strokes = [
      penStroke(scribblePts),
      eraserStroke(scribblePts, 6),
      penStroke(traceOfScaledSquare(cm)),
    ];
    const withErased = engine.compare(cm, makeDrawingEngineStub(strokes), SQUARE_PATH).score;
    const cleanOnly = engine.compare(
      cm,
      makeDrawingEngineStub([penStroke(traceOfScaledSquare(cm))]),
      SQUARE_PATH
    ).score;
    expect(withErased).toBe(cleanOnly);
  });
});
