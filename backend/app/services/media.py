import asyncio
import subprocess
from pathlib import Path
from typing import Optional

def _sync_get_media_duration(input_path: Path) -> float:
    """Synchronous probing of media duration via ffprobe or ffmpeg."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(input_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode == 0 and res.stdout.strip():
            return float(res.stdout.strip())
    except Exception:
        pass

    # Fallback: probe via ffmpeg -i
    cmd_fallback = ["ffmpeg", "-i", str(input_path)]
    try:
        res = subprocess.run(cmd_fallback, capture_output=True, text=True, check=False)
        stderr_str = res.stderr or ""
        if "Duration:" in stderr_str:
            dur_str = stderr_str.split("Duration:")[1].split(",")[0].strip()
            parts = dur_str.split(":")
            if len(parts) == 3:
                return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except Exception:
        pass

    return 0.0


async def get_media_duration(input_path: Path) -> float:
    """Probe duration in seconds asynchronously using worker thread."""
    return await asyncio.to_thread(_sync_get_media_duration, input_path)


def _sync_extract_normalized_audio(input_path: Path, output_wav_path: Path) -> bool:
    """Synchronously extract 16kHz mono WAV via FFmpeg."""
    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",                # Overwrite if exists
        "-i", str(input_path),
        "-vn",               # Disable video stream
        "-ar", "16000",      # 16,000 Hz sample rate (Whisper native)
        "-ac", "1",          # Mono channel
        "-c:a", "pcm_s16le", # Standard 16-bit uncompressed PCM
        str(output_wav_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, check=False)
        return res.returncode == 0
    except Exception:
        return False


async def extract_normalized_audio(
    input_path: Path,
    output_wav_path: Path,
) -> bool:
    """
    Standardize any audio/video input to 16kHz mono PCM WAV.
    Runs via asyncio.to_thread to avoid Windows SelectorEventLoop NotImplementedError.
    """
    return await asyncio.to_thread(_sync_extract_normalized_audio, input_path, output_wav_path)
