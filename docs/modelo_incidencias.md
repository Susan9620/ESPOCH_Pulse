# Modelo de incidencias simuladas — ESPOCH Pulse

## Propósito

Una incidencia representa un problema reportado por la comunidad universitaria y georreferenciado dentro del campus. En esta prueba de concepto, todas las incidencias serán ficticias y servirán exclusivamente para demostrar el funcionamiento de ESPOCH Pulse.

La futura capa será `data/simulated/incidencias.geojson`, una `FeatureCollection` cuyos elementos tendrán geometría `Point` en WGS84 / EPSG:4326. Las coordenadas se expresarán en orden longitud–latitud y deberán ubicarse dentro del límite de `data/base/campus.geojson`.

Este documento solo define el modelo. No crea la capa ni genera incidencias como archivos de datos.

## Atributos

Cada `Feature` utilizará exclusivamente los siguientes once atributos en `properties`:

| Atributo | Tipo | Formato o valores permitidos | Descripción |
| --- | --- | --- | --- |
| `id` | string | `INC-001`, `INC-002`, etc. | Identificador único de la incidencia. |
| `titulo` | string | Texto breve. | Descripción breve del problema. |
| `categoria` | string | `iluminacion`, `limpieza`, `infraestructura`, `seguridad`, `accesibilidad`, `movilidad` | Categoría del problema reportado. |
| `descripcion` | string | Texto breve. | Explicación de la situación reportada. |
| `estado` | string | `nuevo`, `en_atencion`, `resuelto` | Estado de atención de la incidencia. |
| `prioridad` | string | `baja`, `media`, `alta`, `critica` | Prioridad definida en los datos de demostración. |
| `fecha_reporte` | string | ISO 8601; por ejemplo, `2026-10-03T10:00:00-05:00`. | Fecha y hora del reporte simulado. |
| `reportes` | integer | Valor mínimo: `1`. | Cantidad de personas que han reportado o confirmado la misma situación; en esta prueba, el conteo también será ficticio. |
| `origen` | string | `qr`, `web`, `movil` | Canal de origen del reporte simulado. |
| `zona` | string | Texto; cadena vacía cuando no resulte útil indicar una referencia. | Nombre textual del sector o edificio de referencia cuando sea útil. |
| `es_simulado` | boolean | Siempre `true` en esta prueba de concepto. | Identifica explícitamente el carácter ficticio del registro. |

## Reglas

- Las coordenadas se almacenarán únicamente en la geometría GeoJSON. No se repetirán como atributos `lat` y `lon`.
- Todas las incidencias de la prueba de concepto serán ficticias y deberán identificarse mediante `es_simulado=true`.
- Los datos serán plausibles para demostrar el funcionamiento de ESPOCH Pulse, pero no se presentarán como hechos reales ocurridos en la ESPOCH.
- No se utilizarán nombres de personas ni datos personales. El atributo `zona` podrá referirse a sectores o edificios, sin identificar personas.
- La prioridad no se calculará automáticamente todavía. Inicialmente será un atributo definido en los datos de demostración.
- El número de `reportes` podrá utilizarse posteriormente junto con la prioridad y la concentración espacial para análisis y mapas de calor.
- La capa se concentrará principalmente en la FIE como área piloto. Posteriormente podrán existir algunas incidencias simuladas en otras zonas del campus para demostrar escalabilidad.
- Los identificadores deberán ser únicos. Se respetarán los tipos y valores permitidos; `reportes` será un número entero y `es_simulado` será un booleano, no una cadena de texto.
- Los datos simulados permanecerán en `data/simulated/`, separados de los datos fuente y de las capas procesadas.

## Ejemplo conceptual único

La siguiente `Feature` es exclusivamente ilustrativa. La ubicación de referencia está dentro del campus, en el sector FIE; no acredita que exista un problema allí. El título, la situación, la fecha, la prioridad, el canal y el número de reportes son valores ficticios de demostración. Este ejemplo permanece únicamente en el documento y no se guarda como archivo de datos.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-78.6775332, -1.6555386]
  },
  "properties": {
    "id": "INC-001",
    "titulo": "SIMULADO: luminaria sin funcionamiento",
    "categoria": "iluminacion",
    "descripcion": "Escenario ficticio de demostración: una luminaria del sector FIE requiere revisión. No corresponde a un reporte real.",
    "estado": "nuevo",
    "prioridad": "media",
    "fecha_reporte": "2026-10-03T10:00:00-05:00",
    "reportes": 3,
    "origen": "qr",
    "zona": "FIE - Escuela ELECTRONICA",
    "es_simulado": true
  }
}
```
