import subprocess
import sys
from pathlib import Path


def run_step(cmd: list[str], description: str, cwd: Path = None):
    print(f"\n=========================================")
    print(f"Step: {description}")
    print(f"Running: {' '.join(cmd)}")
    print(f"=========================================")
    try:
        # Use shell=True on Windows to support running commands correctly in all shell contexts
        result = subprocess.run(cmd, check=True, shell=sys.platform == "win32", cwd=cwd)
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Step failed: {description}")
        print(f"Command returned non-zero exit code: {e.returncode}")
        sys.exit(e.returncode)
    except FileNotFoundError:
        print(
            f"\n[ERROR] Command not found. Make sure {' '.join(cmd)} is available in path."
        )
        sys.exit(1)


def main():
    import os

    os.environ["USE_SYSTEM_SIGNCODE"] = "true"
    project_dir = Path(__file__).resolve().parent
    desktop_dir = project_dir / "desktop"

    # 1. Build & Package React/Electron UI
    print("Compiling React & packaging Electron UI...")
    run_step(["npm", "install"], "Installing node dependencies", cwd=desktop_dir)
    run_step(
        ["npm", "run", "dist"],
        "Compiling and building Electron standalone package",
        cwd=desktop_dir,
    )

    # 2. Sync python project environment
    run_step(
        ["uv", "sync"],
        "Synchronizing python environment & dependencies",
        cwd=project_dir,
    )

    # 3. Run unit tests
    run_step(["uv", "run", "pytest"], "Running pytest suite", cwd=project_dir)

    # 4. Build python packaging artifacts
    run_step(["uv", "build"], "Building source and wheel packages", cwd=project_dir)

    print("\n[SUCCESS] Build pipeline completed successfully!")


if __name__ == "__main__":
    main()
