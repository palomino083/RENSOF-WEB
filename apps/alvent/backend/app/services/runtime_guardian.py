from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Deque
import os
import uuid


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RuntimeGuardian:
    def __init__(self) -> None:
        self.enabled = _to_bool(os.getenv("ALVENT_GUARDIAN_ENABLED"), True)
        self.auto_safe_mode = _to_bool(os.getenv("ALVENT_GUARDIAN_AUTO_SAFE_MODE"), True)
        self.error_burst_threshold = int(os.getenv("ALVENT_GUARDIAN_ERROR_BURST", "3"))
        self.latency_warn_ms = float(os.getenv("ALVENT_GUARDIAN_LATENCY_WARN_MS", "2500"))
        self.max_incidents = int(os.getenv("ALVENT_GUARDIAN_MAX_INCIDENTS", "250"))

        self._lock = Lock()
        self._incidents: Deque[dict[str, Any]] = deque(maxlen=self.max_incidents)

        self.started_at = _utc_iso()
        self.safe_mode_enabled = False
        self.safe_mode_reason = ""

        self.requests_total = 0
        self.requests_2xx = 0
        self.requests_4xx = 0
        self.requests_5xx = 0
        self.exceptions_total = 0
        self.consecutive_5xx = 0

        self.last_error_at: str | None = None
        self.last_exception: str | None = None
        self.last_high_latency_at: str | None = None

    def _create_incident(
        self,
        *,
        severity: str,
        source: str,
        title: str,
        details: dict[str, Any],
        auto_action: str | None = None,
    ) -> dict[str, Any]:
        incident = {
            "id": uuid.uuid4().hex,
            "timestamp": _utc_iso(),
            "severity": severity,
            "source": source,
            "title": title,
            "details": details,
            "auto_action": auto_action,
            "acked": False,
            "acked_at": None,
            "acked_by": None,
            "ack_note": None,
        }
        self._incidents.appendleft(incident)
        return incident

    def mark_startup(self, ok: bool, message: str) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._create_incident(
                severity="info" if ok else "critical",
                source="startup",
                title="Startup check",
                details={"ok": ok, "message": message},
            )

    def record_request(self, *, path: str, method: str, status_code: int, duration_ms: float) -> None:
        if not self.enabled:
            return

        with self._lock:
            self.requests_total += 1

            if 200 <= status_code < 300:
                self.requests_2xx += 1
                self.consecutive_5xx = 0
            elif 400 <= status_code < 500:
                self.requests_4xx += 1
                self.consecutive_5xx = 0
            elif status_code >= 500:
                self.requests_5xx += 1
                self.consecutive_5xx += 1
                self.last_error_at = _utc_iso()
                self._create_incident(
                    severity="error",
                    source="http",
                    title="HTTP 5xx detected",
                    details={
                        "path": path,
                        "method": method,
                        "status_code": status_code,
                        "duration_ms": round(duration_ms, 2),
                        "consecutive_5xx": self.consecutive_5xx,
                    },
                )

            if duration_ms >= self.latency_warn_ms:
                self.last_high_latency_at = _utc_iso()
                self._create_incident(
                    severity="warning",
                    source="latency",
                    title="High latency request",
                    details={
                        "path": path,
                        "method": method,
                        "status_code": status_code,
                        "duration_ms": round(duration_ms, 2),
                        "threshold_ms": self.latency_warn_ms,
                    },
                )

            if (
                self.auto_safe_mode
                and not self.safe_mode_enabled
                and self.consecutive_5xx >= self.error_burst_threshold
            ):
                self.safe_mode_enabled = True
                self.safe_mode_reason = (
                    f"Auto safe mode after {self.consecutive_5xx} consecutive 5xx responses"
                )
                self._create_incident(
                    severity="critical",
                    source="guardian",
                    title="Auto safe mode activated",
                    details={
                        "reason": self.safe_mode_reason,
                        "threshold": self.error_burst_threshold,
                    },
                    auto_action="SAFE_MODE_ON",
                )

    def record_exception(self, *, path: str, method: str, duration_ms: float, error: Exception) -> None:
        if not self.enabled:
            return

        with self._lock:
            self.exceptions_total += 1
            self.last_error_at = _utc_iso()
            self.last_exception = f"{error.__class__.__name__}: {error}"
            self.consecutive_5xx += 1
            self._create_incident(
                severity="critical",
                source="exception",
                title="Unhandled exception",
                details={
                    "path": path,
                    "method": method,
                    "duration_ms": round(duration_ms, 2),
                    "error_type": error.__class__.__name__,
                    "error": str(error),
                    "consecutive_5xx": self.consecutive_5xx,
                },
            )

    def set_safe_mode(self, *, enabled: bool, reason: str, actor: str) -> dict[str, Any]:
        with self._lock:
            changed = self.safe_mode_enabled != bool(enabled)
            self.safe_mode_enabled = bool(enabled)
            self.safe_mode_reason = str(reason or "manual")
            incident = self._create_incident(
                severity="warning" if enabled else "info",
                source="guardian",
                title="Safe mode updated",
                details={
                    "enabled": self.safe_mode_enabled,
                    "reason": self.safe_mode_reason,
                    "actor": actor,
                    "changed": changed,
                },
                auto_action="SAFE_MODE_ON" if enabled else "SAFE_MODE_OFF",
            )
            return incident

    def ack_incident(self, *, incident_id: str, actor: str, note: str | None = None) -> dict[str, Any] | None:
        with self._lock:
            for incident in self._incidents:
                if incident["id"] != incident_id:
                    continue
                incident["acked"] = True
                incident["acked_at"] = _utc_iso()
                incident["acked_by"] = actor
                incident["ack_note"] = str(note or "").strip() or None
                return incident
        return None

    def list_incidents(self, *, limit: int = 50, include_acked: bool = True) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._incidents)
            if not include_acked:
                items = [item for item in items if not item.get("acked")]
            return items[: max(1, min(int(limit or 50), 200))]

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "enabled": self.enabled,
                "started_at": self.started_at,
                "safe_mode": {
                    "enabled": self.safe_mode_enabled,
                    "reason": self.safe_mode_reason,
                    "auto_enabled": self.auto_safe_mode,
                },
                "metrics": {
                    "requests_total": self.requests_total,
                    "requests_2xx": self.requests_2xx,
                    "requests_4xx": self.requests_4xx,
                    "requests_5xx": self.requests_5xx,
                    "exceptions_total": self.exceptions_total,
                    "consecutive_5xx": self.consecutive_5xx,
                    "latency_warn_ms": self.latency_warn_ms,
                    "error_burst_threshold": self.error_burst_threshold,
                },
                "last_events": {
                    "last_error_at": self.last_error_at,
                    "last_exception": self.last_exception,
                    "last_high_latency_at": self.last_high_latency_at,
                },
                "open_incidents": len([i for i in self._incidents if not i.get("acked")]),
                "total_incidents": len(self._incidents),
            }


runtime_guardian = RuntimeGuardian()
