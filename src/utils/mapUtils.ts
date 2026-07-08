/**
 * Coordinate mapping projection helpers
 */

/**
 * Translates longitude (-180 to 180) to a coordinate on an 800-pixel wide flat equirectangular projection
 */
export function mapLonToX(lon: number): number {
  return ((lon + 180) / 360) * 800;
}

/**
 * Translates latitude (90 to -90) to a coordinate on a 400-pixel tall flat equirectangular projection
 */
export function mapLatToY(lat: number): number {
  return ((90 - lat) / 180) * 400;
}
