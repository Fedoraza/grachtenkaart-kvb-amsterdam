import test from "node:test";
import assert from "node:assert/strict";
import { reportingPointsGeoJson } from "./reporting-points.mjs";

test("publishes every numbered direction from the supplied RZ marifoonkaart", () => {
  const data = reportingPointsGeoJson();
  const numbers = data.features.map((feature) => feature.properties.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 82 }, (_, index) => index + 1));
  assert.ok(data.features.every((feature) => Number.isFinite(feature.properties.bearing)));
  assert.ok(data.features.every((feature) => feature.properties.obligation.includes("Geen algemene meldplicht")));
});
