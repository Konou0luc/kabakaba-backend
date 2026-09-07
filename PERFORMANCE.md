# Optimisations performance

- Cache mémoire de 10 secondes sur les résultats Analytics et les statistiques du dashboard. Il ne s'applique qu'aux instances serverless chaudes et ne remplace pas PostgreSQL.
- Les requêtes simultanées identiques partagent la même Promise afin d'éviter les doublons lors d'un pic de navigation.
- Le pool PostgreSQL serverless reste limité à 3 connexions par instance pour éviter la saturation du pooler Neon.
- Le cache HTTP reste `no-store` : aucune donnée authentifiée n'est mise en cache par CDN/proxy.

# Validation

npm run build
