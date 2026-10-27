// Hides how a flow's numbers become its look: width from the log of the rate, colour from how full its
// belt or pipe is, and particles whose speed and spacing encode the rate. All lengths are flow units.
import type { EdgeSlot } from "./result-slots";

export const MIN_FLOW_WIDTH = 1.5;
export const MAX_FLOW_WIDTH = 14;
/** Width added per tenfold rate. */
const WIDTH_PER_DECADE = 3;
/** Items per second where the log scale starts to bite; slower flows stay near the minimum. */
const RATE_SCALE = 0.1;

/** Above this share of the capacity a flow is near capacity. */
const NEAR_CAPACITY = 0.9;
/** Solver results carry float noise; a flow this close to its capacity is at it, not over. */
const TOLERANCE = 1e-6;

export type FlowSaturation = "healthy" | "near-capacity" | "over-capacity" | "unknown";

function decades(perSecond: number): number {
  return Math.log10(1 + perSecond / RATE_SCALE);
}

export function flowWidth(perSecond: number | undefined): number {
  if (!perSecond || perSecond <= 0) return MIN_FLOW_WIDTH;
  return Math.min(MAX_FLOW_WIDTH, MIN_FLOW_WIDTH + WIDTH_PER_DECADE * decades(perSecond));
}

export function flowSaturation(edge: EdgeSlot | undefined): FlowSaturation {
  if (!edge) return "unknown";
  if (edge.overflow) return "over-capacity";
  if (edge.capacity === undefined) return "healthy";
  const load = edge.perSecond / edge.capacity;
  if (load > 1 + TOLERANCE) return "over-capacity";
  if (load > NEAR_CAPACITY) return "near-capacity";
  return "healthy";
}

export interface FlowParticles {
  /** Distance between two particles. */
  spacing: number;
  /** Flow units per second. */
  speed: number;
  /** Time a particle takes to move one spacing: one cycle of the animation. */
  seconds: number;
}

const BASE_SPEED = 40;
const SPEED_PER_DECADE = 30;
const MAX_SPEED = 240;
const MAX_SPACING = 64;
const MIN_SPACING = 18;

/** Particles for a flow: faster and denser as the rate grows. None without flow. */
export function flowParticles(perSecond: number | undefined): FlowParticles | undefined {
  if (!perSecond || perSecond <= 0) return undefined;
  const speed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_DECADE * decades(perSecond));
  const spacing = Math.max(MIN_SPACING, MAX_SPACING / (1 + decades(perSecond) / 2));
  return { spacing, speed, seconds: spacing / speed };
}

/** Below this zoom particles are too small and too many to read, and only cost frames. */
const PARTICLE_MIN_ZOOM = 0.45;

export function particlesShown(zoom: number): boolean {
  return zoom >= PARTICLE_MIN_ZOOM;
}
