"use strict";

function escaparTexto(valor) {
  const entidades = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => entidades[caracter]);
}

function normalizarReporte(feature) {
  const coordenadas = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "Point" || !Array.isArray(coordenadas) ||
      !Number.isFinite(coordenadas[0]) || !Number.isFinite(coordenadas[1]) ||
      Math.abs(coordenadas[0]) > 180 || Math.abs(coordenadas[1]) > 90) return null;
  const datos = feature.properties || {};
  const categorias = {
    "Iluminación": "iluminacion", "Limpieza": "limpieza", "Infraestructura": "infraestructura",
    "Seguridad": "seguridad", "Accesibilidad": "accesibilidad", "Movilidad": "movilidad",
    "Áreas verdes": "areas_verdes", "Otro": "otro"
  };
  const categoria = datos.category ?? datos.categoria;
  const lugar = datos.lugar || datos.location || datos.zona || "Ubicación reportada por GPS";
  return {
    type: "Feature", geometry: feature.geometry,
    properties: {
      id: datos.id, titulo: `Reporte demostrativo: ${lugar}`,
      categoria: categorias[categoria] || categoria,
      descripcion: datos.description ?? datos.descripcion ?? "",
      estado: "nuevo", prioridad: "sin_clasificar",
      fecha_reporte: datos.createdAt ?? datos.fecha_reporte,
      reportes: 1, origen: datos.qr ? "qr" : "gps_web",
      zona: datos.zona || lugar, es_simulado: true, reporte_demostrativo: true
    }
  };
}

async function iniciarMapa() {
  try {
    if (typeof L === "undefined") {
      throw new Error("No se pudo cargar Leaflet desde el CDN. Revisa la conexión a Internet.");
    }

    const map = L.map("map");
    map.createPane("areasVerdes");
    map.getPane("areasVerdes").style.zIndex = 400;
    map.createPane("vias");
    map.getPane("vias").style.zIndex = 405;
    map.createPane("parqueaderos");
    map.getPane("parqueaderos").style.zIndex = 407;
    map.createPane("edificios");
    map.getPane("edificios").style.zIndex = 410;
    map.createPane("servicios");
    map.getPane("servicios").style.zIndex = 415;
    map.createPane("limiteCampus");
    map.getPane("limiteCampus").style.zIndex = 420;
    map.createPane("qr");
    map.getPane("qr").style.zIndex = 425;
    map.createPane("zonaPrioritaria");
    map.getPane("zonaPrioritaria").style.zIndex = 428;
    map.createPane("incidencias");
    map.getPane("incidencias").style.zIndex = 430;
    map.createPane("rutas");
    map.getPane("rutas").style.zIndex = 432;
    map.createPane("accesibilidad");
    map.getPane("accesibilidad").style.zIndex = 435;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const response = await fetch("../data/base/campus.geojson");
    if (!response.ok) {
      throw new Error(`No se pudo cargar campus.geojson: HTTP ${response.status}.`);
    }

    const campus = L.geoJSON(await response.json(), {
      pane: "limiteCampus",
      style: {
        color: "#176b45",
        weight: 3,
        fillColor: "#36a269",
        fillOpacity: 0
      }
    });

    const bounds = campus.getBounds();
    if (!bounds.isValid()) {
      throw new Error("campus.geojson no contiene un límite válido para ajustar el mapa.");
    }

    campus.addTo(map);
    map.fitBounds(bounds, { padding: [24, 24] });
    const overlays = {};

    try {
      const edificiosResponse = await fetch("../data/base/edificios.geojson");
      if (!edificiosResponse.ok) {
        throw new Error(`No se pudo cargar edificios.geojson: HTTP ${edificiosResponse.status}.`);
      }

      overlays["Edificios"] = L.geoJSON(await edificiosResponse.json(), {
        pane: "edificios",
        style: {
          color: "#705333",
          weight: 1,
          fillColor: "#ce9854",
          fillOpacity: 0.8
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de edificios.", error);
    }

    try {
      const viasResponse = await fetch("../data/base/vias.geojson");
      if (!viasResponse.ok) {
        throw new Error(`No se pudo cargar vias.geojson: HTTP ${viasResponse.status}.`);
      }

      overlays["Vías y senderos"] = L.geoJSON(await viasResponse.json(), {
        pane: "vias",
        style: {
          color: "#526b80",
          weight: 2,
          opacity: 0.75
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de vías.", error);
    }

    try {
      const areasVerdesResponse = await fetch("../data/base/areas_verdes.geojson");
      if (!areasVerdesResponse.ok) {
        throw new Error(`No se pudo cargar areas_verdes.geojson: HTTP ${areasVerdesResponse.status}.`);
      }

      overlays["Áreas verdes"] = L.geoJSON(await areasVerdesResponse.json(), {
        pane: "areasVerdes",
        style: {
          color: "#6b9568",
          weight: 1,
          opacity: 0.7,
          fillColor: "#91c788",
          fillOpacity: 0.35
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de áreas verdes.", error);
    }

    try {
      const parqueaderosResponse = await fetch("../data/processed/parqueaderos.geojson");
      if (!parqueaderosResponse.ok) {
        throw new Error(`No se pudo cargar parqueaderos.geojson: HTTP ${parqueaderosResponse.status}.`);
      }

      overlays["Parqueaderos"] = L.geoJSON(await parqueaderosResponse.json(), {
        pane: "parqueaderos",
        style: (feature) => ({
          color: "#596d7c",
          weight: 1,
          opacity: 0.85,
          fillColor: "#94a7b5",
          fillOpacity: feature.geometry.type === "Point" ? 0.8 : 0.4
        }),
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: "parqueaderos",
          radius: 4
        })
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de parqueaderos.", error);
    }

    try {
      const serviciosResponse = await fetch("../data/processed/servicios.geojson");
      if (!serviciosResponse.ok) {
        throw new Error(`No se pudo cargar servicios.geojson: HTTP ${serviciosResponse.status}.`);
      }

      overlays["Servicios"] = L.geoJSON(await serviciosResponse.json(), {
        pane: "servicios",
        style: (feature) => ({
          color: "#79539a",
          weight: 2,
          opacity: 0.9,
          fillColor: "#9973b8",
          fillOpacity: feature.geometry.type === "Point" ? 0.85 : 0.12
        }),
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: "servicios",
          radius: 4
        })
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de servicios.", error);
    }

    try {
      const incidenciasResponse = await fetch("../data/simulated/incidencias.geojson");
      if (!incidenciasResponse.ok) {
        throw new Error(`No se pudo cargar incidencias.geojson: HTTP ${incidenciasResponse.status}.`);
      }

      const incidenciasIniciales = await incidenciasResponse.json();
      let reportes = [];
      try {
        const responseReportes = await fetch("/api/reports?format=geojson", { cache: "no-store" }).catch(() => null);
        if (responseReportes && responseReportes.ok) {
          const recibidos = await responseReportes.json();
          if (recibidos.type === "FeatureCollection" && Array.isArray(recibidos.features)) {
            reportes = recibidos.features.map(normalizarReporte).filter(Boolean);
          }
        }
      } catch (error) {
        console.error("ESPOCH Pulse: no se pudieron incorporar los reportes recibidos desde SQLite.", error);
      }
      // Colección compartida por puntos, indicadores, filtros y análisis; no altera las fuentes.
      const incidenciasDatos = {
        type: "FeatureCollection",
        features: [...incidenciasIniciales.features, ...reportes]
      };
      const conteos = { nuevo: 0, en_atencion: 0, resuelto: 0 };
      for (const feature of incidenciasDatos.features) {
        const estado = feature.properties.estado;
        if (Object.hasOwn(conteos, estado)) conteos[estado] += 1;
      }
      document.getElementById("pulso-total").textContent = incidenciasDatos.features.length;
      document.getElementById("pulso-nuevas").textContent = conteos.nuevo;
      document.getElementById("pulso-atencion").textContent = conteos.en_atencion;
      document.getElementById("pulso-resueltas").textContent = conteos.resuelto;

      const coloresEstado = {
        nuevo: "#dc2626",
        en_atencion: "#f59e0b",
        resuelto: "#16a34a"
      };

      const etiquetasIncidencia = {
        iluminacion: "Iluminación", limpieza: "Limpieza", infraestructura: "Infraestructura",
        seguridad: "Seguridad", accesibilidad: "Accesibilidad", movilidad: "Movilidad", areas_verdes: "Áreas verdes", otro: "Otro",
        nuevo: "Nuevo", en_atencion: "En atención", resuelto: "Resuelto",
        baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica", sin_clasificar: "Sin clasificar",
        qr: "QR", web: "Web", movil: "Móvil"
      };
      const formatoFecha = new Intl.DateTimeFormat("es-EC", {
        timeZone: "America/Guayaquil",
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      });

      const incidenciasLayer = L.geoJSON(incidenciasDatos, {
        pane: "incidencias",
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: "incidencias",
          radius: 6,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillColor: coloresEstado[feature.properties.estado],
          fillOpacity: 0.95
        }),
        onEachFeature: (feature, layer) => {
          const datos = feature.properties;
          const etiqueta = (valor) => Object.hasOwn(etiquetasIncidencia, valor)
            ? etiquetasIncidencia[valor] : valor;
          const fecha = new Date(datos.fecha_reporte);
          const filas = [
            ["Categoría", etiqueta(datos.categoria)],
            ["Estado", etiqueta(datos.estado)],
            ["Prioridad", etiqueta(datos.prioridad)],
            ["Zona", datos.zona],
            ["Reportes", datos.reportes],
            ["Fecha", Number.isNaN(fecha.getTime()) ? datos.fecha_reporte : formatoFecha.format(fecha)],
            ["Origen", datos.reporte_demostrativo
              ? (datos.origen === "qr" ? "Reporte mediante QR" : "Reporte mediante ubicación actual")
              : etiqueta(datos.origen)]
          ];
          layer.bindPopup(
            `<strong>${escaparTexto(datos.titulo)}</strong>` +
            `<p><strong>${escaparTexto(datos.reporte_demostrativo
              ? (datos.origen === "qr" ? "Reporte demostrativo mediante QR" : "Reporte demostrativo mediante GPS")
              : "Incidencia simulada")}</strong></p>` +
            `<p>${escaparTexto(datos.descripcion)}</p>` +
            filas.map(([nombre, valor]) => `<b>${escaparTexto(nombre)}:</b> ${escaparTexto(valor)}`).join("<br>")
          );
        }
      }).addTo(map);
      overlays["Incidencias"] = incidenciasLayer;
      const filtrosIncidencias = ["categoria", "estado", "prioridad"].map((atributo) => ({
        atributo,
        control: document.getElementById(`filtro-${atributo}`)
      }));
      const aplicarFiltrosIncidencias = () => {
        const features = incidenciasDatos.features.filter((feature) =>
          filtrosIncidencias.every(({ atributo, control }) =>
            control.value === "" || feature.properties[atributo] === control.value));
        incidenciasLayer.clearLayers();
        incidenciasLayer.addData({ type: "FeatureCollection", features });
      };
      for (const { control } of filtrosIncidencias) {
        control.addEventListener("change", aplicarFiltrosIncidencias);
      }
      document.getElementById("limpiar-filtros").addEventListener("click", () => {
        for (const { control } of filtrosIncidencias) control.value = "";
        aplicarFiltrosIncidencias();
      });
      aplicarFiltrosIncidencias();
      try {
        const puntosCalor = incidenciasDatos.features
          .filter((feature) => feature.geometry.type === "Point")
          .map((feature) => [
            feature.geometry.coordinates[1],
            feature.geometry.coordinates[0],
            feature.properties.reportes / 9
          ]);
        overlays["Mapa de calor"] = L.heatLayer(puntosCalor, {
          radius: 28,
          blur: 22,
          maxZoom: 18
        });
      } catch (error) {
        console.error("ESPOCH Pulse: no se pudo crear el mapa de calor.", error);
      }

      // Heurística de demostración: vecindarios de 60 m, incluyendo su punto central.
      const radioAnalisis = 60;
      const incidenciasActivas = incidenciasDatos.features
        .filter((feature) => feature.geometry.type === "Point" && feature.properties.estado !== "resuelto")
        .map((feature) => ({
          latlng: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
          reportes: feature.properties.reportes
        }));
      let grupoPrioritario = [];
      let reportesPrioritarios = 0;
      for (const incidencia of incidenciasActivas) {
        const grupo = incidenciasActivas.filter((otra) =>
          map.distance(incidencia.latlng, otra.latlng) <= radioAnalisis);
        const reportes = grupo.reduce((suma, otra) => suma + otra.reportes, 0);
        if (reportes > reportesPrioritarios ||
            (reportes === reportesPrioritarios && grupo.length > grupoPrioritario.length)) {
          grupoPrioritario = grupo;
          reportesPrioritarios = reportes;
        }
      }
      if (grupoPrioritario.length > 0) {
        const centro = [0, 1].map((eje) =>
          grupoPrioritario.reduce((suma, incidencia) => suma + incidencia.latlng[eje], 0) / grupoPrioritario.length);
        overlays["Zona prioritaria"] = L.circle(centro, {
          pane: "zonaPrioritaria",
          radius: radioAnalisis,
          color: "#e45524",
          weight: 2,
          opacity: 0.8,
          fillColor: "#ef652f",
          fillOpacity: 0.12
        }).bindPopup(
          "<strong>Zona prioritaria — demostración</strong>" +
          "<p><strong>PRUEBA DE CONCEPTO</strong></p>" +
          `<b>Incidencias activas agrupadas:</b> ${escaparTexto(grupoPrioritario.length)}<br>` +
          `<b>Reportes acumulados:</b> ${escaparTexto(reportesPrioritarios)}<br>` +
          `<b>Radio de análisis:</b> ${escaparTexto(radioAnalisis)} m` +
          "<p>Criterio: mayor concentración local de reportes entre incidencias activas.</p>" +
          "<p>Esta zona es generada automáticamente para la prueba de concepto y no representa una declaración oficial de la ESPOCH.</p>"
        );
      }
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de incidencias.", error);
    }

    try {
      const qrResponse = await fetch("../data/simulated/puntos_qr.geojson");
      if (!qrResponse.ok) {
        throw new Error(`No se pudo cargar puntos_qr.geojson: HTTP ${qrResponse.status}.`);
      }

      const tiposLugarQR = {
        edificio: "Edificio", servicio: "Servicio", acceso: "Acceso", espacio: "Espacio"
      };
      const accionesQR = {
        informacion: "Información", reportar: "Reportar incidencia",
        navegacion: "Navegación", servicios: "Consultar servicios"
      };

      overlays["Puntos QR"] = L.geoJSON(await qrResponse.json(), {
        pane: "qr",
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: "qr",
          radius: 5,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillColor: "#0891d1",
          fillOpacity: 0.95
        }),
        onEachFeature: (feature, layer) => {
          const datos = feature.properties;
          const tipoLugar = Object.hasOwn(tiposLugarQR, datos.tipo_lugar)
            ? tiposLugarQR[datos.tipo_lugar] : datos.tipo_lugar;
          const accion = Object.hasOwn(accionesQR, datos.accion_principal)
            ? accionesQR[datos.accion_principal] : datos.accion_principal;
          layer.bindPopup(
            `<strong>${escaparTexto(datos.nombre)}</strong>` +
            "<p><strong>QR SIMULADO</strong></p>" +
            `<b>Tipo de lugar:</b> ${escaparTexto(tipoLugar)}<br>` +
            `<b>Acción principal:</b> ${escaparTexto(accion)}<br>` +
            `<b>Zona:</b> ${escaparTexto(datos.zona)}` +
            `<p>${escaparTexto(datos.descripcion)}</p>` +
            `<p><small>URL demostrativa: ${escaparTexto(datos.url_demo)}<br>` +
            "Dirección y dominio ficticios de la prueba de concepto.</small></p>" +
            `<small>Referencia demo: ${escaparTexto(datos.id)}</small>` +
            `<p><a href="../espoch-pulse-demo/index.html?qr=${escaparTexto(encodeURIComponent(datos.id))}">Reportar incidencia</a></p>`
          );
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de QR.", error);
    }

    try {
      const accesibilidadResponse = await fetch("../data/simulated/accesibilidad.geojson");
      if (!accesibilidadResponse.ok) {
        throw new Error(`No se pudo cargar accesibilidad.geojson: HTTP ${accesibilidadResponse.status}.`);
      }

      const titulosAccesibilidad = {
        rampa: "Rampa simulada", escalera: "Escalera simulada", acceso: "Acceso simulado",
        obstaculo: "Obstáculo simulado", cruce: "Cruce simulado"
      };
      const estadosAccesibilidad = {
        adecuado: "Adecuado", requiere_atencion: "Requiere atención", no_accesible: "No accesible"
      };

      overlays["Accesibilidad"] = L.geoJSON(await accesibilidadResponse.json(), {
        pane: "accesibilidad",
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          pane: "accesibilidad",
          radius: 5,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillColor: feature.properties.apto_movilidad_reducida ? "#0d9488" : "#831843",
          fillOpacity: 0.95
        }),
        onEachFeature: (feature, layer) => {
          const datos = feature.properties;
          const titulo = Object.hasOwn(titulosAccesibilidad, datos.tipo)
            ? titulosAccesibilidad[datos.tipo] : datos.tipo;
          const estado = Object.hasOwn(estadosAccesibilidad, datos.estado)
            ? estadosAccesibilidad[datos.estado] : datos.estado;
          layer.bindPopup(
            `<strong>${escaparTexto(titulo)}</strong>` +
            "<p><strong>DATOS SIMULADOS</strong></p>" +
            `<b>Estado:</b> ${escaparTexto(estado)}<br>` +
            `<b>Zona:</b> ${escaparTexto(datos.zona)}<br>` +
            `<b>Apto para movilidad reducida:</b> ${escaparTexto(datos.apto_movilidad_reducida ? "Sí" : "No")}` +
            `<p>${escaparTexto(datos.descripcion)}</p>` +
            `<small>Referencia demo: ${escaparTexto(datos.id)}</small>`
          );
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de accesibilidad.", error);
    }

    try {
      const rutasResponse = await fetch("../data/simulated/rutas.geojson");
      if (!rutasResponse.ok) {
        throw new Error(`No se pudo cargar rutas.geojson: HTTP ${rutasResponse.status}.`);
      }

      overlays["Rutas"] = L.geoJSON(await rutasResponse.json(), {
        pane: "rutas",
        style: (feature) => ({
          color: feature.properties.tipo === "convencional" ? "#b45309" : "#1d4ed8",
          weight: feature.properties.tipo === "convencional" ? 4 : 5,
          opacity: 0.95,
          dashArray: feature.properties.tipo === "convencional" ? "6 4" : null
        }),
        onEachFeature: (feature, layer) => {
          const datos = feature.properties;
          const titulo = datos.tipo === "convencional"
            ? "Ruta convencional simulada" : "Ruta accesible simulada";
          const distancia = new Intl.NumberFormat("es-EC", {
            minimumFractionDigits: 1, maximumFractionDigits: 1
          }).format(datos.distancia_m);
          layer.bindPopup(
            `<strong>${escaparTexto(titulo)}</strong>` +
            "<p><strong>DATOS SIMULADOS</strong></p>" +
            `<b>Origen:</b> ${escaparTexto(datos.origen)}<br>` +
            `<b>Destino:</b> ${escaparTexto(datos.destino)}<br>` +
            `<b>Distancia:</b> ${escaparTexto(distancia)} m<br>` +
            `<b>Apta para movilidad reducida:</b> ${escaparTexto(datos.apta_movilidad_reducida ? "Sí" : "No")}` +
            `<p>${escaparTexto(datos.descripcion)}</p>` +
            `<small>Referencia demo: ${escaparTexto(datos.id)}</small>`
          );
        }
      }).addTo(map);
    } catch (error) {
      console.error("ESPOCH Pulse: no se pudo cargar la capa de rutas.", error);
    }

    L.control.layers(null, overlays, {
      collapsed: true
    }).addTo(map);
  } catch (error) {
    console.error("ESPOCH Pulse: no se pudo cargar el mapa del campus. Abre la aplicación mediante un servidor HTTP local.", error);
  }
}

iniciarMapa();
