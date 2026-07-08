export interface Astronaut {
  id: string;
  name: string;
  agency: string;
  role: string;
  nationality: string;
  bio: string;
  voiceName: string;
  imageUrl: string;
  callsign: string;
}

export interface ISSLocation {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility?: string;
  timestamp: number;
  isSimulated: boolean;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface VoiceLog {
  id: string;
  sender: "user" | "astronaut";
  astronautName?: string;
  text: string;
  audioUrl?: string | null;
  timestamp: string;
  isTransmitting?: boolean;
  route?: {
    station: string;
    satellite: string;
  };
}

export interface AlertConfig {
  enabled: boolean;
  notifyOnApproach: boolean; // alert when groundDistance < 800 km
  triggerDistance: number;   // default 800 km
  permissionStatus: NotificationPermission | "prompt";
}
