// Maps file extension to the Three.js loader import path (from 'three/addons/')
export const LOADER_MAP = {
  glb: 'loaders/GLTFLoader',
  gltf: 'loaders/GLTFLoader',
  stl: 'loaders/STLLoader',
  obj: 'loaders/OBJLoader',
  '3mf': 'loaders/3MFLoader',
  ply: 'loaders/PLYLoader',
};

export function isSupported(format) {
  return format in LOADER_MAP;
}
