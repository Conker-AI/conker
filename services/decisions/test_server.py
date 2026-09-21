import threading

from fastapi.testclient import TestClient

from server import ContextTooLarge, create_app

KEY = "test-only-decision-key-not-a-secret-12345"
HEADERS = {"X-Decision-Key": KEY}
BODY = {"state": "Hello", "instructions": "Choose the complexity.",
        "choices": {"simple": "Greeting", "complex": "Difficult analysis"}}


class Backend:
    name, model = "test", "test-model"

    def choose(self, request):
        return {"choice": "simple", "confidence": 0.8,
                "probabilities": {"simple": 0.8, "complex": 0.2}}


def test_auth_validation_and_no_context_echo():
    with TestClient(create_app(Backend(), key=KEY)) as client:
        assert client.get("/health").status_code == 401
        assert client.post("/v1/choose", json=BODY).status_code == 401
        result = client.post("/v1/choose", headers=HEADERS, json=BODY)
        assert result.status_code == 200
        assert result.json()["choice"] == "simple"
        assert result.headers["cache-control"] == "no-store"
        bad = client.post("/v1/choose", headers=HEADERS,
                          json={**BODY, "credential": "PRIVATE_CONTEXT"})
        assert bad.status_code == 422
        assert "PRIVATE_CONTEXT" not in bad.text
        assert client.post("/v1/choose", headers=HEADERS,
                           content=b"x" * 32769).status_code == 413


def test_oversize_context_is_explicit_and_model_errors_are_private():
    backend = Backend()
    with TestClient(create_app(backend, key=KEY)) as client:
        def oversize(request):
            raise ContextTooLarge()
        backend.choose = oversize
        response = client.post("/v1/choose", headers=HEADERS, json=BODY)
        assert response.status_code == 422
        assert response.json()["detail"] == "decision_context_too_large"
        def broken(request):
            raise RuntimeError("PRIVATE_CONTEXT")
        backend.choose = broken
        response = client.post("/v1/choose", headers=HEADERS, json=BODY)
        assert response.status_code == 503 and "PRIVATE_CONTEXT" not in response.text


def test_invalid_choices_and_probabilities_cannot_escape():
    backend = Backend()
    with TestClient(create_app(backend, key=KEY)) as client:
        for result in [
            {"choice": "unauthorized", "confidence": 1, "probabilities": {}},
            {"choice": "simple", "confidence": float("nan"), "probabilities": {}},
            {"choice": "simple", "confidence": 1,
             "probabilities": {"simple": 1, "complex": 1}},
        ]:
            backend.choose = lambda request: result
            assert client.post("/v1/choose", headers=HEADERS, json=BODY).status_code == 503


def test_busy_inference_rejects_queue_then_recovers():
    entered, release = threading.Event(), threading.Event()
    backend = Backend()
    def slow(request):
        entered.set()
        assert release.wait(5)
        return Backend().choose(request)
    backend.choose = slow
    with TestClient(create_app(backend, key=KEY)) as client:
        responses = []
        worker = threading.Thread(target=lambda: responses.append(
            client.post("/v1/choose", headers=HEADERS, json=BODY)))
        worker.start()
        try:
            assert entered.wait(3)
            assert client.get("/health", headers=HEADERS).json()["busy"]
            assert client.post("/v1/choose", headers=HEADERS, json=BODY).status_code == 503
        finally:
            release.set()
            worker.join(5)
        assert responses[0].status_code == 200
        assert not client.get("/health", headers=HEADERS).json()["busy"]
