#!/usr/bin/env bash
set -euo pipefail

npm run test:run -- tests/integration/engine/PerformanceReport.integration.test.ts
npm run test:run -- tests/integration/engine/RecoveryPolicy.integration.test.ts tests/integration/engine/ErrorEvent.integration.test.ts tests/integration/engine/DebugState.integration.test.ts
npm run typecheck
npm run build
npm run test:browser:raster-ellipsoid-host
npm run test:browser:surface-tiles
npm run test:metrics:baseline

echo "map-engine checks: PASS"
