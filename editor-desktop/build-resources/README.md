# build-resources

Assets electron-builder consumes during installer generation.

| File | Purpose | Status |
|---|---|---|
| `entitlements.mac.plist` | macOS hardened-runtime entitlements (JIT for Pyodide, network client, user-selected file access) | ✅ shipped |
| `installer.ico` | Windows NSIS installer icon | ⚠️ placeholder — replace with a 256×256 ICO before signed release |
| `uninstaller.ico` | Windows uninstaller icon | ⚠️ placeholder |
| `installer-header.ico` | Windows installer banner | ⚠️ placeholder |
| `icon.png` | Linux desktop icon (512×512 PNG) | ⚠️ placeholder |

The `.ico` and `.png` placeholders are 1×1 transparent PNGs renamed —
electron-builder will fail loudly during a signed release build if they
haven't been replaced with real artwork. See ROADMAP §2.3a.6 for the
icon-design backlog.

## Adding signing certs

```bash
# macOS
export APPLE_ID="dev@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCD123456"
export CSC_LINK="$(base64 -w0 < developer-cert.p12)"
export CSC_KEY_PASSWORD="cert-password"

# Windows EV cert (preferred — no SmartScreen warm-up period)
export CSC_LINK="$(base64 -w0 < windows-ev-cert.pfx)"
export CSC_KEY_PASSWORD="cert-password"

cd editor-desktop
npm run dist
```

In CI (`.github/workflows/release.yml`) these come from GitHub Actions
secrets of the same name.
