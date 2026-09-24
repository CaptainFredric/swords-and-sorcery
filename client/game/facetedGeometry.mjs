import * as THREE from 'three';
import { validateGeometryData } from './facetedGeometryData.mjs';

export function geometryFromData(data) {
  validateGeometryData(data);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function facetedMesh(data, material, {
  castShadow = true,
  receiveShadow = true,
  name = '',
} = {}) {
  const mesh = new THREE.Mesh(geometryFromData(data), material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.name = name;
  return mesh;
}
