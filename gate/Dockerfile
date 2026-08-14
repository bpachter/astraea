# Astraea.Gate — ASP.NET Core 8 reconciliation + ontology-law service.
#
# Build context is the REPO ROOT, because the traditional lookup API
# (/api/v1/nodes, /lookup) serves the atlas catalog that lives in
# recon/public/atlas:  docker build -f gate/Dockerfile .
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY gate/Astraea.Gate/Astraea.Gate.csproj gate/Astraea.Gate/
RUN dotnet restore gate/Astraea.Gate/Astraea.Gate.csproj
COPY gate/Astraea.Gate/ gate/Astraea.Gate/
RUN dotnet publish gate/Astraea.Gate/Astraea.Gate.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Without this the lookup endpoints answer 503 naming the paths they probed —
# honest, but useless in production. Bake the catalog in.
COPY recon/public/atlas /app/atlas
# Deploys set PortalOrigins to the portal's public origin for CORS.
ENV ASPNETCORE_HTTP_PORTS=8080 \
    AtlasDir=/app/atlas
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Astraea.Gate.dll"]
