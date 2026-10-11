"""Módulo de base de datos SQLite para ESPOCH Pulse y Smart Parking.
Maneja tablas de parqueaderos, telemetría en tiempo real, predicciones históricas
y reportes de incidencias ciudadanas del campus ESPOCH FIE.
"""
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

MODULE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = MODULE_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
DB_PATH = DATA_DIR / "espoch_pulse.db"

# Fuentes de datos iniciales para seeding
JSON_OCCUPANCY = DATA_DIR / "simulated/parking_occupancy_demo.json"
JSON_PREDICTIONS = DATA_DIR / "simulated/parking_historical_predictions.json"
JSON_REPORTS = MODULE_DIR / "reports.json"


def get_connection():
    """Obtiene una conexión a SQLite con row_factory habilitado para facilitar diccionarios."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Crea las tablas en SQLite y migra/siembra los datos iniciales si la BD está vacía."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Tabla de parqueaderos
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS parqueaderos (
                id TEXT PRIMARY KEY,
                osm_id INTEGER NOT NULL,
                etiqueta TEXT NOT NULL,
                capacidad INTEGER NOT NULL,
                fuente_capacidad TEXT,
                libres_iniciales INTEGER NOT NULL,
                libres_actuales INTEGER NOT NULL,
                plazas_discapacidad INTEGER DEFAULT 0,
                tipo_acceso TEXT,
                descripcion_acceso TEXT,
                perfiles_permitidos TEXT,
                updated_at TEXT
            )
        """)

        # 2. Tabla de predicciones históricas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS predicciones_historicas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parqueadero_id TEXT NOT NULL,
                nombre TEXT,
                capacidad INTEGER,
                pico_horario TEXT,
                sensibilidad TEXT,
                tipo_dia TEXT NOT NULL,
                hora TEXT NOT NULL,
                porcentaje_ocupacion INTEGER NOT NULL,
                FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE
            )
        """)

        # 3. Tabla de reportes de incidencias
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reportes (
                id TEXT PRIMARY KEY,
                categoria TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                origen TEXT,
                lugar TEXT,
                qr TEXT,
                element_id TEXT,
                zona TEXT,
                latitude REAL,
                longitude REAL,
                accuracy REAL,
                status TEXT DEFAULT 'Pendiente',
                created_at TEXT
            )
        """)

        # 4. Tabla de telemetría y rotación en vivo
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetria_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parqueadero_id TEXT NOT NULL,
                tipo_evento TEXT NOT NULL,
                libres INTEGER NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)

        conn.commit()

        # Sembrar datos si las tablas están vacías
        _seed_parqueaderos(cursor)
        _seed_predicciones(cursor)
        _seed_reportes(cursor)
        conn.commit()


def _seed_parqueaderos(cursor):
    cursor.execute("SELECT COUNT(*) AS total FROM parqueaderos")
    if cursor.fetchone()["total"] == 0 and JSON_OCCUPANCY.exists():
        try:
            data = json.loads(JSON_OCCUPANCY.read_text(encoding="utf-8"))
            now_iso = datetime.now(timezone.utc).isoformat()
            for p in data.get("parqueaderos", []):
                cursor.execute("""
                    INSERT INTO parqueaderos (
                        id, osm_id, etiqueta, capacidad, fuente_capacidad,
                        libres_iniciales, libres_actuales, plazas_discapacidad,
                        tipo_acceso, descripcion_acceso, perfiles_permitidos, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p.get("id"),
                    p.get("osm_id"),
                    p.get("etiqueta"),
                    p.get("capacidad"),
                    p.get("fuente_capacidad", "SIMULADA"),
                    p.get("libres_iniciales", 0),
                    p.get("libres_iniciales", 0),
                    p.get("plazas_discapacidad", 0),
                    p.get("tipo_acceso", "universal"),
                    p.get("descripcion_acceso", ""),
                    json.dumps(p.get("perfiles_permitidos", []), ensure_ascii=False),
                    now_iso
                ))
            print("[SQLite] Tabla 'parqueaderos' sembrada exitosamente.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sembrar parqueaderos: {e}", flush=True)


def _seed_predicciones(cursor):
    cursor.execute("SELECT COUNT(*) AS total FROM predicciones_historicas")
    if cursor.fetchone()["total"] == 0 and JSON_PREDICTIONS.exists():
        try:
            data = json.loads(JSON_PREDICTIONS.read_text(encoding="utf-8"))
            perfiles = data.get("perfiles_parqueaderos", {})
            for pid, info in perfiles.items():
                nombre = info.get("nombre", pid)
                cap = info.get("capacidad", 0)
                pico = info.get("pico_horario", "")
                sens = info.get("sensibilidad", "")

                for hora, val in info.get("curva_laborable", {}).items():
                    cursor.execute("""
                        INSERT INTO predicciones_historicas (
                            parqueadero_id, nombre, capacidad, pico_horario, sensibilidad,
                            tipo_dia, hora, porcentaje_ocupacion
                        ) VALUES (?, ?, ?, ?, ?, 'laborable', ?, ?)
                    """, (pid, nombre, cap, pico, sens, hora, int(val)))

                for hora, val in info.get("curva_sabado", {}).items():
                    cursor.execute("""
                        INSERT INTO predicciones_historicas (
                            parqueadero_id, nombre, capacidad, pico_horario, sensibilidad,
                            tipo_dia, hora, porcentaje_ocupacion
                        ) VALUES (?, ?, ?, ?, ?, 'sabado', ?, ?)
                    """, (pid, nombre, cap, pico, sens, hora, int(val)))
            print("[SQLite] Tabla 'predicciones_historicas' sembrada exitosamente.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sembrar predicciones: {e}", flush=True)


def _seed_reportes(cursor):
    cursor.execute("SELECT COUNT(*) AS total FROM reportes")
    if cursor.fetchone()["total"] == 0 and JSON_REPORTS.exists():
        try:
            reports = json.loads(JSON_REPORTS.read_text(encoding="utf-8"))
            for r in reports:
                cursor.execute("""
                    INSERT INTO reportes (
                        id, categoria, descripcion, origen, lugar, qr, element_id,
                        zona, latitude, longitude, accuracy, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    r.get("id"),
                    r.get("category", "otro"),
                    r.get("description", ""),
                    r.get("origen", "qr"),
                    r.get("lugar", r.get("location", "")),
                    r.get("qr"),
                    r.get("elementId"),
                    r.get("zona"),
                    r.get("latitude"),
                    r.get("longitude"),
                    r.get("accuracy"),
                    r.get("status", "Pendiente"),
                    r.get("createdAt", datetime.now().isoformat())
                ))
            print("[SQLite] Tabla 'reportes' sembrada exitosamente.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sembrar reportes: {e}", flush=True)


# ==========================================
# Métodos para PARQUEADEROS
# ==========================================

def get_parqueaderos():
    """Devuelve los parqueaderos en el mismo formato estructurado que parking_occupancy_demo.json."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM parqueaderos ORDER BY id ASC").fetchall()
        result = []
        for r in rows:
            perfiles = []
            if r["perfiles_permitidos"]:
                try:
                    perfiles = json.loads(r["perfiles_permitidos"])
                except Exception:
                    perfiles = []
            result.append({
                "osm_id": r["osm_id"],
                "id": r["id"],
                "etiqueta": r["etiqueta"],
                "capacidad": r["capacidad"],
                "fuente_capacidad": r["fuente_capacidad"],
                "libres_iniciales": r["libres_iniciales"],
                "libres_actuales": r["libres_actuales"],
                "perfiles_permitidos": perfiles,
                "plazas_discapacidad": r["plazas_discapacidad"],
                "tipo_acceso": r["tipo_acceso"],
                "descripcion_acceso": r["descripcion_acceso"]
            })
        return {
            "tipo": "escenario_de_demostracion",
            "origen": "sqlite",
            "aviso": "Datos provistos desde SQLite local (espoch_pulse.db) para alto rendimiento y desacople de archivo JSON.",
            "parqueaderos": result
        }


def update_parqueadero_libres(slot_id, libres, evento="ajuste_manual"):
    """Actualiza los espacios libres de un parqueadero y guarda en la bitácora de telemetría."""
    with get_connection() as conn:
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE parqueaderos SET libres_actuales = ?, updated_at = ? WHERE id = ?",
            (int(libres), now_iso, slot_id)
        )
        conn.execute(
            "INSERT INTO telemetria_log (parqueadero_id, tipo_evento, libres, timestamp) VALUES (?, ?, ?, ?)",
            (slot_id, evento, int(libres), now_iso)
        )
        conn.commit()


def reset_parqueaderos():
    """Restaura los valores de libres_actuales a los libres_iniciales."""
    with get_connection() as conn:
        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute("UPDATE parqueaderos SET libres_actuales = libres_iniciales, updated_at = ?", (now_iso,))
        conn.commit()


# ==========================================
# Métodos para PREDICCIONES HISTÓRICAS
# ==========================================

def get_predicciones():
    """Devuelve las predicciones históricas organizadas idéntico a parking_historical_predictions.json."""
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT parqueadero_id, nombre, capacidad, pico_horario, sensibilidad,
                   tipo_dia, hora, porcentaje_ocupacion
            FROM predicciones_historicas
            ORDER BY hora ASC
        """).fetchall()

        horas_set = set()
        perfiles = {}

        for r in rows:
            pid = r["parqueadero_id"]
            horas_set.add(r["hora"])
            if pid not in perfiles:
                perfiles[pid] = {
                    "nombre": r["nombre"],
                    "capacidad": r["capacidad"],
                    "pico_horario": r["pico_horario"],
                    "sensibilidad": r["sensibilidad"],
                    "curva_laborable": {},
                    "curva_sabado": {}
                }
            if r["tipo_dia"] == "laborable":
                perfiles[pid]["curva_laborable"][r["hora"]] = r["porcentaje_ocupacion"]
            elif r["tipo_dia"] == "sabado":
                perfiles[pid]["curva_sabado"][r["hora"]] = r["porcentaje_ocupacion"]

        horas_ordenadas = sorted(list(horas_set))
        return {
            "tipo": "datos_historicos_sqlite",
            "descripcion": "Perfiles horarios y registros históricos simulados almacenados en SQLite.",
            "horas_disponibles": horas_ordenadas,
            "perfiles_parqueaderos": perfiles
        }


# ==========================================
# Métodos para REPORTES DE INCIDENCIAS
# ==========================================

def get_reportes_list():
    """Devuelve la lista de reportes de incidencias."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM reportes ORDER BY created_at DESC").fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "category": r["categoria"],
                "description": r["descripcion"],
                "origen": r["origen"],
                "location": r["lugar"],
                "lugar": r["lugar"],
                "qr": r["qr"],
                "elementId": r["element_id"],
                "zona": r["zona"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "accuracy": r["accuracy"],
                "status": r["status"],
                "createdAt": r["created_at"]
            })
        return result


def get_reportes_geojson():
    """Devuelve los reportes en formato GeoJSON FeatureCollection."""
    reportes = get_reportes_list()
    features = []
    for rep in reportes:
        lat = rep.get("latitude")
        lon = rep.get("longitude")
        geometry = None
        if lat is not None and lon is not None:
            geometry = {"type": "Point", "coordinates": [lon, lat]}
        properties = {k: v for k, v in rep.items() if k not in ("latitude", "longitude")}
        features.append({"type": "Feature", "geometry": geometry, "properties": properties})
    return {"type": "FeatureCollection", "features": features}


def insert_reporte(data):
    """Inserta un nuevo reporte en SQLite autogenerando su ID con formato PULSE-XXXX."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM reportes WHERE id LIKE 'PULSE-%'")
        existing_ids = [r["id"] for r in cursor.fetchall()]
        numbers = [int(i[6:]) for i in existing_ids if i[6:].isdigit()]
        new_id = f"PULSE-{max(numbers, default=0) + 1:04d}"

        now_iso = datetime.now(timezone(timedelta(hours=-5))).isoformat()
        cursor.execute("""
            INSERT INTO reportes (
                id, categoria, descripcion, origen, lugar, qr, element_id,
                zona, latitude, longitude, accuracy, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            data.get("category", "otro"),
            data.get("description", "").strip(),
            data.get("origen", "qr"),
            data.get("lugar", data.get("location", "")),
            data.get("qr"),
            data.get("elementId", data.get("qr")),
            data.get("zona"),
            data.get("latitude"),
            data.get("longitude"),
            data.get("accuracy"),
            "Pendiente",
            now_iso
        ))
        conn.commit()
        return new_id


if __name__ == "__main__":
    init_db()
    p = get_parqueaderos()
    print(f"Parqueaderos cargados desde SQLite: {len(p['parqueaderos'])}")
    h = get_predicciones()
    print(f"Predicciones cargadas: {len(h['perfiles_parqueaderos'])} sectores")
    r = get_reportes_list()
    print(f"Reportes cargados: {len(r)}")
