# AI Resume Analyzer — Project Architecture

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Request Flow — User to App](#2-request-flow--user-to-app)
3. [Project File Structure](#3-project-file-structure)
4. [Data Models & Schemas](#4-data-models--schemas)
5. [Frontend Routes](#5-frontend-routes)
6. [Backend (Puter.js API Surface)](#6-backend-puterjs-api-surface)
7. [Scaling Strategy](#7-scaling-strategy)

---

## 1. System Architecture

This is a **client-side SPA** (Single Page Application) built with **React Router v7** (SPA mode, `ssr: false`). There is **no custom backend server** — all backend services (auth, file storage, key-value database, AI) are provided by **Puter.js**, a Browser-as-a-Service platform loaded via a `<script>` tag.

```mermaid
graph TB
    subgraph "Browser (Client)"
        A["React Router v7 SPA"] --> B["Zustand Store<br/>(usePuterStore)"]
        B --> C["Puter.js SDK<br/>(window.puter)"]
        A --> D["PDF.js<br/>(pdfjs-dist)"]
    end

    subgraph "Puter.js Cloud (Backend)"
        C -->|"Auth"| E["Puter Auth Service"]
        C -->|"File Upload/Read"| F["Puter File System"]
        C -->|"KV Get/Set/List"| G["Puter Key-Value Store"]
        C -->|"AI Chat"| H["Claude Sonnet 4<br/>(via Puter AI)"]
    end

    I["User's Browser"] --> A
    D -->|"Renders page 1<br/>to canvas"| J["PNG Image"]

    style A fill:#3b82f6,color:#fff
    style C fill:#10b981,color:#fff
    style H fill:#8b5cf6,color:#fff
```

### Entry Point Chain

| Step | File | What Happens |
|------|------|-------------|
| 1 | [vite.config.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/vite.config.ts) | Vite bootstraps the app with TailwindCSS + React Router + tsconfig paths |
| 2 | [react-router.config.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/react-router.config.ts) | Sets `ssr: false` — the app runs entirely as a client-side SPA |
| 3 | [app/root.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/root.tsx) | `Layout` component renders `<html>`, loads Puter.js via `<script>`, calls `init()` to connect to Puter SDK |
| 4 | [app/routes.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes.ts) | Defines all routes — `/`, `/auth`, `/upload`, `/resume/:id`, `/wipe` |
| 5 | Route components | Each route renders its page using the shared `usePuterStore` Zustand store |

---

## 2. Request Flow — User to App

### Flow 1: Resume Upload & Analysis (Core Feature)

```mermaid
sequenceDiagram
    actor User
    participant Browser as React SPA
    participant PuterFS as Puter File System
    participant PuterAI as Puter AI (Claude)
    participant PuterKV as Puter KV Store

    User->>Browser: Fill form (company, job title, JD) + drop PDF
    Browser->>Browser: Validate form fields & file

    Note over Browser: Step 1 — Upload PDF
    Browser->>PuterFS: fs.upload([file])
    PuterFS-->>Browser: { path: "/user/resume.pdf" }

    Note over Browser: Step 2 — Convert PDF → Image (client-side)
    Browser->>Browser: PDF.js renders page 1 → canvas → PNG blob

    Note over Browser: Step 3 — Upload Image
    Browser->>PuterFS: fs.upload([imageFile])
    PuterFS-->>Browser: { path: "/user/resume.png" }

    Note over Browser: Step 4 — Save metadata to KV
    Browser->>PuterKV: kv.set("resume:uuid", JSON.stringify(data))

    Note over Browser: Step 5 — AI Analysis
    Browser->>PuterAI: ai.chat([{ role: "user", content: [file + prompt] }])
    PuterAI-->>Browser: JSON feedback (scores, tips)

    Note over Browser: Step 6 — Save feedback
    Browser->>PuterKV: kv.set("resume:uuid", JSON.stringify(data + feedback))

    Browser->>User: Navigate to /resume/:uuid
```

### Flow 2: Authentication

```mermaid
sequenceDiagram
    actor User
    participant Browser as React SPA
    participant PuterAuth as Puter Auth

    User->>Browser: Visit any protected page
    Browser->>Browser: Check auth.isAuthenticated (Zustand)
    alt Not Authenticated
        Browser->>Browser: Redirect to /auth?next=/target-page
        User->>Browser: Click "Log in"
        Browser->>PuterAuth: puter.auth.signIn()
        PuterAuth-->>Browser: Auth token + user object
        Browser->>Browser: Update Zustand store
        Browser->>User: Redirect to ?next= target
    end
```

### Flow 3: Viewing Resume Results

```mermaid
sequenceDiagram
    actor User
    participant Browser as React SPA
    participant PuterKV as Puter KV Store
    participant PuterFS as Puter File System

    User->>Browser: Navigate to /resume/:id
    Browser->>PuterKV: kv.get("resume:id")
    PuterKV-->>Browser: JSON string (metadata + feedback)
    Browser->>Browser: JSON.parse(data)
    Browser->>PuterFS: fs.read(data.resumePath)
    PuterFS-->>Browser: PDF Blob
    Browser->>PuterFS: fs.read(data.imagePath)
    PuterFS-->>Browser: Image Blob
    Browser->>Browser: Create Object URLs
    Browser->>User: Render resume image + feedback (Summary, ATS, Details)
```

---

## 3. Project File Structure

```
AI-RESUME-ANALYZER/
├── app/                            # Application source code
│   ├── root.tsx                    # Root layout — <html>, <head>, <body>, Puter init
│   ├── routes.ts                   # Route definitions (React Router v7)
│   ├── app.css                     # Global styles + Tailwind imports
│   │
│   ├── routes/                     # Page-level components (1 per route)
│   │   ├── home.tsx                # "/" — Dashboard listing all resumes
│   │   ├── auth.tsx                # "/auth" — Login/logout page
│   │   ├── upload.tsx              # "/upload" — Upload form + analysis trigger
│   │   ├── resume.tsx              # "/resume/:id" — Detailed feedback view
│   │   └── wipe.tsx                # "/wipe" — Dev tool to clear all data
│   │
│   ├── components/                 # Reusable UI components
│   │   ├── NavBar.tsx              # Top navigation bar
│   │   ├── FileUploader.tsx        # Drag-and-drop PDF uploader (react-dropzone)
│   │   ├── ResumeCard.tsx          # Card for each resume on home page
│   │   ├── Summary.tsx             # Overall score + category breakdown
│   │   ├── ScoreGauge.tsx          # Circular score gauge (SVG)
│   │   ├── ScoreBadge.tsx          # Colored score pill badge
│   │   ├── ScoreCircle.tsx         # Circular score indicator
│   │   ├── ATS.tsx                 # ATS score section with tips
│   │   ├── Details.tsx             # Expandable category details (accordion)
│   │   └── Accordion.tsx           # Custom accordion component
│   │
│   └── lib/                        # Utilities and integrations
│       ├── puter.ts                # Zustand store — wraps entire Puter.js SDK
│       ├── pdf2image.ts            # PDF → PNG conversion using PDF.js
│       └── utils.ts                # Helpers (cn, generateUUID)
│
├── constants/
│   └── index.ts                    # AI prompt template + mock resume data
│
├── types/
│   ├── index.d.ts                  # App types (Resume, Feedback, Job)
│   └── puter.d.ts                  # Puter SDK types (FSItem, PuterUser, etc.)
│
├── public/                         # Static assets (images, icons, SVGs)
├── build/                          # Production build output
│
├── vite.config.ts                  # Vite config (TailwindCSS + React Router)
├── react-router.config.ts          # SPA mode config (ssr: false)
├── tsconfig.json                   # TypeScript config
├── package.json                    # Dependencies & scripts
├── Dockerfile                      # Multi-stage Docker build
├── client-tools.ts                 # Auto-generated DOM tools (not used in app)
└── actions.json                    # Web agent action definitions
```

---

## 4. Data Models & Schemas

### Entity Relationship Diagram

```mermaid
erDiagram
    PuterUser {
        string uuid PK
        string username
    }

    Resume {
        string id PK "UUIDv4"
        string companyName "Optional"
        string jobTitle "Optional"
        string imagePath "Puter FS path to PNG"
        string resumePath "Puter FS path to PDF"
        Feedback feedback "Nested JSON object"
    }

    Feedback {
        number overallScore "0-100"
        ATSSection ATS
        CategorySection toneAndStyle
        CategorySection content
        CategorySection structure
        CategorySection skills
    }

    ATSSection {
        number score "0-100"
        ATSTip[] tips
    }

    ATSTip {
        string type "good | improve"
        string tip
    }

    CategorySection {
        number score "0-100"
        CategoryTip[] tips
    }

    CategoryTip {
        string type "good | improve"
        string tip "Short title"
        string explanation "Detailed explanation"
    }

    FSItem {
        string id PK
        string uid
        string name
        string path
        boolean is_dir
        string parent_id
        string parent_uid
        number created "Unix timestamp"
        number modified "Unix timestamp"
        number size "Bytes, null for dirs"
        boolean writable
    }

    KVItem {
        string key PK "Pattern: resume:uuid"
        string value "JSON stringified Resume"
    }

    AIResponse {
        number index
        ChatMessage message
        string finish_reason
        UsageItem[] usage
        boolean via_ai_chat_service
    }

    ChatMessage {
        string role "user | assistant | system"
        string content "String or content array"
    }

    PuterUser ||--o{ Resume : "owns (via KV scope)"
    Resume ||--|| Feedback : "contains"
    Feedback ||--|| ATSSection : "has"
    Feedback ||--|| CategorySection : "has 4 categories"
    ATSSection ||--o{ ATSTip : "contains"
    CategorySection ||--o{ CategoryTip : "contains"
    KVItem ||--|| Resume : "stores serialized"
```

### Storage Model

The app uses **Puter KV** as its database. Data is stored as serialized JSON:

```mermaid
graph LR
    subgraph "Puter Key-Value Store"
        K1["resume:a1b2c3d4"] -->|value| V1["{ id, companyName, jobTitle,<br/>resumePath, imagePath, feedback }"]
        K2["resume:e5f6g7h8"] -->|value| V2["{ id, companyName, jobTitle,<br/>resumePath, imagePath, feedback }"]
    end

    subgraph "Puter File System"
        F1["/user/resume.pdf"]
        F2["/user/resume.png"]
    end

    V1 -.->|resumePath| F1
    V1 -.->|imagePath| F2

    style K1 fill:#f59e0b,color:#000
    style K2 fill:#f59e0b,color:#000
```

### TypeScript Type Definitions

The full types are defined in two files:

| File | Types Defined |
|------|--------------|
| [types/index.d.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/types/index.d.ts) | `Job`, `Resume`, `Feedback` |
| [types/puter.d.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/types/puter.d.ts) | `FSItem`, `PuterUser`, `KVItem`, `ChatMessage`, `ChatMessageContent`, `PuterChatOptions`, `AIResponse` |

---

## 5. Frontend Routes

| Route | File | Auth Required | Purpose |
|-------|------|:---:|---------|
| `/` | [home.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/home.tsx) | ✅ | Dashboard — lists all analyzed resumes from KV store |
| `/auth` | [auth.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/auth.tsx) | ❌ | Login/logout page, redirects via `?next=` param |
| `/upload` | [upload.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/upload.tsx) | ✅ | Form to upload resume + job details, triggers AI analysis |
| `/resume/:id` | [resume.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/resume.tsx) | ✅ | Detailed view — resume image + ATS score + feedback sections |
| `/wipe` | [wipe.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/wipe.tsx) | ✅ | Dev/admin tool — lists files and wipes all KV + FS data |

### Route Configuration

Defined in [app/routes.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes.ts):

```typescript
export default [
  index("routes/home.tsx"),          // /
  route('/auth', "routes/auth.tsx"), // /auth
  route('/upload', "routes/upload.tsx"),   // /upload
  route('/resume/:id', "routes/resume.tsx"), // /resume/:id
  route('/wipe', 'routes/wipe.tsx') // /wipe
] satisfies RouteConfig;
```

### Auth Guard Pattern

There is no centralized auth middleware. Each route manually checks auth status:

```typescript
// Pattern used in home.tsx, resume.tsx, wipe.tsx
useEffect(() => {
  if (!isLoading && !auth.isAuthenticated) {
    navigate('/auth?next=/current-path');
  }
}, [isLoading]);
```

---

## 6. Backend (Puter.js API Surface)

Since there is **no custom backend**, all "backend" operations are Puter.js SDK calls made from the browser. The entire SDK is wrapped in a Zustand store at [app/lib/puter.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/lib/puter.ts).

### API Surface

| Service | Method | Used In | Purpose |
|---------|--------|---------|---------|
| **Auth** | `puter.auth.signIn()` | [auth.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/auth.tsx) | Trigger Puter OAuth login |
| **Auth** | `puter.auth.signOut()` | [auth.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/auth.tsx) | Log user out |
| **Auth** | `puter.auth.isSignedIn()` | [puter.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/lib/puter.ts) | Check auth status on init |
| **Auth** | `puter.auth.getUser()` | [puter.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/lib/puter.ts) | Fetch user profile |
| **FS** | `puter.fs.upload([file])` | [upload.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/upload.tsx) | Upload PDF and PNG files |
| **FS** | `puter.fs.read(path)` | [resume.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/resume.tsx) | Read file as Blob for display |
| **FS** | `puter.fs.readdir(path)` | [wipe.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/wipe.tsx) | List all user files |
| **FS** | `puter.fs.delete(path)` | [wipe.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/wipe.tsx) | Delete individual files |
| **KV** | `puter.kv.set(key, value)` | [upload.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/upload.tsx) | Store resume metadata + feedback |
| **KV** | `puter.kv.get(key)` | [resume.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/resume.tsx) | Retrieve single resume by ID |
| **KV** | `puter.kv.list(pattern, true)` | [home.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/home.tsx) | List all resumes (`resume:*`) |
| **KV** | `puter.kv.flush()` | [wipe.tsx](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/routes/wipe.tsx) | Clear entire KV store |
| **AI** | `puter.ai.chat(messages, options)` | [puter.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/app/lib/puter.ts#L330-L355) | Send resume file + prompt to Claude Sonnet 4 |

### AI Prompt Architecture

The AI analysis prompt is constructed in [constants/index.ts](file:///c:/Users/Amartya/Dropbox/PC/Desktop/Projects/AI-RESUME-ANALYZER/constants/index.ts#L228-L246):

```mermaid
graph LR
    A["prepareInstructions(jobTitle, JD)"] --> B["System prompt:<br/>ATS expert role"]
    B --> C["Include job title<br/>+ job description"]
    C --> D["AIResponseFormat<br/>(TypeScript interface)"]
    D --> E["Instruction:<br/>Return raw JSON only"]

    F["Resume PDF<br/>(puter_path)"] --> G["puter.ai.chat()"]
    E --> G
    G --> H["Claude Sonnet 4"]
    H --> I["JSON Feedback<br/>(scores + tips)"]
```

---

## 7. Scaling Strategy

### Current Limitations

| Concern | Current State | Risk Level |
|---------|--------------|:---:|
| Backend | Zero custom backend — all on Puter.js | 🔴 High vendor lock-in |
| Database | KV store (flat key-value, no queries) | 🔴 No filtering, sorting, pagination |
| PDF processing | Client-side (PDF.js on canvas) | 🟡 Slow on large/multi-page PDFs |
| Auth | No user-scoped KV keys | 🔴 Any user can guess UUIDs |
| Error handling | No try-catch on JSON.parse | 🔴 App crashes on malformed AI response |
| State mgmt | One 450-line Zustand store | 🟡 Hard to maintain at scale |
| Testing | No tests | 🔴 No safety net for changes |

### Phase 1 — Harden the MVP (Quick Wins)

```mermaid
graph TD
    A["Phase 1: Harden MVP"] --> B["Add try-catch<br/>around JSON.parse"]
    A --> C["Fix isProcessing<br/>never resetting on error"]
    A --> D["Scope KV keys<br/>resume:userId:uuid"]
    A --> E["Add Zod validation<br/>for AI response schema"]
    A --> F["Split Zustand store<br/>into slices"]
```

### Phase 2 — Add a Real Backend

Replace Puter.js with a proper backend to unlock querying, caching, and multi-tenancy:

```mermaid
graph TB
    subgraph "Frontend (unchanged)"
        A["React SPA"]
    end

    subgraph "API Layer (NEW)"
        B["Next.js API Routes<br/>or Express.js"]
        C["Auth: NextAuth / Clerk"]
    end

    subgraph "Data Layer (NEW)"
        D["PostgreSQL<br/>(Supabase / Neon)"]
        E["S3 / Cloudflare R2<br/>(file storage)"]
        F["Redis<br/>(caching + queue)"]
    end

    subgraph "AI Layer"
        G["Claude API<br/>(direct, not via Puter)"]
    end

    A --> B
    B --> C
    B --> D
    B --> E
    B --> F
    B --> G

    style B fill:#3b82f6,color:#fff
    style D fill:#10b981,color:#fff
    style G fill:#8b5cf6,color:#fff
```

| Component | Current (Puter) | Scaled Replacement | Why |
|-----------|---------------|-------------------|-----|
| Auth | `puter.auth` | NextAuth / Clerk | OAuth + RBAC + team accounts |
| File Storage | `puter.fs` | S3 / Cloudflare R2 | Cheaper, CDN, access control |
| Database | `puter.kv` | PostgreSQL | Queries, indexes, relations |
| AI | `puter.ai.chat` | Direct Claude API | Rate limit control, retries, streaming |
| PDF → Image | Client-side PDF.js | Server-side `pdf-to-img` | Faster, supports multi-page |

### Phase 3 — Production Scale Architecture

```mermaid
graph TB
    subgraph "CDN"
        A["Cloudflare / Vercel Edge"]
    end

    subgraph "App Servers"
        B["Node.js Cluster<br/>(or serverless)"]
    end

    subgraph "Job Queue"
        C["BullMQ + Redis"]
    end

    subgraph "Workers"
        D["PDF Processing Worker"]
        E["AI Analysis Worker"]
    end

    subgraph "Storage"
        F["PostgreSQL<br/>(with Prisma ORM)"]
        G["S3 Object Storage"]
        H["Redis Cache"]
    end

    subgraph "AI"
        I["Claude API<br/>(with retry + fallback)"]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    D --> G
    E --> I
    I --> F
    B --> F
    B --> H

    style C fill:#f59e0b,color:#000
    style I fill:#8b5cf6,color:#fff
```

Key changes at scale:

| Feature | Implementation |
|---------|---------------|
| **Async processing** | Move AI analysis to a background job queue (BullMQ). User uploads → gets a "processing" status → polls or gets websocket notification |
| **Multi-page PDF** | Process all pages server-side, generate thumbnail grid |
| **Resume versioning** | `resumes` table with `version` column, diff comparison view |
| **Team features** | Organizations, shared resume pools, role-based access |
| **Caching** | Redis cache for AI results (same resume + same JD = cached response) |
| **Rate limiting** | Per-user limits on AI calls (e.g., 10 analyses/day on free tier) |
| **Monitoring** | Sentry for errors, Datadog/Grafana for metrics, structured logging |
| **CI/CD** | GitHub Actions → Docker build → deploy to Cloud Run / Fly.io |

### Database Schema at Scale

```mermaid
erDiagram
    users {
        uuid id PK
        string email UK
        string name
        string avatar_url
        timestamp created_at
        timestamp updated_at
    }

    resumes {
        uuid id PK
        uuid user_id FK
        string company_name
        string job_title
        text job_description
        string pdf_url "S3 path"
        string thumbnail_url "S3 path"
        integer version
        enum status "pending | processing | completed | failed"
        timestamp created_at
        timestamp updated_at
    }

    analyses {
        uuid id PK
        uuid resume_id FK
        integer overall_score
        jsonb feedback "Full feedback JSON"
        string model_used "claude-sonnet-4"
        integer tokens_used
        float cost_usd
        timestamp analyzed_at
    }

    categories {
        uuid id PK
        uuid analysis_id FK
        string name "ATS | toneAndStyle | content | structure | skills"
        integer score
    }

    tips {
        uuid id PK
        uuid category_id FK
        enum type "good | improve"
        string title
        text explanation
    }

    users ||--o{ resumes : "uploads"
    resumes ||--o{ analyses : "has versions"
    analyses ||--o{ categories : "scored in"
    categories ||--o{ tips : "contains"
```

---

> [!TIP]
> **For interviews**: Start with "This is an MVP using Puter.js as BaaS — here's how I'd scale it" and walk through Phases 1→3. This shows both pragmatism (ship fast) and architectural maturity (know how to scale).
