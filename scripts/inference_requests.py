"""Bounded, request-scoped private inference cancellation; no process IDs on the wire."""

import re
import threading
import time
import uuid
from contextlib import contextmanager

REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{16,128}$")


class AdmissionError(ValueError):
    def __init__(self, code, status):
        super().__init__(code)
        self.status = status


class RequestControl:
    def __init__(self):
        self.lock = threading.Lock()
        self.canceled = threading.Event()
        self.finished = threading.Event()
        self.callbacks = set()
        self.cleanup_failed = False

    def check(self):
        if self.canceled.is_set():
            raise ValueError("request_canceled")

    @contextmanager
    def register(self, callback):
        with self.lock:
            canceled = self.canceled.is_set()
            if not canceled:
                self.callbacks.add(callback)
        if canceled:
            callback()
        try:
            self.check()
            yield
        finally:
            with self.lock:
                self.callbacks.discard(callback)

    def cancel(self):
        with self.lock:
            if self.finished.is_set() or self.canceled.is_set():
                return
            self.canceled.set()
            callbacks = list(self.callbacks)
        for callback in callbacks:
            try:
                callback()
            except Exception:  # noqa: BLE001 - Native cleanup errors may contain private data.
                # Closing one transport cannot prevent cancellation of another.
                # The inference worker remains responsible for finalization.
                self.cleanup_failed = True


class Requests:
    def __init__(self, capacity=3, maximum=2048, retention=300):
        self.slots = threading.BoundedSemaphore(capacity)
        self.lock = threading.Lock()
        self.entries = {}
        self.maximum, self.retention = maximum, retention

    def _purge(self):
        now = time.monotonic()
        self.entries = {
            key: entry
            for key, entry in self.entries.items()
            if entry[1] is None or now - entry[1] < self.retention
        }

    @staticmethod
    def identity(value):
        if not isinstance(value, str) or not REQUEST_ID.fullmatch(value):
            raise AdmissionError("invalid_request", 422)
        return value

    def begin(self, provider, identity=None):
        key = (
            provider,
            self.identity(identity) if identity is not None else uuid.uuid4().hex,
        )
        with self.lock:
            self._purge()
            if key in self.entries:
                raise AdmissionError("request_already_used", 409)
            if len(self.entries) >= self.maximum or not self.slots.acquire(
                blocking=False
            ):
                raise AdmissionError("busy", 503)
            control = RequestControl()
            self.entries[key] = (control, None)
        return key, control

    def finish(self, key, control):
        with self.lock:
            entry = self.entries.get(key)
            if entry is None or entry[0] is not control or entry[1] is not None:
                return
            control.finished.set()
            self.entries[key] = (control, time.monotonic())
            self.slots.release()

    def cancel(self, provider, identity):
        key = (provider, self.identity(identity))
        with self.lock:
            self._purge()
            entry = self.entries.get(key)
            if entry is None:
                if len(self.entries) >= self.maximum:
                    raise AdmissionError("busy", 503)
                control = RequestControl()
                control.canceled.set()
                control.finished.set()
                self.entries[key] = (control, time.monotonic())
                return {"request_id": identity, "status": "not_found"}
            control, ended = entry
        if ended is not None:
            return {"request_id": identity, "status": "finished"}
        control.cancel()
        return {"request_id": identity, "status": "cancel_requested"}

    def close(self):
        with self.lock:
            active = [
                control for control, ended in self.entries.values() if ended is None
            ]
        for control in active:
            control.cancel()
