import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x78856a, 3));
  const light = new THREE.DirectionalLight(0xfff8e9, 4);
  light.position.set(-70, -80, 130);
  light.up.set(0, 0, 1);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -180,
    right: 180,
    top: 180,
    bottom: -180,
    near: 1,
    far: 500,
  });
  light.shadow.normalBias = 0.15;
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xc6e3cf, 2);
  fill.position.set(80, 50, 70);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.ShadowMaterial({ opacity: 0.12 }),
  );
  floor.position.z = -0.15;
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 20;
  controls.maxDistance = 700;
  const material = new THREE.MeshStandardMaterial({
    color: 0x478c76,
    roughness: 0.44,
    metalness: 0.02,
    flatShading: true,
  });
  let mesh,
    diameter = 95,
    center = 10;
  function reset() {
    camera.position.set(diameter * 0.85, -diameter * 1.2, diameter * 1.15);
    controls.target.set(0, 0, center);
    controls.update();
  }
  reset();
  const observer = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(canvas);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    setModel(result, fit = false) {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(result.positions, 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
      geometry.computeVertexNormals();
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const { min, max } = result.bounds;
      diameter = Math.max(max[0] - min[0], max[1] - min[1]);
      center = (max[2] - min[2]) / 3;
      if (fit) reset();
    },
    clear() {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
      }
    },
    reset,
    exportSTL() {
      if (!mesh) throw new Error("No shape has been created yet.");
      return new STLExporter().parse(mesh, { binary: true });
    },
  };
}
