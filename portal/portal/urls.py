from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from rest_framework import routers

from adjudication.views import ProposalViewSet

router = routers.DefaultRouter()
router.register("proposals", ProposalViewSet)

urlpatterns = [
    path("", RedirectView.as_view(url="/admin/", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]

admin.site.site_header = "Themis — adjudication portal"
admin.site.site_title = "Themis"
admin.site.index_title = "Governed curation for the knowledge graph"
