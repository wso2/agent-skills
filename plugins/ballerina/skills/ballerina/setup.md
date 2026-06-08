# Ballerina Setup

Read this file when `bal version` fails or `bal` is not found on the user's machine.

## Prerequisites

- **Java 21 or later** — required by the Ballerina runtime
  - Check: `java -version`
  - Install: https://adoptium.net (Eclipse Temurin recommended)

## Install Ballerina

### macOS (Homebrew)
```bash
brew install ballerina
```

### macOS / Linux (installer)
1. Download the installer from https://ballerina.io/downloads/
2. Run the `.pkg` (macOS) or `.deb`/`.rpm` (Linux) installer
3. Verify: `bal version`

### Windows
1. Download the `.msi` installer from https://ballerina.io/downloads/
2. Run the installer — it sets `PATH` automatically
3. Open a new terminal and verify: `bal version`

### Manual (any OS)
1. Download the zip distribution from https://ballerina.io/downloads/
2. Extract to a directory (e.g., `/usr/local/ballerina`)
3. Add `<install-dir>/bin` to your `PATH`

## PATH Not Set

If `bal` is still not found after installing:

**macOS/Linux** — add to `~/.zshrc` or `~/.bashrc`:
```bash
export PATH="$PATH:/Library/Ballerina/bin"   # macOS default
# or
export PATH="$PATH:/usr/local/ballerina/bin"  # manual install
```
Then: `source ~/.zshrc`

**Windows** — add `C:\Program Files\Ballerina\bin` to System Environment Variables → PATH.

## Verify

```bash
bal version
# Should output: Ballerina 2201.x.x ...
```

## Create a New Project

```bash
bal new my-project     # creates a single-package project
cd my-project
bal run                # runs main.bal
```

## Current LTS Version

Check https://ballerina.io/downloads/ for the latest Swan Lake release. The active LTS is the Swan Lake 2201.x series.
