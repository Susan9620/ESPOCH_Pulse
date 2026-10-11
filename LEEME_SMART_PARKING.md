# ESPOCH Pulse Smart Parking — demostración académica

## 1. Cómo abrirlo

1. Descomprimir la carpeta.
2. Abrir una terminal dentro de `ESPOCH_Pulse_SmartParking_Prototipo` (donde están `web/`, `data/` y `espoch-pulse-demo/`).
3. Ejecutar `py -m http.server 8000` en Windows, o `python -m http.server 8000`.
4. Visitar `http://localhost:8000/web/smart-parking.html`.
5. Si el puerto 8000 ya está ocupado, usar 8001 y abrir la URL correspondiente.

El servidor anterior `py espoch-pulse-demo/server.py` también puede utilizarse para visualizar el nuevo HTML. No se necesita base de datos para la DEMO.

Para ver mapas base y cargar Leaflet se requiere Internet. El servidor local debe estar encendido: abrir el archivo HTML directamente con `file://` impide la carga de GeoJSON en la mayoría de navegadores.

## 2. Qué demuestra

- Capas cartográficas reales de OpenStreetMap provenientes del proyecto original: edificios, vías y polígonos de estacionamiento.
- Red de tramos viales/peatonales con cálculo de recorrido por Dijkstra. El resultado es referencial: la topología, accesos peatonales y rutas aún NO se han verificado sobre el terreno.
- Cambios en la recomendación según destino, proporción de plazas libres y disponibilidad.
- Manejo de escenarios sin alternativas elegibles.

## 3. Qué es simulado y qué no

| Dato | Estado |
| --- | --- |
| Geometrías de cinco estacionamientos | Copiadas de OSM, sin certificación institucional |
| Capacidad Estacionamiento FIE 10 | Etiqueta de OSM, no verificada en campo |
| Capacidad sector Sistemas 50 | Etiqueta de OSM, no verificada en campo |
| Otras capacidades | SIMULADAS: 20, 18, 12 |
| Espacios disponibles | TODOS SIMULADOS; se modifican con barras |
| Acceso público o privado | NO VERIFICADO; se supone elegibilidad solo para probar el algoritmo |
| Distancia a pie | Estimación sobre una red OSM sin auditoría de conectividad, no guía de navegación |

Los nombres de sector (salvo nombres textuales OSM) son etiquetas de interfaz usadas para orientar el ejemplo, NO nombres institucionales. El proyecto no tiene un sistema de reservas ni sensores instalados.

## 4. Experimento sugerido para mostrar al docente

1. Elegir destino «FIE – Sistemas» y observar la recomendación.
2. Mover la barra de espacios libres del parqueadero recomendado a cero.
3. Observar que el sistema descarta esa alternativa y recomienda otra.
4. Cambiar a «FIE – Diseño Gráfico» y comprobar que cambia el peso de las distancias según destino.
5. Ajustar criterio «priorizar mayor disponibilidad» y explicar el efecto de la regla de decisión.

## 5. Antes de una implementación real

1. Validar con la ESPOCH qué parqueaderos forman parte del piloto, su capacidad, nombre oficial y accesos permitidos.
2. Auditar red de vías y senderos, recuperar conexiones de ingreso faltantes y calcular rutas vehiculares y peatonales separadas.
3. Integrar conteo real de ocupación, con hora de actualización y tratamiento de datos desactualizados.
4. Crear backend autenticado para operadores y panel de administración.
5. Medir exactitud de disponibilidad, tiempos de búsqueda y tasa de recomendaciones correctas.

### Atribución

Datos geográficos: © colaboradores de OpenStreetMap, [ODbL](https://www.openstreetmap.org/copyright). El proyecto conserva las fuentes inalteradas en `data/base/` y los escenarios en `data/simulated/`.
