import React, { useMemo } from "react";
import { ISSLocation, UserLocation } from "../types";
import { mapLonToX, mapLatToY } from "../utils/mapUtils";

// Simplified vector paths for major landmasses
const CONTINENTS = [
  // North America
  [[-168, 66], [-120, 70], [-80, 72], [-60, 50], [-80, 25], [-100, 15], [-110, 8], [-100, -8], [-105, -15], [-120, 10], [-160, 20], [-165, 60]],
  // South America
  [[-80, 12], [-40, -10], [-40, -40], [-70, -55], [-80, -20]],
  // Africa
  [[-17, 32], [32, 31], [51, 12], [40, -30], [20, -34], [10, -5]],
  // Eurasia
  [[0, 65], [170, 70], [140, 20], [100, 10], [80, 8], [40, 30], [20, 40]],
  // Australia
  [[113, -20], [152, -20], [150, -38], [115, -34]],
  // Greenland
  [[-60, 83], [-25, 80], [-40, 60], [-55, 65]]
];

// High-fidelity Space Ground Control Stations
const GROUND_STATIONS = [
  { name: "Houston MCC", lat: 29.56, lon: -95.09, code: "JSC" },
  { name: "Moscow MCC", lat: 55.75, lon: 37.62, code: "KOR" },
  { name: "Munich Col-CC", lat: 48.13, lon: 11.57, code: "GSOC" },
  { name: "Tsukuba JEM-CC", lat: 36.08, lon: 140.11, code: "TKSC" },
  { name: "Baikonur", lat: 45.96, lon: 63.30, code: "COS" }
];

interface ISSMapProps {
  issLocation: ISSLocation | null;
  userLocation: UserLocation | null;
  footprintRadiusKm?: number; // visual coverage circle radius (km)
}

export const ISSMap: React.FC<ISSMapProps> = ({
  issLocation,
  userLocation,
  footprintRadiusKm = 1000
}) => {
  // Translate latitude/longitude coordinates to SVG coordinates (800x400 viewbox)
  const mapLonToX = (lon: number) => ((lon + 180) / 360) * 800;
  const mapLatToY = (lat: number) => ((90 - lat) / 180) * 400;

  // Render continent paths
  const landPaths = useMemo(() => {
    return CONTINENTS.map((points, index) => {
      const d = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${mapLonToX(p[0])} ${mapLatToY(p[1])}`)
        .join(" ") + " Z";
      return (
        <path
          key={`land-${index}`}
          d={d}
          className="fill-slate-900/40 stroke-slate-800/80 stroke-[1]"
        />
      );
    });
  }, []);

  // Generate real-time orbit track points (past 45m & future 45m in 1.5m intervals)
  const orbitPoints = useMemo(() => {
    if (!issLocation) return [];
    
    const points: { x: number; y: number; lat: number; lon: number }[] = [];
    const periodS = 5574; // ~92.9 minutes ISS period
    const currentTimestamp = issLocation.timestamp;

    // We calculate orbital positions
    for (let offsetMin = -45; offsetMin <= 45; offsetMin += 1.5) {
      const timeMs = (currentTimestamp + offsetMin * 60) * 1000;
      
      // Re-evaluate orbital formula to project the path line
      const t = (timeMs / 1000) % periodS;
      const angle = (t / periodS) * 2 * Math.PI;
      const inclinationRad = (51.64 * Math.PI) / 180;
      const lat = Math.asin(Math.sin(inclinationRad) * Math.sin(angle)) * (180 / Math.PI);
      
      const earthRotationDeg = ((timeMs / 1000) * (360 / 86400)) % 360;
      let lon = Math.atan2(Math.cos(inclinationRad) * Math.sin(angle), Math.cos(angle)) * (180 / Math.PI);
      lon = ((lon - earthRotationDeg + 180) % 360) - 180;
      if (lon < -180) lon += 360;

      points.push({
        x: mapLonToX(lon),
        y: mapLatToY(lat),
        lat,
        lon
      });
    }
    return points;
  }, [issLocation]);

  // Segment orbital lines to prevent visual line stretches at wrapping boundaries
  const orbitPathSegments = useMemo(() => {
    const segments: string[] = [];
    let currentSegment: string[] = [];

    for (let i = 0; i < orbitPoints.length; i++) {
      const pt = orbitPoints[i];
      const prevPt = orbitPoints[i - 1];

      // If there is a massive jump in X coordinate (wrapping the dateline), split the path
      if (prevPt && Math.abs(pt.x - prevPt.x) > 300) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
      
      currentSegment.push(`${currentSegment.length === 0 ? "M" : "L"} ${pt.x} ${pt.y}`);
    }
    
    if (currentSegment.length > 0) {
      segments.push(currentSegment.join(" "));
    }
    return segments;
  }, [orbitPoints]);

  // Coordinates mapping
  const issX = issLocation ? mapLonToX(issLocation.longitude) : 0;
  const issY = issLocation ? mapLatToY(issLocation.latitude) : 0;

  const userX = userLocation ? mapLonToX(userLocation.longitude) : null;
  const userY = userLocation ? mapLatToY(userLocation.latitude) : null;

  // Approximate pixel radius of the footprint circle
  // 1 degree latitude = 111km. 1000km = ~9 degrees latitude = 400 * (9/180) pixels = 20 pixels
  const footprintPixelRadius = useMemo(() => {
    // Ground radius converted to map pixels scale (assuming simplified equirectangular map)
    const degRange = footprintRadiusKm / 111.12;
    return (degRange / 360) * 800;
  }, [footprintRadiusKm]);

  return (
    <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 select-none glow-orange/10">
      {/* Background stars / space effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-90" />
      <div className="absolute inset-0 bg-grid-pattern opacity-10" />

      {/* Main Tactical Map */}
      <svg
        viewBox="0 0 800 400"
        className="relative z-10 w-full h-full text-slate-400 font-mono"
      >
        {/* Grids and Equator */}
        <line x1="0" y1="200" x2="800" y2="200" className="stroke-slate-800/80 stroke-1 stroke-dasharray-[4,4]" />
        <line x1="400" y1="0" x2="400" y2="400" className="stroke-slate-800/80 stroke-1 stroke-dasharray-[4,4]" />
        
        {/* Lat / Lon Coordinate labels */}
        <text x="5" y="195" className="text-[9px] fill-slate-500 font-mono font-medium">EQUATOR</text>
        <text x="390" y="12" className="text-[9px] fill-slate-500 font-mono font-medium text-right" textAnchor="end">MERIDIAN</text>

        {/* Ocean Labels */}
        <text x="180" y="240" className="text-[10px] fill-slate-600 tracking-widest uppercase opacity-40">Pacific Ocean</text>
        <text x="360" y="180" className="text-[10px] fill-slate-600 tracking-widest uppercase opacity-40">Atlantic Ocean</text>
        <text x="560" y="260" className="text-[10px] fill-slate-600 tracking-widest uppercase opacity-40">Indian Ocean</text>

        {/* Landmass Outlines */}
        {landPaths}

        {/* Ground Tracking Stations */}
        {GROUND_STATIONS.map((station) => {
          const sX = mapLonToX(station.lon);
          const sY = mapLatToY(station.lat);
          return (
            <g key={station.name}>
              <circle cx={sX} cy={sY} r="2.5" className="fill-slate-600 stroke-slate-500 stroke-[0.5]" />
              <text x={sX + 5} y={sY + 3} className="text-[8px] fill-slate-500 opacity-60 font-mono select-none">
                {station.code}
              </text>
            </g>
          );
        })}

        {/* Active Orbital Trajectory (Past and Future) */}
        {issLocation && orbitPathSegments.map((dStr, idx) => (
          <path
            key={`orbit-seg-${idx}`}
            d={dStr}
            fill="none"
            className="stroke-amber-500/50 stroke-1.5 stroke-dasharray-[5,3]"
          />
        ))}

        {/* Observer / Phone GPS Marker */}
        {userX !== null && userY !== null && (
          <g>
            {/* Pulsing locator ring */}
            <circle
              cx={userX}
              cy={userY}
              r="10"
              className="fill-none stroke-teal-500 stroke-1 animate-pulse"
            />
            {/* Exact GPS Center Dot */}
            <circle
              cx={userX}
              cy={userY}
              r="4.5"
              className="fill-teal-400 stroke-slate-950 stroke-[1.5]"
            />
            <text x={userX + 8} y={userY - 8} className="text-[9px] font-bold fill-teal-400 drop-shadow-md">
              MY POSITION
            </text>
            
            {/* Ground Link Visualizer if ISS is near observer (< 1200 km) */}
            {issLocation && (
              <line
                x1={userX}
                y1={userY}
                x2={issX}
                y2={issY}
                className={`stroke-1 ${
                  footprintPixelRadius > 0 &&
                  Math.hypot(issX - userX, issY - userY) < footprintPixelRadius * 1.5
                    ? "stroke-teal-400 stroke-dasharray-[2,2] opacity-80"
                    : "stroke-slate-800/40 opacity-20"
                }`}
              />
            )}
          </g>
        )}

        {/* ISS Coverage Footprint Visual Circle */}
        {issLocation && (
          <g>
            {/* Semi-transparent signal horizon circle */}
            <circle
              cx={issX}
              cy={issY}
              r={footprintPixelRadius}
              className="fill-orange-500/5 stroke-orange-500/30 stroke-[1] stroke-dasharray-[3,3]"
            />
            {/* Double outer border */}
            <circle
              cx={issX}
              cy={issY}
              r={footprintPixelRadius * 1.2}
              className="fill-none stroke-orange-500/10 stroke-[0.5]"
            />
          </g>
        )}

        {/* Active ISS Position Node */}
        {issLocation && (
          <g>
            {/* Outer radar sweeping ring */}
            <circle
              cx={issX}
              cy={issY}
              r="14"
              className="fill-none stroke-orange-500/40 stroke-[0.5] animate-ping"
            />
            {/* Core Satellite Icon Node */}
            <circle
              cx={issX}
              cy={issY}
              r="6"
              className="fill-orange-500 stroke-slate-950 stroke-[2] glow-orange"
            />
            {/* Crosshairs */}
            <line x1={issX - 10} y1={issY} x2={issX + 10} y2={issY} className="stroke-orange-400/60 stroke-[0.5]" />
            <line x1={issX} y1={issY - 10} x2={issX} y2={issY + 10} className="stroke-orange-400/60 stroke-[0.5]" />
            
            {/* Telemetry Label */}
            <g transform={`translate(${issX + 10}, ${issY - 10})`}>
              <rect x="0" y="-12" width="55" height="15" rx="2" className="fill-slate-950/80 stroke-orange-500/40 stroke-[0.5]" />
              <text x="5" y="-1" className="text-[9px] font-bold fill-orange-400 font-mono">
                ISS (ZARYA)
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* Grid Canvas Helper Style (CSS Backdrop Grid) */}
      <style>{`
        .bg-grid-pattern {
          background-size: 20px 20px;
          background-image: linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        }
      `}</style>
    </div>
  );
};
