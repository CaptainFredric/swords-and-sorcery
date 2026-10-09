# Continuous Castleward tour

Baseline: f882655.

The introductory circuit retains its three second pose and acceleration. Its final leg now runs to the route seam at full speed. Later circuits begin at full running speed with no introductory rest or acceleration. Fight anchors, choreography, rare encounter order, and Sky Bait memory remain unchanged.

The route positions are unchanged. Heading now interpolates neighboring sample tangents, including at the closed seam. TourDirector keeps its camera view, hero yaw, animator, and footfall state through the boundary. The entrance camera applies only to the initial departure. Rivals and temporary props are restored while the hero passes the entrance, away from the encounter anchors.

Verification: all 29 tour tests passed; full npm run verify passed with 1108 tests and the HTTP/WebSocket smoke test.

Browser evidence is captured from the production renderer and animator at 60 simulation frames per second around two consecutive circuit boundaries, in both Command View and Watch the Yard. Full circuits between captures were advanced through the same TourDirector update method. Capture frame filenames identify the mode, circuit, and frame. Audio was muted for capture. This is controlled timeline evidence rather than a real time screen recording.

Local capture directory: output/playwright/ui-refinement. Boundary states include route position, speed, yaw, gait phase, and camera position. The adjacent frames show the running pose and tracking camera continuing across the seam. The introductory camera is retained on a fresh menu entrance.
