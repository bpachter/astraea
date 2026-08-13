# Themis adjudication portal — Django 5 behind gunicorn, serving its own
# static files via WhiteNoise. Build context is the REPO ROOT (the seed data
# lives at data/seed): docker build -f portal/Dockerfile .
#
# The demo database is baked at build time from the public seed — migrate,
# seed, demo reviewer account — and resets on every deploy. The repo-root
# .dockerignore excludes any local db.sqlite3 so a development database can
# never leak into the image.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY portal/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY portal/ portal/
COPY data/ data/
WORKDIR /app/portal

ENV DJANGO_DEBUG=0 \
    DJANGO_ALLOWED_HOSTS=* \
    THEMIS_GATE_URL=http://localhost:8080
# demo/themis-demo is a PUBLIC demo credential by design: it guards only the
# baked, seeded, reset-on-redeploy demo database and is documented in README.
RUN python manage.py migrate && \
    python manage.py seed_proposals && \
    DJANGO_SUPERUSER_USERNAME=demo \
    DJANGO_SUPERUSER_EMAIL=demo@example.invalid \
    DJANGO_SUPERUSER_PASSWORD=themis-demo \
    python manage.py createsuperuser --noinput && \
    python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "portal.wsgi", "--bind", "0.0.0.0:8000", "--workers", "2"]
