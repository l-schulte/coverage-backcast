FROM docker.io/library/python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY importer/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY importer/backcast_importer ./backcast_importer

VOLUME ["/coverage", "/data"]
ENTRYPOINT ["python", "-m", "backcast_importer"]
CMD ["--coverage", "/coverage", "--out", "/data"]
