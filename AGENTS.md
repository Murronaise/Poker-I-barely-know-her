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

## Current State & Next Steps
1. **Database Integration:** The UI currently relies on a hardcoded `trueDataArray` in `page.tsx` for the chart animation. The next major step is to finalize the Supabase `players` and `game_records` schemas and pipe live database queries into the UI state.
2. **Flesh out Sub-pages:** The `/leaderboards` and `/profile/[player]` pages are currently placeholder dark-themed screens. They need to be fully designed and populated with specific Supabase queries to match the dashboard's aesthetic.
3. **Data Mapping:** The 8 metric cards (Shark, Whale, Tank, etc.) currently use placeholder data arrays. Logic needs to be written to calculate these specific superlatives from the raw Supabase game records.

## Strict Instructions for Future AI Agents
- **Do Not Break Animations:** The Recharts `<BarChart>` has `overflow="visible"` and `isAnimationActive={false}` to explicitly allow Framer Motion to control the chip physics natively. Do not remove these overrides or you will completely break the raining chip effect and clipping logic.
- **Preserve Navigation Physics:** The drag-to-scroll metric cards use a custom distance-tracking algorithm (`dragged` state) to distinguish between a physical "swipe" and an intentional "click". Do not alter the `onClick`, `onMouseDown`, `onMouseMove` events in the wrapper in `page.tsx` or you will break route navigation.
- **Hydration Safety:** `onClick={(e) => e.stopPropagation()}` is heavily utilized to prevent Next.js Link hydration errors when dealing with nested clickable elements inside the motion wrapper. 
