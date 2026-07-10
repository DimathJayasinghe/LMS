// Stub for the private `@zoom/download-manager` package, an optional AMD
// dependency of @zoom/meetingsdk's UMD bundle used only by its local-recording
// download UI. We disable recording entirely (auto_recording: 'none' in
// createZoomMeeting, see backend/src/utils/zoom.ts), so that code path is
// never exercised — this stub exists purely so bundlers can resolve the
// static `define(["exports", "@zoom/download-manager"], ...)` reference.
module.exports = {};
