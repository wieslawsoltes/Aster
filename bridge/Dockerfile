# The native-speed target is an x86-64 Linux host. ARM hosts emulate this image.
FROM debian:13-slim
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv wine wine64 wine32:i386 xvfb xauth x11vnc openbox novnc \
    fonts-liberation ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 aster \
    && mkdir /data && chown aster:aster /data
WORKDIR /opt/aster
COPY bridge/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY --chown=root:root index.html manifest.webmanifest sw.js LICENSE ./
COPY --chown=root:root src ./src
COPY --chown=root:root assets ./assets
COPY --chown=root:root bridge ./bridge
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/home/aster
USER 1000:1000
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--", "python", "-m", "bridge.server"]
CMD ["--host", "0.0.0.0", "--port", "8787", "--data", "/data", "--public-origin", "http://127.0.0.1:8787"]
