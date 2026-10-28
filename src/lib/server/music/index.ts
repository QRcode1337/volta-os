// Public surface of the VOLTA Music server code.
export { getLibrary, getCandidates, resolveTrack, assertLocal, trackCover, setRootEnabled, musicInputs, metaKeyFor, trackIdFor } from './library';
export type { ResolvedTrack, RawTrack } from './library';
export { readMeta, writeTrackMeta, sanitizeMeta } from './meta';
export { loadConfig } from './config';
