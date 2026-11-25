// Some of the Spellblade's props are hidden by their clips scaling them to nothing (the white flag is scale 0 in every
// clip but the white-flag defeat). A skinned mesh at scale 0 breaks three.js: an attached skin inverts the mesh's world
// matrix every frame, and a zero matrix has no inverse, so the skin's bounds come out NaN. Anything that measures the
// knight then measures NaN (the Siege Workshop's camera framed on it and showed nothing).
//
// So such a prop is never quite nothing: below HIDDEN_SCALE it is held at HIDDEN_SCALE and simply not drawn, and it is
// drawn again as soon as a clip brings it back. Only meshes a clip scales are guarded; whatever else hides a mesh
// (first person, the sight) keeps its own say.

export const HIDDEN_SCALE = 1e-4;

/** The skinned meshes whose scale some clip animates. */
export function scaleAnimatedMeshes(root, clips = []) {
  const names = new Set();
  for (const clip of clips) {
    for (const track of clip.tracks ?? []) {
      const dot = track.name.lastIndexOf('.');
      if (dot > 0 && track.name.slice(dot + 1) === 'scale') names.add(track.name.slice(0, dot));
    }
  }
  const meshes = [];
  root.traverse((object) => { if (object.isSkinnedMesh && names.has(object.name)) meshes.push(object); });
  return meshes;
}

/** Keep a scale-hidden prop invertible, and undrawn while it is hidden. */
export function settleScaleHidden(mesh) {
  const size = Math.max(Math.abs(mesh.scale.x), Math.abs(mesh.scale.y), Math.abs(mesh.scale.z));
  const hidden = !(size >= HIDDEN_SCALE * 2);
  if (!(size >= HIDDEN_SCALE)) mesh.scale.setScalar(HIDDEN_SCALE);
  if (hidden && mesh.visible) {
    mesh.visible = false;
    mesh.userData.hiddenByScale = true;
  } else if (!hidden && mesh.userData.hiddenByScale) {
    mesh.visible = true;
    mesh.userData.hiddenByScale = false;
  }
}

export function guardScaleHiddenProps(root, clips = []) {
  const meshes = scaleAnimatedMeshes(root, clips);
  for (const mesh of meshes) {
    const updateMatrixWorld = mesh.updateMatrixWorld;
    const updateWorldMatrix = mesh.updateWorldMatrix;
    mesh.updateMatrixWorld = function guardedUpdateMatrixWorld(force) {
      settleScaleHidden(this);
      return updateMatrixWorld.call(this, force);
    };
    mesh.updateWorldMatrix = function guardedUpdateWorldMatrix(parents, children) {
      settleScaleHidden(this);
      return updateWorldMatrix.call(this, parents, children);
    };
    settleScaleHidden(mesh);
  }
  return meshes;
}
