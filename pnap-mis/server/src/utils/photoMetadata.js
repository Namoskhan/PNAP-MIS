const fs = require('fs');
const crypto = require('crypto');
const exifr = require('exifr');

// SRS §7.3 — every photo uploaded against a meeting / activity must
// carry verifiable EXIF metadata so a Senior Mawin can't recycle an
// older picture or upload a screenshot. We extract DateTimeOriginal
// + GPS from the raw bytes, hash the file (so duplicates are caught),
// and return a structured verdict the controller uses to accept or
// reject the upload.
//
// Defaults (overridable per-call):
//   • A photo's capture timestamp must be no older than `maxAgeHours`
//     before the event start (default 24h pre-event).
//   • A photo's capture timestamp must be no later than `maxFutureHours`
//     after now (default 6h grace for clock skew).
//   • If `eventStart` is supplied, the capture must fall inside
//     [eventStart - maxAgeHours, now + maxFutureHours].
//   • Missing DateTimeOriginal => reject (most "downloaded from web /
//     screenshot" images strip EXIF, so this filters them out cheaply).
// Haversine distance in metres between two lat/lng points.
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function inspectPhoto(filePath, opts = {}) {
  const {
    eventStart,
    eventGps,
    maxAgeHours = 24,
    maxFutureHours = 6,
    requireGps = false,
    // PR F1: requireExif defaults to TRUE for backwards compat.
    // EventTypeConfig.photoPolicy.requireExif can flip it false for
    // types that want to accept timestamp-less uploads (e.g.
    // photographs supplied by external press where EXIF was stripped).
    requireExif = true,
    maxVenueDistanceMeters = 1000,
  } = opts;
  const bytes = await fs.promises.readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  let exif = null;
  try {
    exif = await exifr.parse(bytes, { gps: true, tiff: true, ifd0: true, exif: true });
  } catch {
    exif = null;
  }

  const capturedAt = exif?.DateTimeOriginal || exif?.CreateDate || null;
  const gpsLat = typeof exif?.latitude === 'number' ? exif.latitude : null;
  const gpsLng = typeof exif?.longitude === 'number' ? exif.longitude : null;

  if (!capturedAt && requireExif) {
    return {
      ok: false,
      reason: 'No capture timestamp in photo metadata. Upload a photo taken with a phone camera (gallery export with EXIF intact) — screenshots and web-downloaded images are rejected.',
      sha256,
    };
  }
  // When requireExif=false and the photo has no timestamp, skip the
  // age / future-cutoff checks entirely — without a timestamp those
  // would always pass anyway.
  if (!capturedAt) {
    const gps = (gpsLat != null && gpsLng != null) ? { lat: gpsLat, lng: gpsLng } : undefined;
    if (requireGps && !gps) {
      return { ok: false, reason: 'Photo has no GPS metadata.', sha256 };
    }
    return { ok: true, sha256, capturedAt: null, gps };
  }

  const now = Date.now();
  const captured = new Date(capturedAt).getTime();
  const futureCutoff = now + maxFutureHours * 3600 * 1000;
  if (captured > futureCutoff) {
    return {
      ok: false,
      reason: `Photo capture timestamp is in the future (${new Date(captured).toISOString()}). Check the device clock.`,
      sha256,
    };
  }

  if (eventStart) {
    const eventStartMs = new Date(eventStart).getTime();
    const earliest = eventStartMs - maxAgeHours * 3600 * 1000;
    if (captured < earliest) {
      return {
        ok: false,
        reason: `Photo was captured on ${new Date(captured).toLocaleString()}, before the meeting/activity window. Old or recycled photos are rejected.`,
        sha256,
      };
    }
  } else {
    // Fallback: if no event time supplied, just reject if the photo
    // is older than 30 days — keeps the system from accepting stale
    // pictures uploaded weeks after the fact.
    if (captured < now - 30 * 24 * 3600 * 1000) {
      return {
        ok: false,
        reason: `Photo is older than 30 days (captured ${new Date(captured).toLocaleString()}).`,
        sha256,
      };
    }
  }

  const gps = (gpsLat != null && gpsLng != null) ? { lat: gpsLat, lng: gpsLng } : undefined;

  if (requireGps && !gps) {
    return {
      ok: false,
      reason: 'Photo has no GPS metadata. Enable location services on the camera and re-shoot the photo.',
      sha256,
    };
  }

  if (eventGps && gps && eventGps.lat != null && eventGps.lng != null) {
    const dist = distanceMeters(gps, eventGps);
    if (dist > maxVenueDistanceMeters) {
      return {
        ok: false,
        reason: `Photo was taken ${(dist / 1000).toFixed(1)} km from the meeting venue (limit ${maxVenueDistanceMeters} m). Photos must be taken at the venue.`,
        sha256,
      };
    }
  }

  return {
    ok: true,
    sha256,
    capturedAt: new Date(captured),
    gps,
  };
}

module.exports = { inspectPhoto };
