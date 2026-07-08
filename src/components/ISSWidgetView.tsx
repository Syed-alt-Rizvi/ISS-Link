import React, { useState, useEffect } from "react";
import { ISSLocation, UserLocation } from "../types";
import { getDistance, getBearing, getElevationAngle, getCardinalDirection } from "../utils/geo";
import { Orbit, Compass, Radio, RefreshCw, X, ShieldAlert, Zap } from "lucide-react";

export function ISSWidgetView() {
  const [issLocation, setIssLocation] = useState<ISSLocation | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dopplerShift, setDopplerShift] = useState<number>(0);
  const [elevation, setElevation] = useState<number>(0);

  // Poll ISS location every 4 seconds in widget mode for super responsive telemetry
  const fetchISSLocation = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/iss/now");
      if (res.ok) {
        const data = await res.json();
        setIssLocation(data);
      }
    } catch (e) {
      console.error("Widget fetch failed:", e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchISSLocation();
    const interval = setInterval(fetchISSLocation, 4000);
    return () => clearInterval(interval);
  }, []);

  // Capture ground observer coordinates (defaulting to Houston if GPS is denied/pending)
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setUserLocation({ latitude: 29.56, longitude: -95.09 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        // Fallback to Houston MCC
        setUserLocation({ latitude: 29.56, longitude: -95.09 });
      }
    );
  }, []);

  // Calculate live telemetry
  const telemetry = React.useMemo(() => {
    if (!issLocation || !userLocation) {
      return { distance: 0, bearing: 0, elevation: 0, cardinal: "N/A" };
    }

    const dist = getDistance(
      userLocation.latitude,
      userLocation.longitude,
      issLocation.latitude,
      issLocation.longitude
    );

    const bear = getBearing(
      userLocation.latitude,
      userLocation.longitude,
      issLocation.latitude,
      issLocation.longitude
    );

    const elev = getElevationAngle(
      userLocation.latitude,
      userLocation.longitude,
      issLocation.latitude,
      issLocation.longitude,
      issLocation.altitude || 415
    );

    const cardinal = getCardinalDirection(bear);

    return { distance: dist, bearing: bear, elevation: elev, cardinal };
  }, [issLocation, userLocation]);

  // Compute live Doppler shift
  useEffect(() => {
    if (!telemetry.distance || !issLocation) return;
    
    // Theoretical radial speed (receding vs approaching) based on orbital flight direction
    const bearingRad = (telemetry.bearing * Math.PI) / 180;
    const vOrbitKmS = (issLocation.velocity || 27560) / 3600; // km/s
    
    // Radial speed component along line of sight
    const elevRad = (telemetry.elevation * Math.PI) / 180;
    const rVel = -vOrbitKmS * Math.cos(elevRad) * Math.cos(bearingRad);
    
    const f0 = 145.8e6; // VHF downlink
    const c = 299792458;
    const vRelMs = rVel * 1000;
    const dShift = -(f0 * vRelMs) / c;

    setDopplerShift(dShift);
  }, [telemetry, issLocation]);

  const isOverhead = telemetry.distance < 800;

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 font-mono select-none flex flex-col justify-between p-4 border border-slate-900 rounded-xl">
      {/* Widget Header bar */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-400 tracking-wider">ISS ORBITAL WIDGET</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchISSLocation}
            className="p-1 rounded hover:bg-slate-900 text-slate-500 hover:text-orange-400 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
          </button>
          <button
            onClick={() => window.close()}
            className="p-1 rounded hover:bg-slate-900 text-slate-500 hover:text-rose-400 transition-colors"
            title="Close Widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Radar Panel & Compass */}
      <div className="flex-1 flex flex-col items-center justify-center py-4">
        <div className="relative w-36 h-36 rounded-full border border-slate-900 flex items-center justify-center bg-slate-950/40 glow-orange/5">
          {/* Outer ring concentric grid */}
          <div className="absolute inset-2 rounded-full border border-slate-950" />
          <div className="absolute inset-6 rounded-full border border-slate-900/60 border-dashed" />
          <div className="absolute inset-12 rounded-full border border-slate-900/30" />

          {/* Crosshairs */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-slate-900/40" />
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-slate-900/40" />

          {/* Compass labels */}
          <span className="absolute top-1 text-[8px] font-bold text-slate-600">N</span>
          <span className="absolute bottom-1 text-[8px] font-bold text-slate-600">S</span>
          <span className="absolute right-1 text-[8px] font-bold text-slate-600">E</span>
          <span className="absolute left-1 text-[8px] font-bold text-slate-600">W</span>

          {/* Compass pointer arrow (points to bearing of ISS) */}
          <div
            className="absolute w-full h-full transition-transform duration-700 ease-out"
            style={{ transform: `rotate(${telemetry.bearing || 0}deg)` }}
          >
            {/* Arrow line */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[2px] h-[72px] bg-gradient-to-t from-transparent via-orange-500/80 to-orange-400" />
            {/* Pulsing Target Dot representing the ISS */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-orange-400 rounded-full border border-slate-950 shadow-md shadow-orange-500/50 animate-pulse" />
          </div>

          {/* Center compass readout */}
          <div className="bg-slate-950/95 border border-slate-900 w-16 h-16 rounded-full flex flex-col items-center justify-center text-center shadow-lg shadow-black/80">
            <span className="text-[10px] font-extrabold text-orange-400 leading-none">
              {telemetry.cardinal}
            </span>
            <span className="text-[8px] text-slate-500 mt-0.5 font-bold">
              {telemetry.bearing ? `${Math.round(telemetry.bearing)}°` : "---"}
            </span>
          </div>
        </div>
      </div>

      {/* Telemetry readouts list */}
      <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-slate-900 pt-2.5 bg-slate-950">
        <div className="bg-slate-950 border border-slate-900/50 p-2 rounded-lg text-center">
          <span className="text-[8px] text-slate-500 block">GROUND RANGE</span>
          <span className="text-xs font-extrabold text-slate-200">
            {telemetry.distance ? `${Math.round(telemetry.distance).toLocaleString()} km` : "SYNCING..."}
          </span>
        </div>
        <div className="bg-slate-950 border border-slate-900/50 p-2 rounded-lg text-center">
          <span className="text-[8px] text-slate-500 block">DOPPLER DRIFT</span>
          <span className={`text-xs font-extrabold ${Math.abs(dopplerShift) < 300 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {dopplerShift > 0 ? "+" : ""}{Math.round(dopplerShift)} Hz
          </span>
        </div>
        <div className="bg-slate-950 border border-slate-900/50 p-2 rounded-lg text-center">
          <span className="text-[8px] text-slate-500 block">ELEVATION ANGLE</span>
          <span className="text-xs font-extrabold text-slate-200">
            {telemetry.elevation ? `+${telemetry.elevation.toFixed(1)}°` : "BELOW HORIZON"}
          </span>
        </div>
        <div className="bg-slate-950 border border-slate-900/50 p-2 rounded-lg text-center">
          <span className="text-[8px] text-slate-500 block">UPLINK STATUS</span>
          <span className={`text-xs font-extrabold uppercase ${isOverhead ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
            {isOverhead ? "Zenith Link" : "Squelched"}
          </span>
        </div>
      </div>

      {/* Direct Overhead Pass Banner alert */}
      {isOverhead ? (
        <div className="mt-2.5 p-2 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-[9px] text-center text-emerald-400 flex items-center justify-center gap-1 animate-pulse font-bold">
          <Zap className="w-3 h-3 text-emerald-400" />
          OVERHEAD FLYOVER IN PROGRESS!
        </div>
      ) : (
        <div className="mt-2.5 p-2 bg-slate-900/30 border border-slate-900/50 rounded-lg text-[9px] text-center text-slate-500">
          Waiting for next line-of-sight pass
        </div>
      )}
    </div>
  );
}
