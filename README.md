# Ausstecherle

A small, static browser app: drop a silhouette, convert it into a cookie cutter, preview it in 3D and download a binary STL. Plain JavaScript, HTML and custom CSS with Vite. No React, TypeScript, backend, accounts or image uploads. The interface is in English.

## Run locally

Use Node.js 22.12+ (or 20.19+) and npm:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Use it

1. Choose or drop a PNG, SVG, JPG or WebP file.
2. Set the size if needed. The slider below **Convert** defaults to **50 mm horizontal contour width (X)**. Type a precise width or height (Y); the other dimension is calculated from the detected contour while preserving proportions.
3. Optionally expand **Settings** for the wall cross-section diagram, dimensions and **Contour detail**. Higher detail retains more contour points; lower it if conversion is slow. Dense contours are automatically simplified to fit the 600-point limit.
4. Click **Convert**, inspect the preview and download the STL.

Changes only affect the 3D model after clicking Convert. Files stay on the device. The app starts empty and has no sample buttons.

## Defaults

| Setting            | Default      | Meaning                                                       |
| ------------------ | ------------ | ------------------------------------------------------------- |
| Contour width (X)  | 50 mm        | Horizontal span of the wall centerline, excluding the base    |
| Contour height (Y) | Proportional | Calculated from the detected silhouette; can also be edited   |
| Wall height        | 20 mm        | Above the top of the base                                     |
| Wall thickness     | 1.2 mm       | Symmetrical around the image contour                          |
| Taper starts at    | 15 mm        | The final 5 mm of the wall becomes thinner                    |
| Cutting edge       | 0.1 mm       | Finite top thickness, not a mathematical point                |
| Base thickness     | 5 mm         | Vertical thickness of the open flange                         |
| Base margin        | 5 mm         | From the outside of the lower wall to the outside of the base |

Total height is 25 mm by default. A square with 50 mm contour width has an outer width of 61.2 mm with the default wall and base. The opening continues through the base. The dimension guide is a schematic example, not a scale drawing or live preview.

## Manual sample files

`examples/` contains a heart, star, square and long snake silhouette, each as a **PNG and SVG**. Load these yourself using the file chooser or drag and drop. They are not automatically loaded or bundled into the website.

```sh
npm run examples
```

This regenerates the samples deterministically. SVG input supports plain local shapes; scripts, external references, styles and embedded HTML are rejected. SVGs are rasterized locally and then use the same contour pipeline as PNGs.

## Static hosting

```sh
npm run build
```

Upload the **contents of `dist/`** to ordinary static hosting, including `assets/` and `dimension-guide.svg`. Relative paths support subdirectories. No Node server is needed on the host. The server must serve `.wasm` files (normally `application/wasm`). Everything needed at runtime is included; no CDN dependency.

Preview the exact production build locally:

```sh
npm run preview
```

## Docker Compose with the existing HTTPS proxy

This follows the Caddy setup in `modmoto/host-bootstrap` and the external `caddy` network used by `modmoto/ItWorksOnMyMachine_org`. An older checkout also contains an nginx-proxy setup; this configuration targets the newer Caddy setup.

The Dockerfile builds with Node.js and copies only the static build into Nginx. Node.js is not part of the running image. There is no application backend. The website container exposes port 80 only inside Docker, so it does not compete with Caddy's public ports 80/443.

From the repository root on the Docker host:

```sh
# The existing Caddy stack must already be running on this network.
docker network inspect caddy

# Build and start the static website.
docker compose up -d --build
```

Add the block from `docker/Caddyfile.example` to your **existing** `host-bootstrap/caddy/Caddyfile`, replacing `ausstecherle.example.com` with the real hostname. Set that domain's DNS A/AAAA records to your server and keep ports 80 and 443 reachable by Caddy. Caddy obtains and renews the TLS certificate automatically; no certificate files or HTTPS environment variables are needed in the website container.

From the existing `host-bootstrap/caddy` directory, validate and reload the updated proxy configuration:

```sh
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The `caddy` external network must be shared by both stacks **on the same Docker host**. Do not replace the existing Caddyfile with the example or start another proxy for this app. If the network is missing, start the existing Caddy setup first; creating a separate network alone does not connect that proxy.

For updates, run `docker compose up -d --build` again from this repository. Nginx revalidates the HTML entry point and caches Vite's content-hashed assets. Its standard MIME mappings serve the geometry engine as `application/wasm`.

To test just the built image locally without Caddy:

```sh
docker build -t imagetoausstecherle:local .
docker run --rm -p 127.0.0.1:8080:80 imagetoausstecherle:local
```

Open `http://127.0.0.1:8080/`. This local-only command serves plain HTTP; production HTTPS belongs to the existing Caddy proxy. The example hostname is a placeholder and has not been deployed or added to DNS.

## How it works

- Canvas decodes the image, proportionally downsamples it to at most 508 pixels, and adds a transparent border.
- A threshold turns the image into a binary mask, compositing transparency over white.
- **D3-Contour** detects closed contours; Ramer–Douglas–Peucker simplifies the largest outer boundary. This small library replaces the initially considered OpenCV package for simple silhouettes.
- **Manifold WebAssembly** runs in a **Web Worker**. Offsets form an open base and wall. Tapered segment wedges and rounded joins narrow the wall without scaling the overall silhouette.
- Manifold unites the parts into a connected solid. **Three.js** displays and exports the same mesh using STLExporter.

Manifold objects are explicitly freed after each calculation. Stale calculation and image-loading results cannot replace newer settings.

## Tests and limits

```sh
npm test
```

Seven tests cover all four actual PNGs, mesh edge closure and orientation, connectivity, the through opening, parameter changes, binary STL roundtrips and horizontal sizing of tall contours.

The prototype targets clear silhouettes, not photos or automatic centerline tracing. Only the largest outer contour is used; additional shapes and ignored internal contours are reported. Raster resolution and simplification approximate tiny details. Tight regions can merge when the wall or base is wide; inspect the result in a slicer. Inputs are limited to 20 MB and 600 simplified contour vertices.

A modern browser with WebGL, WebAssembly and Web Workers is required. STL does not record units: import in **millimeters**. Geometry and exports are tested; a physical print has not been tested.

## Source layout

- `src/main.js`: file loading, settings, linked width/height and downloads
- `src/contour.js`: raster mask, contour detection, simplification and scaling
- `src/geometry.js`: parameter validation and solid construction
- `src/worker.js`: background geometry computation
- `src/viewer.js`: Three.js preview and STL export
- `src/style.css`: all interface styling
- `public/dimension-guide.svg`: annotated wall cross-section
