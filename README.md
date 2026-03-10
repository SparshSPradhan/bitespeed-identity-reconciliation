# Bitespeed Identity Reconciliation Service

> A backend web service that identifies and consolidates customer contacts across multiple purchases using different email addresses and phone numbers.

**Live Endpoint:** 


## Live API Endpoint

POST https://bitespeed-identity-reconciliation-3wda.onrender.com/identify

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Business Logic](#business-logic)
- [API Reference](#api-reference)
- [Local Setup](#local-setup)
- [Example Scenarios](#example-scenarios)

---

## Problem Statement

FluxKart.com customers (like Doc Brown) use different emails/phone numbers for each order. Bitespeed needs to:
1. Link these different contact details to the same person.
2. Maintain a **primary** contact (oldest) and **secondary** contacts (newer, linked).
3. When two previously separate contact clusters get linked, merge them — the older cluster's primary stays primary.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Runtime     | Node.js (v18+)                      |
| Language    | TypeScript                          |
| Framework   | Express.js                          |
| ORM         | Prisma                              |
| Database    | PostgreSQL                          |
| Deployment  | Render.com (free tier)              |

**Why Prisma over Drizzle?**  
Prisma offers better TypeScript inference, auto-generated client, and a visual studio (`prisma studio`) — ideal for rapid development and interview projects. Drizzle is lighter and closer to raw SQL, but Prisma's DX wins for this scope.

---

## Project Structure

```
bitespeed-identity-reconciliation/
├── prisma/
│   └── schema.prisma          # Database schema & Prisma config
├── src/
│   ├── controllers/
│   │   └── identifyController.ts  # Core reconciliation logic
│   ├── middleware/
│   │   └── validateRequest.ts     # Input validation
│   ├── routes/
│   │   └── identify.ts            # Route definitions
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   └── index.ts                   # App entry point & server setup
├── .env.example                   # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Database Schema

```prisma
model Contact {
  id             Int            @id @default(autoincrement())
  phoneNumber    String?
  email          String?
  linkedId       Int?           // Points to the primary contact's ID
  linkPrecedence LinkPrecedence @default(primary)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?      // Soft delete support

  linkedContact     Contact?   @relation("ContactLink", fields: [linkedId], references: [id])
  secondaryContacts Contact[]  @relation("ContactLink")
}

enum LinkPrecedence {
  primary
  secondary
}
```

**Key design decisions:**
- `linkedId` is `null` for primary contacts, and holds the primary's `id` for secondary contacts.
- Soft deletes via `deletedAt` — records are never hard-deleted.
- Indexes on `email`, `phoneNumber`, and `linkedId` for fast lookups.

---

## Business Logic

The `/identify` endpoint follows this decision tree:

```
Incoming request { email?, phoneNumber? }
         │
         ▼
  Find all contacts matching email OR phoneNumber
         │
         ├── No matches found
         │       └── Create new PRIMARY contact → return it
         │
         └── Matches found
                 │
                 ├── Resolve all primaries from matched contacts
                 │   (a secondary → look up its linkedId)
                 │
                 ├── Multiple primaries? → MERGE
                 │   Older primary stays PRIMARY
                 │   Newer primary(s) become SECONDARY (linkedId → older primary)
                 │   Their secondaries are re-pointed to the older primary
                 │
                 ├── New info in request (new email or new phone)?
                 │       └── Create new SECONDARY contact linked to true primary
                 │
                 └── Return consolidated view:
                         primaryContactId
                         emails[]         (primary's first, then secondaries)
                         phoneNumbers[]   (primary's first, then secondaries)
                         secondaryContactIds[]
```

---

## API Reference

### `POST /identify`

Identifies and reconciles contact information.

**Request Body:**
```json
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
```
> At least one of `email` or `phoneNumber` must be provided.

**Response `200 OK`:**
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

**Response `400 Bad Request`:**
```json
{
  "error": "Bad Request",
  "message": "At least one of 'email' or 'phoneNumber' must be provided."
}
```

### `GET /health`

Health check endpoint.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "message": "Bitespeed Identity Service is running",
  "timestamp": "2024-03-09T10:00:00.000Z"
}
```

---

## Local Setup

### Prerequisites

- Node.js v18 or higher
- PostgreSQL running locally (or use a cloud DB like Neon/Supabase free tier)
- npm or yarn

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/YOUR_USERNAME/bitespeed-identity-reconciliation.git
cd bitespeed-identity-reconciliation
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/bitespeed_db"
PORT=3000
```

**4. Create the database** (if using local PostgreSQL)
```bash
psql -U postgres -c "CREATE DATABASE bitespeed_db;"
```

**5. Run Prisma migration** (creates the Contact table)
```bash
npm run prisma:migrate
```

This command:
- Creates the migration file in `prisma/migrations/`
- Applies it to your database
- Generates the Prisma Client

**6. Generate Prisma Client** (if skipping migration, e.g. DB already set up)
```bash
npm run prisma:generate
```

**7. Start development server**
```bash
npm run dev
```

Server runs at `http://localhost:3000`

**8. Build for production**
```bash
npm run build
npm start
```

### Quick Test with curl

```bash
# Test 1: Create first contact
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'

# Test 2: New email, same phone → creates secondary
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'

# Test 3: Query with just phone → returns consolidated
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "123456"}'

# Health check
curl http://localhost:3000/health
```

---


## Example Scenarios

### Scenario 1: Brand new customer
```
Request:  { email: "doc@future.com", phoneNumber: "9999" }
Result:   New primary contact created
Response: { primaryContatctId: 1, emails: ["doc@future.com"], phoneNumbers: ["9999"], secondaryContactIds: [] }
```

### Scenario 2: Same phone, new email → secondary created
```
Request:  { email: "emmett@future.com", phoneNumber: "9999" }
Result:   New secondary contact linked to contact #1
Response: { primaryContatctId: 1, emails: ["doc@future.com", "emmett@future.com"], phoneNumbers: ["9999"], secondaryContactIds: [2] }
```

### Scenario 3: Two primaries get linked (merge scenario)
```
DB State:
  Contact A (primary, id=11): george@hillvalley.edu / 919191
  Contact B (primary, id=27): biffsucks@hillvalley.edu / 717171

Request: { email: "george@hillvalley.edu", phoneNumber: "717171" }

Result:
  Contact A stays primary (older)
  Contact B becomes secondary, linkedId=11
  
Response: { primaryContatctId: 11, emails: ["george@hillvalley.edu", "biffsucks@hillvalley.edu"], phoneNumbers: ["919191", "717171"], secondaryContactIds: [27] }
```

### Scenario 4: Exact duplicate request → no new row created
```
Request:  { email: "doc@future.com", phoneNumber: "9999" }  (already exists)
Result:   No new DB row, just returns consolidated view
```

---

