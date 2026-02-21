// ============================================
// Nearby Players Page — Full-screen Leaflet map
// ============================================

const NearbyPage = (() => {
  let nearbyMap = null;
  let markersLayer = null;
  let mapInitialized = false;

  function init() {
    document.getElementById('link-back-from-nearby').addEventListener('click', (e) => {
      e.preventDefault();
      UI.showView('landing');
    });
  }

  async function show() {
    UI.showView('nearby');

    // Initialize map once
    if (!mapInitialized) {
      initMap();
      mapInitialized = true;
    }

    // Invalidate size after view becomes visible
    setTimeout(() => { if (nearbyMap) nearbyMap.invalidateSize(); }, 100);

    // Load players
    await loadPlayers();
  }

  function initMap() {
    nearbyMap = L.map('nearby-map', {
      zoomControl: true,
      attributionControl: false,
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(nearbyMap);

    markersLayer = L.layerGroup().addTo(nearbyMap);
  }

  async function loadPlayers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();

    try {
      const res = await Api.get('/location/players');
      const players = res.players || [];

      if (players.length === 0) {
        UI.showToast('No players have set their location yet');
        return;
      }

      const bounds = [];

      players.forEach(player => {
        if (!player.location) return;
        const { lat, lon, name } = player.location;
        const isMe = player.username === getCurrentUsername();

        // Create a colored circle marker
        const color = isMe ? '#7c3aed' : '#06d6a0';
        const marker = L.circleMarker([lat, lon], {
          radius: isMe ? 10 : 7,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(markersLayer);

        // Build popup content
        const initial = player.username ? player.username[0].toUpperCase() : '?';
        let avatarHtml;
        if (player.avatar) {
          avatarHtml = `<img src="${UI.escapeHtml(player.avatar)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ${color};">`;
        } else {
          avatarHtml = `<div style="width:36px;height:36px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;border:2px solid #fff;">${initial}</div>`;
        }

        marker.bindPopup(`
          <div style="display:flex;align-items:center;gap:10px;font-family:Outfit,sans-serif;">
            ${avatarHtml}
            <div>
              <div style="font-weight:700;font-size:0.95rem;">${UI.escapeHtml(player.username)}${isMe ? ' <span style="color:#7c3aed;">(You)</span>' : ''}</div>
              <div style="font-size:0.78rem;color:#666;margin-top:2px;">${UI.escapeHtml(name)}</div>
            </div>
          </div>
        `);

        bounds.push([lat, lon]);
      });

      // Fit map to bounds if we have markers
      if (bounds.length > 0) {
        if (bounds.length === 1) {
          nearbyMap.setView(bounds[0], 10, { animate: true });
        } else {
          nearbyMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: true });
        }
      }
    } catch (err) {
      UI.showToast('Failed to load nearby players');
      console.error('Nearby players error:', err);
    }
  }

  function getCurrentUsername() {
    // Read from the landing display name (set by App)
    const el = document.getElementById('user-display-name');
    return el ? el.textContent : '';
  }

  return { init, show };
})();
