# Themis.Gate — ASP.NET Core 8 reconciliation + ontology-law service.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Themis.Gate/Themis.Gate.csproj Themis.Gate/
RUN dotnet restore Themis.Gate/Themis.Gate.csproj
COPY Themis.Gate/ Themis.Gate/
RUN dotnet publish Themis.Gate/Themis.Gate.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Deploys set PortalOrigins to the portal's public origin for CORS.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Themis.Gate.dll"]
