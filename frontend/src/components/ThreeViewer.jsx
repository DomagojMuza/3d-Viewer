import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import styles from './ThreeViewer.module.css';

const LOADERS = {
  glb: GLTFLoader,
  gltf: GLTFLoader,
  stl: STLLoader,
  obj: OBJLoader,
  ply: PLYLoader,
};

/**
 * Build a THREE.BufferGeometry from a parsed 3MF <object> element's <mesh>.
 */
function geometryFromMeshElement(meshEl) {
  const verts = meshEl.querySelectorAll('vertices > vertex');
  const tris = meshEl.querySelectorAll('triangles > triangle');
  if (!verts.length || !tris.length) return null;

  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3]     = parseFloat(verts[i].getAttribute('x'));
    positions[i * 3 + 1] = parseFloat(verts[i].getAttribute('y'));
    positions[i * 3 + 2] = parseFloat(verts[i].getAttribute('z'));
  }

  const indices = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    indices[i * 3]     = parseInt(tris[i].getAttribute('v1'), 10);
    indices[i * 3 + 1] = parseInt(tris[i].getAttribute('v2'), 10);
    indices[i * 3 + 2] = parseInt(tris[i].getAttribute('v3'), 10);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Parse a 3MF ArrayBuffer, handling BambuStudio / production-extension files
 * where meshes live in separate referenced model files (p:path="...").
 * Bypasses ThreeMFLoader and builds geometry directly from XML.
 */
function parse3MF(buf) {
  const zip = unzipSync(new Uint8Array(buf));
  const dec = new TextDecoder();
  const parser = new DOMParser();

  const mainData = zip['3D/3dmodel.model'];
  if (!mainData) throw new Error('3MF: missing 3D/3dmodel.model');

  const mainXml = dec.decode(mainData);
  const mainDoc = parser.parseFromString(mainXml, 'text/xml');

  const group = new THREE.Group();

  // Build map: p:path → transform matrix from main model's component refs
  const pathTransforms = {};
  for (const comp of mainDoc.querySelectorAll('component')) {
    const p = comp.getAttribute('p:path');
    if (!p) continue;
    const key = p.replace(/^\//, '');
    const tfStr = comp.getAttribute('transform');
    if (tfStr) {
      // 3MF transform is row-major 3x4: m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz
      const v = tfStr.trim().split(/\s+/).map(Number);
      if (v.length === 12) {
        const m = new THREE.Matrix4();
        m.set(
          v[0], v[3], v[6], v[9],
          v[1], v[4], v[7], v[10],
          v[2], v[5], v[8], v[11],
          0,    0,    0,    1
        );
        pathTransforms[key] = m;
      }
    }
  }

  const pathMatches = [...mainXml.matchAll(/p:path="([^"]+)"/g)];
  if (pathMatches.length === 0) {
    // Standard 3MF — parse main model directly
    const stdMeshes = [];
    for (const obj of mainDoc.querySelectorAll('object')) {
      const meshEl = obj.querySelector('mesh');
      if (!meshEl) continue;
      const geo = geometryFromMeshElement(meshEl);
      if (!geo) continue;
      const m = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      stdMeshes.push(mesh);
    }
    if (stdMeshes.length > 1) {
      const boxes = stdMeshes.map((mesh) => new THREE.Box3().setFromObject(mesh));
      let hasOverlap = false;
      outer: for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxes[i].intersectsBox(boxes[j])) { hasOverlap = true; break outer; }
        }
      }
      if (hasOverlap) {
        const cols = Math.ceil(Math.sqrt(stdMeshes.length));
        const rows = Math.ceil(stdMeshes.length / cols);
        const sizes = boxes.map((b) => { const s = new THREE.Vector3(); b.getSize(s); return s; });
        const maxX = Math.max(...sizes.map((s) => s.x));
        const maxZ = Math.max(...sizes.map((s) => s.z));
        const gap = Math.max(maxX, maxZ) * 0.2;
        stdMeshes.forEach((mesh, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const center = new THREE.Vector3();
          boxes[i].getCenter(center);
          mesh.position.x += -center.x + col * (maxX + gap) - ((cols - 1) * (maxX + gap)) / 2;
          mesh.position.z += -center.z + row * (maxZ + gap) - ((rows - 1) * (maxZ + gap)) / 2;
        });
      }
    }
    stdMeshes.forEach((mesh) => group.add(mesh));
    return group;
  }

  // BambuStudio: meshes in referenced sub-model files
  const subPaths = [...new Set(pathMatches.map((m) => m[1].replace(/^\//, '')))];
  const meshes = [];
  for (const subPath of subPaths) {
    if (!zip[subPath]) { console.warn('parse3MF: missing', subPath); continue; }
    const subDoc = parser.parseFromString(dec.decode(zip[subPath]), 'text/xml');
    for (const obj of subDoc.querySelectorAll('object')) {
      const meshEl = obj.querySelector('mesh');
      if (!meshEl) continue;
      const geo = geometryFromMeshElement(meshEl);
      if (!geo) continue;
      const m = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (pathTransforms[subPath]) mesh.applyMatrix4(pathTransforms[subPath]);
      meshes.push(mesh);
    }
  }

  // If any meshes overlap, arrange all in a grid layout
  if (meshes.length > 1) {
    const boxes = meshes.map((mesh) => new THREE.Box3().setFromObject(mesh));

    let hasOverlap = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].intersectsBox(boxes[j])) {
          hasOverlap = true;
          break outer;
        }
      }
    }

    if (hasOverlap) {
      const cols = Math.ceil(Math.sqrt(meshes.length));
      const rows = Math.ceil(meshes.length / cols);
      const sizes = boxes.map((b) => { const s = new THREE.Vector3(); b.getSize(s); return s; });
      const maxX = Math.max(...sizes.map((s) => s.x));
      const maxZ = Math.max(...sizes.map((s) => s.z));
      const gap = Math.max(maxX, maxZ) * 0.2;

      meshes.forEach((mesh, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const center = new THREE.Vector3();
        boxes[i].getCenter(center);
        mesh.position.x += -center.x + col * (maxX + gap) - ((cols - 1) * (maxX + gap)) / 2;
        mesh.position.z += -center.z + row * (maxZ + gap) - ((rows - 1) * (maxZ + gap)) / 2;
      });
    }
  }

  meshes.forEach((m) => group.add(m));
  return group;
}

export default function ThreeViewer({ url, format }) {
  const mountRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url || !format) return;
    setLoading(true);
    setError('');

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
    camera.position.set(0, 0, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Lights
    // Ambient + hemisphere in world space for base tone
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x332211, 0.4));
    // Overhead world-space light — subtle top-down shadows only
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.3);
    sunLight.position.set(0, 10, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    // Key + fill attached to camera — always illuminate from viewer's angle
    const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.8);
    keyLight.position.set(1.5, 2, 2); // upper-right-front in camera space
    camera.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fillLight.position.set(-2, -0.5, 1.5); // lower-left-front in camera space
    camera.add(fillLight);
    // Camera must be in scene for its children (lights) to work
    scene.add(camera);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const BINARY_PARSE_FORMATS = new Set(['3mf', 'stl', 'ply']);

    // Load model
    const LoaderClass = LOADERS[format.toLowerCase()];
    if (!LoaderClass && !BINARY_PARSE_FORMATS.has(format.toLowerCase())) {
      setError(`Unsupported format: .${format}`);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loader = LoaderClass ? new LoaderClass() : null;

    function onLoad(result) {
      if (cancelled) return;
      let object;
      if (format === 'glb' || format === 'gltf') {
        object = result.scene;
      } else if (format === 'stl') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
        object = new THREE.Mesh(result, mat);
        object.castShadow = true;
        object.receiveShadow = true;
      } else if (format === 'ply') {
        result.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, vertexColors: result.hasAttribute('color') });
        object = new THREE.Mesh(result, mat);
        object.castShadow = true;
        object.receiveShadow = true;
      } else {
        // 3MF, OBJ — loader returns a Group directly
        object = result.scene ?? result;
        object.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry && !child.geometry.attributes.normal) {
              child.geometry.computeVertexNormals();
            }
            child.material = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }

      // Add to scene first so world matrices are valid
      scene.add(object);
      object.updateMatrixWorld(true);

      // Compute bounding box in world space
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) {
        object.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.computeBoundingBox();
            if (child.geometry.boundingBox) {
              box.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
            }
          }
        });
      }

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;

      // Shift object so its center sits at origin
      object.position.set(-center.x, -center.y, -center.z);

      camera.position.set(0, 0, maxDim * 2.5);
      camera.near = Math.max(maxDim * 0.001, 0.001);
      camera.far = maxDim * 200;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.maxDistance = maxDim * 20;
      controls.update();

      setLoading(false);
    }

    function onError(err) {
      if (cancelled) return;
      console.error('ThreeViewer error:', err);
      const msg = err?.message || err?.type || String(err);
      setError(`Failed to load model: ${msg}`);
      setLoading(false);
    }

    // For binary formats use fetch+parse to avoid Three.js FileLoader blob URL issues
    if (BINARY_PARSE_FORMATS.has(format.toLowerCase())) {
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((buf) => {
          if (cancelled) return;
          let result;
          try {
            result = format.toLowerCase() === '3mf'
              ? parse3MF(buf)
              : loader.parse(buf);
          } catch (e) {
            onError(e);
            return;
          }
          try {
            onLoad(result);
          } catch (e) {
            onError(e);
          }
        })
        .catch(onError);
    } else {
      loader.load(url, (result) => {
        try { onLoad(result); } catch (e) { onError(e); }
      }, undefined, onError);
    }

    // Animation loop
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [url, format]);

  return (
    <div className={styles.wrapper}>
      {loading && <div className={styles.overlay}>Loading…</div>}
      {error && <div className={styles.overlay + ' ' + styles.error}>{error}</div>}
      <div ref={mountRef} className={styles.canvas} />
    </div>
  );
}
