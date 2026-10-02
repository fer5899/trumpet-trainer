# Trumpet Trainer — Documento de idea (MVP)

## 1. Resumen

Aplicación web sencilla para entrenar el oído y la lectura "de oído" con la trompeta.
La app reproduce una melodía corta de 5 notas aleatorias y el usuario debe tocarla
con su trompeta. La app escucha por el micrófono y va marcando cada nota acertada.

## 2. Objetivo del MVP

Validar el bucle básico **escuchar → reproducir con la trompeta → feedback inmediato**
con la mínima interfaz posible, sin cuentas, sin persistencia y sin configuración.

## 3. Público

Trompetistas principiantes e intermedios con trompeta en Si♭.

## 4. Flujo de uso

1. **Pantalla de inicio**: un único botón **"Empezar entrenamiento"**.
2. **Reproducción de la melodía**:
   - Se generan 5 notas aleatorias.
   - Se reproducen seguidas, **0,5 s cada una**.
   - Durante la reproducción el micrófono **no** escucha (para no detectar el propio altavoz).
3. **Fase de escucha**:
   - Se muestran **5 recuadros grises**, uno por nota.
   - La **nota activa** (la que toca tocar ahora) se resalta con un borde/recuadro.
   - El micrófono analiza el tono en tiempo real.
   - Cuando se detecta la nota correcta de forma **sostenida durante ≥ 0,5 s**:
     - el recuadro se pinta de **verde**,
     - se muestra dentro el **nombre de la nota**,
     - la nota activa pasa al siguiente recuadro.
   - Si se toca una nota incorrecta **no pasa nada**: la app sigue esperando la correcta.
   - Botones disponibles en esta fase:
     - **"Repetir melodía"**: vuelve a reproducir la melodía (pausando la escucha mientras suena; el progreso ya conseguido se conserva).
     - **"Rendirse"**: abandona el ejercicio y vuelve a la pantalla de inicio.
4. **Final**: al completar las 5 notas se vuelve **directamente** a la pantalla de inicio.

## 5. Reglas musicales

### 5.1 Instrumento y transposición

- Las notas se definen en **notación escrita para trompeta en Si♭**.
- El sonido real (concierto) está **un tono (2 semitonos) por debajo** de lo escrito.
- Tanto la melodía reproducida como la detección trabajan en **altura de concierto**;
  los nombres que se muestran al usuario son los **escritos**.

| | Nota más grave | Nota más aguda |
|---|---|---|
| Escrita (Si♭) | Fa#3 | Do5 |
| Sonido real (concierto) | Mi3 (≈164,8 Hz) | Si♭4 (≈466,2 Hz) |
| MIDI escrito / concierto | 54 / 52 | 72 / 70 |

> Convención de octavas: Do4 = Do central (científica, MIDI 60).

### 5.2 Generación de la melodía

- 5 notas elegidas al azar, de forma independiente, entre las **19 notas cromáticas**
  del rango escrito Fa#3–Do5 (semitonos incluidos).
- Se permiten notas repetidas en el MVP.
- Cada nota dura 0,5 s, sin silencio entre ellas.

### 5.3 Nombres de notas

- Notación **latina**: Do, Re, Mi, Fa, Sol, La, Si, con número de octava (p. ej. *Fa#3*, *Do5*).
- Alteraciones: por defecto se muestran con **sostenido** (#). *(Ver preguntas abiertas.)*

### 5.4 Criterio de acierto

- Tolerancia de afinación: **±25 cents** respecto a la frecuencia objetivo (concierto, La4 = 440 Hz).
- La nota debe mantenerse dentro de la tolerancia de forma **continua durante ≥ 0,5 s**.
  Si sale de la tolerancia, el contador se reinicia.
- La octava importa: tocar la nota correcta en otra octava no cuenta.

## 6. Interfaz (boceto)

```
 Inicio                       Escucha
┌──────────────────────┐     ┌───────────────────────────────────────┐
│                      │     │  [Fa#3] [ Sol4 ] ┏━━━━┓ [    ] [    ] │
│ [Empezar entrenam.]  │     │  verde   verde   ┃    ┃  gris   gris  │
│                      │     │                  ┗━━━━┛ ← nota activa │
└──────────────────────┘     │  [Repetir melodía]      [Rendirse]    │
                             └───────────────────────────────────────┘
```

## 7. Requisitos técnicos (propuesta)

- **Web, solo frontend**, sin backend. Funciona en navegadores de escritorio y móvil modernos.
- **Audio de salida**: Web Audio API (oscilador con envolvente simple, o samples de trompeta más adelante).
- **Entrada**: `getUserMedia` + `AnalyserNode`; detección de tono monofónica
  (p. ej. autocorrelación / YIN / McLeod) en el rango ≈150–500 Hz.
- Se requiere **HTTPS** (o localhost) y permiso de micrófono; si se deniega, mostrar mensaje claro.
- El audio debe iniciarse tras la interacción del usuario (botón), por las políticas de autoplay.

## 8. Fuera del alcance del MVP

- Cuentas de usuario, historial, estadísticas o puntuación.
- Niveles de dificultad, longitud o tempo configurables.
- Elección de instrumento/transposición (Do, Fa, Mi♭...).
- Partitura / pentagrama.
- Ritmo: solo importa la altura, no la duración ni el tiempo entre notas.

## 9. Ideas futuras

- Mostrar en vivo la nota detectada y un afinador (cents de desviación).
- Contador de fallos/intentos y tiempo por ejercicio.
- Dificultad progresiva: rango, intervalos máximos, tonalidades, longitud de la melodía.
- Melodías basadas en escalas en lugar de cromatismo puro.
- Sonido de trompeta realista para la melodía.
- Selector de transposición y de notación (latina/anglosajona).
- Mostrar la melodía en pentagrama tras completarla.

## 10. Preguntas abiertas

- **Enarmonías**: ¿mostrar siempre sostenidos (Fa#, Do#...) o usar bemoles en algunos casos (Si♭, Mi♭)?
- **Volumen / ruido**: ¿umbral mínimo de volumen para ignorar ruido ambiente? (propuesta: sí, calibrable más adelante).
- **Uso con altavoces**: el micrófono puede captar la melodía; se mitiga no escuchando durante la reproducción. ¿Recomendar auriculares?
- **Saltos grandes**: con notas totalmente aleatorias pueden salir intervalos de hasta 18 semitonos. ¿Limitar el intervalo máximo entre notas consecutivas?
