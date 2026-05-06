<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Poker Tracker - AI Agent Handoff Document

## Project Overview
A highly dynamic, visually stunning Poker Tracker application built to monitor player statistics, session profits, and play styles over time. The application is built with a heavy emphasis on premium UI, fluid animations, and data visualization.

## Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Vanilla utilities, no external component libraries)
- **Database:** Supabase (`@supabase/supabase-js`)
- **Animations:** Framer Motion
- **Charting:** Recharts
- **Icons:** Lucide React

## Design System & Aesthetics
- **Theme:** Ultra-dark mode (Background: `#0E1117`) with subtle radial gradients.
- **Cards:** Glassmorphism (`bg-white/5`, `backdrop-blur-xl`, `border-white/10`).
- **Accents:** Neon Green (`#39FF14`) and Cyan gradients. Hovering over interactive cards triggers glowing neon drop shadows (`shadow-[0_0_20px_rgba(57,255,20,0.4)]`).
- **Animations:** All UI elements must feature smooth entrance animations. The dashboard relies heavily on Framer Motion for staggered reveals, drag-to-scroll interactivity, and complex custom physics (e.g., raining poker chips).
- **Rule of Thumb:** NEVER use basic/generic styles. Every new component must perfectly match the existing high-fidelity, premium aesthetic.

## Architecture & Routing
- **`src/app/page.tsx`**: The main Dashboard. Contains the drag-to-scroll metric cards and the highly customized Recharts Global Profit Heatmap.
- **`src/app/leaderboards/page.tsx`**: Dynamic leaderboard routing. Currently reads the `category` search parameter.
- **`src/app/profile/[player]/page.tsx`**: Dynamic player profile routing. Uses Next.js asynchronous `params`.
- **`src/lib/supabase.ts`**: Supabase client initialization (requires `.env.local` to be populated).

## Key Custom Components
- **`ChipStackShape` (in `page.tsx`)**: A fully custom SVG shape injected into Recharts. It replaces standard rectangular bars with highly detailed, 3D isometric casino poker chips. 
  - *Physics Engine:* It uses Framer Motion (`<motion.g>`) inside the SVG to make every individual chip literally drop from 800px off-screen into a perfectly stacked pile when the page loads. It natively supports both positive (green) and negative (red) stacks, and calculates the rendering order bottom-up to ensure flawless 3D perspective.

## Current State

### Fully Implemented Features
- **Live Game Tracking** (`/games/[id]`): Full blind timer, level management, player tracking, rebuys, bust tracking, food spend, event log
- **Historical Games** (`/games/history/[id]`): Detailed settlement pages with peer-to-peer poker settlement + separate food settlement tracking
- **Stats Page** (`/stats`): Volume tracking, average pot, player volume leaderboard, per-session breakdown
- **Player Management** (`/players`): Player list, creation form with names and avatar URLs
- **Game Creation** (`/games/create`): Game setup with player selection, buy-in, blind structure, venue, time
- **Player Profiles** (`/profile/[player]`): Personal game history and stats
- **Leaderboards** (`/leaderboards`): Category-based rankings (searchable)
- **Player Avatars** (`<PlayerAvatar>`): Used in live table, history, and settlement sections

### Data Layer
- **Historical Games:** Hardcoded in `lib/historical-games.ts` with structure: `{id, date, duration, location, blinds, totalPot, players: [{name, avatar_url, buyIn, cashOut, food}]}`
- **Players:** Fetched from Supabase `players` table with name and avatar_url
- **Food Settlement:** Configured via `FOOD_PAYER` constant in `lib/local-store.ts`

## Upcoming Changes (Priority Order)

### Phase 1: Settlement & Mobile (Core UX)
1. **Settlement System Redesign**: Change from peer-to-peer to admin-collects-all model
   - All player balances flow to admin first
   - Admin gets settlement confirmation button per game
   - Update settlement calculation logic in `games/history/[id]/page.tsx`
2. **Mobile Responsiveness**:
   - Game detail cards: Scale fonts/padding based on viewport
   - Historic games table: Collapsible sections by default on mobile (date, players, settlement collapsed until expanded)
   - Fix text overflow in stat cards and headers
3. **Profile Pictures Across Site**:
   - Add to historic games leaderboard (already partially there)
   - Ensure consistent sizing and fallback handling

### Phase 2: Authentication & Permissions
4. **User Authentication**: 
   - Supabase Auth integration (email/password or OAuth)
   - Secure session management
   - Player login to view expanded profile with personal stats
5. **Role-Based Permissions**:
   - Admin role: Can create games, settle balances, edit/delete games
   - Player role: Can view own profile, view game history, view leaderboards
   - Enforce permissions at API and UI level
6. **Game Management**:
   - Edit game: Modify players, venue, date (admin-only)
   - Delete game: Remove from history (admin-only with confirmation)
   - Settlement lock: Once marked settled, prevents further edits

### Phase 3: UI Polish & Data
7. **Remove Redundant Fields**:
   - Historic game cards: Remove "Blinds" and "Venue" (venue already in main heading)
8. **Expanded Player Profiles**:
   - Lifetime net (sum of all game nets)
   - Win rate %
   - Personal game stats (avg buy-in, biggest win/loss, games played)
9. **Future Data Enhancements** (after auth):
   - Player balance tracking over time
   - Per-game notes for admin
   - Game location history/frequency

## Key Architectural Notes

### Settlement Flow (Post-Change)
```
Game ends → All player nets calculated → Button: "Mark Game Settled"
→ All owed amounts → Admin account
→ Admin distributes manually (separate from app, via food/etc)
```

### Mobile Responsiveness Pattern
- Use CSS breakpoints: `sm:`, `md:`, `lg:`
- For tables: Collapse into stacked cards on mobile, show relevant columns only
- Font scaling: Use `text-base md:text-lg` pattern consistently
- Avoid horizontal scroll; prioritize vertical collapse

### Permission Checks
- Middleware to verify user role before actions
- UI elements hidden/disabled for non-admin users
- Toast errors for unauthorized attempts

## Strict Instructions for Future AI Agents

### Critical Animation & Interaction Patterns
- **Do Not Break Animations:** The Recharts `<BarChart>` has `overflow="visible"` and `isAnimationActive={false}` to explicitly allow Framer Motion to control the chip physics natively. Do not remove these overrides or you will completely break the raining chip effect and clipping logic.
- **Preserve Navigation Physics:** The drag-to-scroll metric cards use a custom distance-tracking algorithm (`dragged` state) to distinguish between a physical "swipe" and an intentional "click". Do not alter the `onClick`, `onMouseDown`, `onMouseMove` events in the wrapper in `page.tsx` or you will break route navigation.
- **Hydration Safety:** `onClick={(e) => e.stopPropagation()}` is heavily utilized to prevent Next.js Link hydration errors when dealing with nested clickable elements inside the motion wrapper.

### Settlement Logic
- **Current (hardcoded):** Peer-to-peer settlement with separate food tracking to `FOOD_PAYER`
- **Transitioning to:** Admin-collects-all model where all balances flow to one admin account
- When modifying settlement logic in `games/history/[id]/page.tsx`, preserve `calcSettlements()` function but repurpose it to settle all debtors to admin
- Food settlement continues to use separate `FOOD_PAYER` tracking (no change)

### Mobile & Responsive Design
- Tables on mobile must collapse into cards or use horizontal scroll carefully (prefer collapse)
- Use `max-h-[280px] md:max-h-none` pattern for collapsible sections
- Font sizes: always scale with `text-base md:text-lg xl:text-xl` pattern
- Test any stat card or numeric display at 375px width to catch text overflow early

### Permission Enforcement
- Any game mutation (create, edit, delete, settle) must check admin role
- UI must be guarded with permissions (hidden buttons, disabled inputs) AND backend validation
- Use role checks at component level AND in server actions/API routes (defense in depth) 
