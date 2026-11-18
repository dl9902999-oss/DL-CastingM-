// Each mount receives a new generation; a previous async continuation cannot
// become valid again when React remounts an effect in development StrictMode.
export function createSyncLifetime() {
  let generation = 0;
  let active = false;
  return {
    start() { active = true; generation++; },
    stop() { active = false; generation++; },
    capture() { const ownGeneration = generation; return () => active && generation === ownGeneration; },
  };
}
