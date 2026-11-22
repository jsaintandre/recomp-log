# Recomp Training Log

A per-set workout checklist for the Day A, B, C recomp program and the 12-3-30 incline walk. It runs in the browser as a home screen app and keeps working with no signal.

## Put it on your phone

1. Open https://jsaintandre.github.io/recomp-log/ in Safari.
2. Tap Share, then Add to Home Screen.
3. Open it from the home screen icon from then on. The icon keeps its own copy of the log, separate from Safari.
4. To bring over an earlier log, go to Settings and tap Restore from a backup.

## Coming back after time off

Settings has a Comeback ramp. It starts every lift at 60, 70 or 80% of its program weight and climbs back to 100% in even weekly steps over 2 to 4 weeks. Each new week, a lift shows a button to step up to that week's weight. Starting the ramp resets the program start date to today, so the week count and the deload reminder start over.

## Body check-ins

Log body weight and waist once a week from Your log. Both show a trend next to the main lifts, and they are included in backups and the CSV export. The app reminds you when a week has passed since the last check-in.

## Your data

The log is stored only on the phone, in the home screen app. Nothing is sent to GitHub or anywhere else, so the code in this repo never contains your workouts.

Removing the home screen icon or clearing website data erases the log. Tap Back up everything in Settings every couple of weeks and keep the file in Files or iCloud Drive. The app reminds you when a backup is due.

## Files

- `index.html` is the whole app.
- `sw.js` caches the app for offline use.
- `manifest.webmanifest` and the `icon-*.png` files make it installable.
- `tests/smoke.test.js` loads the app in Chromium and checks that it opens, keeps a logged set after a reload, restores a backup after erasing everything, opens offline, and steps the comeback ramp correctly.

## Tests

```
npm install
npx playwright install chromium
npm test
```

GitHub runs the same tests on every pull request and on pushes to `main`.

To update the app, replace `index.html`. If you change `sw.js`, bump the cache names at the top so phones pick up the new files.
