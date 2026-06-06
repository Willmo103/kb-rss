# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-06-06
### Fixed
- Intercepted window minimize events to collapse the app to the system tray.
- Updated `install` and `serve` commands to check for and dynamically download the latest prebuilt desktop binary from GitHub Releases when missing locally.
- Configured Windows shortcut creation to explicitly set the icon location.
- Created full test-and-release CI/CD workflow to compile assets and generate GitHub releases automatically.
- Added `update` CLI subcommand to manually pull prebuilt desktop updates.

## [0.1.3] - 2026-06-04
### Added
- Unified installer options to copy the desktop app to user PATH, create shortcuts, and run database migrations/seeding.
- Packaged compiled standalone Electron app and default feeds JSON inside Python wheels.

## [0.1.2] - 2026-06-03
### Added
- Electron desktop application for feed management and core backend modules integration.
### Changed
- Added clean steps to `build.py` to purge previous dist artifacts.

## [0.1.1] - 2026-06-01
### Added
- Test-and-bump-version CI workflow.
- Updated `build.py` with `copy_artifacts` helper.
- Background RSS feed polling daemon and database management logic.

## [0.1.0] - 2026-05-30
### Added
- Initial project release with core RSS watcher functionality, database schema, and content scraping utilities.
