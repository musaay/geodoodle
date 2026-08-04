/**
 * CanvasManager - Manages the HTML5 Canvas element
 * Handles DPR scaling, coordinate transformation, and region rendering
 */
export class CanvasManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;

    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    
    this.onResizeCallback = null;
    
    // Use ResizeObserver to detect real CSS size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (this.onResizeCallback) this.onResizeCallback();
    });
    this.resizeObserver.observe(this.container);
    
    this.resize();
  }

  setOnResize(callback) {
    this.onResizeCallback = callback;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  getContext() { return this.ctx; }
  getCanvas() { return this.canvas; }
  getWidth() { return this.width; }
  getHeight() { return this.height; }

  /** Convert page/client coordinates to canvas coordinates */
  pageToCanvas(pageX, pageY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: pageX - rect.left,
      y: pageY - rect.top
    };
  }

  /**
   * Scale normalized path (0-100) to canvas coordinates
   * Maintains aspect ratio and centers the shape
   */
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

    const availWidth = this.width - padding * 2;
    const availHeight = this.height - padding * 2;

    const scale = Math.min(availWidth / pathWidth, availHeight / pathHeight);

    const scaledWidth = pathWidth * scale;
    const scaledHeight = pathHeight * scale;
    const offsetX = padding + (availWidth - scaledWidth) / 2;
    const offsetY = padding + (availHeight - scaledHeight) / 2;

    return path.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale
    ]);
  }

  /**
   * Render a region's outline on the canvas
   * Used for trace mode background and comparison visualization
   */
  renderRegionOutline(path, options = {}) {
    const {
      color = '#5c4033',
      lineWidth = 2,
      lineDash = [],
      opacity = 1,
      fill = false,
      fillColor = 'rgba(200, 169, 81, 0.1)',
      padding = 40
    } = options;

    const scaledPath = this.normalizePathToCanvas(path, padding);
    if (scaledPath.length === 0) return;

    let drawPath = scaledPath;
    let shouldClose = true;

    if (options.hintPercent) {
      const hintLen = Math.max(2, Math.floor(scaledPath.length * options.hintPercent));
      drawPath = scaledPath.slice(0, hintLen);
      shouldClose = false;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(lineDash);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(drawPath[0][0], drawPath[0][1]);
    for (let i = 1; i < drawPath.length; i++) {
      ctx.lineTo(drawPath[i][0], drawPath[i][1]);
    }
    
    if (shouldClose && options.close !== false) {
      ctx.closePath();
    }

    if (fill) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Render the filled region on an offscreen canvas for IoU comparison
   * Returns the offscreen canvas with the region filled in black
   */
  renderFilledRegion(path, padding = 40) {
    const offscreen = document.createElement('canvas');
    offscreen.width = this.canvas.width;
    offscreen.height = this.canvas.height;
    const offCtx = offscreen.getContext('2d');
    offCtx.scale(this.dpr, this.dpr);

    const scaledPath = this.normalizePathToCanvas(path, padding);
    if (scaledPath.length === 0) return offscreen;

    offCtx.fillStyle = '#000000';
    offCtx.beginPath();
    offCtx.moveTo(scaledPath[0][0], scaledPath[0][1]);
    for (let i = 1; i < scaledPath.length; i++) {
      offCtx.lineTo(scaledPath[i][0], scaledPath[i][1]);
    }
    offCtx.closePath();
    offCtx.fill();

    return offscreen;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
