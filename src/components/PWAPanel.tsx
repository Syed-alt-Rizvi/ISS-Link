import React, { useState, useEffect } from "react";
import { Download, Smartphone, Layout, HelpCircle, ExternalLink, Sparkles, Monitor } from "lucide-react";

interface PWAPanelProps {
  userLocation: { latitude: number; longitude: number } | null;
}

export function PWAPanel({ userLocation }: PWAPanelProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  useEffect(() => {
    // Check if app is already running in standalone display mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('ISS Tracker PWA was installed successfully!');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback instruction if prompt isn't available yet (e.g. already installed, or browser unsupported)
      alert("PWA Install prompt is handled by your browser. Tap the 'three dots' menu in Chrome, or the 'Share' icon in Safari, and select 'Add to Home Screen'.");
      return;
    }
    // Show the native prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install prompt choice: ${outcome}`);
    // We've used the prompt, and can't use it again
    setDeferredPrompt(null);
  };

  const launchFloatingWidget = () => {
    const width = 340;
    const height = 400;
    const left = window.screen.width - width - 20;
    const top = 60;

    // Check if Document Picture-in-Picture is supported
    if ('documentPictureInPicture' in window) {
      try {
        // Document PiP can be used on modern Chromium!
        // We'll fallback to a dedicated micro-popup, which is perfectly sized and fully cross-platform.
      } catch (e) {
        console.warn("Doc PiP skipped, using popup", e);
      }
    }

    window.open(
      "/?mode=widget",
      "iss_ambient_widget",
      `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,location=no,toolbar=no,resizable=yes`
    );
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 rounded-2xl glow-teal/5 font-mono">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Info text */}
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-display pb-1 mb-2 border-b border-slate-850 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-teal-400" />
            Device Integration Deck
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Run the ISS Tracker as a standalone web application. Add live widgets directly to your mobile home screen or launch an ambient desktop mini-display that sits on top of other tasks.
          </p>
        </div>

        {/* Dynamic CTAs */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* PWA Install Button */}
          {!isInstalled ? (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl cursor-pointer transition-all duration-300 text-xs shadow-lg shadow-teal-500/10"
            >
              <Download className="w-4 h-4" />
              INSTALL FULL WEB APP
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-2 bg-teal-950/20 border border-teal-500/30 text-teal-400 font-bold rounded-xl text-xs">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              INSTALLED ON DEVICE
            </span>
          )}

          {/* Launch Mini Widget Button */}
          <button
            onClick={launchFloatingWidget}
            className="flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-orange-400 font-bold rounded-xl border border-slate-800 cursor-pointer transition-colors text-xs"
            title="Open a live ambient widget in a small floating popup window"
          >
            <Monitor className="w-4 h-4" />
            LAUNCH FLOATING WIDGET
          </button>

          {/* Tutorial Toggle */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer text-xs ${
              showGuide
                ? "bg-slate-800 border-slate-700 text-slate-200"
                : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-300"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guide details panel */}
      {showGuide && (
        <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-slate-850/80 text-[11px] leading-relaxed text-slate-400 space-y-3 animate-fadeIn">
          <div>
            <span className="font-bold text-teal-400 block mb-1">📲 HOW TO ADD THE HOMESCREEN WIDGET:</span>
            <ul className="list-decimal list-inside space-y-1.5 text-slate-300">
              <li>
                First, tap <span className="text-teal-400 font-semibold">INSTALL FULL WEB APP</span> above, or open the Chrome menu (three dots) and tap <span className="text-slate-200">"Add to Home Screen"</span> / <span className="text-slate-200">"Install app"</span>. This generates the real launcher icon with the correct high-res graphic.
              </li>
              <li>
                Go to your mobile device's home screen, long-press empty space, and choose <span className="text-slate-200">"Widgets"</span>.
              </li>
              <li>
                Scroll down to find <span className="font-bold text-teal-400">ISS Bridge</span> or Chrome, then drag the <span className="text-teal-400 font-semibold">ISS Live Tracker Widget</span> onto your desktop.
              </li>
              <li>
                The widget pulls real-time ISS orbital updates on-the-fly and alerts you when passes occur, even with Chrome completely closed!
              </li>
            </ul>
          </div>
          <div className="pt-2 border-t border-slate-900">
            <span className="font-bold text-orange-400 block mb-1">🖥️ FLOATING AMBIENT WIDGET:</span>
            <p className="text-slate-300">
              On desktops or tablets, the floating widget opens a compact, distraction-free display of the orbital VFO, signal locks, and radar compass. Drag it to a corner of your screen to monitor passes during other daily work.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
