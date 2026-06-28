# 🎨 Drawer

A real-time collaborative infinite whiteboard featuring event-sourced version history, AI-assisted drawing, and horizontally scalable WebSocket architecture.

![Drawer Workspace Interface](apps/frontend/public/drawer_interface_preview.png)

---

## 🚀 Product Evolution & Narrative

**Drawer** represents the third milestone in a progression of real-time systems designed to solve increasingly complex synchronization and distributed-state challenges:

1.  **Realtime Chat**: Solved real-time multi-room textual messaging.
2.  **Poll Battle**: Solved real-time synchronized state voting and concurrent score aggregation.
3.  **Drawer**: Solves real-time collaborative vector graphics rendering, infinite viewport transformations, and event-sourced version history.

---

## ⚡ Technical Highlights

- **Infinite Canvas**: Viewport coordinates projected to coordinates space with support for infinite panning and dynamic zooming.
- **Event Sourcing**: Immutable event history tracking instead of simple database snapshots, enabling full timeline replays and consistent undo/redo logic.
- **Redis Pub/Sub Inter-Server Sync**: Syncs event payloads across multiple WebSocket nodes, allowing the system to scale horizontally.
- **Bi-directional WebSockets**: Handshake-level and message-level JWT validation with strict timeouts.
- **AI-Assisted Canvas**: Connects to the `gemini-3.5-flash` model to transform natural language prompts into vector shapes on the whiteboard.

---

## 🧰 Feature Breakdown

### 🎨 Graphics Engine

- **Infinite Whiteboard**: Viewport coordinate translations support infinite panning and zoom scales (0.5x to 5.0x).
- **Vector Shape Toolkit**: Draw Rectangles, Circles, Lines, Text, and dynamic base64 Images (max 5MB with aspect-ratio locking).
- **Vector Manipulations**: Selection outline highlights, drag-to-move, drag-to-scale, and rotation handles using computed vector angles.
- **Copy & Paste**: Save selected vector elements to an in-memory clipboard (`clipboardShape`) and duplicate them dynamically relative to the cursor position.
- **Layer Management**: Push shapes up or down the rendering hierarchy using Z-index layer swap routines.

### 👥 Collaboration & Scaling

- **Real-time Collaboration**: WebSocket events coordinate tool selections, colors, shape updates, and canvas deletions immediately.
- **Horizontal Scalability**: WebSocket instances communicate through a **Redis Pub/Sub** message bus, allowing sessions to scale past a single server.
- **Presence Tracking & Active Viewports**: Caches user coordinates in Redis, displaying active member cursors and viewport locations in real-time.
- **Role-Based Access Control**: Strict client and server permissions for `Viewer`, `Editor`, and `Owner` roles.

### 📜 Version History & AI

- **Interactive Version History**: Replay the evolution of the board from the starting stroke. Pause, step forward, or step backward using adjustable speed playback controls.
- **Deterministic Undo / Redo**: Revert or repeat vector alterations using a dual stack transaction engine. Reverting a deleted shape uses temporary transaction IDs to reconstruct the element.
- **AI Vector Generation**: Send conversational instructions (e.g., _"draw a laptop next to a cup of coffee"_) to generate structured vector paths.

---

## 🏗️ Architecture & Monorepo Layout

This project is configured as a monorepo managed by **Turborepo** with **pnpm workspaces**:

```mermaid
graph TD
    Client["🎨 Next.js Client (apps/frontend)"]
    HTTP["🌐 Express API Backend (apps/http-backend)"]
    WS["⚡ WebSocket Server (apps/ws-backend)"]
    DB["🗄️ PostgreSQL Database"]
    Redis["🔴 Redis Pub/Sub & Cache"]
    Gemini["✨ Gemini 3.5 Flash Model"]

    Client -->|REST Requests| HTTP
    Client -->|WS Connection| WS
    HTTP -->|Prisma Client| DB
    WS -->|Prisma Client| DB
    WS <-->|Pub/Sub & Coordinate Cache| Redis
    HTTP <-->|Generate Shapes Request| Gemini
```

### Monorepo Structure

- **Applications (`apps/`)**:
  - [`apps/frontend`](file:///d:/Drawer/apps/frontend): A Next.js 16 app using Tailwind CSS 4, HTML5 Canvas API, and WebSockets.
  - [`apps/http-backend`](file:///d:/Drawer/apps/http-backend): An Express server managing REST API endpoints, JWT auth, room configs, and Gemini AI.
  - [`apps/ws-backend`](file:///d:/Drawer/apps/ws-backend): A WebSocket server coordinating real-time canvas events, active cursors, and viewport tracking.
- **Shared Packages (`packages/`)**:
  - [`packages/common`](file:///d:/Drawer/packages/common): Shared Zod validation schemas and general types/enums.
  - [`packages/db`](file:///d:/Drawer/packages/db): Shared Prisma client and migrations for PostgreSQL.
  - [`packages/backend-common`](file:///d:/Drawer/packages/backend-common): Configuration modules shared across the backend instances.
  - [`packages/ui`](file:///d:/Drawer/packages/ui): Shared React components.
  - [`packages/eslint-config`](file:///d:/Drawer/packages/eslint-config) & [`packages/typescript-config`](file:///d:/Drawer/packages/typescript-config): Build configuration baselines.

---

## 📐 Infinite Canvas & Coordinate Transformations

To keep canvas rendering sharp and accurate across different device ratios, Drawer distinguishes between **screen viewport coordinates** and **canvas world coordinates**.

All shapes are stored in the database in **canvas world coordinates** (which are zoom-independent and pan-independent). During rendering or user interaction, coordinates are projected dynamically.

### Viewport Projection Equations

**World Coordinates to Screen Coordinates (For Rendering Shapes):**

```text
Screen_X = (World_X * Zoom) + Pan_X
Screen_Y = (World_Y * Zoom) + Pan_Y
```

**Screen Coordinates to World Coordinates (For Normalizing Browser Mouse Events):**

```text
World_X = (Screen_X - Pan_X) / Zoom
World_Y = (Screen_Y - Pan_Y) / Zoom
```

Where:

- **Screen_X, Screen_Y**: Screen viewport coordinates (Sx, Sy)
- **World_X, World_Y**: Canvas world coordinates (Wx, Wy)
- **Zoom**: Current zoom level factor (Z), ranging from 0.5 to 5.0
- **Pan_X, Pan_Y**: Horizontal and vertical pan offsets (Px, Py)

_Reference implementation can be reviewed in_ [`apps/frontend/Draw/Game.ts`](file:///d:/Drawer/apps/frontend/Draw/Game.ts).

---

## 📜 Event Sourcing Architecture

Drawer uses an event-sourcing pattern for synchronization and version control. Rather than saving absolute states or snapshots of the whiteboard, the database stores the complete, immutable stream of events inside the `roomEvents` model.

```
[Create Rectangle] ➔ [Move Rectangle] ➔ [Rotate Rectangle] ➔ [Delete Rectangle]
```

### Why Event Sourcing?

1.  **Version History Replay**: The frontend can compute the whiteboard's appearance at any point in history by starting with an empty canvas and running the event stream up to index N.
2.  **Robust Undo / Redo**: Instead of overriding shapes, undo/redo logs actions (e.g., reverting a `MOVE_SHAPE` pushes a mirror move event).
3.  **Low Network Payload**: Real-time collaborative updates only need to broadcast the delta mutation (`MOVE_SHAPE` coordinates) instead of the entire shape registry.

---

## 🛠️ Engineering Challenges & Solutions

- **Implementing Rotation Handles**: Resizing a rotated shape requires calculating the pointer coordinates relative to the shape's pivot point. This was solved by applying coordinate rotation transforms using trigonometry (x' = x _ cos(theta) - y _ sin(theta)) before computing dimension deltas.
- **Designing an Immutable Event Ledger**: Storing shape modifications without database updates led to sequence conflicts. Implemented a sequence manager inside [`apps/ws-backend`](file:///d:/Drawer/apps/ws-backend/src/index.ts) to resolve conflicts and write database events in order.
- **Horizontal WebSocket Scalability**: Storing WebSocket user mappings on a single node prevents scaling. Implemented a **Redis Pub/Sub** message layer to sync shape updates instantly across nodes.
- **Optimizing Rendering Loops**: Redrawing hundreds of shapes on every frame during active zoom/pan can lag. Implemented selective caching, and off-screen canvas rendering.

---

## 💾 Database Schema

The database models are configured inside [`packages/db/prisma/schema.prisma`](file:///d:/Drawer/packages/db/prisma/schema.prisma):

| Model            | Description                                                                      | Relations                                                            |
| :--------------- | :------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **`User`**       | Handles user authentication and metadata.                                        | Links to `chats`, `createdShapes`, `updatedShapes`, and `roomUsers`. |
| **`Room`**       | Identifies collaborative workspaces mapped by numeric slugs.                     | Contains `chats`, `Shapes`, `roomUsers`, and `roomEvents`.           |
| **`roomUser`**   | Bridges users to rooms, defining role permissions (`Viewer`, `Editor`, `Owner`). | Many-to-many lookup table.                                           |
| **`Chat`**       | Stores real-time room chat logs.                                                 | Belongs to `Room` and `User`.                                        |
| **`Shapes`**     | Stores stringified shape payloads on the canvas.                                 | Belongs to `Room`.                                                   |
| **`roomEvents`** | The immutable log that powers the timeline replay engine.                        | Linked to `Room` and `User`.                                         |

---

## ⚡ WebSocket Event Reference

Clients communicate with the WebSocket backend via JSON frames. All coordinate mutations use event designations from [`packages/common/src/enum.ts`](file:///d:/Drawer/packages/common/src/enum.ts):

- **`CREATE_SHAPE`**: Broadcasts a new shape.
- **`DELETE_SHAPE`**: Removes a shape from the active layer.
- **`MOVE_SHAPE`**: Updates translation offsets.
- **`ROTATE_SHAPE` / `SCALE_SHAPE`**: Syncs shape orientation angles and bounding box dimensions.
- **`CHANGE_FILL` / `CHANGE_STROKE`**: Syncs color changes.
- **`CHANGE_LAYER`**: Swaps Z-index parameters of overlapping objects.
- **`CHANGE_TEXT`**: Syncs text changes.
- **`ADD_IMAGE`**: Dispatches base64 image strings.

---

## 💻 Local Setup and Installation

Follow this sequence of steps to configure your environment:

### 1. Project Installation

Install all dependencies across workspaces:

```bash
pnpm install
```

### 2. Set Up Environment Variables

Configure the `.env` parameters inside the respective applications:

- **Next.js Frontend**: [`apps/frontend/.env`](file:///d:/Drawer/apps/frontend/.env.example)
  ```env
  NEXT_PUBLIC_BACKEND_URL=http://localhost:3010
  NEXT_PUBLIC_WS_URL=ws://localhost:8200
  ```
- **Express API**: [`apps/http-backend/.env`](file:///d:/Drawer/apps/http-backend/.env.example)
  ```env
  DATABASE_URL=postgresql://username:password@localhost:5432/drawer_db?schema=public
  PORT=3010
  FRONTEND_URL=http://localhost:3000
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
- **WebSocket Backend**: [`apps/ws-backend/.env`](file:///d:/Drawer/apps/ws-backend/.env.example)
  ```env
  DATABASE_URL=postgresql://username:password@localhost:5432/drawer_db?schema=public
  PORT=8200
  REDIS_URL=redis://localhost:6379
  ```
- **Shared Common Backend**: [`packages/backend-common/.env`](file:///d:/Drawer/packages/backend-common/.env.example)
  ```env
  JWT_SECRET=your_jwt_secret_key_here
  ```

### 3. Generate Prisma Clients & Database Migrations

Apply the PostgreSQL schemas:

```bash
pnpm --filter @repo/db build
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
```

### 4. Run Development Workspace

```bash
pnpm dev
```

This boots up:

- Next.js App: [http://localhost:3000](http://localhost:3000)
- Express Server: [http://localhost:3010](http://localhost:3010)
- WS Server: [ws://localhost:8200](ws://localhost:8200)

> [!TIP]
> To run only the backend services (Express and WebSocket instances) without launching Next.js, run:
>
> ```bash
> pnpm dev:backend
> ```
