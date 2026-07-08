const CACHE_NAME = 'iss-tracker-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.png',
  '/icon.jpg'
];

// Install Service Worker and cache essential static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-cache warning (some assets can be cached lazily):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercept requests and serve from cache if offline
self.addEventListener('fetch', (event) => {
  // Let non-GET or API endpoints pass through natively
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for document navigation if fully offline
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});

/* ==========================================
   PWA HOMESCREEN WIDGET ENGINE (W3C standard)
   ========================================== */

self.addEventListener('widgetinstall', (event) => {
  console.log('ISS Widget Installed:', event.widget);
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetclick', (event) => {
  console.log('ISS Widget Clicked:', event.action);
  if (event.action === 'refresh') {
    event.waitUntil(updateWidget(event.widget));
  } else {
    // Open the primary tracking app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

self.addEventListener('widgetuninstall', (event) => {
  console.log('ISS Widget Uninstalled:', event.widget);
});

// Update standard widget Adaptive Card JSON definition
async function updateWidget(widget) {
  try {
    const response = await fetch('/api/iss/now');
    const data = await response.json();
    
    // Default or fallback user position (e.g. Houston, US)
    let userLat = 29.56;
    let userLon = -95.09;

    // Use self.widgets.updateByTag or widget.update if supported
    if (self.widgets && typeof self.widgets.updateByTag === 'function') {
      await self.widgets.updateByTag('iss_live_tracker', {
        template: JSON.stringify(getWidgetTemplate()),
        data: JSON.stringify(getWidgetData(data, userLat, userLon))
      });
    }
  } catch (err) {
    console.error('Failed to update PWA widget:', err);
  }
}

// Widget Adaptive Card Template definition
function getWidgetTemplate() {
  return {
    "type": "AdaptiveCard",
    "body": [
      {
        "type": "TextBlock",
        "size": "Medium",
        "weight": "Bolder",
        "text": "${title}"
      },
      {
        "type": "TextBlock",
        "text": "${issStatus}",
        "wrap": true
      },
      {
        "type": "FactSet",
        "facts": [
          { "title": "Altitude:", "value": "${altitude} km" },
          { "title": "Velocity:", "value": "${velocity} km/h" },
          { "title": "Coordinates:", "value": "Lat ${lat}, Lon ${lon}" }
        ]
      }
    ],
    "actions": [
      {
        "type": "Action.Execute",
        "title": "Refresh Telemetry",
        "verb": "refresh"
      }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "version": "1.5"
  };
}

function getWidgetData(iss, userLat, userLon) {
  if (!iss) {
    return {
      title: "ISS Tracking Offline",
      issStatus: "Unable to retrieve satellite data.",
      altitude: "---",
      velocity: "---",
      lat: "---",
      lon: "---"
    };
  }

  return {
    title: "ISS Command Bridge",
    issStatus: `Telemetry Live // Status: ${iss.isSimulated ? 'PROPAGATOR' : 'NOMINAL'}`,
    altitude: iss.altitude ? Math.round(iss.altitude).toString() : "415",
    velocity: iss.velocity ? Math.round(iss.velocity).toString() : "27560",
    lat: iss.latitude ? iss.latitude.toFixed(2) : "---",
    lon: iss.longitude ? iss.longitude.toFixed(2) : "---"
  };
}

/* ==================================================
   PERIODIC BACKGROUND SYNC & OVERHEAD NOTIFICATIONS
   ================================================== */

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'iss-overhead-sync') {
    event.waitUntil(checkOverheadBackground());
  }
});

// Periodic background updater that can wake up to trigger custom alerts even when tab is closed!
async function checkOverheadBackground() {
  try {
    const res = await fetch('/api/iss/now');
    if (!res.ok) return;
    const iss = await res.json();
    
    // Check if the ISS is close to Houston/Ground observer's coordinates
    // We can show a notification if the distance is under 800km!
    const userLat = 29.56; 
    const userLon = -95.09;
    
    // Simple distance calculation in service worker
    const R = 6371; // km
    const dLat = ((iss.latitude - userLat) * Math.PI) / 180;
    const dLon = ((iss.longitude - userLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLat * Math.PI) / 180) *
        Math.cos((iss.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    if (dist < 800) {
      self.registration.showNotification('ISS PASSING OVERHEAD (BG)', {
        body: `The Space Station is currently flying above your region (${Math.round(dist)}km away). Link active!`,
        icon: '/icon-192.png',
        tag: 'iss-overhead-alert',
        renotify: true
      });
    }
  } catch (err) {
    console.warn('Background telemetry sync check skipped:', err);
  }
}
