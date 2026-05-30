/* ═══════════════════════════════════════════════════════
   NOVA FUMIGACIONES — map.js
   Leaflet · mapa dark con polígono y markers
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Esperar a que Leaflet cargue (script tiene defer)
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var el = document.getElementById('zona-map');
    if (!el) return;
    if (typeof L === 'undefined') {
      console.warn('[map] Leaflet no cargó. El mapa no se inicializará.');
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-family:Barlow Condensed,sans-serif;letter-spacing:1.5px;text-transform:uppercase;font-size:13px;">Mapa no disponible · Consultá las zonas debajo</div>';
      return;
    }

    // ───── Coordenadas de zonas ─────
    var ZONES = {
      laplata:    { name: 'La Plata Centro',  coords: [-34.9214, -57.9544] },
      citybell:   { name: 'City Bell',         coords: [-34.8702, -58.0463] },
      gonnet:     { name: 'Gonnet',            coords: [-34.8853, -58.0167] },
      mbgonnet:   { name: 'Manuel B. Gonnet',  coords: [-34.8853, -58.0167] },
      tolosa:     { name: 'Tolosa',            coords: [-34.9056, -57.9697] },
      loshornos:  { name: 'Los Hornos',        coords: [-34.9569, -57.9656] },
      villaelisa: { name: 'Villa Elisa',       coords: [-34.8500, -58.0833] },
      berisso:    { name: 'Berisso',           coords: [-34.8728, -57.8853] },
      ensenada:   { name: 'Ensenada',          coords: [-34.8550, -57.9100] },
      ringuelet:  { name: 'Ringuelet',         coords: [-34.9000, -57.9833] },
      sancarlos:  { name: 'San Carlos',        coords: [-34.9514, -58.0050] },
      hernandez:  { name: 'Hernández',         coords: [-34.8700, -58.0333] }
    };

    // ───── Init mapa ─────
    var map = L.map('zona-map', {
      center: [-34.910, -57.965],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true
    });

    // Permitir zoom con scroll al hacer click en el mapa
    map.on('focus',  function () { map.scrollWheelZoom.enable();  });
    map.on('blur',   function () { map.scrollWheelZoom.disable(); });
    map.on('click',  function () { map.scrollWheelZoom.enable();  });

    // ───── Tiles dark (CartoDB Dark Matter — gratis, sin API key) ─────
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    // ───── Polígono envolvente (área de cobertura) ─────
    var coveragePolygon = [
      [-34.8350, -58.1000],  // NO  (Villa Elisa area)
      [-34.8400, -57.9700],  // N
      [-34.8500, -57.8700],  // NE  (Berisso area)
      [-34.8900, -57.8650],  // E
      [-34.9450, -57.9000],  // SE
      [-34.9750, -57.9650],  // S   (Los Hornos area)
      [-34.9700, -58.0400],  // SO
      [-34.9100, -58.0900],  // O
      [-34.8500, -58.1100]   // NO
    ];

    L.polygon(coveragePolygon, {
      color: '#D42B2B',
      weight: 2,
      opacity: 0.85,
      fillColor: '#D42B2B',
      fillOpacity: 0.10,
      dashArray: '6 4',
      interactive: false
    }).addTo(map);

    // ───── Markers de zonas ─────
    var markers = {};
    Object.keys(ZONES).forEach(function (key) {
      var z = ZONES[key];
      var icon = L.divIcon({
        className: 'nova-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      var m = L.marker(z.coords, { icon: icon, title: z.name }).addTo(map);
      m.bindPopup('<strong>' + z.name + '</strong>', {
        closeButton: false,
        offset: [0, -4]
      });
      m.on('mouseover', function () { m.openPopup(); });
      m.on('mouseout',  function () { m.closePopup(); });
      markers[key] = m;
    });

    // ───── Bounds ajustados ─────
    map.fitBounds([
      [-34.840, -58.100],
      [-34.970, -57.880]
    ], { padding: [20, 20] });

    // ───── Chips clickeables ─────
    var chips = document.querySelectorAll('#zona-chips button[data-zone]');
    chips.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-zone');
        var z = ZONES[key];
        if (!z) return;

        chips.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        map.flyTo(z.coords, 13, { duration: 0.9 });

        var m = markers[key];
        if (m) setTimeout(function () { m.openPopup(); }, 700);
      });
    });

    el.classList.add('loaded');
  });
})();
