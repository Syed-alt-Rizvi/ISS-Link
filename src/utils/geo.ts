/**
 * Geographical and aerospace math utility functions for ISS tracking
 */

const EARTH_RADIUS_KM = 6371.008; // Mean Earth radius

/**
 * Calculates the great-circle distance between two points on the Earth's surface using the Haversine formula.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(rLat1) * Math.cos(rLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates the initial bearing (compass heading) from point 1 to point 2.
 * Returns bearing in degrees, in range [0, 360).
 */
export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

/**
 * Calculates the elevation angle (degrees above horizon) of the ISS from an observer's location.
 * Takes Earth's curvature, observer position, ISS ground point, and ISS altitude into account.
 * 
 * @param userLat Observer latitude in degrees
 * @param userLon Observer longitude in degrees
 * @param issLat ISS ground point latitude in degrees
 * @param issLon ISS ground point longitude in degrees
 * @param issAltKm ISS orbital altitude in kilometers (typically ~415km)
 * @returns Elevation angle in degrees. Values > 0 are above the horizon.
 */
export function getElevationAngle(
  userLat: number,
  userLon: number,
  issLat: number,
  issLon: number,
  issAltKm: number
): number {
  const distanceKm = getDistance(userLat, userLon, issLat, issLon);
  
  // Angle subtended at the center of the Earth
  const psi = distanceKm / EARTH_RADIUS_KM;
  
  const r = EARTH_RADIUS_KM + issAltKm; // Distance from Earth center to ISS
  
  // Trigonometry to find angle above local horizontal plane
  const numerator = r * Math.cos(psi) - EARTH_RADIUS_KM;
  const denominator = r * Math.sin(psi);
  
  const elevationRad = Math.atan2(numerator, denominator);
  const elevationDeg = (elevationRad * 180) / Math.PI;
  
  return parseFloat(elevationDeg.toFixed(2));
}

/**
 * Returns a human-readable cardinal direction from a bearing in degrees.
 */
export function getCardinalDirection(bearing: number): string {
  const index = Math.round(bearing / 45) % 8;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[index];
}
