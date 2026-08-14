"""
WSGI config for portal project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portal.settings")

# Instrument before the application object exists: Django's instrumentation
# wraps middleware at import time.
from portal.tracing import configure as configure_tracing  # noqa: E402

configure_tracing()

application = get_wsgi_application()
