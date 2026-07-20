# Marketplace Database Schema

Tenant-scoped installs and platform-level pack templates. Works with `STORAGE_BACKEND=memory` for local dev.

## Firestore Paths

### Tenant Installs

```
companies/{companyId}/marketplace/installed/{packId}
```

| Field | Type | Description |
|-------|------|-------------|
| `packId` | string | Canonical pack ID |
| `packName` | string | Display name at install time |
| `version` | string | Installed semver (e.g. `1.0.0`) |
| `installedAt` | timestamp | First install time |
| `updatedAt` | timestamp | Last update time |
| `customizations` | map | Branding, integration selections |
| `enabledIntegrations` | array | Active integration IDs |
| `agentIds` | array | Provisioned AI employee IDs |
| `knowledgeDocIds` | array | Provisioned KB document IDs |
| `workflowIds` | array | Provisioned automation IDs |
| `mergedKnowledgeTitles` | array | Titles merged from updates |
| `mergedWorkflowNames` | array | Workflow names merged from updates |
| `links` | map | Navigation links for UI |

### Platform Pack Versions

```
platform/marketplace/packs/{packId}/versions/{version}
```

| Field | Type | Description |
|-------|------|-------------|
| `packId` | string | Pack identifier |
| `version` | string | Semver |
| `template` | map | Full pack manifest (agents, knowledge, workflows, contents) |
| `changelog` | array | Human-readable change list |
| `publishedAt` | timestamp | Version publish date |

### Platform Reviews

```
platform/marketplace/reviews/{reviewId}
```

| Field | Type | Description |
|-------|------|-------------|
| `packId` | string | Pack being reviewed |
| `companyId` | string | Reviewing tenant |
| `author` | string | Display name |
| `rating` | number | 1–5 |
| `title` | string | Review headline |
| `body` | string | Review text |
| `createdAt` | timestamp | Submission time |

### Platform Ratings Aggregate

```
platform/marketplace/ratings/{packId}
```

| Field | Type | Description |
|-------|------|-------------|
| `packId` | string | Pack identifier |
| `average` | number | Rolling average (1–5) |
| `count` | number | Total review count |
| `updatedAt` | timestamp | Last recalculation |

## Schema Constants

Defined in `services/database/schema.js`:

- `TENANT_COLLECTIONS.MARKETPLACE` → `"marketplace"`
- `TENANT_MARKETPLACE.INSTALLED` → `"installed"`
- `PLATFORM_MARKETPLACE.PACKS` → `"packs"`
- `PLATFORM_MARKETPLACE.REVIEWS` → `"reviews"`
- `PLATFORM_MARKETPLACE.RATINGS` → `"ratings"`

Helper paths:

- `tenantMarketplaceInstalledPath(companyId, packId)`
- `platformPackVersionPath(packId, version)`
- `platformReviewPath(reviewId)`
- `platformRatingPath(packId)`

## Memory Adapter (Dev)

In-memory Maps mirror Firestore collections:

| Store | Key | Methods |
|-------|-----|---------|
| `installedPacks` | `companyId` → array | `saveInstalledPack`, `updateInstalledPack`, `getInstalledPacks` |
| `packVersions` | `{packId}@{version}` | `savePackVersion`, `listPackVersions` |
| `marketplaceReviews` | `packId` → array | `saveMarketplaceReview`, `listMarketplaceReviews` |
| `packRatings` | `packId` | `getPackRating`, `updatePackRating` |

## Indexes

Recommended composite indexes for production queries:

```json
{
  "collectionGroup": "installed",
  "fields": [
    { "fieldPath": "companyId", "order": "ASCENDING" },
    { "fieldPath": "installedAt", "order": "DESCENDING" }
  ]
}
```

```json
{
  "collectionGroup": "reviews",
  "fields": [
    { "fieldPath": "packId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```
