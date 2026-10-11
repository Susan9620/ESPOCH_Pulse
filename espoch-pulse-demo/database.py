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

INITIAL_PARQUEADEROS = [
    {
        "id": "P-FIE1",
        "osm_id": 747151945,
        "etiqueta": "Estacionamiento FIE1",
        "capacidad": 10,
        "fuente_capacidad": "OSM (no verificado)",
        "libres_iniciales": 5,
        "plazas_accesibles_totales": 2,
        "plazas_accesibles_libres": 1,
        "plazas_discapacidad": 2,
        "tipo_acceso": "restringido",
        "descripcion_acceso": "Sector FIE1 reservado para docentes y personal administrativo (restringido para estudiantes).",
        "perfiles_permitidos": ["docente", "administrativo"]
    },
    {
        "id": "P-OESTE",
        "osm_id": 747153215,
        "etiqueta": "Estacionamiento Software",
        "capacidad": 50,
        "fuente_capacidad": "OSM (no verificado)",
        "libres_iniciales": 30,
        "plazas_accesibles_totales": 4,
        "plazas_accesibles_libres": 3,
        "plazas_discapacidad": 4,
        "tipo_acceso": "universal",
        "descripcion_acceso": "Acceso universal para la comunidad politécnica: Estudiantes, Docentes y Administrativos.",
        "perfiles_permitidos": ["estudiante", "docente", "administrativo"]
    },
    {
        "id": "P-AULAS",
        "osm_id": 747154783,
        "etiqueta": "Estacionamiento Ciencias Básicas I",
        "capacidad": 20,
        "fuente_capacidad": "SIMULADA",
        "libres_iniciales": 11,
        "plazas_accesibles_totales": 2,
        "plazas_accesibles_libres": 2,
        "plazas_discapacidad": 2,
        "tipo_acceso": "mixto",
        "descripcion_acceso": "Sector Ciencias Básicas I asignado a Estudiantes y Docentes (restringido para administrativos).",
        "perfiles_permitidos": ["estudiante", "docente"]
    },
    {
        "id": "P-DISENO",
        "osm_id": 819653549,
        "etiqueta": "Estacionamiento Diseño",
        "capacidad": 18,
        "fuente_capacidad": "SIMULADA",
        "libres_iniciales": 8,
        "plazas_accesibles_totales": 2,
        "plazas_accesibles_libres": 1,
        "plazas_discapacidad": 2,
        "tipo_acceso": "universal",
        "descripcion_acceso": "Acceso politécnico general junto al taller de diseño (Estudiantes, Docentes y Administrativos).",
        "perfiles_permitidos": ["estudiante", "docente", "administrativo"]
    },
    {
        "id": "P-FIE2",
        "osm_id": 819653548,
        "etiqueta": "Estacionamiento FIE2",
        "capacidad": 12,
        "fuente_capacidad": "SIMULADA",
        "libres_iniciales": 6,
        "plazas_accesibles_totales": 2,
        "plazas_accesibles_libres": 1,
        "plazas_discapacidad": 2,
        "tipo_acceso": "restringido",
        "descripcion_acceso": "Área reservada para docentes, investigadores y administrativos (restringido para estudiantes).",
        "perfiles_permitidos": ["docente", "administrativo"]
    }
]

INITIAL_PREDICCIONES = {
    "P-FIE1": {
        "nombre": "Estacionamiento FIE",
        "capacidad": 10,
        "pico_horario": "07:00, 13:00 y 17:00",
        "sensibilidad": "Muy alta (pocas plazas cerca a decanato y aulas FIE)",
        "curva_laborable": {"07:00": 90, "08:00": 60, "09:00": 50, "10:00": 45, "11:00": 40, "12:00": 55, "13:00": 90, "14:00": 60, "15:00": 50, "16:00": 45, "17:00": 70, "18:00": 20},
        "curva_sabado": {"07:00": 10, "08:00": 40, "09:00": 60, "10:00": 65, "11:00": 55, "12:00": 50, "13:00": 40, "14:00": 30, "15:00": 20, "16:00": 15, "17:00": 10, "18:00": 5}
    },
    "P-OESTE": {
        "nombre": "Estacionamiento Software",
        "capacidad": 50,
        "pico_horario": "07:00, 13:00 y 17:00",
        "sensibilidad": "Moderada (alta capacidad amortigua saturación rápida)",
        "curva_laborable": {"07:00": 84, "08:00": 58, "09:00": 52, "10:00": 46, "11:00": 42, "12:00": 56, "13:00": 86, "14:00": 64, "15:00": 52, "16:00": 48, "17:00": 68, "18:00": 22},
        "curva_sabado": {"07:00": 10, "08:00": 35, "09:00": 50, "10:00": 55, "11:00": 50, "12:00": 42, "13:00": 35, "14:00": 25, "15:00": 20, "16:00": 15, "17:00": 10, "18:00": 5}
    },
    "P-AULAS": {
        "nombre": "Estacionamiento Ciencias Básicas I",
        "capacidad": 20,
        "pico_horario": "07:00, 13:00 y 17:00",
        "sensibilidad": "Alta (gran afluencia de estudiantes en horas de entrada y salida)",
        "curva_laborable": {"07:00": 90, "08:00": 60, "09:00": 50, "10:00": 45, "11:00": 40, "12:00": 55, "13:00": 85, "14:00": 60, "15:00": 50, "16:00": 45, "17:00": 65, "18:00": 15},
        "curva_sabado": {"07:00": 15, "08:00": 45, "09:00": 55, "10:00": 50, "11:00": 40, "12:00": 35, "13:00": 30, "14:00": 20, "15:00": 15, "16:00": 10, "17:00": 5, "18:00": 5}
    },
    "P-DISENO": {
        "nombre": "Estacionamiento Diseño",
        "capacidad": 18,
        "pico_horario": "07:00, 13:00 y 17:00",
        "sensibilidad": "Media-alta en jornada vespertina (talleres de diseño y laboratorios)",
        "curva_laborable": {"07:00": 82, "08:00": 55, "09:00": 48, "10:00": 44, "11:00": 40, "12:00": 52, "13:00": 88, "14:00": 65, "15:00": 55, "16:00": 50, "17:00": 70, "18:00": 20},
        "curva_sabado": {"07:00": 10, "08:00": 25, "09:00": 40, "10:00": 45, "11:00": 40, "12:00": 35, "13:00": 30, "14:00": 25, "15:00": 20, "16:00": 15, "17:00": 10, "18:00": 5}
    },
    "P-FIE2": {
        "nombre": "Estacionamiento FIE2",
        "capacidad": 12,
        "pico_horario": "07:00, 13:00 y 17:00",
        "sensibilidad": "Alta (capacidad reducida, docentes y estudiantes de desarrollo)",
        "curva_laborable": {"07:00": 88, "08:00": 58, "09:00": 50, "10:00": 45, "11:00": 42, "12:00": 54, "13:00": 92, "14:00": 62, "15:00": 50, "16:00": 45, "17:00": 72, "18:00": 18},
        "curva_sabado": {"07:00": 10, "08:00": 30, "09:00": 45, "10:00": 50, "11:00": 45, "12:00": 40, "13:00": 30, "14:00": 25, "15:00": 15, "16:00": 10, "17:00": 5, "18:00": 5}
    }
}


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
                plazas_accesibles_totales INTEGER DEFAULT 0,
                plazas_accesibles_libres INTEGER DEFAULT 0,
                tipo_acceso TEXT,
                descripcion_acceso TEXT,
                perfiles_permitidos TEXT,
                updated_at TEXT
            )
        """)

        # Migración de columnas si la tabla ya existía
        cursor.execute("PRAGMA table_info(parqueaderos)")
        existing_cols = [c[1] for c in cursor.fetchall()]
        if "plazas_accesibles_totales" not in existing_cols:
            cursor.execute("ALTER TABLE parqueaderos ADD COLUMN plazas_accesibles_totales INTEGER DEFAULT 0")
        if "plazas_accesibles_libres" not in existing_cols:
            cursor.execute("ALTER TABLE parqueaderos ADD COLUMN plazas_accesibles_libres INTEGER DEFAULT 0")

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
    now_iso = datetime.now(timezone.utc).isoformat()
    if cursor.fetchone()["total"] == 0:
        try:
            for p in INITIAL_PARQUEADEROS:
                cursor.execute("""
                    INSERT INTO parqueaderos (
                        id, osm_id, etiqueta, capacidad, fuente_capacidad,
                        libres_iniciales, libres_actuales, plazas_discapacidad,
                        plazas_accesibles_totales, plazas_accesibles_libres,
                        tipo_acceso, descripcion_acceso, perfiles_permitidos, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    p.get("id"),
                    p.get("osm_id"),
                    p.get("etiqueta"),
                    p.get("capacidad"),
                    p.get("fuente_capacidad", "SIMULADA"),
                    p.get("libres_iniciales", 0),
                    p.get("libres_iniciales", 0),
                    p.get("plazas_discapacidad", 0),
                    p.get("plazas_accesibles_totales", p.get("plazas_discapacidad", 0)),
                    p.get("plazas_accesibles_libres", p.get("plazas_discapacidad", 0)),
                    p.get("tipo_acceso", "universal"),
                    p.get("descripcion_acceso", ""),
                    json.dumps(p.get("perfiles_permitidos", []), ensure_ascii=False),
                    now_iso
                ))
            print("[SQLite] Tabla 'parqueaderos' sembrada exitosamente.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sembrar parqueaderos: {e}", flush=True)
    else:
        # Sincronizar y actualizar columnas de accesibilidad y perfiles en registros existentes
        try:
            for p in INITIAL_PARQUEADEROS:
                cursor.execute("""
                    UPDATE parqueaderos SET
                        etiqueta = ?,
                        capacidad = ?,
                        plazas_discapacidad = ?,
                        plazas_accesibles_totales = ?,
                        plazas_accesibles_libres = CASE 
                            WHEN plazas_accesibles_libres IS NULL OR plazas_accesibles_libres = 0 
                            THEN ? ELSE plazas_accesibles_libres END,
                        tipo_acceso = ?,
                        descripcion_acceso = ?,
                        perfiles_permitidos = ?
                    WHERE id = ?
                """, (
                    p.get("etiqueta"),
                    p.get("capacidad"),
                    p.get("plazas_discapacidad", 0),
                    p.get("plazas_accesibles_totales", 0),
                    p.get("plazas_accesibles_libres", 0),
                    p.get("tipo_acceso", "universal"),
                    p.get("descripcion_acceso", ""),
                    json.dumps(p.get("perfiles_permitidos", []), ensure_ascii=False),
                    p.get("id")
                ))
            print("[SQLite] Tabla 'parqueaderos' sincronizada con permisos y plazas accesibles.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sincronizar parqueaderos: {e}", flush=True)


def _seed_predicciones(cursor):
    cursor.execute("SELECT COUNT(*) AS total FROM predicciones_historicas")
    if cursor.fetchone()["total"] == 0:
        try:
            for pid, info in INITIAL_PREDICCIONES.items():
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
    if cursor.fetchone()["total"] == 0:
        try:
            cursor.execute("""
                INSERT INTO reportes (
                    id, categoria, descripcion, origen, lugar, qr, element_id,
                    zona, latitude, longitude, accuracy, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "PULSE-0001",
                "limpieza",
                "Edificio sucio",
                "qr",
                "FIE - Diseño Grafico",
                "QR-005",
                "QR-005",
                "FIE - Diseño Grafico",
                -1.6566268,
                -78.6763226,
                None,
                "Pendiente",
                "2026-10-05T21:38:43.876345-05:00"
            ))
            print("[SQLite] Tabla 'reportes' sembrada con registro de demostración.", flush=True)
        except Exception as e:
            print(f"[SQLite Error] Error al sembrar reportes: {e}", flush=True)


# ==========================================
# Métodos para PARQUEADEROS
# ==========================================

def get_parqueaderos():
    """Devuelve los parqueaderos en el mismo formato estructurado que parking_occupancy_demo.json, con plazas accesibles diferenciadas."""
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
            keys = r.keys()
            pcd_totales = r["plazas_accesibles_totales"] if "plazas_accesibles_totales" in keys and r["plazas_accesibles_totales"] is not None else r["plazas_discapacidad"]
            pcd_libres = r["plazas_accesibles_libres"] if "plazas_accesibles_libres" in keys and r["plazas_accesibles_libres"] is not None else pcd_totales

            result.append({
                "osm_id": r["osm_id"],
                "id": r["id"],
                "etiqueta": r["etiqueta"],
                "capacidad": r["capacidad"],
                "fuente_capacidad": r["fuente_capacidad"],
                "libres_iniciales": r["libres_iniciales"],
                "libres_actuales": r["libres_actuales"],
                "perfiles_permitidos": perfiles,
                "plazas_discapacidad": pcd_totales,
                "plazas_accesibles_totales": pcd_totales,
                "plazas_accesibles_libres": pcd_libres,
                "tipo_acceso": r["tipo_acceso"],
                "descripcion_acceso": r["descripcion_acceso"]
            })
        return {
            "tipo": "escenario_de_demostracion",
            "origen": "sqlite",
            "aviso": "Datos provistos desde SQLite local (espoch_pulse.db) para alto rendimiento y desacople de archivo JSON.",
            "parqueaderos": result
        }


def update_parqueadero_libres(slot_id, libres, pcd_libres=None, evento="ajuste_manual"):
    """Actualiza los espacios libres de un parqueadero (totales y accesibles) y guarda en la bitácora de telemetría."""
    with get_connection() as conn:
        now_iso = datetime.now(timezone.utc).isoformat()
        if pcd_libres is not None:
            conn.execute(
                "UPDATE parqueaderos SET libres_actuales = ?, plazas_accesibles_libres = ?, updated_at = ? WHERE id = ?",
                (int(libres), int(pcd_libres), now_iso, slot_id)
            )
        else:
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
    """Restaura los valores de libres_actuales y plazas_accesibles_libres a sus valores iniciales."""
    with get_connection() as conn:
        now_iso = datetime.now(timezone.utc).isoformat()
        for p in INITIAL_PARQUEADEROS:
            conn.execute(
                "UPDATE parqueaderos SET libres_actuales = ?, plazas_accesibles_libres = ?, updated_at = ? WHERE id = ?",
                (p["libres_iniciales"], p.get("plazas_accesibles_libres", 2), now_iso, p["id"])
            )
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
