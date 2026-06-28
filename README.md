# 🎨 Drawer: Collaborative Vector Whiteboard with Gemini AI Shape Generation

Welcome to **Drawer**, a state-of-the-art real-time collaborative vector whiteboard application. Drawer allows users to create workspaces (rooms) where multiple participants can sketch, resize, pan, zoom, upload images, write text, and chat in real-time. It features a complete historic timeline replay system and integrated Gemini AI shape generation.

---

## 🏗️ Monorepo Architecture Overview

This project is configured as a monorepo managed by **Turborepo** with **pnpm workspaces**. The services are split into focused application layers and shared packages:

```mermaid
graph TD
    Client["🎨 Next.js Client (apps/frontend)"]
    HTTP["🌐 Express API Backend (apps/http-backend)"]
    WS["⚡ WebSocket Server (apps/ws-backend)"]
    DB["🗄️ PostgreSQL Database"]
    Redis["🔴 Redis Message Bus & Cache"]
    Gemini["✨ Gemini 3.5 Flash Model"]

    Client -->|REST Requests| HTTP
    Client -->|WS Connection| WS
    HTTP -->|Prisma Client| DB
    WS -->|Prisma Client| DB
    WS <-->|Pub/Sub & Coordinate Cache| Redis
    HTTP <-->|Generate Shapes Request| Gemini
```

### Monorepo Layout

- **Applications (`apps/`)**:
  - [`apps/frontend`](file:///d:/Drawer/apps/frontend): A Next.js 16 Web application using Tailwind CSS 4, HTML5 Canvas API, and WebSockets.
  - [`apps/http-backend`](file:///d:/Drawer/apps/http-backend): An Express server managing REST API endpoints, JWT authentication, room operations, and Gemini AI.
  - [`apps/ws-backend`](file:///d:/Drawer/apps/ws-backend): A high-performance WebSocket server orchestrating real-time Canvas updates, presence state, and viewport caching via Redis.
- **Shared Packages (`packages/`)**:
  - [`packages/common`](file:///d:/Drawer/packages/common): Shared Zod validation schemas and general types/enums.
  - [`packages/db`](file:///d:/Drawer/packages/db): Shared Prisma database Client mapping the database schemas.
  - [`packages/backend-common`](file:///d:/Drawer/packages/backend-common): Configuration modules shared across the backend instances.
  - [`packages/ui`](file:///d:/Drawer/packages/ui): Shared React components.
  - [`packages/eslint-config`](file:///d:/Drawer/packages/eslint-config) & [`packages/typescript-config`](file:///d:/Drawer/packages/typescript-config): ESLint rules and TypeScript configuration baselines.

---

## 🚀 Core Product Features

1.  **High-Performance Canvas Engine**: Coordinates zoom (0.5x to 5.0x) and infinite viewport panning. Handles coordinates translation math between the browser screen space and game world coordinates.
2.  **Rich Vector Tools**: Drawing support for Rectangles, Circles, Lines, Text, and dynamic image insertion (with 5MB file limit checks and aspect ratio retention).
3.  **Advanced Vector Manipulations**: Real-time bounding selector boxes allow users to select, reposition, scale, and rotate vector shapes using customized rotational drag vectors.
4.  **Real-Time State Synchronization**: Collaborative state updates synced across clients via Redis Pub/Sub backend channels and WebSockets. Active viewport sharing lets editors see where other members are looking.
5.  **History Subsystem (Undo/Redo)**: Full transaction logging allowing actions to be reverted. Reverting deletions generates a temporary server transaction to restore elements reliably.
6.  **Interactive Timeline Replay Mode**: Sequenced database storage of events allows room owners and editors to replay the drawing's history at variable playback speeds (Play, Pause, and Frame-by-Frame steps).
7.  **Gemini AI Assisted Drawing**: Connects to the `gemini-3.5-flash` model. Accepts natural language requests (e.g., _"draw a house with a tree beside it"_) and converts them to vector shapes on the canvas.
8.  **Role-Based Access Control**: Standardizes users into `Viewer`, `Editor`, and `Owner` roles.

---

## 🧮 Mathematical Subsystem: Viewport Coordinate Transforms

To keep canvas rendering sharp and accurate across different device ratios, screen coordinates ($S_x$, $S_y$) are dynamically translated into game-world coordinates ($W_x$, $W_y$) using the zoom factor ($Z$) and viewport pan offsets ($P_x$, $P_y$).

### 1. Plain Text Equations (Standard Markdown Compatibility)

**World to Screen Coordinates (For Rendering Shapes):**

```text
Screen_X = (World_X * Zoom) + Pan_X
Screen_Y = (World_Y * Zoom) + Pan_Y
```

**Screen to World Coordinates (For Normalizing Browser Mouse Events):**

```text
World_X = (Screen_X - Pan_X) / Zoom
World_Y = (Screen_Y - Pan_Y) / Zoom
```

### 2. LaTeX Mathematical Representation

For Markdown engines that support LaTeX math block rendering:

$$
S_x = W_x \cdot Z + P_x
$$

$$
S_y = W_y \cdot Z + P_y
$$

$$
W_x = \frac{S_x - P_x}{Z}
$$

$$
W_y = \frac{S_y - P_y}{Z}
$$

Where:

- **$S_x$, $S_y$**: Screen viewport coordinates
- **$W_x$, $W_y$**: Game-world coordinates
- **$Z$**: Current zoom level factor
- **$P_x$, $P_y$**: Horizontal and vertical pan offsets

_Reference implementation can be reviewed in_ [`apps/frontend/Draw/Game.ts`](file:///d:/Drawer/apps/frontend/Draw/Game.ts).

---

## 💾 Database Schema

The PostgreSQL schema is managed via Prisma in [`packages/db/prisma/schema.prisma`](file:///d:/Drawer/packages/db/prisma/schema.prisma). It maps the following relationships:

| Model            | Description                                                                            | Relations                                                            |
| :--------------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **`User`**       | Stores basic user accounts, credentials, and references.                               | Has many `chats`, `createdShapes`, `updatedShapes`, and `roomUsers`. |
| **`Room`**       | Identifies collaborative canvas spaces mapped by numeric slugs.                        | Has many `chats`, `Shapes`, `roomUsers`, and `roomEvents`.           |
| **`roomUser`**   | Bridges users to rooms, defining permissions via `role` (`Viewer`, `Editor`, `Owner`). | Many-to-many lookup table.                                           |
| **`Chat`**       | Stores contextual group conversations within rooms.                                    | Belongs to `Room` and `User`.                                        |
| **`Shapes`**     | Stores stringified vector shape payload objects currently on canvas.                   | Belongs to `Room`. Tracked by creators and updater IDs.              |
| **`roomEvents`** | The event log database for replay mode. Tracks sequence actions.                       | Linked to `Room` and `User`.                                         |

---

## ⚡ WebSocket Synchronized Protocols

Clients establish communication with [`apps/ws-backend`](file:///d:/Drawer/apps/ws-backend/src/index.ts) using the following WebSocket interface structure.

### 🔑 Authentication Flow

If an `Authorization` token cookie is present during handshake, the connection is instantly authenticated. Otherwise, clients must send an `auth` frame within 5 seconds, or the connection is terminated:

```json
{
  "type": "auth",
  "token": "YOUR_JWT_AUTH_TOKEN"
}
```

### 🎨 Synchronization Frames (`EventType`)

All vector actions use payloads matching the shared [`packages/common/src/enum.ts`](file:///d:/Drawer/packages/common/src/enum.ts):

- **`CREATE_SHAPE`**: Broadcasts a new vector shape creation.
- **`DELETE_SHAPE`**: Reverts or deletes a shape by ID.
- **`MOVE_SHAPE`**: Triggered when moving selected items.
- **`ROTATE_SHAPE` / `SCALE_SHAPE`**: Syncs size, handle scaling, or angle changes.
- **`CHANGE_FILL` / `CHANGE_STROKE`**: Syncs colors.
- **`CHANGE_LAYER`**: Recalculates index hierarchies (`zIndex` swaps).
- **`CHANGE_TEXT`**: Syncs text updates.
- **`ADD_IMAGE`**: Dispatches base64 image urls.

---

## 🛠️ Environment Configuration

Set up these `.env` configuration files inside their respective modules before launching the workspace:

### 🖥️ Next.js Web App Configuration

Create [`apps/frontend/.env`](file:///d:/Drawer/apps/frontend/.env.example):

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3010
NEXT_PUBLIC_WS_URL=ws://localhost:8200
```

### 🌐 Express Backend API Configuration

Create [`apps/http-backend/.env`](file:///d:/Drawer/apps/http-backend/.env.example):

```env
DATABASE_URL=postgresql://username:password@localhost:5432/drawer_db?schema=public
PORT=3010
FRONTEND_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key_here
```

### ⚡ WebSocket Server Configuration

Create [`apps/ws-backend/.env`](file:///d:/Drawer/apps/ws-backend/.env.example):

```env
DATABASE_URL=postgresql://username:password@localhost:5432/drawer_db?schema=public
PORT=8200
REDIS_URL=redis://localhost:6379
```

### 🔐 Shared Backend Configuration

Create [`packages/backend-common/.env`](file:///d:/Drawer/packages/backend-common/.env.example):

```env
JWT_SECRET=your_jwt_secret_key_here
```

---

## 💻 Local Setup and Installation

Follow this sequence of steps to configure your environment:

### 1. Project Installation

Install all dependencies across workspaces:

```bash
pnpm install
```

### 2. Configure Database & Apply Migrations

Make sure you have a running PostgreSQL database. Apply the Prisma migrations:

```bash
# Generate the Prisma client and sync schema with your PostgreSQL database
pnpm --filter @repo/db build
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
```

### 3. Launch Development Servers

Run the full monorepo stack:

```bash
pnpm dev
```

This runs:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Express API: [http://localhost:3010](http://localhost:3010)
- WebSocket Server: [ws://localhost:8200](ws://localhost:8200)

> [!TIP]
> If you only want to spin up the backend instances (Express API & WebSockets) without running Next.js, run:
>
> ```bash
> pnpm dev:backend
> ```

### 4. Build for Production

Create optimized builds:

```bash
pnpm build
```

---

## 📂 Primary Code Reference Map

Explore these core entrypoints to inspect implementation details:

- **Whiteboard Canvas Controller**: [`apps/frontend/Draw/Game.ts`](file:///d:/Drawer/apps/frontend/Draw/Game.ts)
- **Drawing Component Interface**: [`apps/frontend/components/Canvas.tsx`](file:///d:/Drawer/apps/frontend/components/Canvas.tsx)
- **Vector Object Typings**: [`apps/frontend/types.ts`](file:///d:/Drawer/apps/frontend/types.ts)
- **Sign-In / Sign-Up Zod Validation**: [`packages/common/src/types.ts`](file:///d:/Drawer/packages/common/src/types.ts)
- **HTTP Endpoints Router**: [`apps/http-backend/src/routes/room.route.ts`](file:///d:/Drawer/apps/http-backend/src/routes/room.route.ts)
- **AI Generation Controller**: [`apps/http-backend/src/controllers/ai.controller.ts`](file:///d:/Drawer/apps/http-backend/src/controllers/ai.controller.ts)
- **WebSocket Handler Core**: [`apps/ws-backend/src/index.ts`](file:///d:/Drawer/apps/ws-backend/src/index.ts)
