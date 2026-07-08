import React, { useState, useEffect, useRef } from "react";
import { Astronaut, ISSLocation, UserLocation, VoiceLog } from "../types";
import { spaceAudio } from "../utils/audio";
import { getDistance, getElevationAngle } from "../utils/geo";
import {
  Mic,
  MicOff,
  Send,
  Radio,
  Volume2,
  Lock,
  Loader2,
  HelpCircle,
  AlertCircle,
  Signal,
  CheckCircle2,
  Smartphone,
  Globe,
  Satellite,
  Wifi,
  ChevronRight,
  XCircle,
  Activity,
  Zap
} from "lucide-react";

// Client-side representation of the orbital propagator to compute high-resolution Doppler shifts
function getSimulatedISSPositionClient(timeMs: number) {
  const periodS = 5574; // ~92.9 minutes
  const t = (timeMs / 1000) % periodS;
  const angle = (t / periodS) * 2 * Math.PI;

  const inclinationRad = (51.64 * Math.PI) / 180;
  const lat = Math.asin(Math.sin(inclinationRad) * Math.sin(angle)) * (180 / Math.PI);
  
  // Account for earth's rotation (360 degrees per 86400 seconds)
  const earthRotationDeg = ((timeMs / 1000) * (360 / 86400)) % 360;
  let lon = Math.atan2(Math.cos(inclinationRad) * Math.sin(angle), Math.cos(angle)) * (180 / Math.PI);
  lon = ((lon - earthRotationDeg + 180) % 360) - 180;
  if (lon < -180) lon += 360;

  return { latitude: lat, longitude: lon };
}

// Educational Relay Network database
const GROUND_STATIONS = [
  { id: "goonhilly", name: "ESA Goonhilly (UK)", callsign: "GNH-1", lat: 50.05, lon: -5.18 },
  { id: "white_sands", name: "NASA White Sands (USA)", callsign: "WSC-B", lat: 32.50, lon: -106.61 },
  { id: "canberra", name: "Canberra Deep Space (AUS)", callsign: "CDS-4", lat: -35.40, lon: 148.98 },
  { id: "tokyo", name: "ARISS Tokyo (JPN)", callsign: "TYO-A", lat: 35.67, lon: 139.65 },
  { id: "goldstone", name: "DSN Goldstone (USA)", callsign: "GDS-2", lat: 35.42, lon: -116.89 }
];

const SATELLITE_POOL = [
  { name: "TDRS-11 (GEO)", agency: "NASA", freq: "S-Band SGL", reason: "Uplink Denied: Station-to-satellite elevation angle below 5° horizon mask (Earth shadow)." },
  { name: "AO-7 OSCAR (LEO)", agency: "Amateur Radio", freq: "VHF Repeater", reason: "Uplink Denied: Satellite in solar eclipsing state (battery voltage under 11.8V safety cut)." },
  { name: "Starlink-5211 (LEO)", agency: "SpaceX Relay", freq: "Laser-Mesh", reason: "Uplink Denied: S-band laser inter-satellite trunk experiencing channel collision spikes." },
  { name: "Fuji FO-29 (LEO)", agency: "JARL OSCAR", freq: "VHF Mode V/S", reason: "Uplink Denied: Severe ionospheric scintillation (equatorial anomaly absorption peak)." },
  { name: "O3b-FM12 (MEO)", agency: "SES Network", freq: "Ka-Band Trunk", reason: "Uplink Denied: Spacecraft executing reaction wheel desaturation. Relays offline." },
  { name: "TDRS-12 (GEO)", agency: "NASA", freq: "S-Band SGL", reason: "Uplink Approved: TDRS-12 S-band subcarrier locked. Coherent phase tracking verified!" },
  { name: "OSCAR AO-92 (LEO)", agency: "AMSAT FM", freq: "VHF/UHF Mode V/U", reason: "Uplink Approved: FM Repeater open. VHF uplink pilot sub-audible carrier locked!" }
];

interface SecureVoiceLinkProps {
  issLocation: ISSLocation | null;
  userLocation: UserLocation | null;
}

export const SecureVoiceLink: React.FC<SecureVoiceLinkProps> = ({
  issLocation,
  userLocation
}) => {
  const [astronauts, setAstronauts] = useState<Astronaut[]>([]);
  const [selectedAstronautId, setSelectedAstronautId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [squelch, setSquelch] = useState<number>(45);
  const [signalStrength, setSignalStrength] = useState<number>(0);
  const [encryptionKey, setEncryptionKey] = useState<string>("LOCKING...");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Satellite Relay states
  const [selectedStationId, setSelectedStationId] = useState<string>("goonhilly");
  const [handshakeStatus, setHandshakeStatus] = useState<"DISCONNECTED" | "ROUTING" | "CONNECTED">("DISCONNECTED");
  const [checkedSatellites, setCheckedSatellites] = useState<Array<{ name: string; agency: string; status: "denied" | "approved"; reason: string }>>([]);
  const [connectedSatellite, setConnectedSatellite] = useState<{ name: string; agency: string; freq: string } | null>(null);

  const initiateSatelliteHandshake = async () => {
    if (handshakeStatus === "ROUTING") return;
    
    setHandshakeStatus("ROUTING");
    setCheckedSatellites([]);
    setConnectedSatellite(null);
    
    try {
      await spaceAudio.playIntroBeep();
    } catch (e) {}

    const deniedPool = SATELLITE_POOL.filter(s => s.reason.includes("Denied"));
    const approvedPool = SATELLITE_POOL.filter(s => s.reason.includes("Approved"));
    
    const shuffledDenied = [...deniedPool].sort(() => 0.5 - Math.random());
    const selectedDenied = shuffledDenied.slice(0, 2);
    const selectedApproved = approvedPool[Math.floor(Math.random() * approvedPool.length)];
    
    const sequence = [
      ...selectedDenied.map(s => ({ ...s, status: "denied" as const })),
      { ...selectedApproved, status: "approved" as const }
    ];

    for (let i = 0; i < sequence.length; i++) {
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          const sat = sequence[i];
          setCheckedSatellites(prev => [...prev, {
            name: sat.name,
            agency: sat.agency,
            status: sat.status,
            reason: sat.reason
          }]);
          
          try {
            if (sat.status === "approved") {
              await spaceAudio.playOutroBeep();
            } else {
              await spaceAudio.playIntroBeep();
            }
          } catch (soundErr) {}
          
          resolve();
        }, 1300);
      });
    }

    const activeSat = {
      name: selectedApproved.name,
      agency: selectedApproved.agency,
      freq: selectedApproved.freq
    };
    setConnectedSatellite(activeSat);
    setHandshakeStatus("CONNECTED");
    
    const stationName = GROUND_STATIONS.find(s => s.id === selectedStationId)?.name || "Primary Station";
    setLogs(prev => [
      ...prev,
      {
        id: `sys-route-${Date.now()}`,
        sender: "astronaut",
        astronautName: "ISS Comm Link",
        text: `📡 SATELLITE ROUTE ESTABLISHED!\n\nGround Link: ${stationName}\nOrbit Relay: ${activeSat.name} (${activeSat.freq})\nStatus: SECURED & NOMINAL. Dynamic link active. READY FOR TRANSMISSION.`,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  // ARISS / Doppler shift tracking state
  const [dopplerShift, setDopplerShift] = useState<number>(0);
  const [radialVelocity, setRadialVelocity] = useState<number>(0);
  const [elevation, setElevation] = useState<number>(0);
  const [autoTuning, setAutoTuning] = useState<boolean>(true);
  const [tuningOffset, setTuningOffset] = useState<number>(0);
  const [uplinkLocked, setUplinkLocked] = useState<boolean>(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Calculate live Doppler shift and Zenith elevation dynamically
  useEffect(() => {
    if (!userLocation) return;

    const updateDoppler = () => {
      const now = Date.now();
      const pos1 = getSimulatedISSPositionClient(now);
      const pos2 = getSimulatedISSPositionClient(now + 1000);

      const dist1 = getDistance(userLocation.latitude, userLocation.longitude, pos1.latitude, pos1.longitude);
      const dist2 = getDistance(userLocation.latitude, userLocation.longitude, pos2.latitude, pos2.longitude);

      // radial velocity in km/s (negative means approaching, positive means receding)
      const rVel = dist2 - dist1;
      setRadialVelocity(rVel);

      // Doppler shift formula on 145.800 MHz (VHF downlink frequency)
      const f0 = 145.8e6; // 145.8 MHz
      const c = 299792458; // m/s
      const vRelMs = rVel * 1000;
      const dShift = -(f0 * vRelMs) / c;
      setDopplerShift(dShift);

      // Calculate current elevation angle relative to observer
      const elev = getElevationAngle(userLocation.latitude, userLocation.longitude, pos1.latitude, pos1.longitude, 415);
      setElevation(elev);
    };

    updateDoppler();
    const interval = setInterval(updateDoppler, 1000);
    return () => clearInterval(interval);
  }, [userLocation]);

  // Synchronize tuning offset with Doppler shift if Auto-Tuning (Rotor Sync) is enabled
  useEffect(() => {
    if (autoTuning) {
      setTuningOffset(Math.round(dopplerShift));
    }
  }, [dopplerShift, autoTuning]);

  // Monitor frequency lock status
  useEffect(() => {
    // Locked if:
    // 1. Rotor Sync Autopilot is enabled, or
    // 2. Manual offset matches Doppler shift within a standard 300 Hz amateur radio filter bandwidth, or
    // 3. Directly overhead pass is active (where Doppler shift drops to near 0 Hz anyway, simplifying tuning entirely!)
    const isDirectOverheadZenith = Math.abs(dopplerShift) < 300 && elevation > 35;
    const isMatched = Math.abs(tuningOffset - dopplerShift) < 300;
    setUplinkLocked(autoTuning || isMatched || isDirectOverheadZenith);
  }, [dopplerShift, tuningOffset, autoTuning, elevation]);

  // Load Astronauts from server on mount
  useEffect(() => {
    fetch("/api/astronauts")
      .then(res => res.json())
      .then(data => {
        setAstronauts(data);
        if (data.length > 0) {
          setSelectedAstronautId(data[0].id);
        }
      })
      .catch(err => console.error("Error fetching crew data:", err));
    
    // Add initial telemetry greeting
    setLogs([
      {
        id: "sys-init",
        sender: "astronaut",
        astronautName: "ISS Comm Link",
        text: "SECURE UHF SPACE-GROUND RADIO BRIDGE INITIALIZED. CHOOSE A CREW MEMBER TO DISPATCH A TRANSMISSION.",
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  }, []);

  // Scroll to bottom of message logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle dynamic encryption key and signal strength calculation
  useEffect(() => {
    if (!issLocation) return;

    // Set signal strength based on physical proximity (stronger if closer)
    let strength = 0;
    if (userLocation) {
      const dist = getDistance(
        userLocation.latitude,
        userLocation.longitude,
        issLocation.latitude,
        issLocation.longitude
      );
      if (dist < 800) strength = 98;
      else if (dist < 2000) strength = 84;
      else if (dist < 5000) strength = 56;
      else if (dist < 10000) strength = 32;
      else strength = 12;
    } else {
      strength = 45; // arbitrary default without GPS
    }
    setSignalStrength(strength);

    // Rotate simulated encryption hash for sci-fi atmosphere
    const interval = setInterval(() => {
      const hex = "0123456789ABCDEF";
      let key = "VHF-SEC_";
      for (let i = 0; i < 8; i++) {
        key += hex[Math.floor(Math.random() * 16)];
      }
      setEncryptionKey(key);
    }, 1000);

    return () => clearInterval(interval);
  }, [issLocation, userLocation]);

  // Speech Recognition hook setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => setIsListening(true);
      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setMessage(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onend = () => setIsListening(false);
      rec.onerror = () => setIsListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please type your message.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      // Play a quick mic open beep first
      spaceAudio.playIntroBeep().then(() => {
        recognitionRef.current.start();
      });
    }
  };

  const selectedAstronaut = astronauts.find(a => a.id === selectedAstronautId);

  // Submit Text/Voice packet to Express server -> Gemini text -> Gemini TTS -> Audio playback
  const transmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isTransmitting || !selectedAstronaut) return;

    if (!uplinkLocked) {
      // Append warning from system directly into logs to guide the user!
      setLogs(prev => [
        ...prev,
        {
          id: `sys-warn-${Date.now()}`,
          sender: "astronaut",
          astronautName: "ISS Comm Link",
          text: `⚠️ TRANSMISSION BLOCKED: UNCORRECTED DOPPLER FREQUENCY DRIFT.\n\nYour uplink frequency is misaligned by ${Math.round(dopplerShift - tuningOffset)} Hz from the ISS receiver center frequency.\n\nTo resolve this Doppler shift issue:\n1. Drag the 'Transceiver Tuning Offset' slider to match the target Doppler of ${Math.round(dopplerShift)} Hz.\n2. Enable 'Rotor Sync' auto-tracking.\n3. Wait for the ISS to pass directly overhead (Zenith Approach, Doppler ~ 0 Hz).`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      return;
    }

    const userMsgText = message.trim();
    setMessage(""); // clear input
    setIsTransmitting(true);
    setApiKeyError(null);

    let activeSatellite = connectedSatellite;
    if (!activeSatellite) {
      // Append a system message in logs informing about auto-routing
      setLogs(prev => [
        ...prev,
        {
          id: `sys-autorouting-${Date.now()}`,
          sender: "astronaut",
          astronautName: "ISS Comm Link",
          text: `📡 ROUTE OFFLINE: Initiating automated orbital fallback routing cascade...`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Fast-track cascade handshake
      setHandshakeStatus("ROUTING");
      setCheckedSatellites([]);

      const deniedPool = SATELLITE_POOL.filter(s => s.reason.includes("Denied"));
      const approvedPool = SATELLITE_POOL.filter(s => s.reason.includes("Approved"));
      const shuffledDenied = [...deniedPool].sort(() => 0.5 - Math.random());
      const selectedDenied = shuffledDenied.slice(0, 1); // just try 1 denied satellite to keep fast-track speedy but realistic
      const selectedApproved = approvedPool[Math.floor(Math.random() * approvedPool.length)];

      const sequence = [
        { ...selectedDenied[0], status: "denied" as const },
        { ...selectedApproved, status: "approved" as const }
      ];

      for (let i = 0; i < sequence.length; i++) {
        const sat = sequence[i];
        setCheckedSatellites(prev => [...prev, {
          name: sat.name,
          agency: sat.agency,
          status: sat.status,
          reason: sat.reason
        }]);
        try {
          if (sat.status === "approved") {
            await spaceAudio.playOutroBeep();
          } else {
            await spaceAudio.playIntroBeep();
          }
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      activeSatellite = {
        name: selectedApproved.name,
        agency: selectedApproved.agency,
        freq: selectedApproved.freq
      };
      setConnectedSatellite(activeSatellite);
      setHandshakeStatus("CONNECTED");
    }

    // Append user message to logs list
    const userLogId = `user-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString();
    setLogs(prev => [
      ...prev,
      {
        id: userLogId,
        sender: "user",
        text: userMsgText,
        timestamp: timestampStr,
        route: activeSatellite ? {
          station: GROUND_STATIONS.find(s => s.id === selectedStationId)?.name || "Primary Station",
          satellite: activeSatellite.name
        } : undefined
      }
    ]);

    // Calculate flight stats
    let distanceKm = null;
    if (userLocation && issLocation) {
      distanceKm = getDistance(
        userLocation.latitude,
        userLocation.longitude,
        issLocation.latitude,
        issLocation.longitude
      );
    }

    try {
      // Play a quick transmission beep on client to sound like standard radio PTT
      await spaceAudio.playIntroBeep();
      spaceAudio.startStatic(0.015); // soft radio crackle while waiting

      const response = await fetch("/api/voice/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          astronautId: selectedAstronaut.id,
          message: userMsgText,
          userLocation,
          issLocation,
          groundDistance: distanceKm,
          route: activeSatellite ? {
            station: GROUND_STATIONS.find(s => s.id === selectedStationId)?.name || "Primary Station",
            satellite: activeSatellite.name
          } : undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "API_KEY_MISSING") {
          setApiKeyError(data.message);
        }
        throw new Error(data.message || "Failed to transmit voice packet");
      }

      // Add astronaut response text to log
      const astronautLogId = `astronaut-${Date.now()}`;
      setLogs(prev => [
        ...prev,
        {
          id: astronautLogId,
          sender: "astronaut",
          astronautName: selectedAstronaut.name,
          text: data.replyText,
          audioUrl: data.audioBase64,
          timestamp: new Date().toLocaleTimeString(),
          isTransmitting: true
        }
      ]);

      // Play astronaut synthesized speech and Quindar Tones!
      if (data.audioBase64) {
        await spaceAudio.playAstronautAudio(data.audioBase64);
      } else {
        // Fallback: Speak the text using client-side Web Speech Synthesis wrapped in radio static and beeps
        try {
          await spaceAudio.playIntroBeep();
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(data.replyText);
            const voices = window.speechSynthesis.getVoices();
            const isFemale = selectedAstronaut.id === "williams";
            
            const preferredVoice = voices.find(v => {
              const langMatch = v.lang.startsWith("en");
              if (!langMatch) return false;
              if (isFemale) {
                return v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("google us english");
              } else {
                return v.name.toLowerCase().includes("male") || v.name.toLowerCase().includes("david") || v.name.toLowerCase().includes("microsoft david");
              }
            }) || voices.find(v => v.lang.startsWith("en"));
            
            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }
            utterance.rate = 0.95;
            utterance.pitch = isFemale ? 1.05 : 0.9;
            
            window.speechSynthesis.speak(utterance);
            await new Promise<void>((resolve) => {
              utterance.onend = () => resolve();
              utterance.onerror = () => resolve();
              setTimeout(resolve, 15000);
            });
          } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          await spaceAudio.playOutroBeep();
        } catch (speechErr) {
          console.warn("Client speech synthesis failed", speechErr);
          await spaceAudio.playOutroBeep();
        }
      }

      // Mark transmission complete
      setLogs(prev =>
        prev.map(l => (l.id === astronautLogId ? { ...l, isTransmitting: false } : l))
      );

    } catch (err: any) {
      console.error(err);
      setLogs(prev => [
        ...prev,
        {
          id: `sys-err-${Date.now()}`,
          sender: "astronaut",
          astronautName: "BRIDGE ERROR",
          text: `TRANSMISSION INTERRUPTED. SYSTEM CODE: VHF-ERR-LOSS-OF-SIGNAL. ${err.message || ""}`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      spaceAudio.stopStatic(0.5);
      setIsTransmitting(false);
    }
  };

  // Replay a previous message audio
  const replayAudio = async (text: string, base64Audio?: string | null, astronautName?: string) => {
    if (base64Audio) {
      try {
        await spaceAudio.playAstronautAudio(base64Audio);
      } catch (e) {
        console.error("Failed to replay audio", e);
      }
    } else {
      // Fallback: use Web Speech Synthesis
      try {
        await spaceAudio.playIntroBeep();
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          const voices = window.speechSynthesis.getVoices();
          const isFemale = astronautName && (astronautName.toLowerCase().includes("suni") || astronautName.toLowerCase().includes("williams"));
          
          const preferredVoice = voices.find(v => {
            const langMatch = v.lang.startsWith("en");
            if (!langMatch) return false;
            if (isFemale) {
              return v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("google us english");
            } else {
              return v.name.toLowerCase().includes("male") || v.name.toLowerCase().includes("david") || v.name.toLowerCase().includes("microsoft david");
            }
          }) || voices.find(v => v.lang.startsWith("en"));
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }
          utterance.rate = 0.95;
          utterance.pitch = isFemale ? 1.05 : 0.9;
          
          window.speechSynthesis.speak(utterance);
          await new Promise<void>((resolve) => {
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            setTimeout(resolve, 15000);
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        await spaceAudio.playOutroBeep();
      } catch (err) {
        console.warn("Speech synthesis replay failed", err);
        await spaceAudio.playOutroBeep();
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono select-none">
      {/* Column 1 Wrapper */}
      <div className="flex flex-col gap-6">
        {/* Col 1: Astronaut Selection Panel */}
        <div className="flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-2xl glow-teal/5">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-display pb-2 mb-4 border-b border-slate-800 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-teal-400" />
            Crew Directory
          </h3>

          {astronauts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              <span className="text-xs">UPLINKING DIRECTORY...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1">
              {astronauts.map((astro) => (
                <button
                  key={astro.id}
                  onClick={() => setSelectedAstronautId(astro.id)}
                  className={`flex gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedAstronautId === astro.id
                      ? "bg-slate-950 border-teal-500/80 glow-teal/10"
                      : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700"
                  }`}
                >
                  {/* Photo */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={astro.imageUrl}
                      alt={astro.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                    />
                    {selectedAstronautId === astro.id && (
                      <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400"></span>
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">{astro.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{astro.role}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] px-1 bg-slate-900 border border-slate-800 rounded font-medium text-slate-500 font-mono">
                        {astro.agency}
                      </span>
                      <span className="text-[9px] text-slate-600 font-semibold uppercase tracking-wider">
                        {astro.callsign}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedAstronaut && (
            <div className="mt-4 p-3.5 bg-slate-950 rounded-xl border border-slate-800/60 text-[11px] leading-relaxed text-slate-400">
              <span className="font-bold text-teal-400 block mb-1">ASTRONAUT PROFILE:</span>
              {selectedAstronaut.bio}
            </div>
          )}
        </div>

        {/* Card: Satellite Link Router (Educational Simulation) */}
        <div className="flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-2xl glow-teal/5">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-display pb-2 mb-4 border-b border-slate-800 flex items-center gap-2">
            <Satellite className="w-4 h-4 text-teal-400 animate-pulse" />
            Satellite Relay Deck
          </h3>

          <div className="flex flex-col gap-4 text-xs">
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-900/60">
              Select an earth ground station to transmit VHF radio waves. If direct line-of-sight is denied by an orbital relay, our autonomous network executes an <span className="text-teal-400 font-bold">automated fallback protocol</span> to establish a linked space bridge!
            </p>

            {/* Station dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 font-bold">TERRESTRIAL GROUND STATION</label>
              <select
                value={selectedStationId}
                onChange={(e) => {
                  setSelectedStationId(e.target.value);
                  setHandshakeStatus("DISCONNECTED");
                  setConnectedSatellite(null);
                  setCheckedSatellites([]);
                }}
                disabled={handshakeStatus === "ROUTING"}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-50 cursor-pointer"
              >
                {GROUND_STATIONS.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.callsign})
                  </option>
                ))}
              </select>
            </div>

            {/* Handshake Trigger Button */}
            <button
              onClick={initiateSatelliteHandshake}
              disabled={handshakeStatus === "ROUTING"}
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all text-xs cursor-pointer ${
                handshakeStatus === "ROUTING"
                  ? "bg-slate-950 border-slate-850 text-slate-600 cursor-not-allowed"
                  : handshakeStatus === "CONNECTED"
                  ? "bg-teal-500 hover:bg-teal-400 border-teal-400 text-slate-950"
                  : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-teal-400 hover:text-teal-300"
              }`}
            >
              {handshakeStatus === "ROUTING" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                  <span>NEGOTIATING RELAY PROTOCOL...</span>
                </>
              ) : handshakeStatus === "CONNECTED" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                  <span>RESET UPLINK ROUTE</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  <span>ESTABLISH OMNI-SATELLITE BRIDGE</span>
                </>
              )}
            </button>

            {/* Handshake Live Logging / Cascade Steps */}
            {(checkedSatellites.length > 0 || handshakeStatus === "ROUTING") && (
              <div className="flex flex-col gap-2 p-3 bg-slate-950 rounded-xl border border-slate-850">
                <div className="flex items-center justify-between border-b border-slate-900 pb-1 mb-1 text-[9px] font-bold text-slate-500">
                  <span>AUTONOMOUS ROUTING CASCADE</span>
                  <span className={handshakeStatus === "CONNECTED" ? "text-emerald-400" : "text-amber-400 animate-pulse"}>
                    {handshakeStatus === "CONNECTED" ? "LINK LOCKED" : "SEQUENCING..."}
                  </span>
                </div>

                <div className="flex flex-col gap-2 font-mono">
                  {checkedSatellites.map((sat, idx) => (
                    <div key={idx} className="flex flex-col gap-1 text-[10px]">
                      {idx > 0 && (
                        <div className="flex items-center justify-center -my-1">
                          <ChevronRight className="w-3.5 h-3.5 text-rose-500 transform rotate-90" />
                          <span className="text-[8px] text-rose-500/80 uppercase font-bold tracking-widest bg-slate-950 px-1 font-sans">
                            FALLBACK CASCADE
                          </span>
                        </div>
                      )}
                      <div className={`flex items-start gap-2 p-2 rounded border ${
                        sat.status === "approved"
                          ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-300"
                          : "bg-rose-950/10 border-rose-500/10 text-rose-300"
                      }`}>
                        {sat.status === "approved" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between font-bold">
                            <span>{sat.name}</span>
                            <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-slate-900">
                              {sat.agency}
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                            {sat.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {handshakeStatus === "ROUTING" && checkedSatellites.length < 2 && (
                    <div className="flex items-center justify-center py-2 gap-2 text-[10px] text-slate-500 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>POLLING ORBITAL ASSET {checkedSatellites.length + 1}...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Connected Route diagram */}
            {handshakeStatus === "CONNECTED" && connectedSatellite && (
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-emerald-500/20 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px]">
                  <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  UPLINK SIGNAL ENCRYPTED & LOCKED
                </div>
                
                {/* Visual Signal Path */}
                <div className="flex items-center justify-center gap-2 w-full py-1 text-slate-300">
                  <div className="flex flex-col items-center text-[10px]">
                    <Globe className="w-4 h-4 text-teal-400 animate-pulse" />
                    <span className="text-[8px] text-slate-500 mt-1 font-bold">GROUND</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <div className="flex flex-col items-center text-[10px]">
                    <Satellite className="w-4 h-4 text-teal-400 animate-bounce" />
                    <span className="text-[8px] text-slate-400 mt-1 font-bold truncate max-w-[80px]">
                      {connectedSatellite.name.split(" ")[0]}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <div className="flex flex-col items-center text-[10px]">
                    <Radio className="w-4 h-4 text-orange-400 animate-pulse" />
                    <span className="text-[8px] text-orange-500 mt-1 font-bold font-sans">ISS</span>
                  </div>
                </div>

                <div className="w-full text-center text-[9px] text-slate-500 border-t border-slate-900 pt-1.5 mt-0.5">
                  Path: <span className="text-slate-300">{GROUND_STATIONS.find(s => s.id === selectedStationId)?.name}</span> ➡️ <span className="text-slate-300">{connectedSatellite.name} ({connectedSatellite.freq})</span>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Card 2: ARISS Doppler Tuning Deck */}
        <div className="flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-2xl glow-teal/5">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-display pb-2 mb-4 border-b border-slate-800 flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-400" />
            ARISS Pass Coordinator
          </h3>

          <div className="flex flex-col gap-4 text-xs">
            
            {/* Theoretical / tutorial explanation */}
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-900">
              The ISS travels at <span className="text-slate-200 font-semibold">27,560 km/h</span>, causing a 
              dynamic <span className="text-amber-400 font-semibold">±3.5 kHz Doppler shift</span> on VHF voice links. 
              During a <span className="text-emerald-400 font-bold">direct overhead pass (Zenith)</span>, the relative velocity reaches zero, reducing the Doppler shift to <span className="text-emerald-400 font-bold">0 Hz</span> and eliminating the need for frequency tracking!
            </p>

            {/* Quick stats grid */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-850">
              <div>
                <span className="text-[9px] text-slate-500 block">DOPPLER FREQ DRIFT</span>
                <span className={`text-xs font-bold font-mono ${Math.abs(dopplerShift) < 300 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {dopplerShift > 0 ? "+" : ""}{Math.round(dopplerShift)} Hz
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">RADIAL SPEED</span>
                <span className="text-xs font-bold text-slate-300 font-mono">
                  {radialVelocity > 0 ? "▲ RECEDE" : "▼ CLOSE"} {Math.abs(radialVelocity * 3600).toFixed(0)} km/h
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">ELEVATION FROM GROUND</span>
                <span className="text-xs font-bold text-slate-300 font-mono">
                  {elevation > 0 ? `+${elevation.toFixed(1)}°` : "BELOW HORIZON"}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">OVERHEAD STATUS</span>
                <span className={`text-xs font-bold font-mono uppercase ${elevation > 45 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {elevation > 45 ? "Zenith Approach" : "Low Horizon"}
                </span>
              </div>
            </div>

            {/* Auto Tuning Autopilot vs Manual Toggle */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                <span>TUNING CONTROLLER MODE</span>
                <span className="text-[9px] bg-slate-950 px-1.5 py-0.5 rounded text-teal-400 font-mono">
                  {autoTuning ? "AUTOMATED ROTOR" : "MANUAL VFO"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                <button
                  type="button"
                  onClick={() => setAutoTuning(true)}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    autoTuning
                      ? "bg-teal-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ROTOR SYNC
                </button>
                <button
                  type="button"
                  onClick={() => setAutoTuning(false)}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !autoTuning
                      ? "bg-teal-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  MANUAL VFO
                </button>
              </div>
            </div>

            {/* Manual Tuning Offset slider */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>TRANSCEIVER TUNING OFFSET</span>
                <span className={`font-mono ${autoTuning ? 'text-slate-500' : 'text-teal-400 font-bold'}`}>
                  {tuningOffset > 0 ? "+" : ""}{tuningOffset} Hz
                </span>
              </div>
              <input
                type="range"
                min="-4000"
                max="4000"
                step="50"
                value={tuningOffset}
                disabled={autoTuning}
                onChange={(e) => setTuningOffset(parseInt(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer h-1.5 rounded-full bg-slate-950 border border-slate-850 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-bold">
                <span>-4.0 kHz (UPLINK LOW)</span>
                <span>CENTER FREQ</span>
                <span>+4.0 kHz (UPLINK HIGH)</span>
              </div>
            </div>

            {/* ARISS Connection Status Banner */}
            <div className={`mt-2 p-3 rounded-xl border text-[11px] leading-relaxed font-bold font-mono transition-all duration-300 ${
              Math.abs(dopplerShift) < 300 && elevation > 35
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400 animate-pulse"
                : uplinkLocked
                ? "bg-teal-950/20 border-teal-500/30 text-teal-400"
                : "bg-rose-950/20 border-rose-500/30 text-rose-400"
            }`}>
              {Math.abs(dopplerShift) < 300 && elevation > 35 ? (
                <div>
                  ❇️ ZENITH OVERHEAD PASS ACTIVE (DOPPLER 0 Hz)<br />
                  <span className="font-normal text-slate-300 text-[10px] mt-1 block">
                    The space station is directly overhead! Zero Doppler drift detected. Channel is perfectly matched at 145.800 MHz downlink / 144.490 MHz uplink. Bridge open!
                  </span>
                </div>
              ) : uplinkLocked ? (
                <div>
                  🟢 FREQUENCY COHERENCE COUPLING LOCKED<br />
                  <span className="font-normal text-slate-300 text-[10px] mt-1 block">
                    Your transceiver offset is matched to the ISS Doppler shift. Uplink frequency is tracked and locked. Ready to transmit.
                  </span>
                </div>
              ) : (
                <div>
                  ⚠️ FREQUENCY COHERENCE LOST (SQUELCHED)<br />
                  <span className="font-normal text-slate-300 text-[10px] mt-1 block">
                    Uplink blocked. Doppler shift of <span className="text-rose-400 font-bold">{Math.round(dopplerShift)} Hz</span> exceeds the receiver's bandwidth filter limit. Adjust manual offset or enable Rotor Sync.
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Col 2 & 3: Comm Log & Controller Console */}
      <div className="lg:col-span-2 flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl overflow-hidden glow-teal/5">
        
        {/* Header telemetry band */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 grid grid-cols-2 md:grid-cols-5 gap-4 text-[10px] text-slate-400">
          <div>
            <div className="text-slate-500">ARISS FREQ</div>
            <div className="font-bold text-teal-400">145.800 MHz (VHF)</div>
          </div>
          <div>
            <div className="text-slate-500">DOPPLER DRIFT</div>
            <span className={`font-bold font-mono ${Math.abs(dopplerShift) < 300 ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
              {dopplerShift > 0 ? "+" : ""}{Math.round(dopplerShift)} Hz
            </span>
          </div>
          <div>
            <div className="text-slate-500">TUNING OFFSETS</div>
            <div className="font-bold text-slate-300 font-mono">
              {tuningOffset > 0 ? "+" : ""}{tuningOffset} Hz
            </div>
          </div>
          <div>
            <div className="text-slate-500">SIGNAL & LOCK</div>
            <div className="font-bold flex items-center gap-1.5 font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${uplinkLocked ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className={uplinkLocked ? "text-emerald-400" : "text-rose-400"}>
                {uplinkLocked ? "LOCKED" : "UNLOCKED"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">SECURE VHF KEY</div>
            <div className="font-bold text-slate-400 flex items-center gap-1 truncate font-mono">
              <Lock className="w-3 h-3 text-teal-500" />
              {encryptionKey}
            </div>
          </div>
        </div>

        {/* Message Log Thread */}
        <div className="flex-1 p-4 min-h-[250px] max-h-[350px] overflow-y-auto bg-slate-950/80 flex flex-col gap-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`flex flex-col max-w-[85%] rounded-xl p-3 border text-xs leading-relaxed ${
                log.sender === "user"
                  ? "self-end bg-teal-950/10 border-teal-500/20 text-slate-200"
                  : log.astronautName === "BRIDGE ERROR"
                  ? "self-start bg-rose-950/10 border-rose-950 text-rose-400"
                  : log.astronautName === "ISS Comm Link"
                  ? "self-center text-center bg-slate-900/40 border-slate-800 text-slate-500 max-w-[95%] tracking-wide"
                  : "self-start bg-slate-900 border-slate-800 text-slate-300"
              }`}
            >
              {/* Header */}
              {log.sender === "astronaut" && log.astronautName !== "ISS Comm Link" && (
                <div className="flex items-center justify-between gap-4 mb-1.5 pb-1 border-b border-slate-800/60">
                  <span className="font-bold text-teal-400 tracking-wider">
                    {log.astronautName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500">{log.timestamp}</span>
                    <button
                      onClick={() => replayAudio(log.text, log.audioUrl, log.astronautName)}
                      className="text-teal-400 hover:text-teal-300 p-0.5 rounded hover:bg-slate-800"
                      title="Replay audio transmission"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {log.sender === "user" && (
                <div className="flex flex-col gap-1 mb-1.5 pb-1 border-b border-teal-500/10 text-[9px] text-slate-500 font-bold tracking-wider">
                  <div className="flex justify-between gap-4">
                    <span>GROUND TRANSMISSION</span>
                    <span>{log.timestamp}</span>
                  </div>
                  {log.route && (
                    <div className="flex items-center gap-1 text-teal-400 font-mono mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                      <Globe className="w-3 h-3 text-teal-500 flex-shrink-0" />
                      <span className="truncate max-w-[80px]">{log.route.station.replace("ESA ", "").replace("NASA ", "")}</span>
                      <ChevronRight className="w-2.5 h-2.5 text-slate-600 flex-shrink-0" />
                      <Satellite className="w-3 h-3 text-teal-400 flex-shrink-0" />
                      <span className="text-teal-300 truncate max-w-[85px]">{log.route.satellite.split(" ")[0]}</span>
                      <ChevronRight className="w-2.5 h-2.5 text-slate-600 flex-shrink-0" />
                      <span className="text-orange-400 flex-shrink-0 font-sans">ISS</span>
                    </div>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="whitespace-pre-wrap select-text">
                {log.text}
              </div>

              {/* Transmission Active Indicator */}
              {log.isTransmitting && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-bold text-teal-400 tracking-widest animate-pulse">
                  <Volume2 className="w-3.5 h-3.5" />
                  RECEIVING VOICE FEED...
                </div>
              )}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {/* Input Controller Squelch & Dispatch Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
          
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Squelch slider */}
            <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-lg border border-slate-800/60 flex-1 min-w-[200px]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                RF Squelch
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={squelch}
                onChange={(e) => setSquelch(parseInt(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer h-1 rounded-full bg-slate-800"
              />
              <span className="text-[10px] text-teal-400 font-bold w-8 text-right">
                {squelch}dB
              </span>
            </div>

            {/* Micro instructions */}
            <div className="text-[10px] text-slate-500">
              UHF radio active. Click Mic icon to speak or enter text and hit send.
            </div>
          </div>

          {/* API Key missing notification */}
          {apiKeyError && (
            <div className="p-3 bg-rose-950/20 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span className="font-bold">Space Link Inactive:</span> {apiKeyError} Use the <span className="font-bold">Settings &gt; Secrets</span> panel to add your <span className="font-mono bg-rose-950/50 px-1 py-0.5 rounded">GEMINI_API_KEY</span>.
              </div>
            </div>
          )}

          {/* Dispatch Form */}
          <form onSubmit={transmitMessage} className="flex gap-2">
            {/* Voice dictate record button */}
            <button
              type="button"
              onClick={toggleListening}
              disabled={isTransmitting}
              className={`p-3 rounded-xl border flex items-center justify-center transition-all ${
                isListening
                  ? "bg-rose-500 border-rose-400 text-white animate-pulse glow-orange"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-teal-400 hover:border-slate-700"
              }`}
              title={isListening ? "Listening... click to stop" : "Speak to write message"}
            >
              {isListening ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>

            {/* Input message field */}
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isListening
                  ? "Listening carefully... speak now"
                  : "Type security transmission payload..."
              }
              disabled={isTransmitting}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500"
            />

            {/* Submit transmission */}
            <button
              type="submit"
              disabled={isTransmitting || !message.trim()}
              className={`px-4 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                isTransmitting || !message.trim()
                  ? "bg-slate-900/40 border-slate-850 text-slate-600 cursor-not-allowed"
                  : "bg-teal-500 hover:bg-teal-400 text-slate-950 border-teal-400 cursor-pointer"
              }`}
            >
              {isTransmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline text-xs">TRANSMIT</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
