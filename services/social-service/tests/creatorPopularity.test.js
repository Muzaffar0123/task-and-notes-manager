const assert = require("node:assert/strict");
const { test } = require("node:test");
const { creatorLevel } = require("../src/services/creatorPopularity");

test("creator levels follow the configured score thresholds", () => {
  const cases = [
    [0, "New Creator"],
    [49, "New Creator"],
    [50, "Bronze"],
    [199, "Bronze"],
    [200, "Silver"],
    [499, "Silver"],
    [500, "Gold"],
    [1499, "Gold"],
    [1500, "Platinum"],
    [4999, "Platinum"],
    [5000, "Diamond"],
  ];
  for (const [score, level] of cases) assert.equal(creatorLevel(score), level);
});
