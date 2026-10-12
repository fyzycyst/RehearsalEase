# RehearsalEase invariants

- Microphone begins only through explicit Start after local readiness and valid input; no microphone in navigation, readiness or install handlers.
- Recognition requires processLocally:true. No cloud fallback, automatic restart, recording, assets, storage or upload.
- Rehearse has no time, target, pace, progress or analysis. Review owns all performance numbers; text-size adjustment is a reading control.
- Script renders with textContent; HTML remains literal and Markdown destinations never become fetched assets.
- Empty scripts and invalid/zero target block Start. Script and target freeze per run; reading size remains adjustable. Try again/Edit await cleanup and preserve UI settings.
- Finish/Stop/error/background/pagehide share session cleanup; app-owned tracks stop immediately and recognition finalization waits at most one second. Late callbacks cannot revive a completed run.
- Quiet requires observed acoustic input lasting at least two seconds; transcript gaps and unobserved periods never become quiet. Pace counts finalized recognized words once and includes pauses.
- Primary entry uses shared-track; generic mounts default to voice-only. Missing acoustic input/calibration makes quiet analysis explicitly unavailable. Simulation cannot confirm live microphone shutdown.
- Automated tests and manual browser/hardware verification provide distinct evidence. No browser version or acoustic accuracy guarantee is implied.
