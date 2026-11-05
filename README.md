# Ausstecherle

Eine kleine, statische Browser-Anwendung: PNG-Silhouette laden, Ausstechform gestalten und binäre STL herunterladen. Normales JavaScript, HTML und eigenes CSS, gebaut mit Vite. Kein React, TypeScript, Backend, Konto oder Bild-Upload.

## Lokal starten

Node.js 22.12 oder neuer (alternativ 20.19+) und npm:

```sh
npm ci
npm run dev
```

Die von Vite ausgegebene lokale Adresse öffnen. Die vier mitgelieferten transparenten PNGs liegen unter `examples/`: Herz, Stern, Quadrat und eine längere, breite Schlangenlinie. Zu jedem Motiv gibt es eine PNG- und SVG-Datei zum manuellen Laden. Die Oberfläche startet leer und lädt keine Beispiele automatisch. SVGs werden lokal gerastert; eingebettete Inhalte und externe Referenzen werden abgelehnt.

## Einfach hosten

```sh
npm run build
```

Den **Inhalt von `dist/`** auf beliebiges statisches Hosting kopieren, inklusive `assets/`. Relative Asset-Pfade erlauben auch Unterverzeichnisse. Es wird kein Node-Server auf dem Hosting benötigt. Der Webserver muss `.wasm`-Dateien ausliefern können (üblicher MIME-Typ: `application/wasm`). Alle Laufzeitdateien werden mitgeliefert; keine CDN-Abhängigkeit.

Zum lokalen Prüfen genau dieses Builds:

```sh
npm run preview
```

## Einstellungen

| Parameter     | Standard | Bedeutung                                                           |
| ------------- | -------- | ------------------------------------------------------------------- |
| Konturgröße   | 80 mm    | Längste Seite der erkannten Kontur, gemessen an der Wandmittellinie |
| Wandhöhe      | 20 mm    | Ab Oberseite der Base                                               |
| Wandstärke    | 1,2 mm   | Symmetrisch um die Bildkontur                                       |
| Verjüngung ab | 15 mm    | Letzte 5 mm der 20-mm-Wand werden dünner                            |
| Schneidkante  | 0,1 mm   | Obere Wandstärke; keine mathematisch scharfe Spitze                 |
| Base          | 5 mm     | Vertikale Dicke der offenen, umlaufenden Base                       |
| Randabstand   | 5 mm     | Von der äußeren unteren Wand bis zum äußeren Rand der Base          |

Gesamthöhe = Base + Wandhöhe. Tatsächliche Außenmaße werden in der Vorschau angezeigt. Bei 80 mm Konturgröße ist die längste Seite mit Standardwand und Base etwa 91,2 mm. Die innere Öffnung geht durch die Base hindurch.

## Bedienung

Bild auswählen oder hineinziehen, **Konvertieren** klicken, Vorschau prüfen und STL herunterladen. Unter **Maße anpassen** lassen sich optional die eingeklappten Maße ändern. Änderungen werden erst beim nächsten Klick auf Konvertieren angewendet. Standard-Gesamthöhe: 25 mm (5 mm Base + 20 mm Wand).

## Verarbeitung

1. Bild lokal einlesen, proportional auf höchstens 508 Pixel verkleinern und mit transparentem Rand versehen.
2. Transparenz auf Weiß rechnen und per einstellbarem Schwellwert in eine Maske umwandeln.
3. **D3-Contour** extrahiert geschlossene Konturen. Ramer–Douglas–Peucker vereinfacht die größte Außenkontur.
4. In einem **Web Worker** berechnet **Manifold (WebAssembly)** die offene Base, gerade Wand und verjüngte Wand. Die Verjüngung besteht aus keilförmigen Segmenten mit gerundeten Verbindungen; sie skaliert nicht das gesamte Motiv.
5. Manifold vereinigt die Teile zu einem zusammenhängenden Körper. **Three.js** zeigt genau dieses Mesh und exportiert es mit dem STLExporter.

Die kleine D3-Contour-Bibliothek ersetzt hier das ursprünglich erwogene größere OpenCV-Paket; für klare Silhouetten ist keine allgemeine Computer-Vision-Bibliothek nötig. Manifold-Objekte werden nach jeder Berechnung explizit freigegeben. Veraltete Berechnungsergebnisse können eine neuere Einstellung nicht überschreiben.

## Grenzen des Prototyps

- Für klare Silhouetten gedacht, nicht für Fotos oder die automatische Interpretation gezeichneter Linien.
- Nur die größte Außenkontur wird verwendet. Innere Bildkonturen werden ignoriert; weitere getrennte Motive werden gemeldet.
- Die Schlangenlinie ist eine breite, geschlossene Silhouette, kein offener Mittellinienpfad.
- Kleine Details sind durch Rasterauflösung und Konturvereinfachung angenähert. Sehr enge Stellen können durch Wand oder Base zusammenwachsen; vor dem Druck im Slicer prüfen.
- Upload maximal 20 MB; zur Begrenzung der Rechenzeit höchstens 600 vereinfachte Konturpunkte.
- Moderner Browser mit WebAssembly, Web Workers und WebGL benötigt.
- STL enthält keine Einheit. Koordinaten werden in Millimetern erzeugt; im Slicer entsprechend importieren.
- Geometrie und Export sind automatisiert geprüft; ein realer Probedruck steht noch aus.

## Prüfen und Beispiele neu erzeugen

```sh
npm test
npm run examples
```

Die Pipeline-Tests lesen alle vier tatsächlichen PNG-Dateien, prüfen die Mesh-Kanten, Zusammenhang, durchgehende Öffnung, Maße und einen binären STL-Roundtrip. Weitere Tests prüfen ungültige Eingaben und geänderte Maße. Die PNGs werden deterministisch mit einem kleinen Node-Skript erzeugt.

## Dateien

- `src/main.js`: Oberfläche, Dateieingabe, Einstellungen und Download
- `src/contour.js`: Rastermaske, Konturerkennung und Vereinfachung
- `src/geometry.js`: Parameterprüfung und Körperaufbau
- `src/worker.js`: Berechnung abseits der Oberfläche
- `src/viewer.js`: Three.js-Vorschau und STL-Export
- `src/style.css`: gesamte Gestaltung
