import { getRank } from '../data/levels.js';

/**
 * ComparisonEngine - Compares user drawing with target region using Vector/Ray-Casting algorithm.
 */
export class ComparisonEngine {
  
  compare(canvasManager, drawingEngine, targetPath) {
    // 1. Get raw points from user's drawing
    let rawUserPoints = [];
    const strokes = drawingEngine.getStrokes();
    for (const stroke of strokes) {
      if (stroke.color !== 'eraser') {
        rawUserPoints.push(...stroke.points);
      }
    }
    
    // Fallback if no drawing
    if (rawUserPoints.length < 3) {
      const padding = 40;
      const scaledTargetPoints = canvasManager.normalizePathToCanvas(targetPath, padding);
      const targetPoly = this.resamplePolygon(scaledTargetPoints, 60);
      const visualData = {
        targetPoly,
        userPoly: [], // Empty drawing
        rays: [],
        canvasWidth: canvasManager.width,
        canvasHeight: canvasManager.height,
        avgDeviationPercent: "100.0"
      };
      return { score: 0, rank: getRank(0), visualData };
    }

    // Get the properly scaled target points based on the canvas size!
    // We use CanvasManager to get the scaled version of the target path that was shown on screen.
    const padding = 40;
    const scaledTargetPoints = canvasManager.normalizePathToCanvas(targetPath, padding);

    // 2. Resample both paths to have N equal-distance points
    const N = 60;
    const userPoly = this.resamplePolygon(rawUserPoints, N);
    const targetPoly = this.resamplePolygon(scaledTargetPoints, N);

    // 3. (Removed Procrustes Analysis)
    // We want to compare the user's drawing EXACTLY as they drew it,
    // including their chosen size and position on the canvas.
    // This ensures the Result screen exactly matches their input.
    let alignedUser = userPoly;

    // 4. Calculate Deviation (Rays)
    let totalDeviation = 0;
    const rays = [];
    
    // We compute bounding box diagonal of target to normalize the deviation
    const targetBBox = this.getBoundingBox(targetPoly);
    const diag = Math.sqrt(
      Math.pow(targetBBox.maxX - targetBBox.minX, 2) + 
      Math.pow(targetBBox.maxY - targetBBox.minY, 2)
    );

    for (let i = 0; i < alignedUser.length; i++) {
      const up = alignedUser[i];
      // Find closest point on the continuous target polygon
      const closest = this.closestPointOnPolygon(up, targetPoly);
      const dist = this.distance(up, closest);
      
      const isInside = this.pointInPolygon(up, targetPoly);
      
      rays.push({
        from: up,
        to: closest,
        distance: dist,
        isInside: isInside
      });
      
      totalDeviation += dist;
    }

    const avgDeviation = totalDeviation / N;
    
    // Score based on average deviation vs bounding box diagonal
    // If deviation is 0, score is 100. If deviation is e.g. 40% of diagonal, score is 0.
    const maxAllowedDeviation = diag * 0.40; 
    let score = 100 - (avgDeviation / maxAllowedDeviation) * 100;
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    const visualData = {
      targetPoly,
      userPoly: alignedUser,
      rays,
      canvasWidth: canvasManager.width,
      canvasHeight: canvasManager.height,
      avgDeviationPercent: ((avgDeviation / diag) * 100).toFixed(1)
    };

    return { score, rank: getRank(score), visualData };
  }

  // --- Geometry Helpers ---

  distance(p1, p2) {
    if (Array.isArray(p1)) p1 = {x: p1[0], y: p1[1]};
    if (Array.isArray(p2)) p2 = {x: p2[0], y: p2[1]};
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  pathLength(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += this.distance(points[i - 1], points[i]);
    }
    return d;
  }

  resamplePolygon(points, n) {
    // Standardize format to {x, y}
    const pts = points.map(p => Array.isArray(p) ? {x: p[0], y: p[1]} : {x: p.x, y: p.y});
    const I = this.pathLength(pts) / (n - 1);
    let D = 0;
    const newPoints = [pts[0]];
    
    for (let i = 1; i < pts.length; i++) {
      let pt1 = pts[i - 1];
      let pt2 = pts[i];
      let d = this.distance(pt1, pt2);
      
      while (D + d >= I) {
        const qx = pt1.x + ((I - D) / d) * (pt2.x - pt1.x);
        const qy = pt1.y + ((I - D) / d) * (pt2.y - pt1.y);
        const q = {x: qx, y: qy};
        newPoints.push(q);
        pts.splice(i, 0, q);
        d = d - (I - D);
        pt1 = q;
        D = 0;
      }
      D = D + d;
    }
    
    // Fix precision issues at the end
    if (newPoints.length === n - 1) {
      newPoints.push(pts[pts.length - 1]);
    }
    return newPoints;
  }

  getCentroid(points) {
    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / points.length, y: cy / points.length };
  }

  translatePolygon(points, tx, ty) {
    return points.map(p => ({ x: p.x + tx, y: p.y + ty }));
  }

  getScale(centeredPoints) {
    // RMS distance from centroid
    let sum = 0;
    for (const p of centeredPoints) {
      sum += (p.x * p.x + p.y * p.y);
    }
    return Math.sqrt(sum / centeredPoints.length);
  }

  scalePolygon(points, scale) {
    return points.map(p => ({ x: p.x * scale, y: p.y * scale }));
  }

  getBoundingBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  // Ray-casting algorithm for point in polygon
  pointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].x, yi = vs[i].y;
      let xj = vs[j].x, yj = vs[j].y;
      
      let intersect = ((yi > y) != (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Find closest point on a polygon's line segments to a given point
  closestPointOnPolygon(p, poly) {
    let minDist = Infinity;
    let closest = {x: 0, y: 0};
    
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      
      const pnt = this.closestPointOnLineSegment(p, p1, p2);
      const d = this.distance(p, pnt);
      if (d < minDist) {
        minDist = d;
        closest = pnt;
      }
    }
    return closest;
  }

  closestPointOnLineSegment(p, a, b) {
    const atob = { x: b.x - a.x, y: b.y - a.y };
    const atop = { x: p.x - a.x, y: p.y - a.y };
    const len = atob.x * atob.x + atob.y * atob.y;
    if (len === 0) return {x: a.x, y: a.y}; // a == b
    let dot = atop.x * atob.x + atop.y * atob.y;
    const t = Math.min(1, Math.max(0, dot / len));
    return { x: a.x + atob.x * t, y: a.y + atob.y * t };
  }
}
