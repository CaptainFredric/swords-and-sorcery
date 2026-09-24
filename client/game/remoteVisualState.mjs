let nextGeneration = 1;

function visualRoot(value) {
  return value?.root ?? value ?? null;
}

function removeVisual(shell) {
  if (shell.visual) shell.root.remove(shell.visual);
  shell.visual = null;
}

function disposeFallback(shell) {
  if (shell.fallbackDisposed) return;
  shell.fallbackDisposed = true;
  shell.fallbackDispose?.();
}

export function createRemoteVisualShell({ root, fallback, fallbackDispose = null }) {
  if (!root?.add || !root?.remove) throw new Error('Remote visual shell requires a stable root');
  const visual = visualRoot(fallback);
  if (!visual) throw new Error('Remote visual shell requires a fallback visual');

  root.add(visual);
  return {
    root,
    fallback,
    fallbackDispose,
    fallbackDisposed: false,
    visual,
    visualInstance: null,
    visualKind: 'fallback',
    generation: nextGeneration++,
    active: true,
    disposed: false,
    latestPlan: null,
  };
}

export function setRemoteVisualPlan(shell, plan) {
  if (!shell?.active) return;
  shell.latestPlan = plan;
  shell.visualInstance?.animator?.apply?.(plan, 0);
}

export function upgradeRemoteVisual(shell, instance, generation) {
  if (!instance) return false;
  if (!shell?.active || shell.disposed || generation !== shell.generation) {
    instance.dispose?.();
    return false;
  }

  const next = visualRoot(instance);
  if (!next) {
    instance.dispose?.();
    return false;
  }

  removeVisual(shell);
  disposeFallback(shell);
  shell.visualInstance?.dispose?.();

  shell.root.add(next);
  shell.visual = next;
  shell.visualInstance = instance;
  shell.visualKind = 'glb';
  if (shell.latestPlan) instance.animator?.apply?.(shell.latestPlan, 0);
  return true;
}

export function disposeRemoteVisualShell(shell) {
  if (!shell || shell.disposed) return;

  shell.disposed = true;
  shell.active = false;
  shell.generation = nextGeneration++;
  removeVisual(shell);

  if (shell.visualInstance) {
    shell.visualInstance.dispose?.();
    shell.visualInstance = null;
  } else {
    disposeFallback(shell);
  }

  shell.visualKind = 'disposed';
  shell.latestPlan = null;
}
