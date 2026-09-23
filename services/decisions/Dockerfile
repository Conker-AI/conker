FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
COPY server.py prepare_model.py ./
RUN useradd --uid 1000 --create-home conker
ENV HOME=/home/conker
USER conker
CMD ["uvicorn", "server:create_app", "--factory", "--host", "127.0.0.1", "--port", "8060"]
