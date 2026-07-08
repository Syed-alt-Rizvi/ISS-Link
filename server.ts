import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Ensure workspace relative paths are clean
const isProduction = process.env.NODE_ENV === "production";
const PORT = 3000;

// Shared Astronaut Crew Data
const ASTRONAUTS = [
  {
    id: "hague",
    name: "Commander Nick Hague",
    agency: "NASA",
    role: "Expedition 72 Commander",
    nationality: "American",
    bio: "Colonel in the US Space Force and veteran astronaut. Enjoys flight tests, space walking, and is known for his calm, structured demeanor.",
    voiceName: "Zephyr",
    imageUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=200&h=200", // Representative high-quality portrait
    callsign: "STATION-LEADER"
  },
  {
    id: "williams",
    name: "Flight Engineer Suni Williams",
    agency: "NASA",
    role: "Expedition 72 Flight Engineer / Pilot",
    nationality: "American",
    bio: "Retired Navy Captain and legendary space walker. Has logged over 320 days in space. Passionate, energetic, and highly supportive of ground communications.",
    voiceName: "Kore",
    imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200",
    callsign: "STATION-PILOT"
  },
  {
    id: "pettit",
    name: "Flight Engineer Donald Pettit",
    agency: "NASA",
    role: "Science Officer",
    nationality: "American",
    bio: "Chemical engineer and photography wizard. Famous for his 'Science of Opportunity' demonstrations on board and taking stunning night-time long exposure space photos.",
    voiceName: "Charon",
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200&h=200",
    callsign: "SCIENCE-EYE"
  },
  {
    id: "wilmore",
    name: "Flight Engineer Butch Wilmore",
    agency: "NASA",
    role: "Safety & Systems Officer",
    nationality: "American",
    bio: "US Navy Captain and flight instructor. Enthusiastic and professional, Butch focuses on station maintenance, EVA tasks, and payload execution.",
    voiceName: "Puck",
    imageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200",
    callsign: "SYSTEMS-CHIEF"
  },
  {
    id: "gorbunov",
    name: "Flight Engineer Aleksandr Gorbunov",
    agency: "Roscosmos",
    role: "Flight Engineer",
    nationality: "Russian",
    bio: "Graduated from Moscow Aviation Institute. Expert in space vehicle guidance and propulsion systems. Known for his concise, highly precise updates.",
    voiceName: "Fenrir",
    imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=200&h=200",
    callsign: "SOYUZ-ENGINEER"
  }
];

// Semi-realistic orbital propagator for the ISS (Orbital period ~92.9 min, Inclination 51.64 deg)
function getSimulatedISSPosition(timeMs: number) {
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

  return {
    latitude: parseFloat(lat.toFixed(5)),
    longitude: parseFloat(lon.toFixed(5)),
    altitude: parseFloat((415 + Math.sin(angle * 2) * 8).toFixed(2)),
    velocity: parseFloat((27560 + Math.cos(angle * 2) * 35).toFixed(2)),
    timestamp: Math.floor(timeMs / 1000),
    isSimulated: true
  };
}

// Lazy loaded Gemini client
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API endpoint: Get crew data
  app.get("/api/astronauts", (req, res) => {
    res.json(ASTRONAUTS);
  });

  // API endpoint: Get ISS location (attempting public API with orbital model fallback)
  app.get("/api/iss/now", async (req, res) => {
    try {
      const response = await fetch("https://api.wheretheiss.at/v1/satellites/25544", {
        signal: AbortSignal.timeout(3000) // 3-second timeout
      });
      if (response.ok) {
        const data = await response.json();
        res.json({
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          altitude: parseFloat(data.altitude),
          velocity: parseFloat(data.velocity),
          visibility: data.visibility,
          timestamp: data.timestamp,
          isSimulated: false
        });
      } else {
        throw new Error("API responded with error");
      }
    } catch (error) {
      // Fall back seamlessly to our semi-realistic orbital propagator
      const simulatedData = getSimulatedISSPosition(Date.now());
      res.json(simulatedData);
    }
  });

  // Helper to generate a contextual, highly realistic space radio reply offline if Gemini is unavailable
  function generateOfflineAstronautReply(
    astronaut: any,
    userMessage: string,
    userLocation: any,
    issLocation: any,
    groundDistance: number | null
  ): string {
    const cleanMsg = userMessage.toLowerCase();
    const isOverhead = groundDistance && groundDistance < 800;
    
    if (astronaut.id === "pettit") {
      if (cleanMsg.includes("photo") || cleanMsg.includes("camera") || cleanMsg.includes("picture") || cleanMsg.includes("night") || cleanMsg.includes("view")) {
        return `Ground, this is ISS, SCIENCE-EYE. Copy that. I actually have our Nikon set up in the Cupola right now for a nighttime time-lapse. Your region is looking beautifully dark from up here, perfect for a long exposure. Hope you catch a glimpse of our solar arrays reflecting. Over.`;
      }
      if (cleanMsg.includes("experiment") || cleanMsg.includes("science") || cleanMsg.includes("research") || cleanMsg.includes("work")) {
        return `Ground, ISS Science Officer Pettit here. Fascinating query! We are currently running microgravity fluid physics assays. Watching water form perfect spheres never gets old. Microgravity continues to challenge all textbook assumptions. Copy, standing by for next pass. Over.`;
      }
      if (isOverhead) {
        return `Ground station, this is ISS. Science Officer Donald Pettit here. We are sailing directly overhead right now. Just peered through the Cupola and snapped a high-beta angle shot of your coastline. The detail is stunning. Science of opportunity is active. Over!`;
      }
      return `Copy, Ground. This is Donald Pettit on board ISS. Standing by in the US Laboratory. Your signal is crisp and clear, we appreciate the interest from down there. Signal lock is steady, and science runs are nominal. Over.`;
    }
    
    if (astronaut.id === "williams") {
      if (cleanMsg.includes("spacewalk") || cleanMsg.includes("eva") || cleanMsg.includes("outside") || cleanMsg.includes("suit")) {
        return `Ground, this is STATION-PILOT. Oh, spacewalks are the ultimate experience! Feeling the raw vacuum of space right on your visor is indescribable. Suni here, we are preparing for a maintenance EVA next week. Thanks for asking, it keeps us motivated! Over.`;
      }
      if (cleanMsg.includes("hello") || cleanMsg.includes("hi") || cleanMsg.includes("greet")) {
        return `Ground, ISS, STATION-PILOT. Hello down there! Suni Williams here. Wonderful to hear your voice on this frequency. We're having a spectacular day in orbit. How are things on Earth today? Over.`;
      }
      if (isOverhead) {
        return `Ground, Suni on the ISS! We are flying right above you! Signal strength is absolutely maximum five-by-five. Just looked out the port side window—your skies look clear. Sending a big wave from 415 kilometers up! Over!`;
      }
      return `Roger, Ground station! Suni Williams here, flight engineer. Copied your transmission loud and clear. We're keeping busy with payload cycles today, but always thrilled to establish a connection with you. Fly safe down there. Over.`;
    }

    if (astronaut.id === "hague") {
      if (cleanMsg.includes("military") || cleanMsg.includes("space force") || cleanMsg.includes("colonel") || cleanMsg.includes("test")) {
        return `Ground station, ISS, Commander Hague here. Appreciate the shoutout to the Space Force. Running flight test procedures in the Destiny module today. Precision is key up here. Your telemetry is locked on our systems. Over.`;
      }
      if (isOverhead) {
        return `Ground, this is ISS, STATION-LEADER. Commander Nick Hague copy. Signal telemetry confirms we are at zenith, direct line-of-sight. The command deck reports nominal status. Glad to have this solid voice uplink established. Over.`;
      }
      return `Ground, this is ISS, Commander Nick Hague. Copy your transmission. We are currently crossing the terminal terminator line into orbital night. Station systems are performing exceptionally well. Thank you for the contact. Over.`;
    }

    if (astronaut.id === "wilmore") {
      if (cleanMsg.includes("safe") || cleanMsg.includes("emergency") || cleanMsg.includes("maintenance")) {
        return `Ground, Systems-Chief Wilmore here. Copy your safety query. All pressure hulls, environmental control systems, and water recovery systems are running in green status. We keep safety first up here. Over.`;
      }
      if (isOverhead) {
        return `Ground, Butch Wilmore on the ISS. We are directly overhead your location right now. Visual is locked on the ground station sector. Signal strength is great, squelch is quiet. Over.`;
      }
      return `Roger, Ground. Systems-Chief Wilmore copy. We're working on equipment racks in the Columbus module today. Always glad to take a moment and confirm contact on this VHF link. God bless, and over.`;
    }

    if (astronaut.id === "gorbunov") {
      if (cleanMsg.includes("soyuz") || cleanMsg.includes("propulsion") || cleanMsg.includes("russian") || cleanMsg.includes("thrust")) {
        return `Ground, Soyuz-Engineer Gorbunov here. Russian segment thrusters and guidance computers are fully nominal. We completed an orbital adjustment burns yesterday. Propulsion fuel reserves at ninety-two percent. Over.`;
      }
      if (isOverhead) {
        return `Ground, this is ISS. Flight Engineer Aleksandr Gorbunov copy. We are over your geographic coordinates now. Orbital parameters are stable. Signal is strong. Over.`;
      }
      return `Copy, Ground. Flight Engineer Gorbunov here. Telemetry is received. Russian Segment systems operating according to standard flight schedule. Thank you for communication. Over.`;
    }

    const passText = isOverhead 
      ? `We are directly above your coordinates right now at ${Math.round(groundDistance || 415)} kilometers.`
      : `We are currently in orbit over coordinates lat ${issLocation?.latitude || '0'}, lon ${issLocation?.longitude || '0'}.`;

    return `Ground station, this is ISS, ${astronaut.callsign}. Copied your transmission: "${userMessage.substring(0, 30)}...". ${passText} Station operations are nominal. Standing by for your next uplink, over.`;
  }

  // Helper with retries to generate dialogue with multiple models
  async function generateDialogueText(ai: any, prompt: string): Promise<string> {
    const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[Gemini API] Attempting dialogue generation with model: ${model}`);
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            temperature: 0.85,
          }
        });
        if (response && response.text) {
          console.log(`[Gemini API] Successfully generated dialogue using: ${model}`);
          return response.text;
        }
      } catch (err: any) {
        console.warn(`[Gemini API] Model ${model} failed:`, err.message || err);
        lastError = err;
      }
    }
    throw lastError || new Error("All generative dialogue models failed");
  }

  // API endpoint: Contact Astronaut Voice Link (AI response text + TTS speech audio)
  app.post("/api/voice/contact", async (req, res) => {
    const { astronautId, message, userLocation, issLocation, groundDistance } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "API_KEY_MISSING",
        message: "Gemini API key is missing. Please configure your GEMINI_API_KEY in the Secrets panel."
      });
    }

    const astronaut = ASTRONAUTS.find(a => a.id === astronautId);
    if (!astronaut) {
      return res.status(404).json({ error: "ASTRONAUT_NOT_FOUND", message: "Selected astronaut not found." });
    }

    try {
      const ai = getGeminiClient();

      // Build context information
      const locationContext = userLocation && userLocation.latitude
        ? `Ground station coordinates: lat ${userLocation.latitude}, lon ${userLocation.longitude}.`
        : "Ground station coordinates unknown.";

      const issContext = issLocation
        ? `ISS current location: lat ${issLocation.latitude}, lon ${issLocation.longitude} (altitude ${issLocation.altitude} km, velocity ${issLocation.velocity} km/h).`
        : "ISS position details unconfirmed.";

      const distanceContext = groundDistance
        ? `Ground distance to observer: ${Math.round(groundDistance)} km.`
        : "";

      const overheadStatus = groundDistance && groundDistance < 800
        ? "ALERT: The ISS is currently overhead or near-overhead of the ground observer's position!"
        : "The ISS is currently out of direct optical line-of-sight of the ground observer.";

      // Step 1: Generate dialogue from the astronaut
      const dialoguePrompt = `
        You are simulating an authentic radio response from ${astronaut.name} (Callsign: ${astronaut.callsign}, Agency: ${astronaut.agency}), who is currently on board the International Space Station.
        
        Contextual Telemetry:
        - ${locationContext}
        - ${issContext}
        - ${distanceContext}
        - ${overheadStatus}
        
        Ground Message received from observer: "${message}"
        
        Instructions:
        1. Write a realistic space-ground radio response from ${astronaut.name}.
        2. Keep it under 65 words. It must be highly concise, professional, and friendly.
        3. Start the transmission with proper callsigns/radio protocol, e.g. "Ground, this is ISS, ${astronaut.callsign}..." or similar. Use "Copy", "Roger", "Over" naturally.
        4. Integrate the telemetry context naturally in a human way (e.g., if overhead, say 'We can see you guys below!' or if far away, mention the territory they are flying over).
        5. DO NOT use any markdown characters like asterisks (** or *) or bullet points. The text will be read directly by an audio TTS engine, so it must be plain, readable prose. No special symbols.
      `;

      let astronautReplyText = "";
      try {
        astronautReplyText = await generateDialogueText(ai, dialoguePrompt);
      } catch (dialogueErr: any) {
        console.warn("[Gemini API] Dialogue generation failed. Falling back to offline contextual script engine:", dialogueErr.message || dialogueErr);
        astronautReplyText = generateOfflineAstronautReply(
          astronaut,
          message,
          userLocation,
          issLocation,
          groundDistance
        );
      }

      // Step 2: Convert dialogue into speech audio using Gemini TTS
      let base64Audio = null;
      try {
        console.log(`[Gemini API] Attempting TTS generation for voice: ${astronaut.voiceName}`);
        const ttsResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: astronautReplyText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: astronaut.voiceName },
              },
            },
          },
        });
        base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
      } catch (ttsErr: any) {
        console.warn("[Gemini API] TTS generation failed. Falling back to browser-side voice synthesis:", ttsErr.message || ttsErr);
        // Retaining base64Audio as null tells the frontend to perform native client-side SpeechSynthesis
      }

      res.json({
        replyText: astronautReplyText,
        audioBase64: base64Audio,
        astronaut: astronaut.name,
        callsign: astronaut.callsign,
        timestamp: Math.floor(Date.now() / 1000)
      });

    } catch (error: any) {
      console.error("[Gemini API] Root error in Voice Link endpoint:", error);
      res.status(500).json({
        error: "COMMUNICATION_ERROR",
        message: "Failed to establish a secure voice link to the ISS. Error: " + (error.message || error)
      });
    }
  });

  // Serve static UI assets
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ISS Tracker Server listening on http://localhost:${PORT}`);
  });
}

startServer();
