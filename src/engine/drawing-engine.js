import { getStroke } from 'perfect-freehand';

/**
 * DrawingEngine - Handles user drawing input via Pointer Events
 * Supports touch + mouse, Bézier smoothing, eraser, undo/redo
 */
export class DrawingEngine {
  constructor(canvasManager, options = {}) {
    this.cm = canvasManager;
    this.options = {
      color: options.color || '#3d2b1f',
      lineWidth: options.lineWidth || 3,
      smoothing: options.smoothing !== false,
      theme: options.theme || 'day',
    };

    this.strokes = [];
    this.currentStroke = null;
    this.redoStack = [];
    this.isDrawing = false;
    this.isEraser = false;
    this.brushSize = this.options.lineWidth;
    this.enabled = false;
    this.extraRenderFn = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    // Re-render when canvas resizes to prevent cleared background
    this.cm.setOnResize(() => {
      this.render();
    });
  }

  enable() {
    const canvas = this.cm.getCanvas();
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    this.enabled = true;
  }

  disable() {
    const canvas = this.cm.getCanvas();
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('pointerleave', this._onPointerUp);
    canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.enabled = false;
  }

  _onPointerDown(e) {
    e.preventDefault();
    this.isDrawing = true;
    const pos = this.cm.pageToCanvas(e.clientX, e.clientY);
    this.currentStroke = {
      points: [pos],
      color: this.isEraser ? 'eraser' : this.options.color,
      lineWidth: this.brushSize,
      timestamp: Date.now()
    };
  }

  _onPointerMove(e) {
    if (!this.isDrawing || !this.currentStroke) return;
    e.preventDefault();
    const pos = this.cm.pageToCanvas(e.clientX, e.clientY);
    this.currentStroke.points.push(pos);
    this.render();
  }

  _onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    if (this.currentStroke && this.currentStroke.points.length > 1) {
      if (this.options.smoothing) {
        this.currentStroke.points = this.smoothStroke(this.currentStroke.points);
      }
      this.strokes.push(this.currentStroke);
      this.redoStack = [];
    }
    this.currentStroke = null;
    this.render();
  }

  /** Apply Bézier smoothing for natural-looking strokes */
  smoothStroke(points) {
    if (points.length < 3) return points;
    const smoothed = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      smoothed.push({
        x: curr.x * 0.5 + (prev.x + next.x) * 0.25,
        y: curr.y * 0.5 + (prev.y + next.y) * 0.25
      });
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
  }

  render() {
    this.cm.clear();
    const ctx = this.cm.getContext();

    // Render trace background first if available
    if (this.extraRenderFn) this.extraRenderFn();

    // Render all completed strokes
    for (const stroke of this.strokes) {
      this._renderStroke(ctx, stroke);
    }

    // Render current in-progress stroke
    if (this.currentStroke && this.currentStroke.points.length > 1) {
      this._renderStroke(ctx, this.currentStroke);
    }
  }

  _renderStroke(ctx, stroke) {
    if (stroke.color === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    // Neon glow effect for night mode
    if (this.options.theme === 'night' && stroke.color !== 'eraser') {
      ctx.shadowColor = this.options.color;
      ctx.shadowBlur = 8;
    } else {
      ctx.shadowBlur = 0;
    }

    const points = stroke.points;
    if (points.length < 2) return;

    // Use perfect-freehand to generate the stroke outline
    const outline = getStroke(points, {
      size: stroke.lineWidth * 2.5, // Scale up slightly for ink effect
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: true
    });

    if (outline.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      ctx.lineTo(outline[i][0], outline[i][1]);
    }
    ctx.closePath();

    ctx.fillStyle = stroke.color === 'eraser' ? '#000' : stroke.color;
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }

  setTheme(theme) {
    this.options.theme = theme;
    this.options.color = theme === 'night' ? '#00f5d4' : '#3d2b1f';
  }

  setBrushSize(size) { this.brushSize = size; }
  setColor(color) { this.options.color = color; }
  setEraser(enabled) { this.isEraser = enabled; }

  undo() {
    if (this.strokes.length > 0) {
      this.redoStack.push(this.strokes.pop());
      this.render();
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      this.strokes.push(this.redoStack.pop());
      this.render();
    }
  }

  clearAll() {
    this.redoStack = [...this.redoStack, ...this.strokes];
    this.strokes = [];
    this.render();
  }

  hasDrawing() { return this.strokes.length > 0; }
  getStrokes() { return this.strokes; }

  /**
   * Render all strokes as a filled shape on offscreen canvas for IoU comparison
   * Creates a black filled polygon from all user strokes
   */
  renderToOffscreen() {
    const canvas = document.createElement('canvas');
    const dpr = this.cm.dpr;
    canvas.width = this.cm.getCanvas().width;
    canvas.height = this.cm.getCanvas().height;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Draw all strokes as thick lines
    for (const stroke of this.strokes) {
      if (stroke.color === 'eraser') continue;
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = stroke.lineWidth + 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const points = stroke.points;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      if (points.length > 1) {
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      }
      ctx.stroke();
    }

    // Fill the enclosed area from all stroke points
    if (this.strokes.length > 0) {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      const allPoints = [];
      for (const stroke of this.strokes) {
        if (stroke.color !== 'eraser') {
          allPoints.push(...stroke.points);
        }
      }
      if (allPoints.length > 2) {
        ctx.moveTo(allPoints[0].x, allPoints[0].y);
        for (let i = 1; i < allPoints.length; i++) {
          ctx.lineTo(allPoints[i].x, allPoints[i].y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    return canvas;
  }

  /** Set extra render function for trace mode background */
  setExtraRender(fn) {
    this.extraRenderFn = fn;
  }

  destroy() {
    this.disable();
    this.strokes = [];
    this.currentStroke = null;
    this.redoStack = [];
  }
}
