import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { extractContour } from "./contour.js";
import { createCutters } from "./geometry.js";

const ready = Module({ locateFile: () => wasmUrl }).then((api) => {
  api.setup();
  return api;
});
self.onmessage = async ({
  data: { id, image, parameters, threshold, invert, detail },
}) => {
  try {
    const api = await ready;
    const { shapes, warnings } = extractContour(
      image,
      threshold,
      invert,
      detail,
    );
    const result = createCutters(api, shapes, parameters);
    self.postMessage({ id, result, warnings }, [
      result.positions.buffer,
      result.indices.buffer,
    ]);
  } catch (error) {
    self.postMessage({
      id,
      error: error.message || "Geometry calculation failed.",
    });
  }
};
