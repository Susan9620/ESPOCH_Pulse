from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone, timedelta
from threading import RLock
import argparse
import json
import math
import os
import tempfile

PORT = int(os.environ.get("PORT", 8000))
MODULE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = MODULE_DIR.parent
REPORTS_FILE = MODULE_DIR / "reports.json"
GEOJSON_FILE = MODULE_DIR / "reports.geojson"
QR_FILE = PROJECT_DIR / "data/simulated/puntos_qr.geojson"
CAMPUS_FILE = PROJECT_DIR / "data/base/campus.geojson"
REPORT_LOCK = RLock()
CATEGORIES = {
    "Iluminación": "iluminacion", "Limpieza": "limpieza",
    "Infraestructura": "infraestructura", "Seguridad": "seguridad",
    "Accesibilidad": "accesibilidad", "Movilidad": "movilidad",
    "Áreas verdes": "areas_verdes", "Otro": "otro"
}


def read_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_reports():
    reports = read_json(REPORTS_FILE, [])
    if not isinstance(reports, list) or any(not isinstance(r, dict) for r in reports):
        raise ValueError("reports.json no contiene una lista válida de reportes")
    return reports


def coordinates(latitude, longitude):
    if isinstance(latitude, bool) or isinstance(longitude, bool):
        raise ValueError("Coordenadas inválidas")
    lat, lon = float(latitude), float(longitude)
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Coordenadas fuera de rango")
    return lat, lon


def create_geojson(reports):
    features = []
    for report in reports:
        try:
            lat, lon = coordinates(report.get("latitude"), report.get("longitude"))
            geometry = {"type": "Point", "coordinates": [lon, lat]}
        except (TypeError, ValueError):
            # Se conserva el registro histórico, sin inventar una ubicación.
            geometry = None
        properties = {k: v for k, v in report.items() if k not in ("latitude", "longitude")}
        features.append({"type": "Feature", "geometry": geometry, "properties": properties})
    return {"type": "FeatureCollection", "features": features}


def atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
            temporary = Path(f.name)
            f.write(content)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def save_reports(reports):
    # Ambos documentos se preparan antes de escribir; las peticiones usan el mismo bloqueo.
    documents = {REPORTS_FILE: reports, GEOJSON_FILE: create_geojson(reports)}
    updates = {path: json.dumps(data, ensure_ascii=False, indent=4, allow_nan=False).encode("utf-8")
               for path, data in documents.items() if read_json(path, None) != data}
    backups = {path: path.read_bytes() if path.exists() else None for path in updates}
    written = []
    try:
        for path, content in updates.items():
            atomic_write(path, content)
            written.append(path)
    except OSError:
        for path in reversed(written):
            if backups[path] is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, backups[path])
        raise


def synchronize_reports():
    with REPORT_LOCK:
        reports = load_reports()
        geojson = read_json(GEOJSON_FILE, {"type": "FeatureCollection", "features": []})
        if geojson.get("type") != "FeatureCollection":
            raise ValueError("reports.geojson no es una FeatureCollection")
        ids = {r.get("id") for r in reports if r.get("id")}
        # Preserva también registros que existieran únicamente en el GeoJSON recibido.
        for feature in geojson["features"]:
            properties = dict(feature.get("properties") or {})
            geometry = feature.get("geometry")
            report = properties.copy()
            if geometry and geometry.get("type") == "Point":
                lon, lat = geometry["coordinates"][:2]
                report.update(latitude=lat, longitude=lon)
            if (properties.get("id") and properties["id"] not in ids) or (not properties.get("id") and report not in reports):
                reports.append(report)
                if properties.get("id"):
                    ids.add(properties["id"])
        save_reports(reports)


def resolve_qr(qr_id):
    feature = next((f for f in read_json(QR_FILE, {})["features"]
                    if f.get("properties", {}).get("id") == qr_id), None)
    if not feature:
        raise ValueError("QR inexistente")
    if (feature.get("geometry") or {}).get("type") != "Point":
        raise ValueError("El QR no tiene una ubicación Point válida")
    lon, lat = feature["geometry"]["coordinates"][:2]
    lat, lon = coordinates(lat, lon)
    data = feature["properties"]
    if not data.get("nombre") or not data.get("zona"):
        raise ValueError("El QR no tiene nombre o zona de referencia")
    return {"origen": "qr", "lugar": data["nombre"], "qr": data["id"], "elementId": data["id"], "location": data["nombre"],
            "zona": data.get("zona"), "latitude": lat, "longitude": lon}


def inside_ring(lon, lat, ring):
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > lat) != (b[1] > lat):
            crossing = a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if lon < crossing:
                inside = not inside
    return inside


def distance_to_ring(lon, lat, ring):
    # Proyección tangente local en metros, suficiente para el límite de este campus.
    scale_y = math.pi * 6371008.8 / 180
    scale_x = scale_y * math.cos(math.radians(lat))
    distance = math.inf
    for a, b in zip(ring, ring[1:] + ring[:1]):
        ax, ay = (a[0] - lon) * scale_x, (a[1] - lat) * scale_y
        bx, by = (b[0] - lon) * scale_x, (b[1] - lat) * scale_y
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        t = max(0, min(1, -(ax * dx + ay * dy) / length)) if length else 0
        distance = min(distance, math.hypot(ax + t * dx, ay + t * dy))
    return distance


def within_campus(lat, lon, accuracy=None):
    # Hasta 30 m de incertidumbre en bordes; una precisión enorme no amplía el campus.
    tolerance = min(30, max(3, accuracy or 0))
    campus = read_json(CAMPUS_FILE, {})
    polygons = []
    for feature in campus.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Polygon":
            polygons.append(geometry["coordinates"])
        elif geometry.get("type") == "MultiPolygon":
            polygons.extend(geometry["coordinates"])
    if not polygons:
        raise ValueError("No se pudo validar el límite del campus")
    for polygon in polygons:
        if inside_ring(lon, lat, polygon[0]) and not any(inside_ring(lon, lat, hole) for hole in polygon[1:]):
            return True
        if any(distance_to_ring(lon, lat, ring) <= tolerance for ring in polygon):
            return True
    return False


def resolve_gps(data):
    lat, lon = coordinates(data.get("latitude"), data.get("longitude"))
    accuracy = data.get("accuracy")
    if accuracy is not None:
        if isinstance(accuracy, bool):
            raise ValueError("Precisión GPS inválida")
        accuracy = float(accuracy)
        if not math.isfinite(accuracy) or accuracy < 0:
            raise ValueError("Precisión GPS inválida")
    if not within_campus(lat, lon, accuracy):
        raise ValueError("La ubicación detectada se encuentra fuera del área de demostración de ESPOCH Pulse.")
    result = {"origen": "gps_web", "lugar": "Ubicación reportada por GPS",
              "location": "Ubicación reportada por GPS", "latitude": lat, "longitude": lon}
    if accuracy is not None:
        result["accuracy"] = accuracy
    return result


import sys
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))
import database


class PulseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        clean_path = self.path.split("?")[0]
        if clean_path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/web/smart-parking.html")
            self.end_headers()
            return
        elif clean_path == "/api/parking":
            self.respond(200, database.get_parqueaderos())
            return
        elif clean_path == "/api/parking/historical":
            self.respond(200, database.get_predicciones())
            return
        elif clean_path == "/api/reports":
            if "format=geojson" in self.path:
                self.respond(200, database.get_reportes_geojson())
            else:
                self.respond(200, database.get_reportes_list())
            return
        elif clean_path == "/api/db/status":
            self.respond(200, {
                "status": "connected",
                "engine": "SQLite",
                "database": "data/espoch_pulse.db",
                "connectedAt": datetime.now(timezone.utc).isoformat()
            })
            return
        with REPORT_LOCK:
            super().do_GET()

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        clean_path = self.path.split("?")[0]

        # Actualización de espacios en SQLite
        if clean_path == "/api/parking/occupancy":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length))
                slot_id = data.get("id")
                libres = data.get("libres")
                evento = data.get("evento", "simulacion")
                if not slot_id or libres is None:
                    raise ValueError("Faltan parámetros 'id' o 'libres'")
                database.update_parqueadero_libres(slot_id, libres, evento)
                self.respond(200, {"success": True, "id": slot_id, "libres": libres, "evento": evento})
            except Exception as e:
                self.respond(400, {"success": False, "error": str(e)})
            return

        # Restablecimiento de parqueaderos en SQLite
        elif clean_path == "/api/parking/reset":
            try:
                database.reset_parqueaderos()
                self.respond(200, {"success": True, "message": "Parqueaderos restablecidos a valores iniciales en SQLite"})
            except Exception as e:
                self.respond(500, {"success": False, "error": str(e)})
            return

        # Creación de nuevo reporte de incidencia
        elif clean_path != "/api/report":
            self.respond(404, {"success": False, "error": "Ruta no encontrada"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 65536:
                raise ValueError("Tamaño de reporte inválido")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Reporte inválido")
            category = CATEGORIES.get(data.get("category"), data.get("category"))
            description = data.get("description")
            if category not in CATEGORIES.values() or not isinstance(description, str) or not description.strip():
                raise ValueError("Selecciona una categoría y escribe una descripción")
            if data.get("qr") is not None:
                location = resolve_qr(data["qr"])
            elif data.get("mode") == "gps" or data.get("origen") == "gps_web":
                location = resolve_gps(data)
            else:
                raise ValueError("Abre el formulario mediante un QR válido o el modo GPS")

            with REPORT_LOCK:
                report_data = {
                    "category": category,
                    "description": description.strip(),
                    **location
                }
                report_id = database.insert_reporte(report_data)

                # Mantener sincronizado reports.json y reports.geojson para compatibilidad
                reports = load_reports()
                full_report = {
                    "id": report_id,
                    **location,
                    "category": category,
                    "description": description.strip(),
                    "status": "Pendiente",
                    "createdAt": datetime.now(timezone(timedelta(hours=-5))).isoformat()
                }
                reports.append(full_report)
                save_reports(reports)

            self.respond(200, {"success": True, "reportId": report_id, "message": "Reporte registrado y guardado en SQLite"})
        except (ValueError, TypeError, KeyError) as error:
            self.respond(400, {"success": False, "error": str(error)})
        except OSError:
            self.respond(500, {"success": False, "error": "No se pudo guardar el reporte en almacenamiento."})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Servidor de demostración de ESPOCH Pulse")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    database.init_db()
    with ThreadingHTTPServer(("0.0.0.0", args.port), PulseHandler) as server:
        synchronize_reports()
        print(f"ESPOCH Pulse: http://localhost:{args.port}/web/", flush=True)
        print(f"Base de datos SQLite: Conectada exitosamente (data/espoch_pulse.db)", flush=True)
        print(f"Formulario: http://localhost:{args.port}/espoch-pulse-demo/index.html?qr=QR-002", flush=True)
        print("Prueba de concepto con SQLite. CTRL+C para detener.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
