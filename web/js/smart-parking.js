"use strict";
/* ESPOCH Pulse Smart Parking — demostración académica.
 * Geometrías OSM; ocupación y capacidades simuladas con telemetría IoT.
 * Cálculo: red peatonal OSM disponible, Dijkstra sobre nodos.
 */
const $ = (id) => document.getElementById(id);
const ROOT = "../data/";
let map, mapLayer, destMarker, routeLayer, parkLayer, vehicleRouteLayer, driverMarker, dataRows = [], initialRows = [];
let roadGraph = new Map(), roadNodes = [], largeComponent = new Set(), buildings = [], routeCache = {};
let autoTimer = null, isAutoRunning = false;
let historicalData = null, predHour = "07:00", predDay = "laborable", predApplyMap = false;

// Estado y sincronización con Base de Datos SQLite
let isDbConnected = false;
let dbSyncDebounceTimer = null;

function updateDbStatusUI(connected, engine = "SQLite") {
  isDbConnected = connected;
  const badge = $("db-badge");
  const badgeText = $("db-badge-text");
  if (!badge || !badgeText) return;
  if (connected) {
    badge.classList.remove("offline");
    badgeText.textContent = `DB: ${engine}`;
    badge.title = `Conectado a la base de datos ${engine} (data/espoch_pulse.db). Sincronización en tiempo real activa.`;
  } else {
    badge.classList.add("offline");
    badgeText.textContent = "DB: Local (JSON)";
    badge.title = "Servidor SQLite no detectado; utilizando archivos JSON locales como respaldo.";
  }
}

function syncSlotOccupancyToDb(slotId, freeCount, eventType = "simulacion") {
  if (!isDbConnected) return;
  clearTimeout(dbSyncDebounceTimer);
  dbSyncDebounceTimer = setTimeout(() => {
    fetch("/api/parking/occupancy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, libres: freeCount, evento: eventType })
    }).catch(() => {});
  }, 150);
}

// Estado del sistema de alertas automáticas
let previousSlotState = new Map();
let parkingLayersMap = new Map();
let alertHistory = [];
let isSoundEnabled = true;
let audioCtx = null;
let unreadAlertCount = 0;

// Estado del Panel Administrativo
let isAdminModalOpen = false;
let adminSelectedJornada = "laborable";
let sessionStats = {
  entries: 0,
  exits: 0,
  perSlotTurnover: {}
};

// Perfil del conductor y restricciones de acceso
let currentDriverProfile = "todos";

const PROFILE_INFO = {
  todos: {
    id: "todos",
    name: "Vista General",
    icon: "👥",
    desc: "Mostrando todos los parqueaderos del campus sin filtro de acreditación institucional."
  },
  estudiante: {
    id: "estudiante",
    name: "Estudiante",
    icon: "🎓",
    desc: "Acceso autorizado a Estacionamiento Sistemas (P-OESTE), Ciencias Básicas I (P-AULAS) y Diseño (P-DISENO). Sectores FIE1 y Software están reservados para docentes y administrativos."
  },
  docente: {
    id: "docente",
    name: "Docente",
    icon: "👨‍🏫",
    desc: "Acceso preferencial en todos los sectores del campus FIE (FIE1, Sistemas, Ciencias Básicas I, Diseño y Software)."
  },
  administrativo: {
    id: "administrativo",
    name: "Personal Administrativo",
    icon: "💼",
    desc: "Acceso asignado a Estacionamiento FIE1, Software, Diseño y FIE2."
  },
  discapacidad: {
    id: "discapacidad",
    name: "Persona con Discapacidad (PCD)",
    icon: "♿",
    desc: "Acceso preferencial garantizado a plazas reservadas PCD en todos los sectores, con prioridad de ruta cercana a rampas y accesos accesibles."
  }
};

function isProfileAllowed(slot, profile = currentDriverProfile) {
  if (profile === "todos") return true;
  const allowed = slot.perfiles_permitidos || ["estudiante", "docente", "administrativo", "discapacidad"];
  return allowed.includes(profile);
}

// Ubicación por defecto del conductor (Puerta Canónigo Ramos / Este) [lng, lat]
let driverLocation = [-78.6741285, -1.6539158];

const DRIVER_ENTRANCES = {
  puerta_posterior: {
    id: "puerta_posterior",
    name: "Puerta Av. Canónigo Ramos (Acceso Este FIE)",
    coord: [-78.6741285, -1.6539158]
  },
  acceso_norte: {
    id: "acceso_norte",
    name: "Vía Principal / Entrada Norte (Panamericana)",
    coord: [-78.6824435, -1.6517478]
  },
  acceso_central: {
    id: "acceso_central",
    name: "Longitudinal 2 (Acceso Central Politécnica)",
    coord: [-78.6794589, -1.6544622]
  },
  acceso_sur: {
    id: "acceso_sur",
    name: "Transversal 1 (Acceso Sur / Shyris)",
    coord: [-78.6774255, -1.6607843]
  },
  acceso_vinculacion: {
    id: "acceso_vinculacion",
    name: "Entrada a Vinculación (Suroeste)",
    coord: [-78.678493, -1.6577078]
  }
};

const BUILDINGS_CONFIG = [
  { id: "telecomunicaciones", name: "Edificio Carrera de Telecomunicaciones", osm_id: 498940529 },
  { id: "software", name: "Edificio Software", osm_id: 329896275 },
  { id: "electronica", name: "Edificio Carrera de Electrónica y Automatización", osm_id: 1336635293 },
  { id: "diseno_grafico", name: "Edificio Diseño Gráfico", osm_id: 330738061 },
  { id: "talleres_diseno", name: "Edificio de Laboratorios y Talleres | Diseño Gráfico", osm_id: 1336635294 },
  { id: "ciencias_basicas_1", name: "Edificio Ciencias Básicas I", osm_id: 1336635291 },
  { id: "principal_fie", name: "Edificio Principal FIE", osm_id: 1487253986 },
  { id: "ciencias_basicas_2", name: "Edificio Ciencias Básicas II", osm_id: 1336635288 }
];

const htmlEscape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

function normStr(s) {
  return String(s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function meters(a, b) {
  const d = Math.PI / 180, R = 6371000;
  const x = (b[1] - a[1]) * d, y = (b[0] - a[0]) * d;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a[1] * d) * Math.cos(b[1] * d) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function idNode(c) {
  return c[0].toFixed(7) + ',' + c[1].toFixed(7);
}

function linkNode(a, b) {
  let k = idNode(a), l = idNode(b), d = meters(a, b);
  if (!roadGraph.has(k)) roadGraph.set(k, { coord: a, edges: [] });
  if (!roadGraph.has(l)) roadGraph.set(l, { coord: b, edges: [] });
  roadGraph.get(k).edges.push({ to: l, cost: d });
  roadGraph.get(l).edges.push({ to: k, cost: d });
}

function buildGraph(ways) {
  roadGraph = new Map();
  for (const f of ways.features) {
    if (!f.geometry || f.geometry.type !== "LineString") continue;
    if (f.properties?.foot === 'no' || f.properties?.access === 'no') continue;
    const p = f.geometry.coordinates;
    for (let i = 0; i < p.length - 1; i++) linkNode(p[i], p[i + 1]);
  }
  const seen = new Set();
  let large = [];
  for (const k of roadGraph.keys()) {
    if (seen.has(k)) continue;
    let stack = [k], component = [];
    seen.add(k);
    while (stack.length) {
      let n = stack.pop();
      component.push(n);
      for (const e of roadGraph.get(n).edges) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          stack.push(e.to);
        }
      }
    }
    if (component.length > large.length) large = component;
  }
  largeComponent = new Set(large);
  roadNodes = large.map(k => [k, roadGraph.get(k).coord]);
}

function nearest(c) {
  let best = null;
  for (const [k, p] of roadNodes) {
    const dist = meters(c, p);
    if (!best || dist < best.dist) best = { key: k, dist };
  }
  return best;
}

function dijkstra(from) {
  const dist = new Map([[from, 0]]), prev = new Map(), visited = new Set();
  const frontier = [[0, from]];
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [d, k] = frontier.shift();
    if (visited.has(k)) continue;
    visited.add(k);
    for (const e of roadGraph.get(k).edges) {
      if (!largeComponent.has(e.to)) continue;
      const nd = d + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, k);
        frontier.push([nd, e.to]);
      }
    }
  }
  return { dist, prev };
}

function center(feature) {
  const g = feature.geometry;
  if (g.type === 'Point') return g.coordinates;
  let ring = g.coordinates?.[0];
  if (g.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
  if (!ring?.length) return null;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    let a = ring[i], b = ring[i + 1], f = a[0] * b[1] - b[0] * a[1];
    area += f;
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
  }
  if (Math.abs(area) > 1e-12) return [cx / (3 * area), cy / (3 * area)];
  return ring[Math.floor(ring.length / 2)];
}

function pathTo(dijkstraResult, from, to) {
  const r = [from], seen = new Set([from]);
  while (r.at(-1) !== to) {
    const n = dijkstraResult.prev.get(r.at(-1));
    if (!n || seen.has(n)) return null;
    seen.add(n);
    r.push(n);
  }
  return r.map(k => roadGraph.get(k).coord);
}

/* ── SEMÁFORO DE DISPONIBILIDAD ──
 * Verde: Disponible (> 25% de plazas libres y > 2)
 * Amarillo: Casi lleno (<= 25% de plazas libres o <= 2 plazas)
 * Rojo: Lleno (0 plazas libres)
 */
function getAvailabilityStatus(free, capacidad) {
  if (free === 0) {
    return {
      level: 'rojo',
      label: 'Lleno',
      color: '#ef4444',
      strokeColor: '#b91c1c',
      fillOpacity: 0.55,
      icon: '🔴'
    };
  }
  const ratio = free / capacidad;
  if (ratio <= 0.25 || free <= 2) {
    return {
      level: 'amarillo',
      label: 'Casi lleno',
      color: '#f59e0b',
      strokeColor: '#b45309',
      fillOpacity: 0.50,
      icon: '🟡'
    };
  }
  return {
    level: 'verde',
    label: 'Disponible',
    color: '#10b981',
    strokeColor: '#047857',
    fillOpacity: 0.45,
    icon: '🟢'
  };
}

function statusColor(r) {
  return getAvailabilityStatus(r.free, r.capacidad).color;
}

function chosenDestination() {
  const el = $("destino");
  if (!el || !buildings.length) return buildings[0];
  const raw = el.value;
  const val = normStr(raw);
  return buildings.find(b => b.id === raw) ||
    buildings.find(b => normStr(b.name) === val) ||
    buildings.find(b => normStr(b.id) === val) ||
    buildings[0];
}

/* --- LOG TELEMETRÍA IoT --- */
function logTelemetry(message, type = 'system') {
  const feed = $("iot-telemetry-feed");
  if (!feed) return;
  const now = new Date();
  const ts = now.toTimeString().split(' ')[0];
  const line = document.createElement('div');
  line.className = `iot-log-line ${type}`;
  line.innerHTML = `<span class="ts">[${ts}]</span> ${htmlEscape(message)}`;
  feed.appendChild(line);
  while (feed.children.length > 35) {
    feed.removeChild(feed.firstChild);
  }
  feed.scrollTop = feed.scrollHeight;
}

function syncSlotUI(r) {
  const status = getAvailabilityStatus(r.free, r.capacidad);
  const numEl = $("num-" + r.id);
  if (numEl) numEl.innerHTML = `<strong>${r.free}</strong> / ${r.capacidad} libres`;
  const slider = $("slider-" + r.id);
  if (slider && Number(slider.value) !== r.free) slider.value = r.free;
  const dot = $("dot-" + r.id);
  if (dot) {
    dot.className = `sensor-dot ${status.level}`;
    dot.title = `Estado: ${status.label}`;
  }
  const pill = $("pill-" + r.id);
  if (pill) {
    pill.className = `semaforo-pill ${status.level}`;
    pill.innerHTML = `<span class="semaforo-indicator-dot"></span>${status.label}`;
  }
  const btnIn = $("btn-in-" + r.id);
  if (btnIn) btnIn.disabled = (r.free <= 0);
  const btnOut = $("btn-out-" + r.id);
  if (btnOut) btnOut.disabled = (r.free >= r.capacidad);
}

/* ── MOTOR DE ALERTAS AUTOMÁTICAS (LLENO / DISPONIBILIDAD RECUPERADA) ── */
function playAlertSound(type) {
  if (!isSoundEnabled) return;
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    if (!audioCtx) audioCtx = new AudioCtxClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'full') {
      // Tono de alerta de saturación
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.28);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'available') {
      // Tono armonioso de disponibilidad recuperada
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Advertencia casi lleno
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (_) { }
}

function removeToast(toastEl, immediate = false) {
  if (!toastEl || !toastEl.parentNode) return;
  if (immediate) {
    if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    return;
  }
  toastEl.style.transform = 'translateX(50px)';
  toastEl.style.opacity = '0';
  setTimeout(() => {
    if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
  }, 260);
}

function showToastNotification(alertItem) {
  const container = $("alert-toast-container");
  if (!container) return;

  // Remover de forma síncrona y segura los toasts excedentes para evitar bucles infinitos
  while (container.children.length >= 3) {
    const oldest = container.firstChild;
    if (oldest && oldest.parentNode) {
      oldest.parentNode.removeChild(oldest);
    } else {
      break;
    }
  }

  const toast = document.createElement('div');
  toast.className = `alert-toast ${alertItem.type || 'warning'}`;
  toast.id = alertItem.id || ('toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));

  const typeLabels = {
    full: 'Saturado (Lleno)',
    available: 'Disponible',
    warning: 'Casi lleno'
  };

  toast.innerHTML = `
    <div class="toast-top-row">
      <div class="toast-badge-group">
        <span class="toast-type-pill">${typeLabels[alertItem.type] || 'Alerta'}</span>
        <span class="toast-time">${alertItem.timestamp}</span>
      </div>
      <button type="button" class="btn-toast-close" title="Cerrar notificación" aria-label="Cerrar">✕</button>
    </div>
    <div class="toast-body">
      <div class="toast-icon">${alertItem.icon}</div>
      <div class="toast-text-group">
        <div class="toast-title">${htmlEscape(alertItem.title)}</div>
        <div class="toast-message">${htmlEscape(alertItem.message)}</div>
      </div>
    </div>
    <div class="toast-footer">
      <button type="button" class="btn-toast-map">📍 Enfocar en mapa</button>
    </div>
    <div class="toast-progress-bar"></div>
  `;

  toast.querySelector('.btn-toast-close').addEventListener('click', () => {
    removeToast(toast);
  });

  toast.querySelector('.btn-toast-map').addEventListener('click', () => {
    focusParkingOnMap(alertItem.slotId);
  });

  let timeoutId = null;
  let remainingTime = 6500;
  let startTime = Date.now();

  function startDismissTimer() {
    startTime = Date.now();
    timeoutId = setTimeout(() => {
      removeToast(toast);
    }, remainingTime);
  }

  toast.addEventListener('mouseenter', () => {
    clearTimeout(timeoutId);
    remainingTime -= (Date.now() - startTime);
    const pbar = toast.querySelector('.toast-progress-bar');
    if (pbar) pbar.style.animationPlayState = 'paused';
  });

  toast.addEventListener('mouseleave', () => {
    if (remainingTime > 500) {
      const pbar = toast.querySelector('.toast-progress-bar');
      if (pbar) pbar.style.animationPlayState = 'running';
      startDismissTimer();
    } else {
      removeToast(toast);
    }
  });

  startDismissTimer();
  container.appendChild(toast);
}

function highlightSlotCard(slotId, type) {
  const card = $(`slot-${slotId}`);
  if (!card) return;
  const cls = type === 'full' ? 'alert-pulse-full' : 'alert-pulse-avail';
  card.classList.remove('alert-pulse-full', 'alert-pulse-avail');
  void card.offsetWidth;
  card.classList.add(cls);
  setTimeout(() => {
    card.classList.remove(cls);
  }, 2000);
}

function updateAlertHistoryUI() {
  const badge = $("alert-counter-badge");
  const countText = $("alert-history-count-text");
  const list = $("alert-history-list");

  if (badge) {
    badge.textContent = unreadAlertCount;
    if (unreadAlertCount > 0) {
      badge.classList.add('active');
    } else {
      badge.classList.remove('active');
    }
  }

  if (countText) {
    countText.textContent = `${alertHistory.length} evento${alertHistory.length === 1 ? '' : 's'}`;
  }

  if (list) {
    if (alertHistory.length === 0) {
      list.innerHTML = `<div class="alert-empty-state">No hay alertas registradas aún. Las alertas se emitirán automáticamente cuando un parqueadero se llene o libere plazas.</div>`;
    } else {
      const typeLabels = { full: 'Lleno', available: 'Disponible', warning: 'Casi lleno' };
      list.innerHTML = alertHistory.map(item => `
        <div class="alert-history-item ${item.type}">
          <div class="alert-item-top">
            <span class="alert-item-badge">${item.icon} ${typeLabels[item.type] || 'Evento'}</span>
            <span class="alert-item-time">${item.timestamp}</span>
          </div>
          <div class="alert-item-title">${htmlEscape(item.title)} — ${htmlEscape(item.slotName)}</div>
          <div class="alert-item-msg">${htmlEscape(item.message)}</div>
          <button type="button" class="alert-item-action" data-slot="${item.slotId}">📍 Ver en mapa</button>
        </div>
      `).join('');

      list.querySelectorAll('.alert-item-action').forEach(btn => {
        btn.addEventListener('click', () => {
          focusParkingOnMap(btn.dataset.slot);
          const dropdown = $("alert-history-dropdown");
          if (dropdown) dropdown.classList.add('hidden');
        });
      });
    }
  }
}

function focusParkingOnMap(slotId) {
  const p = dataRows.find(x => x.id === slotId);
  if (!p || !map) return;
  map.flyTo([p.center[1], p.center[0]], 18, { animate: true, duration: 0.8 });
  setTimeout(() => {
    const layer = parkingLayersMap.get(slotId);
    if (layer) layer.openPopup();
  }, 350);
}

function triggerAlert(alertData) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const alertItem = {
    id: 'alert-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    ...alertData,
    timestamp: timeStr,
    date: now
  };

  alertHistory.unshift(alertItem);
  if (alertHistory.length > 30) alertHistory.pop();
  unreadAlertCount++;

  updateAlertHistoryUI();
  playAlertSound(alertData.type);
  showToastNotification(alertItem);

  const logType = alertData.type === 'full' ? 'alert-danger' : alertData.type === 'available' ? 'alert-success' : 'alert-warning';
  logTelemetry(`[ALERTA AUTOMÁTICA] ${alertData.title} -> ${alertData.slotName}: ${alertData.message}`, logType);

  highlightSlotCard(alertData.slotId, alertData.type);
}

function checkSlotAlerts(r, prevFree) {
  const prevState = previousSlotState.get(r.id);
  const oldFree = (prevFree !== undefined && prevFree !== null) ? prevFree : (prevState ? prevState.free : r.free);
  const newFree = r.free;

  if (oldFree === newFree) return;

  const oldStatus = getAvailabilityStatus(oldFree, r.capacidad);
  const newStatus = getAvailabilityStatus(newFree, r.capacidad);

  // 1. Caso crítico: Se LLENÓ (tenía plazas > 0 y ahora tiene 0)
  if (oldFree > 0 && newFree === 0) {
    triggerAlert({
      type: 'full',
      slotId: r.id,
      slotName: r.etiqueta,
      free: 0,
      capacidad: r.capacidad,
      title: '¡Parqueadero Lleno!',
      message: `El ${r.etiqueta} ha alcanzado su capacidad máxima (0/${r.capacidad} libres). Ya no tiene plazas disponibles.`,
      icon: '🚨',
      level: 'rojo',
      center: r.center
    });
  }
  // 2. Caso positivo: RECUPERÓ DISPONIBILIDAD (estaba en 0 y ahora se liberó al menos 1 plaza)
  else if (oldFree === 0 && newFree > 0) {
    triggerAlert({
      type: 'available',
      slotId: r.id,
      slotName: r.etiqueta,
      free: newFree,
      capacidad: r.capacidad,
      title: '¡Disponibilidad Recuperada!',
      message: `¡Se han liberado plazas en ${r.etiqueta}! (${newFree}/${r.capacidad} libres). Vuelve a estar disponible.`,
      icon: '🟢',
      level: 'verde',
      center: r.center
    });
  }
  // 3. Caso advertencia: CASI LLENO (estaba en verde y cayó a amarillo con <= 2 plazas o <= 25%)
  else if (oldStatus.level === 'verde' && newStatus.level === 'amarillo' && newFree > 0) {
    triggerAlert({
      type: 'warning',
      slotId: r.id,
      slotName: r.etiqueta,
      free: newFree,
      capacidad: r.capacidad,
      title: '¡Parqueadero Casi Lleno!',
      message: `Atención: Quedan solo ${newFree} plazas libres en ${r.etiqueta}. Podría saturarse pronto.`,
      icon: '🟡',
      level: 'amarillo',
      center: r.center
    });
  }

  previousSlotState.set(r.id, {
    free: newFree,
    capacidad: r.capacidad,
    level: newStatus.level
  });
}

function initAlertStates() {
  previousSlotState.clear();
  for (const r of dataRows) {
    previousSlotState.set(r.id, {
      free: r.free,
      capacidad: r.capacidad,
      level: getAvailabilityStatus(r.free, r.capacidad).level
    });
  }
}

function initAlertSystemUI() {
  const btnCenter = $("btn-alert-center");
  const dropdown = $("alert-history-dropdown");
  const btnToggleSound = $("btn-toggle-sound");
  const btnClearAlerts = $("btn-clear-alerts");

  btnCenter?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
    unreadAlertCount = 0;
    const badge = $("alert-counter-badge");
    if (badge) {
      badge.textContent = "0";
      badge.classList.remove('active');
    }
  });

  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && e.target !== btnCenter && !btnCenter?.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    }
  });

  btnToggleSound?.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    if (btnToggleSound) {
      btnToggleSound.textContent = isSoundEnabled ? '🔊 Sonido: ON' : '🔇 Sonido: OFF';
      btnToggleSound.classList.toggle('muted', !isSoundEnabled);
    }
    logTelemetry(`[Sistema] Alertas sonoras ${isSoundEnabled ? 'activadas' : 'silenciadas'}`, 'system');
  });

  btnClearAlerts?.addEventListener('click', () => {
    alertHistory = [];
    unreadAlertCount = 0;
    updateAlertHistoryUI();
    logTelemetry("[Sistema] Historial de alertas limpiado", 'system');
  });
}

function renderControls() {
  const host = $("controles-parking");
  if (!host) return;
  host.replaceChildren();

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const sensorCode = `NODO-IoT-${String(i + 1).padStart(2, '0')}`;
    const status = getAvailabilityStatus(r.free, r.capacidad);
    const isAllowed = isProfileAllowed(r, currentDriverProfile);
    const profileMeta = PROFILE_INFO[currentDriverProfile] || PROFILE_INFO.todos;

    const pcdQuotaHtml = r.plazas_discapacidad ? `<span class="badge-pcd-quota" title="${r.plazas_discapacidad} plazas reservadas para Personas con Discapacidad">♿ ${r.plazas_discapacidad} PCD</span>` : '';

    let accessInfoHtml = '';
    if (currentDriverProfile !== "todos") {
      accessInfoHtml = isAllowed
        ? `<span class="badge-access-status allowed">✅ Autorizado</span>`
        : `<span class="badge-access-status restricted">🔒 Restringido (${profileMeta.name})</span>`;
    } else {
      // Resumen limpio de acceso para evitar sobrecargar de etiquetas repetitivas
      const allowed = r.perfiles_permitidos || ["estudiante", "docente", "administrativo", "discapacidad"];
      if (allowed.length >= 4) {
        accessInfoHtml = `<span class="access-badge-summary">👥 Acceso General</span>`;
      } else {
        const names = allowed.map(p => (PROFILE_INFO[p]?.name || p).split(' ')[0]).join(', ');
        accessInfoHtml = `<span class="access-badge-summary restricted" title="Acceso asignado a: ${names}">🔒 Solo ${names}</span>`;
      }
    }

    const div = document.createElement('div');
    div.className = `slot ${isAllowed ? '' : 'restringido-perfil'}`;
    div.id = `slot-${r.id}`;
    div.innerHTML = `
      <div class="slot-iot-header">
        <div class="slot-info-col">
          <div class="slot-title-row">
            <span class="slotname">${htmlEscape(r.etiqueta)}</span>
            <span class="semaforo-pill ${status.level}" id="pill-${r.id}"><span class="semaforo-indicator-dot"></span>${status.label}</span>
            <span class="sensor-dot ${status.level}" id="dot-${r.id}" style="display:none;" title="Estado: ${status.label}"></span>
          </div>
          <div class="slot-meta-row">
            <span class="sensor-chip">${sensorCode}</span>
            <small id="num-${r.id}" class="slot-free-count"><strong>${r.free}</strong> / ${r.capacidad} libres</small>
          </div>
          <div class="access-tag-row">
            ${accessInfoHtml}
            ${pcdQuotaHtml}
          </div>
        </div>
      </div>
      <div class="slot-slider-wrap">
        <input aria-label="Espacios disponibles simulados en ${htmlEscape(r.etiqueta)}" id="slider-${r.id}" data-id="${r.id}" type="range" min="0" max="${r.capacidad}" value="${r.free}">
      </div>
      <div class="slot-actions">
        <button type="button" class="btn-sensor-step btn-step-in" id="btn-in-${r.id}" data-id="${r.id}" data-act="in" ${r.free <= 0 ? 'disabled' : ''}>
          🚗 +1 Entrada
        </button>
        <button type="button" class="btn-sensor-step btn-step-out" id="btn-out-${r.id}" data-id="${r.id}" data-act="out" ${r.free >= r.capacidad ? 'disabled' : ''}>
          🚙 +1 Salida
        </button>
      </div>
    `;
    host.append(div);
  }

  // Sliders manuales
  host.querySelectorAll('input[type=range]').forEach(el => el.addEventListener('input', () => {
    const r = dataRows.find(x => x.id === el.dataset.id);
    if (!r) return;
    const oldFree = r.free;
    const newFree = Number(el.value);
    if (newFree < oldFree) {
      const diff = oldFree - newFree;
      sessionStats.entries += diff;
      if (sessionStats.perSlotTurnover[r.id]) sessionStats.perSlotTurnover[r.id].in += diff;
    } else if (newFree > oldFree) {
      const diff = newFree - oldFree;
      sessionStats.exits += diff;
      if (sessionStats.perSlotTurnover[r.id]) sessionStats.perSlotTurnover[r.id].out += diff;
    }
    r.free = newFree;
    checkSlotAlerts(r, oldFree);
    syncSlotUI(r);
    syncSlotOccupancyToDb(r.id, r.free, 'ajuste_manual');
    logTelemetry(`[${r.id}] Ajuste manual sensor: ${r.free}/${r.capacidad} libres`, 'manual');
    update();
  }));

  // Botones +1 Entrada / +1 Salida
  host.querySelectorAll('.btn-sensor-step').forEach(btn => btn.addEventListener('click', () => {
    const r = dataRows.find(x => x.id === btn.dataset.id);
    if (!r) return;
    const oldFree = r.free;
    const isEntry = btn.dataset.act === 'in';
    if (isEntry && r.free > 0) {
      r.free--;
      sessionStats.entries++;
      if (sessionStats.perSlotTurnover[r.id]) sessionStats.perSlotTurnover[r.id].in++;
      logTelemetry(`[${r.id}] Entrada manual: ocupada plaza en ${r.etiqueta} (${r.free}/${r.capacidad} libres)`, 'entry');
    } else if (!isEntry && r.free < r.capacidad) {
      r.free++;
      sessionStats.exits++;
      if (sessionStats.perSlotTurnover[r.id]) sessionStats.perSlotTurnover[r.id].out++;
      logTelemetry(`[${r.id}] Salida manual: liberada plaza en ${r.etiqueta} (${r.free}/${r.capacidad} libres)`, 'exit');
    }
    checkSlotAlerts(r, oldFree);
    syncSlotUI(r);
    syncSlotOccupancyToDb(r.id, r.free, isEntry ? 'entrada_manual' : 'salida_manual');
    update();
  }));
}

/* --- MOTOR DE SIMULACIÓN AUTOMÁTICA --- */
function setAutoBadge(running) {
  const badge = $("iot-status-badge");
  if (!badge) return;
  if (running) {
    badge.className = "iot-badge active";
    badge.textContent = "● Transmitiendo en vivo";
  } else {
    badge.className = "iot-badge paused";
    badge.textContent = "● Pausado";
  }
}

function startAutoSimulation() {
  if (isAutoRunning) return;
  isAutoRunning = true;
  setAutoBadge(true);
  const btn = $("btn-toggle-auto");
  if (btn) {
    btn.className = "btn-auto-toggle stop";
    const icon = $("btn-auto-icon");
    const txt = $("btn-auto-text");
    if (icon) icon.textContent = "⏸";
    if (txt) txt.textContent = "Pausar flujo automático";
  }
  const speed = Number($("auto-speed")?.value || 3000);
  logTelemetry(`[Fase 2] Flujo automático iniciado (intervalo: ${(speed / 1000).toFixed(1)}s)`, 'system');
  autoTimer = setInterval(tickAutoVehicle, speed);
}

function stopAutoSimulation(silent = false) {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  isAutoRunning = false;
  setAutoBadge(false);
  const btn = $("btn-toggle-auto");
  if (btn) {
    btn.className = "btn-auto-toggle start";
    const icon = $("btn-auto-icon");
    const txt = $("btn-auto-text");
    if (icon) icon.textContent = "▶";
    if (txt) txt.textContent = "Iniciar flujo automático";
  }
  if (!silent) {
    logTelemetry("[Fase 2] Flujo automático pausado", 'system');
  }
}

function toggleAutoSimulation() {
  if (isAutoRunning) {
    stopAutoSimulation();
  } else {
    startAutoSimulation();
  }
}

function tickAutoVehicle() {
  if (!dataRows.length) return;
  const target = dataRows[Math.floor(Math.random() * dataRows.length)];
  const pattern = $("auto-traffic-pattern")?.value || "balanced";

  let wantsEntry = Math.random() < 0.5;
  if (pattern === "rush_in") wantsEntry = Math.random() < 0.75;
  if (pattern === "rush_out") wantsEntry = Math.random() < 0.25;

  if (target.free <= 0) wantsEntry = false;
  else if (target.free >= target.capacidad) wantsEntry = true;

  const oldFree = target.free;
  if (wantsEntry && target.free > 0) {
    target.free--;
    sessionStats.entries++;
    if (sessionStats.perSlotTurnover[target.id]) sessionStats.perSlotTurnover[target.id].in++;
    logTelemetry(`[${target.id}] 🚗 Sensor detecta ENTRADA: ${target.etiqueta} (${target.free}/${target.capacidad} libres)`, 'entry');
  } else if (!wantsEntry && target.free < target.capacidad) {
    target.free++;
    sessionStats.exits++;
    if (sessionStats.perSlotTurnover[target.id]) sessionStats.perSlotTurnover[target.id].out++;
    logTelemetry(`[${target.id}] 🚙 Sensor detecta SALIDA: ${target.etiqueta} (${target.free}/${target.capacidad} libres)`, 'exit');
  }

  checkSlotAlerts(target, oldFree);
  syncSlotUI(target);
  syncSlotOccupancyToDb(target.id, target.free, wantsEntry ? 'entrada_auto' : 'salida_auto');
  update();
}

function getPredictionForSlot(slotId, hour = predHour, day = predDay) {
  if (!historicalData || !historicalData.perfiles_parqueaderos) {
    return {
      pct: 50,
      freeEstimated: 5,
      riskLevel: "medio",
      riskLabel: "Moderado",
      peakHours: "07:00, 13:00 y 17:00",
      sensibilidad: "Datos estándar simulados",
      recommendation: "Sin datos históricos disponibles"
    };
  }

  const profile = historicalData.perfiles_parqueaderos[slotId];
  if (!profile) {
    return {
      pct: 50,
      freeEstimated: 5,
      riskLevel: "medio",
      riskLabel: "Moderado",
      peakHours: "07:00, 13:00 y 17:00",
      sensibilidad: "Estándar",
      recommendation: "Información general de campus"
    };
  }

  const curve = (day === "sabado") ? profile.curva_sabado : profile.curva_laborable;
  const pct = curve[hour] ?? 50;
  const cap = profile.capacidad || 10;
  const occEstimated = Math.min(cap, Math.round((pct / 100) * cap));
  const freeEstimated = Math.max(0, cap - occEstimated);

  let riskLevel = "bajo";
  let riskLabel = "Bajo riesgo";
  if (pct >= 85 || freeEstimated <= 1) {
    riskLevel = "critico";
    riskLabel = "Riesgo Alto (Saturación)";
  } else if (pct >= 60 || freeEstimated <= 3) {
    riskLevel = "medio";
    riskLabel = "Riesgo Moderado";
  } else {
    riskLevel = "bajo";
    riskLabel = "Plazas garantizadas";
  }

  let recommendation = "";
  if (riskLevel === "critico") {
    recommendation = `Alta demanda a las ${hour} (${pct}% ocupación esperada). Muy probable que se llene. Conviene llegar antes o evaluar alternativas.`;
  } else if (riskLevel === "medio") {
    recommendation = `Demanda regular esperada (${pct}%). Rotación continua entre clases.`;
  } else {
    recommendation = `Excelente disponibilidad histórica para las ${hour} (${freeEstimated} plazas libres estimadas).`;
  }

  return {
    pct,
    freeEstimated,
    capacidad: cap,
    riskLevel,
    riskLabel,
    peakHours: profile.pico_horario || "07:00, 13:00 y 17:00",
    sensibilidad: profile.sensibilidad || "Normal",
    recommendation
  };
}

function renderPredictionSection() {
  if (!historicalData) return;

  const displayEl = $("pred-slot-display");
  if (displayEl) displayEl.textContent = `${predHour} (${predDay === 'laborable' ? 'L-V' : 'Sáb'})`;

  // 1. Render Timeline chips
  const timelineEl = $("pred-timeline-bar");
  if (timelineEl) {
    const hours = historicalData.horas_disponibles || [
      "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
      "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
    ];
    timelineEl.innerHTML = hours.map(h => {
      const activeClass = h === predHour ? "active" : "";
      return `<button type="button" class="pred-time-chip ${activeClass}" data-hour="${h}">
        ${h}
      </button>`;
    }).join("");

    timelineEl.querySelectorAll(".pred-time-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        predHour = btn.dataset.hour;
        const select = $("pred-hora-select");
        if (select) select.value = predHour;
        renderPredictionSection();
        if (predApplyMap) update();
        logTelemetry(`[Predicción] Consulta horaria cambiada a las ${predHour} (${predDay})`, 'system');
      });
    });
  }

  // 2. Render Cards Grid
  const gridEl = $("pred-cards-grid");
  if (gridEl) {
    gridEl.innerHTML = dataRows.map(r => {
      const pred = getPredictionForSlot(r.id, predHour, predDay);
      return `
        <div class="pred-slot-card risk-${pred.riskLevel}">
          <div>
            <div class="pred-card-top">
              <div>
                <div class="pred-card-name">${htmlEscape(r.etiqueta)}</div>
                <div class="pred-card-cap">${r.capacidad} plazas · Pico habitual: ${htmlEscape(pred.peakHours)}</div>
              </div>
              <span class="pred-risk-badge ${pred.riskLevel}">${pred.riskLabel}</span>
            </div>

            <div class="pred-meter-group">
              <div class="pred-meter-header">
                <span class="pred-meter-label">Ocupación estimada a las ${predHour}:</span>
                <span class="pred-meter-val" style="color: ${pred.riskLevel === 'critico' ? '#ef4444' : pred.riskLevel === 'medio' ? '#f59e0b' : '#10b981'};">
                  ${pred.pct}% (${pred.freeEstimated} libres)
                </span>
              </div>
              <div class="pred-progress-bg">
                <div class="pred-progress-fill ${pred.riskLevel}" style="width: ${pred.pct}%;"></div>
              </div>
            </div>

            <p style="font-size: 11px; color: #587285; line-height: 1.4; margin: 6px 0 0;">
              ${htmlEscape(pred.recommendation)}
            </p>
          </div>

          <div class="pred-card-footer">
            <span>Sensor actual: <strong>${r.free} libres</strong></span>
            <span>Pronóstico: <strong>${pred.freeEstimated} libres</strong></span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 3. Render Campus Hourly Chart
  const chartEl = $("pred-chart-bars");
  const chartSub = $("pred-chart-subtitle");
  if (chartSub) {
    chartSub.textContent = `Ocupación promedio acumulada (% plazas ocupadas) · ${predDay === 'laborable' ? 'Lunes a Viernes (Lectivo regular)' : 'Sábado (Posgrado / Extensión)'}`;
  }
  if (chartEl && historicalData.horas_disponibles) {
    const hours = historicalData.horas_disponibles;
    const totals = hours.map(h => {
      let sumPct = 0;
      let count = 0;
      for (const pId in historicalData.perfiles_parqueaderos) {
        const prof = historicalData.perfiles_parqueaderos[pId];
        const curve = (predDay === "sabado") ? prof.curva_sabado : prof.curva_laborable;
        sumPct += (curve[h] || 0);
        count++;
      }
      const avg = count ? Math.round(sumPct / count) : 0;
      return { hour: h, avg };
    });

    chartEl.innerHTML = totals.map(item => {
      let risk = "bajo";
      if (item.avg >= 80) risk = "critico";
      else if (item.avg >= 50) risk = "medio";
      const isSelected = item.hour === predHour ? "selected" : "";

      return `
        <div class="pred-bar-col ${isSelected}" data-hour="${item.hour}" title="Hora ${item.hour}: ${item.avg}% ocupación promedio">
          <span class="pred-bar-pct">${item.avg}%</span>
          <div class="pred-bar-fill ${risk}" style="height: ${item.avg}%;"></div>
          <span class="pred-bar-label">${item.hour}</span>
        </div>
      `;
    }).join("");

    chartEl.querySelectorAll(".pred-bar-col").forEach(col => {
      col.addEventListener("click", () => {
        predHour = col.dataset.hour;
        const select = $("pred-hora-select");
        if (select) select.value = predHour;
        renderPredictionSection();
        if (predApplyMap) update();
        logTelemetry(`[Predicción] Selección horaria desde gráfico: ${predHour}`, 'system');
      });
    });
  }
}

function createDriverCarIcon() {
  return L.divIcon({
    className: "driver-car-icon-wrapper",
    html: '<div class="driver-car-icon" title="Tu vehículo (Arrastra para mover)">🚗</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

function initDriverMarker() {
  if (!map) return;
  driverMarker = L.marker([driverLocation[1], driverLocation[0]], {
    icon: createDriverCarIcon(),
    draggable: true,
    zIndexOffset: 1000
  }).addTo(map);

  driverMarker.bindTooltip("<strong>🚗 Tu vehículo (Conductor)</strong><br><small>Arrastra para mover tu origen</small>", {
    direction: "top",
    offset: [0, -16]
  });

  driverMarker.bindPopup(`
    <div style="font-family: inherit; font-size: 12px; min-width: 180px;">
      <strong style="color: #1d4ed8; font-size: 13px; display:block; margin-bottom: 4px;">🚗 Ubicación del Conductor</strong>
      Punto de partida del vehículo hacia el estacionamiento recomendado.<br>
      <small style="color: #607d8e;">Puedes arrastrar el vehículo en cualquier calle del mapa.</small>
    </div>
  `);

  driverMarker.on('dragend', (e) => {
    const latlng = e.target.getLatLng();
    driverLocation = [latlng.lng, latlng.lat];
    const origenSelect = $("origen");
    if (origenSelect) origenSelect.value = "custom";
    logTelemetry(`[Navegación] Vehículo reubicado a coordenadas: [${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}]`, 'manual');
    update();
  });
}

function getDriverOriginName() {
  const sel = $("origen");
  if (!sel) return "Punto de partida";
  const val = sel.value;
  if (val !== "custom" && DRIVER_ENTRANCES[val]) {
    return DRIVER_ENTRANCES[val].name;
  }
  return "Ubicación en el mapa";
}

function initTabs() {
  const tabManual = $("tab-manual");
  const tabAuto = $("tab-auto");
  const tabPred = $("tab-pred");
  const panelManual = $("panel-manual");
  const panelAuto = $("panel-auto");
  const panelPred = $("panel-pred");

  function switchTab(activeTab, activePanel) {
    [tabManual, tabAuto, tabPred].forEach(t => {
      if (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });
    [panelManual, panelAuto, panelPred].forEach(p => {
      if (p) p.classList.add('hidden');
    });

    activeTab?.classList.add('active');
    activeTab?.setAttribute('aria-selected', 'true');
    activePanel?.classList.remove('hidden');
  }

  tabManual?.addEventListener('click', () => switchTab(tabManual, panelManual));
  tabAuto?.addEventListener('click', () => switchTab(tabAuto, panelAuto));
  tabPred?.addEventListener('click', () => {
    switchTab(tabPred, panelPred);
    renderPredictionSection();
    switchMainView('pred');
  });

  $("btn-toggle-auto")?.addEventListener('click', toggleAutoSimulation);

  $("auto-speed")?.addEventListener('change', () => {
    if (isAutoRunning) {
      stopAutoSimulation(true);
      startAutoSimulation();
    }
  });

  $("btn-clear-feed")?.addEventListener('click', () => {
    const feed = $("iot-telemetry-feed");
    if (feed) feed.replaceChildren();
    logTelemetry("[Sistema] Registro de telemetría limpiado", 'system');
  });

  // Controles del Panel Predictivo
  $("pred-hora-select")?.addEventListener('change', (e) => {
    predHour = e.target.value;
    renderPredictionSection();
    if (predApplyMap) update();
    logTelemetry(`[Predicción] Franja horaria ajustada a las ${predHour} (${predDay})`, 'system');
  });

  $("pred-dia-select")?.addEventListener('change', (e) => {
    predDay = e.target.value;
    renderPredictionSection();
    if (predApplyMap) update();
    logTelemetry(`[Predicción] Calendario modificado a: ${predDay === 'laborable' ? 'Lunes a Viernes' : 'Sábado'}`, 'system');
  });

  $("pred-apply-map")?.addEventListener('change', (e) => {
    predApplyMap = e.target.checked;
    update();
    if (predApplyMap) {
      logTelemetry(`[Predicción] Modo predictivo ACTIVADO: mapa y recomendación proyectados a las ${predHour}`, 'system');
    } else {
      logTelemetry(`[Predicción] Modo predictivo DESACTIVADO: volviendo a sensores IoT en tiempo real`, 'system');
    }
  });

  $("btn-run-prediction")?.addEventListener('click', () => {
    switchMainView('pred');
    renderPredictionSection();
    logTelemetry(`[Predicción] Pronóstico actualizado para las ${predHour} (${predDay})`, 'system');
  });
}

function initSidebarNav() {
  const tabRoute = $("sidebar-tab-route");
  const tabIot = $("sidebar-tab-iot");
  const viewRoute = $("sidebar-view-route");
  const viewIot = $("sidebar-view-iot");
  const btnGoIot = $("btn-go-iot");
  const btnGoRoute = $("btn-go-route");

  function switchSidebarView(isRoute) {
    if (tabRoute) {
      tabRoute.classList.toggle("active", isRoute);
      tabRoute.setAttribute("aria-selected", isRoute ? "true" : "false");
    }
    if (tabIot) {
      tabIot.classList.toggle("active", !isRoute);
      tabIot.setAttribute("aria-selected", !isRoute ? "true" : "false");
    }
    if (viewRoute) viewRoute.classList.toggle("hidden", !isRoute);
    if (viewIot) viewIot.classList.toggle("hidden", isRoute);
  }

  tabRoute?.addEventListener("click", () => switchSidebarView(true));
  tabIot?.addEventListener("click", () => switchSidebarView(false));
  btnGoIot?.addEventListener("click", () => switchSidebarView(false));
  btnGoRoute?.addEventListener("click", () => switchSidebarView(true));
}

function switchMainView(tabName) {
  const tabs = {
    map: { btn: $("tab-main-map"), panel: $("panel-main-map") },
    ranking: { btn: $("tab-main-ranking"), panel: $("panel-main-ranking") },
    pred: { btn: $("tab-main-pred"), panel: $("panel-main-pred") }
  };

  Object.entries(tabs).forEach(([k, item]) => {
    const isTarget = (k === tabName);
    if (item.btn) {
      item.btn.classList.toggle('active', isTarget);
      item.btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    }
    if (item.panel) {
      item.panel.classList.toggle('hidden', !isTarget);
      item.panel.classList.toggle('active', isTarget);
    }
  });

  if (tabName === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 120);
  } else if (tabName === 'pred') {
    renderPredictionSection();
  }
}
window.switchMainView = switchMainView;

function initMainViewTabs() {
  $("tab-main-map")?.addEventListener('click', () => switchMainView('map'));
  $("tab-main-ranking")?.addEventListener('click', () => switchMainView('ranking'));
  $("tab-main-pred")?.addEventListener('click', () => switchMainView('pred'));
  $("btn-view-map-from-ranking")?.addEventListener('click', () => switchMainView('map'));
}

/* ═══════════════════════════════════════════════════════════════
   PANEL ADMINISTRATIVO: ESTADÍSTICAS, HORARIOS CRÍTICOS Y RANKING
   ═══════════════════════════════════════════════════════════════ */
function openAdminModal() {
  isAdminModalOpen = true;
  const modal = $("admin-modal");
  if (modal) {
    modal.classList.remove("hidden");
    renderAdminDashboard();
  }
  logTelemetry("[Admin] Panel Administrativo de Movilidad abierto", 'system');
}

function closeAdminModal() {
  isAdminModalOpen = false;
  const modal = $("admin-modal");
  if (modal) modal.classList.add("hidden");
}

function renderAdminCriticalHours(jornada = adminSelectedJornada) {
  if (!historicalData || !historicalData.perfiles_parqueaderos) return;
  const hours = historicalData.horas_disponibles || ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const totalCap = dataRows.reduce((acc, r) => acc + r.capacidad, 0);

  // Calcular ocupación promedio ponderada del campus por cada hora
  const hourlyStats = hours.map(h => {
    let occupiedSum = 0;
    for (const r of dataRows) {
      const prof = historicalData.perfiles_parqueaderos[r.id];
      if (prof) {
        const curve = (jornada === 'sabado') ? prof.curva_sabado : prof.curva_laborable;
        const pct = curve[h] || 0;
        occupiedSum += (r.capacidad * pct / 100);
      }
    }
    const campusAvgPct = totalCap > 0 ? Math.round((occupiedSum / totalCap) * 100) : 0;
    return { hour: h, pct: campusAvgPct };
  });

  // 1. Tarjetas de Franjas Críticas
  const cardsContainer = $("admin-critical-cards");
  if (cardsContainer) {
    if (jornada === 'laborable') {
      cardsContainer.innerHTML = `
        <div class="critical-card matutino">
          <span class="critical-card-tag">PICO CRÍTICO 1 · INGRESO MATUTINO</span>
          <div class="critical-card-time">07:00</div>
          <div class="critical-card-pct">⚠️ ~86% - 90% de ocupación global</div>
          <p class="critical-card-desc">Ingreso simultáneo al inicio de clases teóricas y laboratorios matutinos. Máxima saturación en todos los sectores del campus FIE.</p>
        </div>
        <div class="critical-card vespertino">
          <span class="critical-card-tag">PICO CRÍTICO 2 · CAMBIO DE JORNADA</span>
          <div class="critical-card-time">13:00</div>
          <div class="critical-card-pct">⚠️ ~85% - 88% de ocupación global</div>
          <p class="critical-card-desc">Franja de mediodía, almuerzo y cambio de turno entre estudiantes matutinos y vespertinos. Alta rotación y presión en accesos.</p>
        </div>
        <div class="critical-card vespertino" style="border-left-color: #f59e0b;">
          <span class="critical-card-tag" style="color: #d97706;">PICO 3 · SALIDA VESPERTINA</span>
          <div class="critical-card-time">17:00</div>
          <div class="critical-card-pct">🟡 ~68% - 72% de ocupación (moderado)</div>
          <p class="critical-card-desc">Salida de la jornada regular y laboratorios tardíos; presenta flujo elevado pero con menor intensidad que a las 07:00 y 13:00.</p>
        </div>
      `;
    } else {
      cardsContainer.innerHTML = `
        <div class="critical-card matutino">
          <span class="critical-card-tag">PICO CRÍTICO · SÁBADO ACADÉMICO</span>
          <div class="critical-card-time">09:00 - 11:30</div>
          <div class="critical-card-pct">🟡 ~55% - 62% ocupación moderada</div>
          <p class="critical-card-desc">Módulos de posgrado, maestrías y talleres de diseño. Ocupación concentrada en sector FIE y Diseño sin sobrepasar la capacidad global del campus.</p>
        </div>
        <div class="critical-card vespertino">
          <span class="critical-card-tag">ROTACIÓN MEDIA VESPERTINA</span>
          <div class="critical-card-time">12:00 - 14:00</div>
          <div class="critical-card-pct">🟡 ~35% - 45% ocupación</div>
          <p class="critical-card-desc">Salida escalonada de módulos sabatinos. Tráfico ligero sin riesgo de colapso en los accesos.</p>
        </div>
        <div class="critical-card valle">
          <span class="critical-card-tag">CIERRE DE CAMPUS</span>
          <div class="critical-card-time">15:00 - 18:00</div>
          <div class="critical-card-pct">✅ &lt; 15% ocupación</div>
          <p class="critical-card-desc">Actividad académica sabatina finalizada. Parqueaderos prácticamente despejados.</p>
        </div>
      `;
    }
  }

  // 2. Gráfico interactivo de barras
  const barsContainer = $("admin-hourly-bars");
  if (barsContainer) {
    barsContainer.innerHTML = hourlyStats.map(item => {
      let riskCls = 'low';
      if (item.pct >= 80) riskCls = 'high';
      else if (item.pct >= 50) riskCls = 'mid';

      return `
        <div class="admin-bar-col" data-hour="${item.hour}" title="Hora ${item.hour}: ${item.pct}% ocupación estimada">
          <span class="admin-bar-pct">${item.pct}%</span>
          <div class="admin-bar-fill ${riskCls}" style="height: ${item.pct}%;"></div>
          <span class="admin-bar-label">${item.hour}</span>
        </div>
      `;
    }).join('');

    barsContainer.querySelectorAll(".admin-bar-col").forEach(col => {
      col.addEventListener("click", () => {
        barsContainer.querySelectorAll(".admin-bar-col").forEach(c => c.classList.remove("selected"));
        col.classList.add("selected");
        const h = col.dataset.hour;
        const stat = hourlyStats.find(s => s.hour === h);
        const recText = $("admin-hours-rec-text");
        if (recText && stat) {
          recText.innerHTML = `A las <strong>${h}</strong> se proyecta una demanda del <strong>${stat.pct}%</strong> en el campus. ${stat.pct >= 80
            ? '🚨 <span style="color:#b91c1c; font-weight:700;">Nivel Crítico:</span> Se aconseja restringir acceso a zonas saturadas y habilitar canalización directa hacia Estacionamiento Sistemas.'
            : stat.pct >= 50
              ? '🟡 <span style="color:#b45309; font-weight:700;">Nivel Moderado:</span> Se recomienda monitorear plazas en FIE y advertir a conductores sobre plazas limitadas.'
              : '🟢 <span style="color:#047857; font-weight:700;">Nivel Fluido:</span> Disponibilidad óptima en todos los sectores sin necesidad de desvíos.'
            }`;
        }
      });
    });
  }

  // 3. Recomendación operativa inicial
  const recText = $("admin-hours-rec-text");
  if (recText) {
    recText.innerHTML = (jornada === 'laborable')
      ? 'Durante las horas pico de <strong>07:00</strong> y de <strong>13:00</strong> (con una franja moderada de salida a las <strong>17:00</strong>), los estacionamientos registran su mayor afluencia. Se sugiere instruir al personal de garita a canalizar el flujo hacia el <strong>Estacionamiento Software (50 plazas)</strong> para evitar cuellos de botella en la Av. Canónigo Ramos.'
      : 'En jornada de sábado, la demanda global se mantiene por debajo del 65%. La mayor concentración ocurre entre <strong>09:00 y 11:30</strong> cerca de los módulos de posgrado de la FIE.';
  }
}

function renderAdminRanking() {
  if (!historicalData || !historicalData.perfiles_parqueaderos) return;

  const hours = historicalData.horas_disponibles || [];
  const rankingList = dataRows.map(r => {
    const prof = historicalData.perfiles_parqueaderos[r.id] || {};
    const curve = (adminSelectedJornada === 'sabado') ? (prof.curva_sabado || {}) : (prof.curva_laborable || {});

    let sum = 0, count = 0;
    for (const h of hours) {
      if (curve[h] !== undefined) {
        sum += curve[h];
        count++;
      }
    }
    const avgDailyPct = count > 0 ? Math.round(sum / count) : 50;
    const currentStatus = getAvailabilityStatus(r.free, r.capacidad);
    const turnover = sessionStats.perSlotTurnover[r.id] || { in: 0, out: 0 };

    return {
      ...r,
      avgDailyPct,
      peakHour: prof.pico_horario || '07:00, 13:00 y 17:00',
      sensitivity: prof.sensibilidad || 'Moderada',
      currentStatus,
      turnover
    };
  });

  // Ordenar por ocupación promedio descendente
  rankingList.sort((a, b) => b.avgDailyPct - a.avgDailyPct);

  // 1. Tarjetas Spotlight
  const spotlightContainer = $("admin-spotlight-grid");
  if (spotlightContainer && rankingList.length >= 2) {
    const topLot = rankingList[0];
    const capacityLot = [...rankingList].sort((a, b) => b.capacidad - a.capacidad)[0];

    spotlightContainer.innerHTML = `
      <div class="spotlight-card">
        <div class="spotlight-badge-icon">🥇</div>
        <div class="spotlight-info">
          <span>PARQUEADERO #1 DE MAYOR DEMANDA</span>
          <h4>${htmlEscape(topLot.etiqueta)}</h4>
          <p><strong>${topLot.avgDailyPct}% ocupación media diaria</strong> · Pico: ${htmlEscape(topLot.peakHour)}. Presenta la tasa de rotación y probabilidad de llenado más alta del campus.</p>
        </div>
      </div>
      <div class="spotlight-card">
        <div class="spotlight-badge-icon">🛡️</div>
        <div class="spotlight-info">
          <span>PULMÓN DE CAPACIDAD DEL CAMPUS</span>
          <h4>${htmlEscape(capacityLot.etiqueta)}</h4>
          <p><strong>${capacityLot.capacidad} plazas totales</strong> (~45% de la capacidad de la ESPOCH FIE). Amortigua los picos críticos y absorbe el desvío vehicular.</p>
        </div>
      </div>
    `;
  }

  // 2. Tabla completa
  const tbody = $("admin-table-body");
  if (tbody) {
    tbody.innerHTML = rankingList.map((item, index) => {
      let barColor = '#10b981';
      if (item.avgDailyPct >= 75) barColor = '#ef4444';
      else if (item.avgDailyPct >= 50) barColor = '#f59e0b';

      return `
        <tr>
          <td><span class="rank-badge-cell">${index + 1}º</span></td>
          <td>
            <strong>${htmlEscape(item.etiqueta)}</strong>
            <br><small style="color:#728d9f;">ID: ${item.id} · Cap. ${item.capacidad}</small>
          </td>
          <td><strong>${item.capacidad}</strong> plazas</td>
          <td>
            <div class="admin-bar-cell-wrap">
              <div class="admin-table-bar-bg">
                <div class="admin-table-bar-fill" style="width: ${item.avgDailyPct}%; background: ${barColor};"></div>
              </div>
              <strong>${item.avgDailyPct}%</strong>
            </div>
          </td>
          <td>${htmlEscape(item.peakHour)}</td>
          <td><span style="font-size:11px; color:#4a6577;">${htmlEscape(item.sensitivity)}</span></td>
          <td><span style="color:#0284c7; font-weight:700;">+${item.turnover.in} in / -${item.turnover.out} out</span></td>
          <td>
            <div class="access-tag-row">
              ${(item.perfiles_permitidos || ["estudiante", "docente", "administrativo", "discapacidad"]).map(p => {
        const info = PROFILE_INFO[p];
        return `<span class="access-badge ${p}">${info.icon} ${info.name.split(' ')[0]}</span>`;
      }).join('')}
            </div>
            ${item.plazas_discapacidad ? `<div style="margin-top:3px;"><span class="badge-pcd-quota">♿ ${item.plazas_discapacidad} PCD</span></div>` : ''}
          </td>
          <td>
            <span class="semaforo-pill ${item.currentStatus.level}">
              <span class="semaforo-indicator-dot"></span>${item.currentStatus.label} (${item.free} lib.)
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function renderAdminDashboard() {
  if (!dataRows.length) return;

  const totalCap = dataRows.reduce((acc, r) => acc + r.capacidad, 0);
  const totalLibres = dataRows.reduce((acc, r) => acc + r.free, 0);
  const totalOcupadas = Math.max(0, totalCap - totalLibres);
  const pctOcupado = totalCap > 0 ? Math.round((totalOcupadas / totalCap) * 100) : 0;

  // 1. KPIs
  const elCap = $("admin-kpi-capacidad");
  if (elCap) elCap.textContent = `${totalCap}`;

  const elPct = $("admin-kpi-pct-ocupado");
  if (elPct) elPct.textContent = `${pctOcupado}%`;

  const elFill = $("admin-kpi-fill");
  if (elFill) {
    elFill.style.width = `${pctOcupado}%`;
    elFill.className = `kpi-progress-fill ${pctOcupado >= 80 ? 'high' : ''}`;
  }

  const elPlazasSub = $("admin-kpi-plazas-sub");
  if (elPlazasSub) elPlazasSub.textContent = `${totalOcupadas} plazas ocupadas · ${totalLibres} libres`;

  const elTurnover = $("admin-kpi-turnover");
  if (elTurnover) elTurnover.textContent = `${sessionStats.entries + sessionStats.exits}`;

  const elTurnoverSub = $("admin-kpi-turnover-sub");
  if (elTurnoverSub) elTurnoverSub.textContent = `${sessionStats.entries} entradas · ${sessionStats.exits} salidas registradas`;

  const elStatus = $("admin-kpi-status-campus");
  const elStatusSub = $("admin-kpi-status-sub");
  if (elStatus) {
    if (pctOcupado >= 80) {
      elStatus.textContent = "🔴 Saturación Crítica";
      elStatus.style.color = "#dc2626";
      if (elStatusSub) elStatusSub.textContent = "Se sugiere desviar tráfico hacia Estacionamiento Sistemas";
    } else if (pctOcupado >= 60) {
      elStatus.textContent = "🟡 Presión Media";
      elStatus.style.color = "#d97706";
      if (elStatusSub) elStatusSub.textContent = "Ocupación sostenida sin riesgo inmediato de colapso";
    } else {
      elStatus.textContent = "🟢 Normal / Disponible";
      elStatus.style.color = "#059669";
      if (elStatusSub) elStatusSub.textContent = "Nivel de congestión vehicular controlado y fluido";
    }
  }

  // 2. Semáforo distribución
  const countVerde = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'verde').length;
  const countAmarillo = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'amarillo').length;
  const countRojo = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'rojo').length;
  const totalSlots = dataRows.length || 1;

  const semContainer = $("admin-semaforo-bars");
  if (semContainer) {
    semContainer.innerHTML = `
      <div class="admin-sem-stat-row">
        <div class="admin-sem-stat-info">
          <span style="color:#059669;">🟢 Disponibles (&gt; 25% libres)</span>
          <span>${countVerde} parqueaderos (${Math.round((countVerde / totalSlots) * 100)}%)</span>
        </div>
        <div class="admin-sem-stat-bar-bg">
          <div class="admin-sem-stat-bar-fill verde" style="width: ${(countVerde / totalSlots) * 100}%;"></div>
        </div>
      </div>
      <div class="admin-sem-stat-row">
        <div class="admin-sem-stat-info">
          <span style="color:#d97706;">🟡 Casi Llenos (≤ 25% o ≤ 2 libres)</span>
          <span>${countAmarillo} parqueaderos (${Math.round((countAmarillo / totalSlots) * 100)}%)</span>
        </div>
        <div class="admin-sem-stat-bar-bg">
          <div class="admin-sem-stat-bar-fill amarillo" style="width: ${(countAmarillo / totalSlots) * 100}%;"></div>
        </div>
      </div>
      <div class="admin-sem-stat-row">
        <div class="admin-sem-stat-info">
          <span style="color:#dc2626;">🔴 Llenos / Saturados (0 libres)</span>
          <span>${countRojo} parqueaderos (${Math.round((countRojo / totalSlots) * 100)}%)</span>
        </div>
        <div class="admin-sem-stat-bar-bg">
          <div class="admin-sem-stat-bar-fill rojo" style="width: ${(countRojo / totalSlots) * 100}%;"></div>
        </div>
      </div>
    `;
  }

  // 3. Sectores en Vivo
  const sectorsContainer = $("admin-sectors-list");
  if (sectorsContainer) {
    sectorsContainer.innerHTML = dataRows.map(r => {
      const status = getAvailabilityStatus(r.free, r.capacidad);
      const occupied = r.capacidad - r.free;
      const pct = Math.round((occupied / r.capacidad) * 100);

      return `
        <div class="admin-sector-item">
          <span class="admin-sector-name" title="${htmlEscape(r.etiqueta)}">${htmlEscape(r.etiqueta)}</span>
          <div class="admin-sector-bar-bg">
            <div class="admin-sector-bar-fill" style="width: ${pct}%; background: ${status.color};"></div>
          </div>
          <span class="admin-sector-metrics">${occupied}/${r.capacidad} ocupadas</span>
          <span class="admin-sector-pct" style="color: ${status.color};">${pct}%</span>
        </div>
      `;
    }).join('');
  }

  // Actualizar Horarios Críticos y Ranking
  renderAdminCriticalHours(adminSelectedJornada);
  renderAdminRanking();

  // Timestamp de actualización
  const timeText = $("admin-footer-status-text");
  if (timeText) {
    timeText.textContent = `Telemetría sincronizada: ${new Date().toLocaleTimeString('es-EC')} (5 nodos activos)`;
  }
}

function exportAdminReport() {
  const now = new Date();
  const totalCap = dataRows.reduce((acc, r) => acc + r.capacidad, 0);
  const totalLibres = dataRows.reduce((acc, r) => acc + r.free, 0);
  const totalOcupadas = Math.max(0, totalCap - totalLibres);
  const pctOcupado = totalCap > 0 ? Math.round((totalOcupadas / totalCap) * 100) : 0;
  const turnoverTotal = sessionStats.entries + sessionStats.exits;

  let campusStatusLabel = "Normal / Disponible";
  let campusStatusColor = "#059669";
  let campusStatusBg = "#ecfdf5";
  if (pctOcupado >= 80) {
    campusStatusLabel = "Saturación Crítica";
    campusStatusColor = "#dc2626";
    campusStatusBg = "#fef2f2";
  } else if (pctOcupado >= 60) {
    campusStatusLabel = "Presión Media";
    campusStatusColor = "#d97706";
    campusStatusBg = "#fffbeb";
  }

  const countVerde = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'verde').length;
  const countAmarillo = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'amarillo').length;
  const countRojo = dataRows.filter(r => getAvailabilityStatus(r.free, r.capacidad).level === 'rojo').length;
  const totalSlots = dataRows.length || 1;

  const hours = historicalData?.horas_disponibles || [];
  const rankingList = dataRows.map(r => {
    const prof = historicalData?.perfiles_parqueaderos?.[r.id] || {};
    const curve = (adminSelectedJornada === 'sabado') ? (prof.curva_sabado || {}) : (prof.curva_laborable || {});
    let sum = 0, count = 0;
    for (const h of hours) {
      if (curve[h] !== undefined) {
        sum += curve[h];
        count++;
      }
    }
    const avgDailyPct = count > 0 ? Math.round(sum / count) : 50;
    const currentStatus = getAvailabilityStatus(r.free, r.capacidad);
    const turnover = sessionStats.perSlotTurnover[r.id] || { in: 0, out: 0 };
    return {
      ...r,
      avgDailyPct,
      peakHour: prof.pico_horario || 'N/A',
      sensitivity: prof.sensibilidad || 'Moderada',
      currentStatus,
      turnover
    };
  }).sort((a, b) => b.avgDailyPct - a.avgDailyPct);

  const jornadaNombre = (adminSelectedJornada === 'sabado') ? "Sábado Académico (Posgrados y Talleres)" : "Lunes a Viernes (Jornada Regular)";
  const fechaStr = now.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
  const horaStr = now.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const reportCode = `ESPOCH-SP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

  // Elemento temporal para el renderizado del PDF (en flujo normal para captura completa de html2canvas)
  const container = document.createElement('div');
  container.id = 'admin-pdf-render-area';
  container.style.cssText = 'width: 794px; background: #ffffff; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px 30px; box-sizing: border-box; font-size: 11px; margin: 0 auto;';

  container.innerHTML = `
    <!-- ENCABEZADO INSTITUCIONAL -->
    <table style="width: 100%; border-bottom: 2.5px solid #0b7490; padding-bottom: 12px; margin-bottom: 14px; border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top;">
          <div style="font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #0b7490; text-transform: uppercase;">ESCUELA SUPERIOR POLITÉCNICA DE CHIMBORAZO</div>
          <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 3px;">Facultad de Informática y Electrónica · Proyecto ESPOCH Pulse</div>
          <h1 style="font-size: 17px; font-weight: 900; color: #0f172a; margin: 0 0 2px;">INFORME EJECUTIVO DE OCUPACIÓN Y MOVILIDAD</h1>
          <div style="font-size: 10px; color: #475569;">Sistema de Monitoreo Inteligente de Parqueaderos (Smart Parking GIS)</div>
        </td>
        <td style="vertical-align: top; text-align: right; width: 220px;">
          <div style="font-size: 9.5px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; text-align: right;">
            <div><strong>Código:</strong> <span style="color:#0b7490; font-weight:700;">${reportCode}</span></div>
            <div><strong>Fecha:</strong> ${fechaStr} · ${horaStr}</div>
            <div><strong>Jornada:</strong> ${jornadaNombre}</div>
            <div><strong>Red de Sensores:</strong> 5 Nodos IoT Activos</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- RESUMEN EJECUTIVO (4 KPIS EN TABLA PARA COMPATIBILIDAD CON HTML2CANVAS) -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0; margin-bottom: 14px;">
      <tr>
        <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; vertical-align: top;">
          <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .5px;">Capacidad Total</div>
          <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 2px 0;">${totalCap} <span style="font-size: 11px; font-weight: 600; color: #64748b;">plazas</span></div>
          <div style="font-size: 9px; color: #64748b;">5 sectores monitoreados</div>
        </td>
        <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; vertical-align: top;">
          <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .5px;">Ocupación Actual</div>
          <div style="font-size: 20px; font-weight: 900; color: #0b7490; margin: 2px 0;">${pctOcupado}%</div>
          <div style="font-size: 9px; color: #64748b;">${totalOcupadas} ocupadas · ${totalLibres} libres</div>
        </td>
        <td style="width: 25%; background: ${campusStatusBg}; border: 1px solid ${campusStatusColor}40; border-radius: 8px; padding: 10px 12px; vertical-align: top;">
          <div style="font-size: 8.5px; font-weight: 800; color: ${campusStatusColor}; text-transform: uppercase; letter-spacing: .5px;">Estado General</div>
          <div style="font-size: 14px; font-weight: 900; color: ${campusStatusColor}; margin: 5px 0 2px;">${campusStatusLabel}</div>
          <div style="font-size: 8.5px; color: #475569;">${pctOcupado >= 80 ? 'Saturación en accesos' : pctOcupado >= 60 ? 'Carga vehicular moderada' : 'Fluidez garantizada'}</div>
        </td>
        <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; vertical-align: top;">
          <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .5px;">Rotación de Sesión</div>
          <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 2px 0;">${turnoverTotal} <span style="font-size: 11px; font-weight: 600; color: #64748b;">vehículos</span></div>
          <div style="font-size: 9px; color: #0284c7;">+${sessionStats.entries} entradas · -${sessionStats.exits} salidas</div>
        </td>
      </tr>
    </table>

    <!-- DISTRIBUCIÓN POR SEMÁFORO -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0; margin-bottom: 14px;">
      <tr>
        <td style="width: 33.3%; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 9px; font-weight: 700; color: #166534;">🟢 DISPONIBLES (&gt; 25% libres)</div>
          <div style="font-size: 12px; font-weight: 800; color: #14532d; margin-top: 2px;">${countVerde} de ${totalSlots} parqueaderos (${Math.round((countVerde / totalSlots) * 100)}%)</div>
        </td>
        <td style="width: 33.3%; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 9px; font-weight: 700; color: #92400e;">🟡 CASI LLENOS (≤ 25% o ≤ 2 libres)</div>
          <div style="font-size: 12px; font-weight: 800; color: #78350f; margin-top: 2px;">${countAmarillo} de ${totalSlots} parqueaderos (${Math.round((countAmarillo / totalSlots) * 100)}%)</div>
        </td>
        <td style="width: 33.3%; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 9px; font-weight: 700; color: #991b1b;">🔴 LLENOS / SATURADOS (0 libres)</div>
          <div style="font-size: 12px; font-weight: 800; color: #7f1d1d; margin-top: 2px;">${countRojo} de ${totalSlots} parqueaderos (${Math.round((countRojo / totalSlots) * 100)}%)</div>
        </td>
      </tr>
    </table>

    <!-- TABLA DETALLADA POR PARQUEADERO -->
    <div style="margin-bottom: 14px;">
      <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px; display: flex; justify-content: space-between;">
        <span>DETALLE POR SECTOR DE ESTACIONAMIENTO MONITOREADO</span>
        <span style="font-size: 9px; color: #64748b; font-weight: 600;">Ordenado por demanda histórica descendente</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: left;">
        <thead>
          <tr style="background: #0b7490; color: #ffffff;">
            <th style="padding: 6px 8px; border-radius: 4px 0 0 0;">#</th>
            <th style="padding: 6px 8px;">Sector / Nombre</th>
            <th style="padding: 6px 8px; text-align: center;">Capacidad</th>
            <th style="padding: 6px 8px; text-align: center;">Estado Actual</th>
            <th style="padding: 6px 8px; text-align: center;">Demanda Histórica</th>
            <th style="padding: 6px 8px;">Horario Pico</th>
            <th style="padding: 6px 8px; text-align: center;">Rotación</th>
            <th style="padding: 6px 8px; text-align: center;">Acceso / Perfiles</th>
            <th style="padding: 6px 8px; text-align: center; border-radius: 0 4px 0 0;">Semáforo</th>
          </tr>
        </thead>
        <tbody>
          ${rankingList.map((item, idx) => {
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const semPillColor = item.currentStatus.level === 'verde' ? '#166534' : item.currentStatus.level === 'amarillo' ? '#92400e' : '#991b1b';
    const semPillBg = item.currentStatus.level === 'verde' ? '#dcfce7' : item.currentStatus.level === 'amarillo' ? '#fef3c7' : '#fee2e2';
    return `
              <tr style="background: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; font-weight: 800; color: #0b7490;">${idx + 1}º</td>
                <td style="padding: 6px 8px;">
                  <strong style="color: #0f172a;">${htmlEscape(item.etiqueta)}</strong>
                  <br><span style="font-size: 8px; color: #64748b;">ID: ${item.id}</span>
                </td>
                <td style="padding: 6px 8px; text-align: center; font-weight: 700;">${item.capacidad}</td>
                <td style="padding: 6px 8px; text-align: center;">
                  <strong style="color: #0f172a;">${item.capacidad - item.free}</strong> ocupadas · <span style="color:#0b7490; font-weight:700;">${item.free} lib.</span>
                </td>
                <td style="padding: 6px 8px; text-align: center; font-weight: 800; color: ${item.avgDailyPct >= 75 ? '#dc2626' : item.avgDailyPct >= 55 ? '#d97706' : '#059669'};">
                  ${item.avgDailyPct}%
                </td>
                <td style="padding: 6px 8px; color: #334155;">${htmlEscape(item.peakHour)}</td>
                <td style="padding: 6px 8px; text-align: center; font-weight: 700; color: #0284c7;">+${item.turnover.in} / -${item.turnover.out}</td>
                <td style="padding: 6px 8px; text-align: center;">
                  <div>
                    ${(item.perfiles_permitidos || ["estudiante", "docente", "administrativo", "discapacidad"]).map(p => {
      const pInfo = PROFILE_INFO[p];
      return `<span style="display:inline-block; margin: 1px; padding: 1px 4px; border-radius: 4px; font-size: 7.5px; font-weight: 700; background: #e2e8f0; color: #334155;">${pInfo.icon} ${pInfo.name.split(' ')[0]}</span>`;
    }).join(' ')}
                  </div>
                  ${item.plazas_discapacidad ? `<div style="margin-top:2px; font-size:7.5px; font-weight:700; color:#0284c7;">♿ ${item.plazas_discapacidad} PCD</div>` : ''}
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                  <span style="display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 8.5px; font-weight: 800; color: ${semPillColor}; background: ${semPillBg};">
                    ${item.currentStatus.label}
                  </span>
                </td>
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>
    </div>

    <!-- ANÁLISIS DE FRANJAS HORARIAS CRÍTICAS -->
    <div style="margin-bottom: 12px;">
      <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">FRANJAS HORARIAS DE ATENCIÓN Y VULNERABILIDAD</div>
      <table style="width: 100%; border-collapse: separate; border-spacing: 10px 0;">
        <tr>
          <td style="width: 33.3%; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px; padding: 7px 10px; vertical-align: top;">
            <div style="font-size: 8px; font-weight: 800; color: #991b1b; text-transform: uppercase;">Pico Matutino Principal</div>
            <div style="font-size: 11px; font-weight: 900; color: #7f1d1d; margin: 1px 0;">07:00 (~86% - 90%)</div>
            <div style="font-size: 8.5px; color: #450a0a;">Ingreso al inicio de clases teóricas y laboratorios matutinos en FIE.</div>
          </td>
          <td style="width: 33.3%; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px; padding: 7px 10px; vertical-align: top;">
            <div style="font-size: 8px; font-weight: 800; color: #991b1b; text-transform: uppercase;">Pico Mediodía / Cambio</div>
            <div style="font-size: 11px; font-weight: 900; color: #7f1d1d; margin: 1px 0;">13:00 (~85% - 88%)</div>
            <div style="font-size: 8.5px; color: #450a0a;">Almuerzo y cambio masivo de turno entre estudiantes matutinos y vespertinos.</div>
          </td>
          <td style="width: 33.3%; background: #fffbeb; border-left: 3px solid #d97706; border-radius: 4px; padding: 7px 10px; vertical-align: top;">
            <div style="font-size: 8px; font-weight: 800; color: #92400e; text-transform: uppercase;">Pico Vespertino (Moderado)</div>
            <div style="font-size: 11px; font-weight: 900; color: #78350f; margin: 1px 0;">17:00 (~68% - 72%)</div>
            <div style="font-size: 8.5px; color: #451a03;">Salida regular de jornada laboral y talleres; flujo notable pero menor que a las 07:00 y 13:00.</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- DIRECTRICES Y RECOMENDACIÓN OPERATIVA -->
    <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 8px; padding: 9px 12px; margin-bottom: 14px;">
      <div style="font-size: 10px; font-weight: 800; color: #0369a1; margin-bottom: 2px;">DIRECTRICES OPERATIVAS PARA SEGURIDAD INSTITUCIONAL Y GARITAS:</div>
      <div style="font-size: 9px; color: #0c4a6e; line-height: 1.45;">
        Ante la saturación en los accesos de la Av. Canónigo Ramos (Garita Este) y transversal Shyris, se instruye canalizar de manera preventiva el flujo vehicular entrante hacia el <strong>Estacionamiento Software (50 plazas totales)</strong>, el cual actúa como el principal amortiguador de capacidad del campus FIE. Se recomienda alertar oportunamente a los conductores mediante la señalización digital del sistema Pulse Smart Parking.
      </div>
    </div>

    <!-- PIE INSTITUCIONAL -->
    <table style="width: 100%; border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 8px; color: #64748b;">
      <tr>
        <td>Plataforma Institucional ESPOCH Pulse · Demostración y Prototipo Académico GIS FIE</td>
        <td style="text-align: right;">Datos certificados por la red de telemetría IoT · Documento generado en tiempo real</td>
      </tr>
    </table>
  `;

  document.body.appendChild(container);

  const btn = $("btn-admin-export");
  const originalText = btn ? btn.innerHTML : "📄 Exportar PDF";
  if (btn) {
    btn.innerHTML = "⏳ Generando PDF...";
    btn.disabled = true;
  }

  // Generación con html2pdf
  if (typeof html2pdf !== 'undefined') {
    const opt = {
      margin: [6, 6, 6, 6],
      filename: `informe_smartparking_espoch_${now.toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      if (container.parentNode) container.parentNode.removeChild(container);
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
      showToastNotification({
        id: 'pdf-export-' + Date.now(),
        type: 'available',
        slotId: 'admin-export',
        slotName: 'Panel Administrativo',
        free: totalLibres,
        capacidad: totalCap,
        title: 'Reporte PDF Generado',
        message: 'Informe ejecutivo de ocupación descargado con éxito en formato PDF.',
        icon: '📄',
        timestamp: now.toTimeString().split(' ')[0]
      });
      logTelemetry("[Admin] Informe ejecutivo de ocupación exportado en PDF", 'system');
    }).catch(err => {
      console.error("html2pdf failed, using print fallback:", err);
      fallbackPrintWindow(container, reportCode);
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  } else {
    fallbackPrintWindow(container, reportCode);
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

function fallbackPrintWindow(container, reportCode) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Informe Smart Parking ESPOCH - ${reportCode}</title>
        <style>
          @page { size: A4; margin: 8mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 10px; color: #0f172a; }
          @media print {
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 15px; text-align: right;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #0b7490; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">🖨️ Guardar como PDF / Imprimir</button>
        </div>
        \${container.innerHTML}
        <script>
          setTimeout(() => { window.print(); }, 400);
        <\/script>
      </body>
      </html>
    `);
    win.document.close();
  }
  if (container.parentNode) container.parentNode.removeChild(container);
  logTelemetry("[Admin] Ventana de impresión de informe PDF desplegada", 'system');
}

function simulateAdminPeakHour() {
  if (!historicalData || !historicalData.perfiles_parqueaderos) return;
  const hour = "07:00";
  logTelemetry(`[Admin] Simulando escenario de Hora Pico Matutina (${hour} AM)...`, 'system');

  for (const r of dataRows) {
    const prof = historicalData.perfiles_parqueaderos[r.id];
    if (prof) {
      const curve = (adminSelectedJornada === 'sabado') ? prof.curva_sabado : prof.curva_laborable;
      const occPct = curve[hour] || 88;
      const oldFree = r.free;
      const occSlots = Math.round(r.capacidad * occPct / 100);
      r.free = Math.max(0, r.capacidad - occSlots);
      checkSlotAlerts(r, oldFree);
      syncSlotUI(r);
    }
  }

  update();

  showToastNotification({
    id: 'peak-sim-' + Date.now(),
    type: 'warning',
    slotId: 'peak-sim',
    slotName: 'Campus ESPOCH',
    free: dataRows.reduce((a, b) => a + b.free, 0),
    capacidad: dataRows.reduce((a, b) => a + b.capacidad, 0),
    title: 'Hora Pico Simulada (07:00)',
    message: 'Sensores ajustados a la curva histórica de máxima afluencia matutina.',
    icon: '⚡',
    timestamp: new Date().toTimeString().split(' ')[0]
  });
}

function initAdminPanelUI() {
  const modal = $("admin-modal");
  const btnOpenHeader = $("btn-open-admin");
  const btnOpenSidebar = $("btn-sidebar-admin");
  const btnClose = $("btn-close-admin");
  const btnCloseFooter = $("btn-close-admin-footer");
  const btnExport = $("btn-admin-export");
  const btnPeakSim = $("btn-admin-peak-sim");
  const selectJornada = $("admin-select-jornada");

  function openModal() {
    isAdminModalOpen = true;
    modal?.classList.remove("hidden");
    renderAdminDashboard();
    logTelemetry("[Admin] Panel Administrativo abierto", 'system');
  }

  function closeModal() {
    isAdminModalOpen = false;
    modal?.classList.add("hidden");
  }

  btnOpenHeader?.addEventListener("click", openModal);
  btnOpenSidebar?.addEventListener("click", openModal);
  btnClose?.addEventListener("click", closeModal);
  btnCloseFooter?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isAdminModalOpen) {
      closeModal();
    }
  });

  const tabBtns = [
    { btn: $("tab-admin-overview"), panel: $("admin-panel-overview") },
    { btn: $("tab-admin-hours"), panel: $("admin-panel-hours") },
    { btn: $("tab-admin-ranking"), panel: $("admin-panel-ranking") }
  ];

  tabBtns.forEach(({ btn, panel }) => {
    btn?.addEventListener("click", () => {
      tabBtns.forEach(t => {
        t.btn?.classList.remove("active");
        t.btn?.setAttribute("aria-selected", "false");
        t.panel?.classList.add("hidden");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      panel?.classList.remove("hidden");
      renderAdminDashboard();
    });
  });

  selectJornada?.addEventListener("change", (e) => {
    adminSelectedJornada = e.target.value;
    renderAdminCriticalHours(adminSelectedJornada);
    renderAdminRanking();
  });

  btnExport?.addEventListener("click", exportAdminReport);
  btnPeakSim?.addEventListener("click", simulateAdminPeakHour);
}

function update() {
  if (!map || !roadNodes.length) return;
  const dest = chosenDestination();
  if (!dest) return;
  const src = nearest(dest.center);
  const route = dijkstra(src.key);
  const minPlaces = Number($("plazas").value);
  $("plazas-valor").textContent = minPlaces;

  // Sincronizar perfil del conductor y banner informativo
  const perfilSelect = $("perfil-usuario");
  if (perfilSelect) {
    currentDriverProfile = perfilSelect.value || "todos";
  }
  const pMeta = PROFILE_INFO[currentDriverProfile] || PROFILE_INFO.todos;
  const banner = $("perfil-info-banner");
  if (banner) {
    if (currentDriverProfile === "todos") {
      banner.classList.add("hidden");
    } else {
      banner.classList.remove("hidden");
      banner.innerHTML = `<span class="icon">${pMeta.icon}</span><span class="text"><strong>Modo ${pMeta.name}:</strong> ${pMeta.desc}</span>`;
    }
  }

  // 1. Cálculo de tramo vehicular desde el conductor
  const driverSnap = nearest(driverLocation);
  const driverRoute = dijkstra(driverSnap.key);

  const calculated = dataRows.map(p => {
    const snap = nearest(p.center);
    const distanceWalk = route.dist.get(snap.key);
    const isConnectedWalk = Number.isFinite(distanceWalk);
    const distWalk = isConnectedWalk ? Math.round(distanceWalk + snap.dist + src.dist) : Infinity;

    // Distancia vehicular desde el conductor hasta este parqueadero
    const distanceVehRaw = driverRoute.dist.get(snap.key);
    const isConnectedVeh = Number.isFinite(distanceVehRaw);
    const distVeh = isConnectedVeh ? Math.round(distanceVehRaw + driverSnap.dist + snap.dist) : Infinity;

    // Si modo predictivo en mapa está activo, usamos la estimación histórica
    const pred = getPredictionForSlot(p.id, predHour, predDay);
    const effFree = predApplyMap ? pred.freeEstimated : p.free;
    const ratio = p.capacidad > 0 ? (effFree / p.capacidad) : 0;

    // Verificación de restricciones de acceso por perfil de usuario
    const isAllowed = isProfileAllowed(p, currentDriverProfile);
    const hasPcdQuota = Boolean(p.plazas_discapacidad && p.plazas_discapacidad > 0);
    const pcdQuota = p.plazas_discapacidad || 0;

    return {
      ...p,
      dist: distWalk,
      distVeh,
      effFree,
      ratio,
      pred,
      isAllowed,
      hasPcdQuota,
      pcdQuota,
      pathWalk: isConnectedWalk ? pathTo(route, snap.key, src.key) : null,
      pathVeh: isConnectedVeh ? (() => { const p = pathTo(driverRoute, snap.key, driverSnap.key); return p ? p.reverse() : null; })() : null,
      eligible: effFree >= minPlaces && isConnectedWalk && isConnectedVeh && isAllowed
    };
  });

  const valid = calculated.filter(c => c.eligible), maxDist = Math.max(1, ...valid.map(v => v.dist));
  const profile = $("prioridad").value;
  const weight = profile === 'cercania' ? .85 : profile === 'disponibilidad' ? .25 : .60;
  valid.forEach(p => {
    let baseScore = weight * (p.dist / maxDist) + (1 - weight) * (1 - p.ratio);
    // Para perfil de Personas con Discapacidad (PCD), bonificar parqueaderos con plazas reservadas PCD
    if (currentDriverProfile === 'discapacidad' && p.hasPcdQuota) {
      baseScore -= 0.35;
    }
    p.score = baseScore;
  });
  valid.sort((a, b) => a.score - b.score || a.dist - b.dist);

  $("total-libres").textContent = calculated.reduce((s, r) => s + r.effFree, 0);
  $("total-elegibles").textContent = valid.length;
  const tabCounter = $("tab-ranking-counter");
  if (tabCounter) tabCounter.textContent = valid.length;

  // Sincronizar marcador del vehículo del conductor
  if (driverMarker) {
    driverMarker.setLatLng([driverLocation[1], driverLocation[0]]);
  }

  // ── RUTAS EN EL MAPA (MULTIMODAL: AUTO + A PIE) ──
  if (vehicleRouteLayer) vehicleRouteLayer.clearLayers();
  if (routeLayer) routeLayer.clearLayers();

  let carDistDisplay = "—";
  let walkDistDisplay = "—";
  let etaDisplay = "—";
  let driverOriginName = getDriverOriginName();

  if (valid.length) {
    const recommended = valid[0];

    // Tiempos estimados (Vehicular a 25 km/h = 416 m/min, Peatonal a 4.5 km/h = 75 m/min)
    const drivingTimeMin = Math.max(1, Math.round(recommended.distVeh / 416));
    const walkingTimeMin = Math.max(1, Math.round(recommended.dist / 75));
    const totalEtaMin = drivingTimeMin + walkingTimeMin;

    carDistDisplay = `${recommended.distVeh} m (${drivingTimeMin} min)`;
    walkDistDisplay = `${recommended.dist} m (${walkingTimeMin} min)`;
    etaDisplay = `${totalEtaMin} min total`;

    // 1. Tramo vehicular (Azul rey vibrante)
    if (vehicleRouteLayer && recommended.pathVeh) {
      const vehCoords = recommended.pathVeh.map(c => [c[1], c[0]]);
      L.polyline(vehCoords, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.94,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(vehicleRouteLayer);

      // Conector punteado desde el auto al nodo
      L.polyline([[driverLocation[1], driverLocation[0]], vehCoords[0]], {
        color: '#2563eb',
        weight: 3,
        dashArray: '5 6',
        opacity: 0.85
      }).addTo(vehicleRouteLayer);

      // Conector punteado desde el nodo al centro del parqueadero
      L.polyline([vehCoords.at(-1), [recommended.center[1], recommended.center[0]]], {
        color: '#2563eb',
        weight: 3,
        dashArray: '5 6',
        opacity: 0.85
      }).addTo(vehicleRouteLayer);
    }

    // 2. Tramo peatonal (Verde azulado / Teal discontinuo)
    if (routeLayer && recommended.pathWalk) {
      const walkCoords = recommended.pathWalk.map(c => [c[1], c[0]]);
      L.polyline(walkCoords, {
        color: '#0d9488',
        weight: 4.5,
        dashArray: '6 8',
        opacity: 0.95
      }).addTo(routeLayer);

      L.polyline([[recommended.center[1], recommended.center[0]], walkCoords[0]], {
        color: '#0d9488',
        weight: 2.5,
        dashArray: '4 5',
        opacity: 0.85
      }).addTo(routeLayer);

      L.polyline([walkCoords.at(-1), [dest.center[1], dest.center[0]]], {
        color: '#0d9488',
        weight: 2.5,
        dashArray: '4 5',
        opacity: 0.85
      }).addTo(routeLayer);
    }

    // Actualizar barra de instrucciones (secuencia vertical de pasos)
    const elInstruction = $("nav-instruction-text");
    if (elInstruction) {
      elInstruction.innerHTML = `
        <div class="nav-step-item step-vehicular">
          <span class="nav-step-badge vehicular">🚗 Paso 1</span>
          <span class="nav-step-content">Conducir <strong>${recommended.distVeh} m (${drivingTimeMin} min)</strong> desde <em>${htmlEscape(driverOriginName)}</em> hasta <strong>${htmlEscape(recommended.etiqueta)}</strong>.</span>
        </div>
        <div class="nav-step-item step-pedestrian">
          <span class="nav-step-badge pedestrian">🚶 Paso 2</span>
          <span class="nav-step-content">Caminar <strong>${recommended.dist} m (${walkingTimeMin} min)</strong> desde el parqueadero hasta <strong>${htmlEscape(dest.name)}</strong>.</span>
        </div>
      `;
    }
  } else {
    const elInstruction = $("nav-instruction-text");
    if (elInstruction) {
      elInstruction.innerHTML = `<div class="nav-step-empty">⚠️ Sin opciones elegibles de parqueo desde la ubicación actual para los criterios seleccionados.</div>`;
    }
  }

  // Actualizar métricas de navegación en la cabecera del mapa
  const elDistCar = $("nav-dist-car");
  if (elDistCar) elDistCar.textContent = carDistDisplay;
  const elDistWalk = $("nav-dist-walk");
  if (elDistWalk) elDistWalk.textContent = walkDistDisplay;
  const elTotalTime = $("nav-total-time");
  if (elTotalTime) elTotalTime.textContent = etaDisplay;

  // ── RECOMENDACIÓN DESTACADA ──
  const rec = $("recommendation");
  if (valid.length) {
    const p = valid[0];
    const status = getAvailabilityStatus(p.effFree, p.capacidad);
    const modeBadge = predApplyMap
      ? `<span class="pred-badge-ai" style="margin-right: 6px;">🔮 PRONÓSTICO ACTIVO (${predHour})</span>`
      : '';

    const accessBadge = (currentDriverProfile !== "todos")
      ? `<span class="badge-access-status allowed">✅ Acreditado (${pMeta.name})</span>`
      : '';
    const pcdNotice = (currentDriverProfile === 'discapacidad' && p.hasPcdQuota)
      ? `<span class="badge-pcd-quota" style="font-weight:700;">♿ ${p.pcdQuota} Plazas Reservadas PCD</span>`
      : (p.hasPcdQuota ? `<span class="badge-pcd-quota">♿ ${p.pcdQuota} PCD</span>` : '');

    rec.innerHTML = `
      <div class="rec-title">${modeBadge}NAVEGACIÓN INTELIGENTE · ESTACIONAMIENTO RECOMENDADO</div>
      <div class="rec-main">${htmlEscape(p.etiqueta)}</div>
      <div class="rec-details">
        <span class="semaforo-pill ${status.level}"><span class="semaforo-indicator-dot"></span>${status.label} (${p.effFree} plazas)</span>
        ${accessBadge}
        ${pcdNotice}
        <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight:700;">🚗 ${p.distVeh} m en auto desde tu origen</span>
        <span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight:700;">🚶 ${p.dist} m a pie hasta destino</span>
        <span class="pred-risk-badge ${p.pred.riskLevel}" style="font-size: 11px;">🔮 Pronóstico ${predHour}: ${p.pred.pct}% ocupado (${p.pred.riskLabel})</span>
      </div>
      <p>Ruta multimodal trazada en el mapa: <strong>Tramo vehicular en azul continuo</strong> hasta el parqueadero + <strong>tramo peatonal en verde punteado</strong> hasta ${htmlEscape(dest.name)}. ${currentDriverProfile === 'discapacidad' ? '<strong>♿ Acceso prioritario:</strong> Ruta directa con rampas peatonales hacia el destino.' : ''} ${htmlEscape(p.pred.recommendation)}</p>`;
  } else {
    const hasDisallowedWithSpaces = calculated.some(c => !c.isAllowed && c.effFree >= minPlaces);
    rec.innerHTML = `
      <div class="rec-title">SIN ALTERNATIVAS ELEGIBLES</div>
      <div class="rec-main">No hay parqueaderos recomendables en este escenario</div>
      <p>${hasDisallowedWithSpaces
        ? `Existen parqueaderos con plazas libres, pero su <strong>acceso está restringido para el perfil ${pMeta.name}</strong> según las políticas de acreditación vehicular de la ESPOCH.`
        : 'Se descartaron por saturación según el escenario evaluado o por ausencia de conexión en la red GIS.'}</p>`;
  }

  // ── RANKING DE ALTERNATIVAS ──
  $("ranking").innerHTML = valid.map((p, i) => {
    const status = getAvailabilityStatus(p.effFree, p.capacidad);
    const pcdTag = p.hasPcdQuota ? `<span class="badge-pcd-quota">♿ ${p.pcdQuota} PCD</span>` : '';
    const allowedTag = (currentDriverProfile !== "todos") ? `<span class="badge-access-status allowed">✅ Autorizado</span>` : '';
    return `<div class="rankrow ${currentDriverProfile === 'discapacidad' && p.hasPcdQuota ? 'pcd-priority' : ''}">
      <div>
        <strong><span class="rankno">${i + 1}.</span>${htmlEscape(p.etiqueta)}</strong>
        <small>🚗 ${p.distVeh} m en auto · 🚶 ${p.dist} m a pie · ${p.effFree}/${p.capacidad} plazas libres · Pronóstico: ${p.pred.pct}% ocupado</small>
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap: wrap;">
        ${pcdTag}
        ${allowedTag}
        <span class="pred-risk-badge ${p.pred.riskLevel}" style="font-size: 10px;">${p.pred.riskLabel}</span>
        <span class="semaforo-pill ${status.level}"><span class="semaforo-indicator-dot"></span>${status.label}</span>
        <span class="badge">${i === 0 ? 'Recomendado' : 'Alternativa'}</span>
      </div>
    </div>`;
  }).join('') +
    calculated.filter(r => !r.eligible).map(p => {
      const status = getAvailabilityStatus(p.effFree, p.capacidad);
      const isRestrictedByProfile = !p.isAllowed;
      let reasonText = '';
      let badgeHtml = '';

      if (isRestrictedByProfile) {
        reasonText = `🔒 Restringido para perfil ${pMeta.name} (${htmlEscape(p.descripcion_acceso || 'Acceso restringido')})`;
        badgeHtml = `<span class="badge-access-status restricted">🚫 Restringido</span>`;
      } else if (p.effFree < minPlaces) {
        reasonText = 'Saturado / Sin plazas suficientes';
        badgeHtml = `<span class="badge disabled">No elegible</span>`;
      } else {
        reasonText = 'Red vial/peatonal sin conexión';
        badgeHtml = `<span class="badge disabled">No elegible</span>`;
      }

      return `<div class="rankrow ${isRestrictedByProfile ? 'restricted-slot' : ''}">
      <div>
        <strong>${htmlEscape(p.etiqueta)}</strong>
        <small>${reasonText}</small>
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap: wrap;">
        ${p.hasPcdQuota ? `<span class="badge-pcd-quota">♿ ${p.pcdQuota} PCD</span>` : ''}
        ${badgeHtml}
        <span class="pred-risk-badge ${p.pred.riskLevel}" style="font-size: 10px;">${p.pred.riskLabel}</span>
        <span class="semaforo-pill ${status.level}"><span class="semaforo-indicator-dot"></span>${status.label}</span>
      </div>
    </div>`;
    }).join('');

  if (destMarker) {
    destMarker.setLatLng([dest.center[1], dest.center[0]]).bindPopup(`<strong>Destino: ${htmlEscape(dest.name)}</strong>`);
  }

  // ── CAPA DE PARQUEADEROS CON SEMÁFORO Y DETALLES DE NAVEGACIÓN ──
  if (parkLayer) {
    parkLayer.clearLayers();
    parkingLayersMap.clear();
    for (const p of calculated) {
      const f = p.feature;
      const status = getAvailabilityStatus(p.effFree, p.capacidad);
      const isBest = valid.length > 0 && valid[0].id === p.id;
      const isRestricted = !p.isAllowed;

      const layer = L.geoJSON(f, {
        style: {
          color: isRestricted ? '#94a3b8' : (isBest ? '#2563eb' : status.strokeColor),
          weight: isBest ? 3.5 : (isRestricted ? 2 : 2.5),
          fillColor: isRestricted ? '#cbd5e1' : status.color,
          fillOpacity: isRestricted ? 0.25 : status.fillOpacity,
          dashArray: isRestricted ? '5 5' : null
        },
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: isBest ? 12 : 10,
          color: isRestricted ? '#94a3b8' : (isBest ? '#1d4ed8' : status.strokeColor),
          weight: 2.5,
          fillColor: isRestricted ? '#cbd5e1' : status.color,
          fillOpacity: isRestricted ? 0.4 : 0.95
        })
      });

      const allowedBadgesMini = (p.perfiles_permitidos || ["estudiante", "docente", "administrativo", "discapacidad"]).map(perf => {
        const info = PROFILE_INFO[perf];
        return `<span class="access-badge ${perf}" style="font-size:9.5px; padding:2px 6px;">${info.icon} ${info.name.split(' ')[0]}</span>`;
      }).join('');

      const pcdBadgeMini = p.hasPcdQuota ? `<span class="badge-pcd-quota" style="font-size:9.5px; padding:2px 6px;">♿ ${p.pcdQuota} PCD</span>` : '';

      const restrictionNotice = (currentDriverProfile !== "todos")
        ? (p.isAllowed
          ? `<div style="margin-top:6px; font-size:11px; color:#15803d; font-weight:700;">✅ Autorizado para perfil ${pMeta.name}</div>`
          : `<div style="margin-top:6px; font-size:11px; color:#b91c1c; font-weight:700; background:#fef2f2; padding:3px 6px; border-radius:4px; border:1px solid #fecaca;">🔒 Acceso restringido para ${pMeta.name} (${htmlEscape(p.descripcion_acceso || 'Sin acreditación')})</div>`)
        : `<div style="margin-top:6px; font-size:11px; color:#475569;"><strong>Acceso:</strong> ${htmlEscape(p.descripcion_acceso || 'Uso institucional')}</div>`;

      layer.bindPopup(`
        <div style="font-family: inherit; min-width: 220px;">
          <strong style="font-size: 13.5px; color: #0d1f2d; display:block; margin-bottom: 5px;">${htmlEscape(p.etiqueta)}</strong>
          <div style="margin: 5px 0 8px; display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
            <span class="semaforo-pill ${status.level}"><span class="semaforo-indicator-dot"></span>${status.label}</span>
            <span class="pred-risk-badge ${p.pred.riskLevel}">${p.pred.riskLabel}</span>
          </div>
          <div style="margin: 4px 0 7px; display:flex; gap:4px; flex-wrap:wrap;">
            ${allowedBadgesMini}
            ${pcdBadgeMini}
          </div>
          ${restrictionNotice}
          <div style="font-size: 12px; color: #2e4a60; line-height: 1.55; margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 5px;">
            <strong>Ruta desde tu vehículo:</strong> ≈ ${p.distVeh} m en auto<br>
            <strong>Caminata a destino:</strong> ≈ ${p.dist} m a pie<br>
            <strong>Disponibilidad:</strong> ${p.effFree} libres de ${p.capacidad} total<br>
            <strong>Pronóstico (${predHour}):</strong> ${p.pred.pct}% ocupación esperada<br>
            <span style="font-size: 11px; color: #607d8e;">Horario pico: ${htmlEscape(p.pred.peakHours)}</span>
          </div>
        </div>
      `);

      layer.bindTooltip(`<strong>${htmlEscape(p.etiqueta)}</strong>: <span style="font-weight:700; color:${status.color};">${status.label} (${p.effFree}/${p.capacidad})</span>${!p.isAllowed ? ' <strong style="color:#dc2626;">[🔒 Restringido]</strong>' : ''}<br><small style="color:#2563eb;">🚗 ~${p.distVeh}m auto</small> · <small style="color:#0d9488;">🚶 ${p.dist}m a pie</small>`, {
        direction: 'top',
        sticky: true
      });

      layer.addTo(parkLayer);
      parkingLayersMap.set(p.id, layer);
    }
  }

  // Refrescar panel administrativo en vivo si está abierto
  if (isAdminModalOpen) {
    renderAdminDashboard();
  }
}

async function load() {
  try {
    const [apiOcc, apiHist] = await Promise.all([
      fetch('/api/parking'),
      fetch('/api/parking/historical')
    ]);

    if (!apiOcc.ok || !apiHist.ok) {
      throw new Error(`Error consultando la base de datos SQLite (/api/parking: ${apiOcc.status}, /api/parking/historical: ${apiHist.status})`);
    }

    const occ = await apiOcc.json();
    const histJson = await apiHist.json();

    updateDbStatusUI(true, 'SQLite');

    const [ps, vs, bs] = await Promise.all([
      fetch(ROOT + 'processed/parqueaderos.geojson'),
      fetch(ROOT + 'base/vias.geojson'),
      fetch(ROOT + 'base/edificios.geojson')
    ]);
    if (!ps.ok || !vs.ok || !bs.ok) throw new Error('Falta uno de los archivos GeoJSON en la carpeta data.');
    const [parkJson, roads, buildingsGeo] = await Promise.all([ps.json(), vs.json(), bs.json()]);
    historicalData = histJson;

    buildGraph(roads);
    buildings = BUILDINGS_CONFIG.map(cfg => {
      const feat = buildingsGeo.features.find(f => Number(f.properties?.osm_id) === cfg.osm_id);
      return {
        id: cfg.id,
        name: cfg.name,
        osm_id: cfg.osm_id,
        feature: feat,
        center: feat ? center(feat) : null
      };
    }).filter(b => b.center);

    if (buildings.length === 0) throw new Error('No se pudieron vincular los edificios del campus.');

    dataRows = occ.parqueaderos.map(p => {
      const feature = parkJson.features.find(f => Number(f.properties.osm_id) === p.osm_id);
      const freeSlots = (typeof p.libres_actuales === 'number') ? p.libres_actuales : p.libres_iniciales;
      return { ...p, feature, center: feature && center(feature), free: freeSlots };
    }).filter(p => p.feature && p.center);

    // Inicializar rotación de sesión para cada parqueadero
    for (const r of dataRows) {
      sessionStats.perSlotTurnover[r.id] = { in: 0, out: 0 };
    }

    if (dataRows.length < 2) throw new Error('No se pudieron vincular los polígonos del escenario con las capas OSM.');
    initialRows = dataRows.map(r => ({ id: r.id, free: r.free }));

    if (typeof L === 'undefined') throw new Error('No se cargó Leaflet: comprueba la conexión a Internet.');

    map = L.map('map', { scrollWheelZoom: true }).setView([-1.6564, -78.6771], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '© OpenStreetMap contributors' }).addTo(map);
    L.geoJSON(buildingsGeo, {
      style: { color: '#2d6d8f', weight: 1.5, fillOpacity: .18, fillColor: '#78b5d3' },
      filter: f => BUILDINGS_CONFIG.some(b => b.osm_id === Number(f.properties?.osm_id)),
      onEachFeature: (feature, layer) => {
        const cfg = BUILDINGS_CONFIG.find(b => b.osm_id === Number(feature.properties?.osm_id));
        if (cfg) {
          layer.bindTooltip(`<strong>${cfg.name}</strong>`, { direction: 'top', sticky: true });
        }
      }
    }).addTo(map);

    vehicleRouteLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    parkLayer = L.layerGroup().addTo(map);
    destMarker = L.circleMarker([buildings[0].center[1], buildings[0].center[0]], { radius: 10, weight: 3, color: '#102f42', fillColor: '#e9d56b', fillOpacity: 1 }).addTo(map);

    initDriverMarker();

    const totalEl = $("total-parking");
    if (totalEl) totalEl.textContent = dataRows.length;

    initAlertStates();
    initAlertSystemUI();
    updateAlertHistoryUI();

    renderControls();
    initTabs();
    initSidebarNav();
    initMainViewTabs();
    initAdminPanelUI();
    renderPredictionSection();
    update();
    logTelemetry(`[Sistema] Red IoT inicializada con ${dataRows.length} parqueaderos activos`, 'system');

    // Escuchador del selector de origen del conductor
    $("origen")?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val !== "custom" && DRIVER_ENTRANCES[val]) {
        const ent = DRIVER_ENTRANCES[val];
        driverLocation = [ent.coord[0], ent.coord[1]];
        if (driverMarker) {
          driverMarker.setLatLng([driverLocation[1], driverLocation[0]]);
          map?.panTo([driverLocation[1], driverLocation[0]]);
        }
        logTelemetry(`[Navegación] Origen del conductor establecido en: ${ent.name}`, 'system');
        update();
      }
    });

    $("btn-recenter-driver")?.addEventListener('click', () => {
      if (map) {
        map.setView([driverLocation[1], driverLocation[0]], 17);
        if (driverMarker) driverMarker.openPopup();
      }
    });

    $("btn-show-map-mobile")?.addEventListener('click', () => {
      const mapEl = $("map");
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { if (map) map.invalidateSize(); }, 350);
      }
    });

    $("btn-scroll-route-mobile")?.addEventListener('click', () => {
      const sidebarEl = document.querySelector(".sidebar");
      if (sidebarEl) sidebarEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    let windowResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(windowResizeTimer);
      windowResizeTimer = setTimeout(() => {
        if (map) map.invalidateSize();
      }, 150);
    });

    for (const name of ['destino', 'prioridad']) {
      $(name)?.addEventListener('change', update);
    }
    $("plazas")?.addEventListener('input', update);

    // Escuchador de selección de Perfil de Conductor / Restricciones
    $("perfil-usuario")?.addEventListener('change', (e) => {
      currentDriverProfile = e.target.value;
      const pInfo = PROFILE_INFO[currentDriverProfile] || PROFILE_INFO.todos;
      logTelemetry(`[Acceso] Perfil de usuario seleccionado: ${pInfo.name}`, 'system');
      renderControls();
      update();
    });

    $("reset")?.addEventListener('click', () => {
      stopAutoSimulation(true);
      if (isDbConnected) {
        fetch('/api/parking/reset', { method: 'POST' }).catch(() => {});
        logTelemetry('[SQLite] Plazas de parqueaderos restablecidas en la base de datos', 'system');
      }
      for (const r of dataRows) {
        const init = initialRows.find(v => v.id === r.id);
        if (init) r.free = init.free;
        syncSlotUI(r);
      }
      predHour = "07:00";
      predDay = "laborable";
      predApplyMap = false;
      const chkMap = $("pred-apply-map");
      if (chkMap) chkMap.checked = false;
      const selHour = $("pred-hora-select");
      if (selHour) selHour.value = "07:00";
      const selDay = $("pred-dia-select");
      if (selDay) selDay.value = "laborable";

      driverLocation = [-78.6741285, -1.6539158];
      const origenSelect = $("origen");
      if (origenSelect) origenSelect.value = "puerta_posterior";
      if (driverMarker) driverMarker.setLatLng([driverLocation[1], driverLocation[0]]);

      // Resetear perfil de conductor
      currentDriverProfile = "todos";
      const perfilSelect = $("perfil-usuario");
      if (perfilSelect) perfilSelect.value = "todos";
      const banner = $("perfil-info-banner");
      if (banner) banner.classList.add("hidden");

      const destSelect = $("destino");
      if (destSelect && destSelect.options.length) destSelect.value = destSelect.options[0].value;
      const prioSelect = $("prioridad");
      if (prioSelect) prioSelect.value = 'equilibrado';
      const plazasInput = $("plazas");
      if (plazasInput) plazasInput.value = 1;

      // Resetear alertas
      alertHistory = [];
      unreadAlertCount = 0;
      updateAlertHistoryUI();
      const toastCont = $("alert-toast-container");
      if (toastCont) toastCont.replaceChildren();
      initAlertStates();

      // Resetear estadísticas de sesión del panel administrativo
      sessionStats = {
        entries: 0,
        exits: 0,
        perSlotTurnover: {}
      };
      for (const r of dataRows) {
        sessionStats.perSlotTurnover[r.id] = { in: 0, out: 0 };
      }
      if (isAdminModalOpen) renderAdminDashboard();

      renderControls();
      renderPredictionSection();
      map?.setView([-1.6564, -78.6771], 17);
      logTelemetry("[Sistema] Escenario restaurado a valores iniciales", 'system');
      update();
    });

  } catch (e) {
    console.error(e);
    $("recommendation").innerHTML = '<strong>Error al iniciar la demostración:</strong> ' + htmlEscape(e.message);
  }
}

document.addEventListener('DOMContentLoaded', load);
