import React, { useState, useEffect, useRef } from "react";
import { ISSLocation, UserLocation, AlertConfig } from "./types";
import { ISSMap } from "./components/ISSMap";
import { CompassInstrument } from "./components/CompassInstrument";
import { SecureVoiceLink } from "./components/SecureVoiceLink";
import { PWAPanel } from "./components/PWAPanel";
import { ISSWidgetView } from "./components/ISSWidgetView";
import { getDistance, getBearing, getElevationAngle, getCardinalDirection } from "./utils/geo";
import { motion, AnimatePresence } from "motion/react";
import {
  Orbit,
  Compass,
  Radio,
  MapPin,
  Bell,
  BellOff,
  Clock,
  Navigation,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Sliders,
  Settings
} from "lucide-react";

// Preset coordinates for quick overrides
const PRESETS = [
  { name: "My Live GPS", lat: null, lon: null },
  { name: "Houston, USA (MCC)", lat: 29.56, lon: -95.09 },
  { name: "London, UK", lat: 51.5074, lon: -0.1278 },
  { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney, Australia", lat: -33.8688, lon: 151.2093 },
  { name: "Munich, Germany", lat: 48.1351, lon: 11.582 }
];

export default function App() {
  const isWidgetMode = typeof window !== "undefined" && window.location.search.includes("mode=widget");

  if (isWidgetMode) {
    return <ISSWidgetView />;
  }

  const [issLocation, setIssLocation] = useState<ISSLocation | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customLat, setCustomLat] = useState<string>("");
  const [customLon, setCustomLon] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");

  // Alert Settings
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: true,
    notifyOnApproach: true,
    triggerDistance: 800, // Overhead range threshold
    permissionStatus: "prompt"
  });
  const [hasAlertedThisPass, setHasAlertedThisPass] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);

  // Live Clock (UTC)
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toUTCString());
    };
    updateTime();
    const tInterval = setInterval(updateTime, 1000);
    return () => clearInterval(tInterval);
  }, []);

  // Fetch ISS Location on intervals
  const fetchISSLocation = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/iss/now");
      if (res.ok) {
        const data = await res.json();
        setIssLocation(data);
      }
    } catch (e) {
      console.error("Failed to fetch ISS position:", e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    fetchISSLocation();
    const interval = setInterval(fetchISSLocation, 8000); // Poll every 8 seconds
    return () => clearInterval(interval);
  }, []);

  // Geolocation watch
  useEffect(() => {
    // If the selected preset is index 0 ("My Live GPS"), activate live tracker
    if (selectedPresetIndex !== 0) {
      return;
    }

    if (!("geolocation" in navigator)) {
      console.warn("Geolocation not supported by this browser.");
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn("Geolocation permission error/rejected:", error.message);
      // Fallback to Houston if GPS fails/denied
      setUserLocation({ latitude: 29.56, longitude: -95.09 });
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [selectedPresetIndex]);

  // Handle Preset Changes
  useEffect(() => {
    if (selectedPresetIndex === 0) {
      // Handled by GPS watch effect
      return;
    }
    const preset = PRESETS[selectedPresetIndex];
    if (preset.lat !== null && preset.lon !== null) {
      setUserLocation({
        latitude: preset.lat,
        longitude: preset.lon
      });
    }
  }, [selectedPresetIndex]);

  // Set Custom Latitude/Longitude manual inputs
  const applyCustomCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = parseFloat(customLat);
    const lonNum = parseFloat(customLon);
    if (!isNaN(latNum) && !isNaN(lonNum) && latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180) {
      setSelectedPresetIndex(-1); // Deselect presets
      setUserLocation({
        latitude: latNum,
        longitude: lonNum
      });
    } else {
      alert("Invalid Coordinates! Latitude must be -90 to 90, Longitude -180 to 180.");
    }
  };

  // Notification API setup
  useEffect(() => {
    if ("Notification" in window) {
      setAlertConfig(prev => ({
        ...prev,
        permissionStatus: Notification.permission
      }));
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const status = await Notification.requestPermission();
      setAlertConfig(prev => ({
        ...prev,
        permissionStatus: status
      }));
    }
  };

  // Calculate distance, bearing, elevation to ISS
  const telemetry = React.useMemo(() => {
    if (!issLocation || !userLocation) {
      return { distance: null, bearing: null, elevation: null, overhead: false, cardinal: "N/A" };
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

    const overhead = dist < alertConfig.triggerDistance;
    const cardinal = getCardinalDirection(bear);

    return { distance: dist, bearing: bear, elevation: elev, overhead, cardinal };
  }, [issLocation, userLocation, alertConfig.triggerDistance]);

  // Play alarm sound function
  const playAlarm = () => {
    if (!soundEnabled) return;
    try {
      // Synthesize a quick warning alert beep procedurally using Web Audio API!
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch notification beep

      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
      gain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio alarm play blocked:", e);
    }
  };

  // Handle Alert triggers whenever ISS passes overhead
  useEffect(() => {
    if (telemetry.overhead && alertConfig.enabled) {
      if (!hasAlertedThisPass) {
        // Trigger alarm
        playAlarm();

        // Trigger local OS notification
        if (alertConfig.notifyOnApproach && "Notification" in window && Notification.permission === "granted") {
          new Notification("ISS PASSING OVERHEAD!", {
            body: `The ISS is currently within range (${Math.round(telemetry.distance || 0)}km away). Look out!`,
            silent: !soundEnabled
          });
        }

        setHasAlertedThisPass(true);
      }
    } else {
      // Reset alert block when ISS exits range
      if (telemetry.distance !== null && telemetry.distance > alertConfig.triggerDistance + 200) {
        setHasAlertedThisPass(false);
      }
    }
  }, [telemetry.overhead, telemetry.distance, alertConfig.enabled]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Visual background ambient gradient */}
      <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-orange-500/5 via-teal-500/0 to-transparent pointer-events-none" />

      {/* Primary Command Header */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-900 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="bg-orange-500/10 border border-orange-500/40 p-2.5 rounded-xl glow-orange/20 animate-pulse">
              <Orbit className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-display tracking-tight text-slate-100">
                  ISS COMMAND BRIDGE
                </h1>
                <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/30 font-mono font-bold px-2 py-0.5 rounded-full">
                  TRACKING ON
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono tracking-wider">
                VHF-GROUND LINK COMSYNC // ORBITAL TELEMETRY
              </p>
            </div>
          </div>

          {/* Real-time Status / Clock Indicators */}
          <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
            {/* Clock */}
            <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-slate-300 font-bold tracking-wide">{currentTime || "SYNCING TIME..."}</span>
            </div>

            {/* Refresh button */}
            <button
              onClick={fetchISSLocation}
              disabled={isRefreshing}
              className="bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-orange-400 p-2 rounded-xl border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Force Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-orange-400" : ""}`} />
              <span className="hidden sm:inline">REFRESH</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Screen Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6 relative z-10">
        
        {/* Sliding Full Screen Flyover alert banner */}
        <AnimatePresence>
          {telemetry.overhead && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-4 rounded-2xl border border-orange-500 glow-orange flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-950 font-mono">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-950 text-orange-400 p-2 rounded-xl animate-ping">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider font-display">
                      Direct Overhead Pass Detected!
                    </h2>
                    <p className="text-xs font-bold leading-relaxed opacity-90">
                      The Space Station is currently flying above your horizon! Ground range: {Math.round(telemetry.distance || 0)}km. Elevation: +{telemetry.elevation}°.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Trigger audio preview
                      playAlarm();
                    }}
                    className="px-3.5 py-1.5 bg-slate-950 text-orange-400 text-xs font-bold rounded-xl border border-orange-400/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    TEST ALARM
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SECTION 1: Telemetry Dashboard & Active Orbital Map */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Map & Orbit Tracker (Span 2) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-widest uppercase text-slate-400 flex items-center gap-2 font-display">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                Orbital Track Visualizer
              </h2>
              {issLocation && (
                <div className="text-[10px] font-mono text-slate-500">
                  REFRESH IN: {(Date.now() % 8000 / 1000).toFixed(0)}s // STATUS: NOMINAL
                </div>
              )}
            </div>
            
            <ISSMap issLocation={issLocation} userLocation={userLocation} />
            
            {/* Quick Metrics ticker */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-900 font-mono text-center">
                <span className="text-[9px] text-slate-500 block">ALTITUDE (ZARYA)</span>
                <span className="text-sm font-bold text-slate-200">
                  {issLocation ? `${issLocation.altitude.toLocaleString()} km` : "---"}
                </span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-900 font-mono text-center">
                <span className="text-[9px] text-slate-500 block">ORBITAL SPEED</span>
                <span className="text-sm font-bold text-slate-200">
                  {issLocation ? `${issLocation.velocity.toLocaleString()} km/h` : "---"}
                </span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-900 font-mono text-center">
                <span className="text-[9px] text-slate-500 block">DEVIATION PATH</span>
                <span className="text-sm font-bold text-slate-200">51.64° (INC)</span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-900 font-mono text-center">
                <span className="text-[9px] text-slate-500 block">TRACK ENGINE</span>
                <span className="text-sm font-bold text-teal-400">
                  {issLocation?.isSimulated ? "ORBIT-CALC" : "TELEMETRY-LIVE"}
                </span>
              </div>
            </div>
          </div>

          {/* Locator Compass & Pass predicted panels (Span 1) */}
          <div className="flex flex-col gap-6">
            <h2 className="text-sm font-bold tracking-widest uppercase text-slate-400 flex items-center gap-2 font-display">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Directional Navigation
            </h2>
            
            <CompassInstrument
              bearing={telemetry.bearing}
              elevation={telemetry.elevation}
              distance={telemetry.distance}
              overhead={telemetry.overhead}
            />
          </div>
        </div>

        {/* SECTION PWA: Device Install and Widget Controller */}
        <PWAPanel userLocation={userLocation} />

        {/* SECTION 2: Ground Station Configuration */}
        <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            
            {/* Config details */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Settings className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-display">
                  Ground Observer Location & Alerts
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                Set coordinates using your phone's real-time GPS hardware. You can also select preset command centers around the globe, or enter custom coordinates to test distance calculations and flyovers.
              </p>
            </div>

            {/* Quick Presets Toggle buttons */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset, idx) => (
                <button
                  key={preset.name}
                  onClick={() => setSelectedPresetIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    selectedPresetIndex === idx
                      ? "bg-teal-500/10 border-teal-500/60 text-teal-400"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>

          </div>

          {/* Coordinates details row */}
          <div className="mt-4 pt-4 border-t border-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
            {/* Coordinate values */}
            <div className="flex flex-wrap gap-4 text-slate-400">
              <div className="bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-850 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-slate-500" />
                LAT: <span className="text-slate-200 font-bold">{userLocation?.latitude?.toFixed(5) || "Awaiting GPS..."}</span>
              </div>
              <div className="bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-850 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-slate-500 rotate-90" />
                LON: <span className="text-slate-200 font-bold">{userLocation?.longitude?.toFixed(5) || "Awaiting GPS..."}</span>
              </div>
              {selectedPresetIndex === 0 && userLocation?.accuracy && (
                <div className="bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-850 text-[10px]">
                  GPS ACCURACY: ±{Math.round(userLocation.accuracy)}m
                </div>
              )}
            </div>

            {/* Manual Lat/Lon Override form */}
            <form onSubmit={applyCustomCoordinates} className="flex gap-2 items-center w-full md:w-auto">
              <input
                type="text"
                placeholder="Lat"
                value={customLat}
                onChange={e => setCustomLat(e.target.value)}
                className="bg-slate-950 border border-slate-850 text-slate-300 rounded-xl px-2.5 py-1.5 text-xs w-20 focus:outline-none focus:border-teal-500"
              />
              <input
                type="text"
                placeholder="Lon"
                value={customLon}
                onChange={e => setCustomLon(e.target.value)}
                className="bg-slate-950 border border-slate-850 text-slate-300 rounded-xl px-2.5 py-1.5 text-xs w-20 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-teal-400 font-bold rounded-xl border border-slate-800 transition-colors cursor-pointer text-xs"
              >
                APPLY OVERRIDE
              </button>
            </form>
          </div>

          {/* Desktop Notifications controller */}
          <div className="mt-4 pt-4 border-t border-slate-900 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Alert Enable switch */}
              <button
                onClick={() => setAlertConfig(p => ({ ...p, enabled: !p.enabled }))}
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-mono transition-all cursor-pointer ${
                  alertConfig.enabled
                    ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                    : "bg-slate-950 border-slate-850 text-slate-500"
                }`}
              >
                {alertConfig.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                <span>OVERHEAD ALERTS: {alertConfig.enabled ? "ACTIVE" : "OFF"}</span>
              </button>

              {/* Sound Enable switch */}
              <button
                onClick={() => setSoundEnabled(p => !p)}
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-mono transition-all cursor-pointer ${
                  soundEnabled
                    ? "bg-slate-900 border-slate-800 text-slate-300"
                    : "bg-slate-950 border-slate-850 text-slate-500"
                }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span>ALARM SOUND: {soundEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Desktop system permission */}
            {"Notification" in window && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-slate-500">SYSTEM NOTIFICATIONS:</span>
                {alertConfig.permissionStatus === "granted" ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/20 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    AUTHORIZED
                  </span>
                ) : alertConfig.permissionStatus === "denied" ? (
                  <span className="text-rose-400 font-bold bg-rose-950/20 px-2.5 py-1 rounded-lg border border-rose-500/20">
                    BLOCKED BY SYSTEM
                  </span>
                ) : (
                  <button
                    onClick={requestNotificationPermission}
                    className="px-3 py-1 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    AUTHORIZE DESKTOP ALERTS
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* SECTION 3: VHF Space-Ground Secure Voice Link */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-bold tracking-widest uppercase text-slate-400 flex items-center gap-2 font-display">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            VHF Space-Ground voice Link (Secure Channel)
          </h2>
          <SecureVoiceLink issLocation={issLocation} userLocation={userLocation} />
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 bg-slate-950 border-t border-slate-900 text-center text-slate-600 text-[11px] font-mono select-none">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            &copy; {new Date().getFullYear()} International Space Station Comm-Link. Developed for AI Studio.
          </div>
          <div className="flex items-center gap-4 justify-center">
            <span>UHF AP/GP BRIDGE STATUS: ACTIVE</span>
            <span>SECURE CODE: SHA-256</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
