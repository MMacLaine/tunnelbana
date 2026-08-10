// The informed-player rule the probe bots share (0.14.0, with the fleet
// expansion). The shop card quotes the next train's marginal upkeep live, so
// the floor-of-competence bot reads it too and declines a train that would
// eat more than 12 percent of gross. Without this the first 0.14.0 candidate
// run binged seventeen trains inside era 1950, drowned in the fleet curve
// and never reached 1952, measuring its own spiral instead of the pacing.
// ONE definition, imported by probe-arc and probe-costs: the two probes must
// model the same player or cross-checking them (and checking telemetry
// against them) silently compares incompatible bots.
export function wouldBuyTrain(sim, g) {
  return sim.nextTrainUpkeep(g) <= 0.12 * Math.max(1, sim.grossRate(g));
}
