# Astraea.Gate — ASP.NET Core 8 reconciliation + ontology-law service.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Astraea.Gate/Astraea.Gate.csproj Astraea.Gate/
RUN dotnet restore Astraea.Gate/Astraea.Gate.csproj
COPY Astraea.Gate/ Astraea.Gate/
RUN dotnet publish Astraea.Gate/Astraea.Gate.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Deploys set PortalOrigins to the portal's public origin for CORS.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Astraea.Gate.dll"]
