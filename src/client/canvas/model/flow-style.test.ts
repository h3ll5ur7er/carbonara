import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { flowParticles, flowSaturation, flowWidth, MAX_FLOW_WIDTH, MIN_FLOW_WIDTH, particlesShown } from "./flow-style";

describe("flowWidth", () => {
  it("grows with the rate", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        (a, b) => {
          const [low, high] = a < b ? [a, b] : [b, a];
          expect(flowWidth(low)).toBeLessThanOrEqual(flowWidth(high));
        },
      ),
    );
  });

  it("grows with the log of the rate: ten times the flow adds about the same width", () => {
    const step = flowWidth(10) - flowWidth(1);
    expect(flowWidth(100) - flowWidth(10)).toBeCloseTo(step, 0);
    expect(flowWidth(100)).toBeLessThan(flowWidth(1) * 10);
  });

  it("stays between a hairline you can still see and a fat main bus", () => {
    expect(flowWidth(0)).toBe(MIN_FLOW_WIDTH);
    expect(flowWidth(undefined)).toBe(MIN_FLOW_WIDTH);
    expect(flowWidth(1e9)).toBe(MAX_FLOW_WIDTH);
  });
});

describe("flowSaturation", () => {
  it("is healthy up to 90% of the capacity", () => {
    expect(flowSaturation({ perSecond: 9, capacity: 10, overflow: false })).toBe("healthy");
  });

  it("is near capacity above 90%", () => {
    expect(flowSaturation({ perSecond: 9.3, capacity: 10, overflow: false })).toBe("near-capacity");
    expect(flowSaturation({ perSecond: 10, capacity: 10, overflow: false })).toBe("near-capacity");
  });

  it("is over capacity above 100% or when the solver reports an overflow", () => {
    expect(flowSaturation({ perSecond: 12, capacity: 10, overflow: false })).toBe("over-capacity");
    expect(flowSaturation({ perSecond: 1, capacity: 10, overflow: true })).toBe("over-capacity");
  });

  it("is healthy without a capacity, and unknown without a result", () => {
    expect(flowSaturation({ perSecond: 1e6, overflow: false })).toBe("healthy");
    expect(flowSaturation(undefined)).toBe("unknown");
  });

  it("forgives float noise at exactly full capacity", () => {
    expect(flowSaturation({ perSecond: 15.000000001, capacity: 15, overflow: false })).toBe("near-capacity");
  });
});

describe("flowParticles", () => {
  it("moves faster and packs denser as the rate grows", () => {
    const slow = particlesOf(0.1);
    const fast = particlesOf(50);
    expect(fast.speed).toBeGreaterThan(slow.speed);
    expect(fast.spacing).toBeLessThan(slow.spacing);
  });

  it("keeps speed and spacing within readable bounds", () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-3, max: 1e6, noNaN: true }), (rate) => {
        const particles = particlesOf(rate);
        expect(particles.speed).toBeGreaterThan(0);
        expect(particles.spacing).toBeGreaterThan(0);
        expect(particles.seconds).toBeCloseTo(particles.spacing / particles.speed);
      }),
    );
  });

  it("has no particles without flow", () => {
    expect(flowParticles(0)).toBeUndefined();
    expect(flowParticles(undefined)).toBeUndefined();
  });
});

function particlesOf(rate: number) {
  const particles = flowParticles(rate);
  if (!particles) throw new Error(`no particles at ${rate}`);
  return particles;
}

describe("particlesShown", () => {
  it("shows particles only while zoomed in far enough to see them move", () => {
    expect(particlesShown(1)).toBe(true);
    expect(particlesShown(0.2)).toBe(false);
  });
});
