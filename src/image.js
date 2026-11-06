// SVG is decoded as an image, never inserted into the page. Accept only plain
// local shape elements; scripts, external references and embedded HTML are rejected.
export async function imageBlob(file) {
  if (
    !file.name.toLowerCase().endsWith(".svg") &&
    file.type !== "image/svg+xml"
  )
    return file;
  const xml = new DOMParser().parseFromString(
    await file.text(),
    "image/svg+xml",
  );
  const elements = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "title",
    "desc",
  ]);
  const attributes = new Set([
    "xmlns",
    "width",
    "height",
    "viewBox",
    "preserveAspectRatio",
    "d",
    "points",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "fill",
    "fill-rule",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "opacity",
    "transform",
    "id",
    "version",
  ]);
  if (
    xml.documentElement.localName !== "svg" ||
    xml.getElementsByTagName("parsererror").length
  )
    throw new Error("The SVG file is invalid.");
  const metadata = xml.getElementsByTagNameNS("http://www.w3.org/2000/svg", "metadata");
  for (const element of Array.from(metadata)) element.parentNode.removeChild(element);

  for (const element of xml.getElementsByTagName("*")) {
    if (!elements.has(element.localName))
      throw new Error(
        "Please use a simple SVG silhouette without embedded content.",
      );
    for (const attribute of element.attributes) {
      if (
        !attributes.has(attribute.name) ||
        (/url\s*\(|javascript:|https?:/i.test(attribute.value) &&
          attribute.name !== "xmlns")
      )
        throw new Error(
          "This SVG contains unsupported styles or external content. Please export it as a PNG.",
        );
    }
  }
  return new Blob([new XMLSerializer().serializeToString(xml.documentElement)], {
    type: "image/svg+xml",
  });
}
