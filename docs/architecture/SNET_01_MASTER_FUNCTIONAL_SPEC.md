---
Status: Approved vision (draft doc)
Programme: SNET-01
Related: [SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md](./SNET_00_FOUNDATION_ARCHITECTURE_AUDIT.md)
Source: Chat transcript 2026-11-08 (user master functional specification)
---

# Sarah Network — Master Functional Specification (SNET-01)

> **SARAH NETWORK** — The intelligent network connecting people, businesses, organisations and Sarah AI employees.

| Domain | Role |
|--------|------|
| **Businesses** | Registered and discoverable |
| **Organisations** | Schools, churches, hospitals, etc. |
| **People** | Personal identities and connections |
| **Sarah AI employees** | Registered agents and capabilities |
| **Mission Control** | Central governance, administration, verification, policies and monitoring |

## Preamble (user request context)

I think its time we develop Sarah Network, such a way that when companies register, all their details will stay in that network and if any user search for them, will b very easy to get them since they will b on the network, so searching should be easy. Sarah network should be controlled by Mission contol, give me a detaled functionality of it

I agree. I think Sarah Network should become one of the foundational platforms of the entire ZiricAI ecosystem, rather than just a service that connects Personal Sarah to Company Sarah.

What you are describing is effectively a network where businesses and organisations register once, establish their identity, publish their approved information and become discoverable throughout Sarah App. Users can then find them, communicate with them, subscribe to them, make bookings, purchase products and services, and interact with their Sarahs.

Mission Control should govern this network centrally.

I would develop Sarah Network as a combination of:

- A global business and organisation directory.
- A discovery and search engine.
- A network identity and verification system.
- A communication and Sarah-to-Sarah connection infrastructure.
- A permissions, consent and trust management system.
- A network intelligence and analytics platform.
- A central administration and governance system controlled by Mission Control.

Let's establish the full functionality.

---

## 1. What exactly is Sarah Network?

Sarah Network should be the common network layer through which the other ZiricAI products identify and interact with one another.

**Consider this scenario:**

A new company registers for ZiricAI and creates its Company Portal.

**During onboarding, it provides:**

- Company name.
- Registration information.
- Industry.
- Business address.
- Service areas.
- Products and services.
- Contact details.
- Operating hours.
- Company description.
- Logo and images.
- Company Sarah configuration.
The company is then registered in Sarah Network.

Its approved public profile becomes available to Sarah App users through Discover.

A user searches for a service, finds the company and starts a conversation. The conversation is routed through Sarah Network to the company's Company Sarah or authorised human support team.

The business receives that activity in its Company Portal.

The important point is that the company should not have to register separately in Discover, Chat, My Organisations and other Sarah App features.

One company registration should establish one network identity that can be used across all authorised ZiricAI services.

## 2. The architecture: how the ecosystem connects

I recommend separating the network into four layers.

### Layer 1 — Network entities

People, businesses, organisations, branches, locations and AI agents.

### Layer 2 — Network services

Registration, profiles, verification, search, discovery, connections and messaging.

### Layer 3 — Network interactions

Enquiries, bookings, subscriptions, orders, payments, AI-to-AI communication and human handovers.

### Layer 4 — Mission Control

Governance, network administration, verification oversight, moderation, analytics, policies and security.

These layers should operate as shared services, not as separate directories built independently by each module.

## 3. Network registration and onboarding

This is the entry point for businesses and organisations.

A company should be able to join Sarah Network through either:

- Registration through the ZiricAI Company Portal.
- An invitation from an existing network member.
- An approved network onboarding process.
### Registration workflow

- Create or connect a Company Portal account
- The business establishes its company tenant and authorised owner.
- Create network identity
- Sarah Network creates a unique network entity and links it to the company tenant.
- Enter business information
- The company supplies its identity, industry, locations, services, contact information and profile content.
- Verification
- The company submits relevant registration and ownership evidence. Verification status is tracked.
- Configure public visibility
- The company chooses which profile information is public, restricted or private.
- Connect Company Sarah
- The company registers its AI employee, capabilities, operating rules and permitted communication channels.
- Publish to Sarah Network
- Once the required checks and publication conditions are met, the company becomes discoverable.
### Network registration should support different entity types

| Entity type | Examples |
| --- | --- |
| Registered business | Retailers, restaurants, mechanics, manufacturers |
| Professional practice | Lawyers, accountants, consultants |
| Educational institution | Schools, colleges, universities |
| Healthcare organisation | Hospitals, dentists, clinics |
| Religious organisation | Churches and ministries |
| Non-profit | NGOs, charities, foundations |
| Government organisation | Departments, municipalities, public agencies |
| Community organisation | Associations, clubs, neighbourhood groups |
| Independent professional | Freelancers and individual service providers |

Not every network entity needs to be a registered company. However, the platform must distinguish a verified registered business from an unverified individual or informal organisation.

### Multiple branches

A company with multiple branches should have one parent network identity and multiple branch profiles.

**For example:**

- **Example Retail Group** (verified parent)
  - Johannesburg Branch
  - Pretoria Branch
  - Cape Town Branch
  - Durban Branch

One parent identity, separate branch locations, services and operating information.

This is important because a user searching for a business should be able to find the nearest relevant branch rather than just the head office.

## 4. Network Identity Registry

This is one of the most important components.

Every entity needs a permanent, unique Sarah Network identity.

I recommend that each registered entity receive a Sarah Network ID, for example:

- SN-PER-000001 — Person.
- SN-BIZ-000001 — Business.
- SN-ORG-000001 — Organisation.
- SN-BRN-000001 — Branch.
- SN-AI-000001 — AI employee.
These are illustrative display formats; actual IDs should be immutable, globally unique identifiers generated securely by the platform.

### Information stored in the registry

| Information | Purpose |
| --- | --- |
| Entity type | Business, person, organisation, agent |
| Network ID | Permanent identity |
| Display name | Public-facing name |
| Legal name | Restricted verification information |
| Company tenant ID | Link to Company Portal |
| Parent entity ID | Parent/branch relationship |
| Industry | Classification |
| Country and region | Geographic identity |
| Verification status | Trust indicator |
| Public profile reference | Discover profile |
| Agent references | Associated Sarah employees |
| Network status | Active, suspended, restricted, etc. |
| Created and updated timestamps | Lifecycle history |

### An important architectural rule

Sarah Network should hold the central network identity and approved directory information.

The Company Portal should remain the operational source of truth for private business data, such as:

- Internal employee records.
- Financial accounts.
- Customer records.
- Internal documents.
- Private business procedures.
- Internal company communications.
The Network should hold a controlled, synchronised public profile and the references necessary to route interactions to the correct company.

This prevents us from duplicating the entire Company Portal database into Sarah Network.

## 5. Business and organisation profiles

Every network entity should have a profile that can be used throughout Sarah App.

I would call this the Network Profile Manager.

### Profile categories

#### A. Identity

- Name.
- Logo.
- Cover image.
- Description.
- Industry.
- Business or organisation type.
- Verification status.
#### B. Location

- Country.
- Province or region.
- City.
- Physical address, where public.
- Service areas.
- Branches.
- Map coordinates, with appropriate location privacy.
#### C. Products and services

- Products.
- Services.
- Categories.
- Pricing, where provided.
- Availability.
- Product images.
- Booking or purchasing links.
#### D. Communication

- Chat availability.
- Company Sarah.
- Human support availability.
- Supported languages.
- Contact channels.
- Operating hours.
#### E. Discover settings

- Public visibility.
- Categories.
- Search keywords.
- Featured information.
- Promotions.
- Status content.
- Discovery campaign eligibility.
#### F. Trust

- Verification level.
- Verified information.
- Reviews.
- Complaints and moderation status.
- Relevant professional or regulatory credentials, where applicable.
### Public and private profile fields

A company must be able to distinguish:

| Visibility | Example |
| --- | --- |

### Example

Public

Company name, logo, services, published address

Network restricted

Information available only to authorised connected services

Company private

Staff records, internal financial data, private documents

Verification restricted

Registration documents, identity evidence, ownership proof

Mission Control administrators should also have controlled access, not unrestricted browsing of every private company record.

## 6. The Sarah Network Search Engine

This is where your idea becomes particularly powerful.

I recommend building a dedicated Network Search Service.

It should power search throughout Sarah App, Discover, Chat, My Organisations and other modules.

A user should not need to know a company's exact registered name to find it.

They should be able to search using natural language.

Examples:

- "Find a dentist near me."
- "Good mechanics in Emalahleni."
- "Schools in Pretoria."
- "Churches in Johannesburg."
- "A company that supplies mining equipment."
- "A restaurant that delivers."
- "A plumber available today."
- "Funeral services in my area."
- "An accountant who works with small businesses."
The search engine should interpret the request and identify matching network entities.

### Search functionality

I would combine five search capabilities.

| Search capability | Function |
| --- | --- |
| Name search | Search exact or partial company names |
| Category search | Find entities by industry or service |
| Location search | Find nearby businesses and branches |
| Keyword search | Search descriptions, products and services |
| Natural-language search | Understand what the user is looking for |
| Later, we can add semantic search, allowing users to describe a problem rather than know the name of a service. | Search example |

### Discover on Sarah

Find a dentist near me

Nearby

Open now

Verified

Appointments

Illustrative search results — not actual business listings.

Resources & Insights | UDGOK Oklahoma & Texas | UDGOK

Example Dental Practice

Verified

Dental services · Nearby

Appointments available through its Sarah profile

A comfortable, modern dental clinic to welcome you

Example Family Dentistry

Verified

Family dentistry · Nearby

Chat with Dental Sarah

### Search ranking

Search results should be ordered using a transparent combination of:

- Relevance to the search request.
- Geographic distance where location is relevant.
- Category and service match.
- Verification and profile completeness.
- Availability, where supported by live data.
- User-selected preferences.
- Organic popularity and quality signals.
Sponsored results may appear, but must be clearly labelled and must not silently override relevance.

A paid business should never be allowed to purchase a verified badge or manipulate organic trust signals.

### Search infrastructure

I would not make Firestore perform every search directly.

Firestore can remain the source of truth for core records, while a dedicated search index handles discovery at scale.

The architecture should support:

- Search indexing.
- Incremental index updates.
- Search suggestions.
- Autocomplete.
- Synonyms.
- Category filters.
- Geographic queries.
- Typo tolerance.
- Search analytics.
- Duplicate detection.
The search provider should be selected after reviewing expected traffic, cost, indexing requirements and existing infrastructure. We should avoid introducing a complex search service before the product needs it.

## 7. Network Connections and Relationship Management

Sarah Network should also maintain the relationships between people and entities.

These are not all the same kind of connection.

I recommend the following relationship types:

| Relationship | Meaning |
| --- | --- |
| Discovered | User found a company |
| Following | User follows public updates |
| Subscribed | User opted into an organisation's chosen communications |
| Connected | User established a permitted network relationship |
| Customer | User has a business relationship |
| Booking relationship | User has an associated booking |
| Transaction relationship | User has a purchase or payment record |
| Employee relationship | A person is associated with an organisation |
| Agent relationship | A Sarah AI employee is associated with an entity |
| The distinction matters. | For example, discovering a company must not automatically subscribe a user to its announcements. |
| Similarly, a customer making one purchase should not automatically consent to promotional communications. | Network connection controls |
| Request connection. | Accept connection. |
| Reject connection. | Disconnect. |
| Block. | Restrict. |
| Revoke permissions. | View connection history. |
| Manage shared information. | Connections should have explicit purposes and permissions. |

## 8. Sarah Network AI Agent Registry

This is where the network starts becoming an AI ecosystem.

Every participating business or organisation can register its Sarah AI employees.

The Network should know which AI employees exist, what they represent and what they are allowed to do.

### Example

### Central Motors

Network business identity

Active

Registered AI employees

Sales Sarah

Vehicle enquiries and sales support

Registered

Service Sarah

Service bookings and customer updates

Registered

Finance Sarah

Authorised finance enquiries

Registered

Admin Sarah

General business assistance

Registered

The AI Agent Registry should record:

- Agent ID.
- Agent name.
- Owning company or organisation.
- Department.
- Agent type.
- Permitted capabilities.
- Supported languages.
- Availability.
- Approved integrations.
- Handover configuration.
- Permission profile.
- Agent status.
- Version and configuration history.
### Capability discovery

Personal Sarah should be able to ask Sarah Network:

"Which registered company agents can handle vehicle servicing enquiries?"

The Network returns suitable, authorised agent capabilities.

It should not expose the company's internal prompts, secrets, private knowledge base or implementation details.

The Network provides the connection and capability directory; the actual Company Sarah continues to operate under the company's permissions.

## 9. Sarah Network Communication and Routing

This is the messaging backbone we discussed in CHAT-01.

Sarah Network should act as the secure communication and routing layer.

### Example workflow

A user says:

"Sarah, I want to book a vehicle service."

Personal Sarah:

- Understands the user's request.
- Searches Sarah Network for suitable automotive companies.
- Finds the correct business profile.
- Checks the registered agent capabilities.
- Checks whether communication is permitted.
- Opens or retrieves the relevant conversation.
- Sends the enquiry to Service Sarah.
- Service Sarah responds.
- Personal Sarah presents the response.
- If needed, Service Sarah requests human handover.
- The conversation appears in the customer's Chat and the company's Sarah Inbox.
The Network should maintain the routing relationship without becoming the owner of the company's private business conversation data.

The actual conversation records should live in a dedicated messaging service with clear ownership and access controls.

## 10. Mission Control — Sarah Network Management

Now to your most important requirement: Mission Control should control Sarah Network.

I recommend a dedicated Mission Control module called Sarah Network Administration.

It should not just be a dashboard. It should be the central governance and operations environment for the network.

### Mission Control navigation

Mission Control

Platform administration

Sarah Network

Network administration and governance

Network Overview

Businesses & Organisations

People & Identities

AI Agent Registry

Search & Discovery

Connections & Relationships

Communication & Routing

Verification & Trust

Moderation & Reports

Network Analytics

Network Configuration

Audit & Compliance

## 11. Mission Control dashboard

The first screen should show the overall health and size of Sarah Network.

### Key platform metrics

| Metric | What it measures |
| --- | --- |
| Total network entities | All registered people, businesses and organisations |
| Active businesses | Businesses currently active |
| Active organisations | Registered organisations |
| Verified entities | Entities with approved verification |
| Pending verification | Entities awaiting checks |
| Registered Sarah agents | AI employees in the registry |
| Active connections | Current permitted network relationships |
| Active conversations | Conversations currently in progress |
| Daily messages | Messages routed through the network |
| Search activity | Search queries and results |
| Search success | Searches resulting in meaningful discovery actions |
| Network availability | Health of network services |
| Reported entities | Entities with open moderation cases |
| These metrics must come from actual network events and records, not manually entered dashboard values. | Geographic network view |
| Mission Control should also have a map view showing: | Registered businesses. |
| Organisations. | Network coverage. |
| Geographic distribution. | Verification status. |
| Active branches. | Search demand. |
| Network growth. | Sensitive locations and private user locations should never be exposed through this view without a legitimate, authorised operational purpose. |

## 12. Mission Control business and organisation management

Administrators should be able to manage network entities.

### Available actions

- View entity profile.
- Review registration.
- Approve or reject verification.
- Request additional documents.
- Approve public profile publication.
- Restrict profile visibility.
- Suspend network access.
- Reinstate an entity.
- Review reports.
- Review entity relationships.
- View network activity summaries.
- Inspect associated AI agents.
- Review integration health.
- Record administrative decisions.
Every action must be permission-controlled and audited.

### Verification levels

I recommend a clear verification model:

| Status | Meaning |
| --- | --- |
| Unverified | Identity not yet checked |
| Submitted | Verification application received |
| Under review | Evidence being reviewed |
| Verified | Required identity checks passed |
| Restricted | Some network capabilities limited |
| Suspended | Network access suspended |
| Rejected | Application declined |
| We can later introduce additional verification types, such as verified location, professional accreditation or official organisation status. | A verification badge should always explain what has actually been checked. It must not imply that ZiricAI guarantees the quality of every service offered by the entity. |

## 13. Search and discovery management in Mission Control

Mission Control should have control over the search system.

This is important because a network with thousands or millions of companies can quickly become difficult to manage without proper classification and quality controls.

### Search administration

- Manage industry categories.
- Manage business types.
- Manage service classifications.
- Manage search synonyms.
- Manage geographic regions.
- Manage duplicate listings.
- Manage prohibited terms.
- Review search quality.
- Review zero-result searches.
- Review irrelevant search results.
- Manage sponsored result rules.
- Manage search abuse.
### Search intelligence

Mission Control should identify what users are searching for.

**For example:**

- Most searched industries.
- Most searched services.
- Locations with high search demand.
- Searches returning no results.
- Searches with low engagement.
- Emerging business categories.
- Demand versus available network supply.
This can help ZiricAI understand where it needs more businesses and organisations to join the network.

## 14. Network trust, moderation and safety

A public business network will attract spam, fake businesses, impersonation, fraudulent offers and abusive behaviour.

Mission Control needs a dedicated Trust and Safety environment.

### Moderation capabilities

- Report a company.
- Report a profile.
- Report a user.
- Report a message or conversation.
- Report misleading business information.
- Detect duplicate identities.
- Detect suspicious registration patterns.
- Review potentially fraudulent activity.
- Restrict abusive accounts.
- Manage appeals.
- Maintain evidence and audit records.
### Important distinction

Mission Control should not have unrestricted access to every private conversation just because it administers Sarah Network.

Instead, access to message content should be limited to authorised, purpose-specific moderation, safety or legal workflows, with access logging and appropriate safeguards.

## 15. Network analytics and commercial intelligence

Sarah Network can become a major source of intelligence for ZiricAI.

Mission Control should monitor:

### Network growth

- New registrations.
- Active entities.
- Verification completion.
- Business retention.
- Geographic growth.
### Discovery performance

- Search volume.
- Profile impressions.
- Profile views.
- Search-to-chat conversion.
- Search-to-booking conversion.
- Search-to-purchase conversion.
### Communication

- Conversations created.
- Messages routed.
- AI response rate.
- Human handover rate.
- Average response time.
- Unresolved conversations.
### Sarah ecosystem

- Active Sarah agents.
- Agent availability.
- Agent response quality signals.
- Agent failures.
- Capability usage.
- Human escalation patterns.
### Commercial performance

- Discover campaigns.
- Status boosts.
- Sponsored placements.
- Booking referrals.
- Sarah Pay transaction-related activity.
Financial metrics must distinguish actual revenue from gross transaction volume, campaign budgets and payment-provider settlement amounts.

## 16. The complete connection to the other ZiricAI products

Sarah Network should not replace the existing applications. It should connect them.

| ZiricAI product | Relationship with Sarah Network |
| --- | --- |
| Sarah App | Searches and discovers network entities, connects and communicates |
| Personal Sarah | Searches the network and communicates with authorised Sarah agents |
| Chat | Uses network identity and routing to establish conversations |
| Discover | Displays published network profiles and eligible listings |
| My Organisations | Uses network identities to manage subscriptions |
| Sarah Pay | Identifies merchants and routes verified payment requests |
| My Wallet | Uses authorised merchant and transaction references |
| Company Portal | Registers and manages the company's network identity and operations |
| Company Sarah | Registers its capabilities and communicates through the Network |
| Mission Control | Governs and administers the Network |
| This creates a single identity and connection foundation for the ecosystem. |  |

## 17. Data architecture and system boundaries

This is where I want us to be particularly careful.

Sarah Network should not become one enormous Firestore collection containing everything.

I recommend logical services with well-defined data ownership.

| Service | Primary responsibility |
| --- | --- |
| Network Identity Service | Entity IDs and identity relationships |
| Entity Registry | Business, organisation, branch and agent records |
| Profile Service | Public and approved network profiles |
| Verification Service | Evidence, review and verification status |
| Search Service | Indexing and search |
| Relationship Service | Connections, subscriptions and permissions references |
| Agent Registry | Sarah AI employee identity and capabilities |
| Routing Service | Message and request routing |
| Event Service | Network activity and event processing |
| Trust & Safety Service | Reports, moderation and restrictions |
| Analytics Service | Aggregated network reporting |
| Administration Service | Mission Control controls and audit records |

### Suggested logical data structure

These are conceptual paths, not a proposal to create all collections immediately:

```
sarahNetwork/
    entities/
        {entityId}/
            identity
            profile
            classification
            verification
            visibility
            status
```

- branches/
- {branchId}/
- agents/
- {agentId}/
- identity
- capabilities
- availability
- permissions
- relationships/
- {relationshipId}/
- verificationCases/
- {caseId}/
- moderationCases/
- {caseId}/
- events/
- {eventId}/
- searchMetadata/
- {entityId}/
- campaigns/
- {campaignId}/
In the actual implementation, we should choose Firestore paths and indexes based on the existing multi-tenant architecture. Sensitive verification documents and private personal information should be stored separately with more restrictive access controls.

### Critical ownership rule

The Network owns the network identity and its published representation.

The company tenant owns its internal operational records.

The Personal Sarah user owns their personal identity and knowledge.

The messaging service owns conversation records under explicit participant and tenant access rules.

Mission Control owns network governance and administrative configuration.

This separation is essential for security, privacy and future scalability.

## 18. Registration-to-discovery end-to-end example

Let's put all the components together.

### A new business joins Sarah Network

- Company Portal registration
- A business creates its company account.
- Sarah Network identity created
- A unique network identity is generated and linked to the company tenant.
- Profile and verification
- The company completes its information and submits verification evidence.
- Company Sarah registered
- Its AI employee and permitted capabilities are linked to the network identity.
- Mission Control approval
- Verification and public profile eligibility are reviewed.
- Search index updated
- The approved profile is indexed for relevant search queries.
- Discover publication
- The business appears to eligible Sarah App users.
- Customer interaction
- A user discovers the business, opens Chat and contacts Company Sarah.
- Portal activity
- The company receives the enquiry in Sarah Inbox and its analytics are updated.
### One registration · Connected ecosystem

## 19. Sarah Network development programme

I recommend that we establish a formal development programme called SNET-01.

It should be developed in carefully controlled phases.

| Phase | Workstream | Main deliverable |
| --- | --- | --- |
| SNET-00 | Architecture audit | Existing network, identity, tenant and Mission Control architecture mapped |
| SNET-01 | Identity foundation | Network IDs, entity types and ownership model |
| SNET-02 | Entity registry | Businesses, organisations, branches and people |
| SNET-03 | Profile service | Public and restricted profiles |
| SNET-04 | Verification | Registration evidence and approval workflow |
| SNET-05 | Search engine | Business, organisation and service discovery |
| SNET-06 | Agent registry | Company Sarah and organisation Sarah registration |
| SNET-07 | Relationships | Connections, subscriptions and permissions |
| SNET-08 | Communication routing | Sarah-to-Sarah and human communication |
| SNET-09 | Mission Control | Network administration and governance |
| SNET-10 | Analytics and trust | Monitoring, moderation and reporting |
| SNET-11 | Ecosystem integration | Sarah App, Discover, Chat, Company Portal, My Organisations and Sarah Pay |
| SNET-12 | Acceptance and scale | Security, performance and end-to-end acceptance |

The phases are a logical programme sequence. Some services can be developed in parallel after their interfaces and ownership rules have been approved.

## 20. Mission Control must have authority, but not unlimited authority

I want to emphasise this because Sarah Network will eventually contain a very large amount of business and personal information.

Mission Control should be the platform governance authority, but it should not have unrestricted power to access all tenant and user data.

I recommend the following administrative roles:

| Role | Responsibilities |
| --- | --- |
| Platform Superadmin | Overall network configuration and critical administration |
| Network Administrator | Entity and network operations |
| Verification Officer | Business and organisation verification |
| Trust & Safety Officer | Reports, moderation and appeals |
| Search Administrator | Categories, indexing and search quality |
| Network Analyst | Aggregated analytics |
| Support Administrator | Restricted support diagnostics |

Critical actions should require stronger authentication, audit logging and, where appropriate, dual approval.

A Mission Control administrator should be able to suspend a fraudulent network identity, for example, without gaining access to all the company's private financial records.

## 21. My additional recommendation: introduce a Network API

I would make Sarah Network available internally through a formal API from the beginning.

This is important because we don't want every ZiricAI application independently accessing the Network's Firestore collections.

Instead, they should use the approved network services.

**For example:**

`POST /api/network/entities`

`GET  /api/network/entities/:entityId`

`GET  /api/network/search`

`GET  /api/network/entities/:entityId/profile`

`POST /api/network/entities/:entityId/verify`

`GET  /api/network/agents`

`GET  /api/network/agents/:agentId`

`POST /api/network/connections`

`GET  /api/network/connections`

`POST /api/network/route-message`

`GET  /api/network/health`

These are proposed API contracts, not confirmed existing endpoints.

The API must enforce:

- Authentication.
- Entity ownership.
- Tenant scope.
- Role permissions.
- User consent.
- Rate limits.
- Input validation.
- Audit logging.
- Idempotency for operations that may be retried.
We should also introduce a versioned internal API contract so that Sarah App, Company Portal and Mission Control can evolve without breaking one another.

## 22. What I would add to make Sarah Network especially powerful

There are three longer-term capabilities I think we should plan for.

#### A. Network capability discovery

Personal Sarah should be able to identify which businesses can perform a particular service, not just which businesses have matching names.

**For example:**

A user asks for a mechanic who can service a particular vehicle type.

Sarah Network should be able to search registered capabilities, supported services, locations and relevant availability.

This is much more powerful than an ordinary business directory.

#### B. Network availability

Businesses could publish availability for:

- Bookings.
- Appointments.
- Delivery.
- Service requests.
- Human support.
- AI support.
The Network can help Personal Sarah identify businesses capable of fulfilling a request at the required time.

Availability must be supplied by the business's authorised systems; the Network should not invent it.

#### C. External network integrations

Eventually, Sarah Network should allow external businesses to participate even if they do not use the full ZiricAI Company Portal.

For example, a merchant could integrate through a developer API, register its business identity and connect an external POS or CRM.

That would allow Sarah Network to grow beyond businesses that are already ZiricAI customers.

However, we should introduce this after the first-party Company Portal integration is stable.

## 23. The most important strategic decision

I would make Sarah Network a foundational platform service, not just another module inside Sarah App or Company Portal.

That means:

- Sarah App consumes the Network.
- Company Portal registers and manages company participation in the Network.
- Company Sarah registers its capabilities with the Network.
- Personal Sarah uses the Network to find and communicate with other Sarahs.
- Discover uses the Network's public profile and search services.
- Chat uses the Network's identities and routing services.
- My Organisations uses its organisation identities and relationship services.
- Sarah Pay uses its merchant identities and approved payment-related services.
- Mission Control governs the Network.
This creates a shared infrastructure that can support millions of users and businesses without requiring every product to build its own directory, search engine or identity system.

## 24. Recommended first milestone: SNET-00

Before we start implementing the Network, I recommend a read-only architecture audit.

This is especially important because we already have existing work in:

- Mission Control.
- Sarah App.
- Personal Sarah.
- Company Portal.
- Company Sarah.
- Sarah Network permissions and consent design.
- Discover.
- Chat.
- My Organisations.
- Existing tenant and identity services.
We must inspect what exists before deciding what to build.

### Recommended next gate

SNET-00

Sarah Network — Foundation Architecture Audit

Objective: Establish the actual current architecture and design the Network as a central ZiricAI platform service.

Cursor must inspect:

- Current Mission Control architecture and permissions.
- Existing Sarah Network code, if any.
- Firebase authentication and user identity.
- Company tenant identity and registration.
- Company Portal onboarding.
- Personal Sarah consumer identity.
- Existing network permissions and consent models.
- Discover and Chat functionality.
- Company Sarah and agent registration.
- Existing APIs, Firestore collections, rules and indexes.
- Existing event, analytics and integration services.
- Existing unfinished work, branches and stashes that could conflict.
Required report:

- Existing architecture and reusable components.
- Missing services.
- Network entity and identity model.
- Data ownership and security boundaries.
- Search architecture proposal.
- Agent registry design.
- Mission Control module design.
- API contracts.
- Integration map.
- Dependency and risk assessment.
- Phased implementation recommendation.
### Restrictions

Read-only inspection only. No source modifications, branch switching, stash application, commits, merges, pushes, deployments, production configuration changes or changes to Client Zero, Client 0.1, Central Motors or existing WhatsApp integrations.

Exit condition: We review the audit and approve the architecture before SNET-01 implementation.

### My final vision for Sarah Network

Imagine a user opening Sarah App and asking:

"Sarah, find me a school for my child, a dentist nearby, a church in my area, a mechanic for my car and a restaurant for tonight."

Sarah can search one connected network containing registered and discoverable businesses and organisations.

She can identify the right organisation, inspect its published services, check supported capabilities and establish a permitted conversation with its Sarah.

If necessary, a human takes over.

The customer can then book, subscribe, order or pay through the connected services.

On the other side, the company sees everything relevant in its Company Portal, manages its Sarah employees, responds to customers and measures its performance.

Mission Control governs the infrastructure that makes all this possible.

That is the opportunity: Sarah Network becomes the connection layer between people, businesses, organisations and AI employees.

It is the foundation that can turn Sarah from an individual AI assistant into a connected AI ecosystem.


## § Source

This document was transcribed from the user **MASTER FUNCTIONAL SPECIFICATION · SNET-01** message in chat transcript `4b35c336-ba33-40f6-9b85-22cdfafd3a95` (2026-11-08). All 24 numbered sections, programme phases (SNET-00–SNET-12), Mission Control module map, data-ownership rules (§17), and Network API sketch (§21) are included from that message.
