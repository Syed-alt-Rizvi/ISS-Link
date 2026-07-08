import React from "react";
import { Compass, Eye, MapPin, Radio, ShieldCheck } from "lucide-react";
import { getCardinalDirection } from "../utils/geo";

interface CompassInstrumentProps {
  bearing: number | null;
  elevation: number | null;
  distance: number | null;
  overhead: boolean;
}

export const CompassInstrument: React.FC<CompassInstrumentProps> = ({
  bearing,
  elevation,
  distance,
  overhead
}) => {
  // Convert bearing degrees to rotation transform
  const rotationAngle = bearing !== null ? bearing : 0;
  
  // Human readable cardinal heading
  const cardinal = bearing !== null ? getCardinalDirection(bearing) : "N/A";

  // Calculate coordinates for elevation slope indicator
  // Elevation ranges from -90 to 90 degrees. We are interested in positive elevation (> 0 is above horizon)
  const isVisible = elevation !== null && elevation > 0;

  return (
    <div className="flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-2xl glow-orange/5 font-mono select-none">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-orange-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-display">
            Horizon Locator
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px]">
          <span className={`w-1.5 h-1.5 rounded-full ${isVisible ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
          <span className={isVisible ? "text-emerald-400 font-bold" : "text-slate-500"}>
            {isVisible ? "OPTICAL LINK ON" : "HORIZON BLOCKED"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Visual Compass Rose */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40 rounded-full border-2 border-slate-800 bg-slate-950 flex items-center justify-center">
            {/* Grid Lines */}
            <div className="absolute inset-0 border border-dashed border-slate-900/40 rounded-full m-4" />
            <div className="absolute inset-0 border border-slate-900/20 rounded-full m-8" />
            
            {/* Cardinal Marks */}
            <span className="absolute top-1 text-[10px] font-bold text-slate-400">N</span>
            <span className="absolute right-1.5 text-[10px] font-bold text-slate-500">E</span>
            <span className="absolute bottom-1 text-[10px] font-bold text-slate-500">S</span>
            <span className="absolute left-1.5 text-[10px] font-bold text-slate-500">W</span>
            
            {/* Sub-cardinal divisions */}
            <div className="absolute w-[94%] h-[94%] border-l border-r border-slate-900/50 rotate-45" />
            <div className="absolute w-[94%] h-[94%] border-t border-b border-slate-900/50 rotate-45" />
            <div className="absolute w-[94%] h-[94%] border-l border-r border-slate-900/20 rotate-12" />
            <div className="absolute w-[94%] h-[94%] border-l border-r border-slate-900/20 -rotate-12" />

            {/* Rotatable Tracking Needle */}
            {bearing !== null ? (
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${rotationAngle}deg)` }}
              >
                {/* Needle Shape */}
                <div className="relative w-1 h-32 flex flex-col justify-between items-center">
                  {/* North Pointer (Orange Arrow) */}
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[12px] border-b-orange-400 -translate-y-1" />
                  {/* Center Pivot Pivot */}
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-orange-400 z-10" />
                  {/* South Tail */}
                  <div className="w-1.5 h-6 bg-slate-800" />
                </div>
              </div>
            ) : (
              <div className="text-slate-600 text-[10px]">AWAITING GPS</div>
            )}
          </div>
          <div className="mt-2 text-center">
            <span className="text-[10px] text-slate-500">AZIMUTH BEARING</span>
            <div className="text-lg font-bold text-slate-200">
              {bearing !== null ? `${Math.round(bearing)}° ${cardinal}` : "---"}
            </div>
          </div>
        </div>

        {/* Telemetry Numeric Readouts and Elevation Meter */}
        <div className="flex flex-col gap-4">
          {/* Distance Indicator */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] text-slate-500 tracking-wider">SLANT RANGE DISTANCE</span>
            </div>
            <div className="text-xl font-bold text-slate-200">
              {distance !== null ? `${distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : "Searching lock..."}
            </div>
          </div>

          {/* Elevation Angle Indicator */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] text-slate-500 tracking-wider">ELEVATION ANGLE</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-xl font-bold text-slate-200">
                {elevation !== null ? `${elevation > 0 ? "+" : ""}${elevation}°` : "---"}
              </div>
              <div className="text-[10px] text-slate-500">
                {elevation !== null && elevation > 0 ? "Above Horizon" : "Below Horizon"}
              </div>
            </div>
            
            {/* Elevation Slider graphic */}
            <div className="mt-2.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
              <div
                className={`absolute h-full top-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-500 ${
                  isVisible ? "bg-emerald-400" : "bg-orange-500/30"
                }`}
                style={{
                  width: elevation !== null ? `${Math.min(Math.abs(elevation) / 90 * 100, 100)}%` : "0%",
                  left: elevation !== null && elevation >= 0 ? "50%" : "auto",
                  right: elevation !== null && elevation < 0 ? "50%" : "auto"
                }}
              />
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600" />
            </div>
          </div>

          {/* Overhead Signal Status Box */}
          <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
            overhead 
              ? "bg-orange-950/20 border-orange-500/40 text-orange-400 animate-pulse" 
              : "bg-slate-950/30 border-slate-800 text-slate-400"
          }`}>
            <Radio className={`w-5 h-5 flex-shrink-0 ${overhead ? "text-orange-400" : "text-slate-500"}`} />
            <div>
              <div className="text-[11px] font-bold tracking-wider uppercase">
                {overhead ? "OVERHEAD FLYOVER ALERT" : "SPACE TO GROUND LINK"}
              </div>
              <div className="text-[10px] leading-relaxed opacity-85">
                {overhead 
                  ? "ISS is within visual footprint range (<800km)! Step outside to try and spot the station." 
                  : "Ground range is too distant for optical tracking. Radio bridge operating on standby."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
