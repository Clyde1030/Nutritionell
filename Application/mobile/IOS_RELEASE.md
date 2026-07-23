# iPhone Standalone Build and Release (Expo EAS)

## One-time setup

1. Install EAS CLI:
   - `npm install -g eas-cli`
2. Login:
   - `eas login`
3. Configure build credentials and project:
   - `eas build:configure`

## Build profiles

Defined in [eas.json](eas.json):

- `development`: Development client for direct device testing.
- `preview`: Internal distribution build for QA.
- `production`: App Store/TestFlight build with version auto-increment.

## Important env variables

The app reads these at build time:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_TEAM_ASSET_BASE_URL`

Update them in [eas.json](eas.json) before shipping:

- `development` should point to local/LAN endpoints.
- `preview` should point to staging HTTPS endpoints.
- `production` must point to public HTTPS production endpoints.

## Build commands

From `Application/mobile`:

- Development client build:
  - `eas build -p ios --profile development`
- Internal preview build:
  - `eas build -p ios --profile preview`
- Production build:
  - `eas build -p ios --profile production`

## Submit to TestFlight

- `eas submit -p ios --profile production --latest`

Then manage testers in App Store Connect.

## Notes

- Make sure `expo.ios.bundleIdentifier` in [app.json](app.json) is final before production submissions.
- If backend endpoints are private/LAN-only, TestFlight users will not be able to connect.
