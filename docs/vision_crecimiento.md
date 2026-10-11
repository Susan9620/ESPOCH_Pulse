# Visión de crecimiento tecnológico de ESPOCH Pulse

ESPOCH Pulse parte de una prueba de concepto GIS con información geográfica y datos dinámicos simulados. Este documento propone una evolución progresiva hacia un Smart Campus, aprovechando infraestructura disponible, software libre, tecnologías de bajo costo y proyectos de estudiantes y docentes. Las fases, dispositivos, servicios y líneas de proyectos descritos son una visión futura, no implementaciones actuales ni compromisos institucionales aprobados.

## 1. Modelo de evolución

```text
Fase 1: GIS + datos abiertos + comunidad universitaria + QR
↓
Fase 2: Datos institucionales + aplicaciones web/móviles
↓
Fase 3: Sensores IoT económicos
↓
Fase 4: Analítica avanzada e inteligencia artificial
```

**Fase 1 — Base geográfica y participación.** Consolidar el GIS como referencia común del campus, utilizando datos abiertos y la participación de la comunidad para identificar necesidades. Los QR podrían vincular lugares físicos con información y reportes. La prueba actual demuestra estos conceptos con información dinámica y puntos QR simulados; no implica una red de QR instalada ni reportes comunitarios reales.

**Fase 2 — Integración institucional.** Incorporar progresivamente datos institucionales autorizados y aplicaciones web o móviles para consultar información, reportar necesidades y dar seguimiento a su atención. Se aprovecharían sistemas e infraestructura existentes, definiendo responsables de actualización y permisos de acceso.

**Fase 3 — Mediciones IoT.** Probar sensores económicos en sectores seleccionados, asociando sus mediciones con el GIS. Los pilotos permitirían evaluar utilidad, conectividad, mantenimiento y calidad de los datos antes de ampliar la cobertura.

**Fase 4 — Analítica avanzada e inteligencia artificial.** Explorar patrones temporales y espaciales, estimaciones de demanda o apoyo a la planificación cuando existan datos suficientes y confiables. Los resultados requerirían evaluación y revisión humana; no se presentan como capacidades ya implementadas.

La progresión dependería de necesidades verificadas, recursos disponibles y resultados de cada piloto. No exige desplegar todas las tecnologías simultáneamente.

## 2. IoT futuro de bajo costo

En una etapa posterior podrían integrarse dispositivos económicos basados en ESP32 y sensores apropiados para obtener mediciones de temperatura, humedad, iluminación, calidad del aire, consumo energético, ocupación o conteo y otras condiciones ambientales. El ESP32 actuaría como dispositivo de adquisición y comunicación; cada variable requeriría sensores e interfaces adecuados.

Estos dispositivos **no forman parte de la implementación actual**. Su integración sería futura y permitiría relacionar mediciones con ubicaciones concretas del campus mediante el GIS. Se podría comenzar con pocos puntos de interés en la FIE y aprovechar conectividad e infraestructura disponibles, sin sensorizar todo el campus desde el inicio.

Ejemplo conceptual de flujo:

```text
Sensor
↓
dato
↓
ubicación GIS
↓
análisis
↓
alerta o decisión
```

Por ejemplo, una futura medición de temperatura podría asociarse con un espacio del campus y analizarse junto con su evolución temporal para orientar una revisión de las condiciones ambientales. La generación de alertas requeriría criterios definidos y mediciones verificadas. Este ejemplo no describe sensores instalados ni alertas operativas.

## 3. ESPOCH Open Lab

**ESPOCH Open Lab** se propone como un espacio de reutilización académica de los datos y servicios generados alrededor del GIS. Una base geográfica compartida permitiría que distintos proyectos trabajen sobre referencias comunes, evitando reconstruir desde cero la información del campus.

```text
ESPOCH Pulse
↓
GIS y datos del campus
↓
API / servicios geográficos futuros
↓
estudiantes y docentes
↓
nuevos proyectos Smart Campus
```

Las futuras API y los servicios geográficos podrían facilitar consultas e intercambio de información documentada. Su acceso dependería de permisos, licencias y condiciones de uso; la reutilización académica no implica publicar indiscriminadamente información institucional o personal. Open Lab es una propuesta, y estas API y servicios no están implementados en la prueba actual.

## 4. Tipos de proyectos estudiantiles

Los siguientes nombres representan **líneas conceptuales de proyectos**, no sistemas actualmente desarrollados:

### Pulse Mobility

Proyectos de movilidad, transporte y parqueaderos: estudiar desplazamientos, disponibilidad de estacionamiento o necesidades de conexión entre sectores del campus.

### Pulse Access

Proyectos de accesibilidad y navegación: documentar condiciones verificadas y explorar alternativas de desplazamiento que respondan a distintas necesidades de movilidad.

### Pulse Green

Proyectos sobre áreas verdes, residuos y ambiente: relacionar información territorial con actividades de cuidado, gestión de residuos y seguimiento ambiental.

### Pulse Safety

Proyectos de seguridad e incidencias: facilitar la identificación de necesidades y el seguimiento de reportes georreferenciados, sin sustituir los procedimientos institucionales de atención.

### Pulse Maintenance

Proyectos de infraestructura y mantenimiento: organizar observaciones, necesidades de intervención e historial de atención asociado a lugares del campus.

### Pulse Energy

Proyectos de consumo energético y sensores: explorar mediciones y patrones de uso que ayuden a identificar oportunidades de eficiencia.

### Pulse Air

Proyectos de temperatura, humedad y calidad ambiental: estudiar mediciones localizadas y su variación entre espacios y momentos del día.

## 5. Tecnologías y modalidades académicas

Los estudiantes podrían desarrollar aplicaciones web, aplicaciones móviles o aplicaciones multiplataforma apoyadas en GIS, IoT, dashboards, inteligencia artificial y análisis de datos. La selección tecnológica respondería al problema y a los recursos disponibles, sin exigir que cada proyecto utilice todas estas herramientas.

Estas iniciativas podrían articularse mediante trabajos de titulación, proyectos integradores e investigación. La documentación de los datos, métodos y resultados permitiría que otros equipos continúen los proyectos y reutilicen sus aportes.

## 6. Relación con Smart Campus

La estrategia contribuiría a un Smart Campus al permitir que la universidad:

- Genere sus propios datos a partir de participación, procesos institucionales y futuros sensores.
- Reutilice información entre proyectos y áreas académicas.
- Detecte necesidades mediante observaciones y análisis vinculados al territorio.
- Genere soluciones progresivamente, evaluando pilotos antes de ampliarlos.
- Aproveche el talento estudiantil y docente para resolver problemas del campus.
- Reduzca la dependencia de soluciones externas costosas cuando existan alternativas viables.
- Mantenga una infraestructura común de información geográfica como base para integrar proyectos.

Este enfoque no elimina la necesidad de contratar tecnología o servicios externos. Algunas necesidades podrían requerir equipamiento especializado, soporte profesional o integraciones específicas. La propuesta busca combinar recursos propios y externos de manera gradual y sostenible.

## 7. Mensaje central

> “ESPOCH Pulse no propone comprar un Smart Campus terminado, sino construirlo progresivamente utilizando datos, software libre, infraestructura disponible y el talento de su propia comunidad universitaria.”
