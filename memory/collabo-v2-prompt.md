# Collabo v2 — Claude Code Build Prompt

## Prompt

Build a modern project management app called "Collabo" from scratch. Think Linear's speed and keyboard-driven UX meets Notion's clean workspace feel. Task-oriented first, projects are containers.

### Tech Stack
- Next.js 16 (App Router, TypeScript)
- Supabase (auth, database, real-time)
- shadcn/ui + Tailwind CSS 4
- sonner for toast notifications
- nuqs for URL query state

### Design System
- Clean, minimal, fast — inspired by Linear
- Rounded corners, generous padding
- Dark mode default with light mode toggle
- Sidebar navigation (collapsible)
- Keyboard shortcuts for power users (Cmd+K command palette)
- No KPI dashboards. No vanity metrics. Progress is derived from tasks.
- Smooth transitions and micro-interactions

### Auth
- Supabase Auth with email/password
- Login page, signup page, forgot password
- Protected routes via middleware
- Session management with automatic refresh

### Data Model (Supabase/Postgres)

```sql
-- workspaces (multi-tenant)
workspaces: id, name, slug, created_at, updated_at

-- workspace members
workspace_members: id, workspace_id, user_id, role (owner|admin|member), joined_at

-- projects (belong to workspace)
projects: id, workspace_id, name, description, status (active|archived), created_by, created_at, updated_at

-- project members
project_members: id, project_id, user_id, role (lead|member)

-- tasks (core entity — belong to project optionally)
tasks: id, workspace_id, project_id (nullable), parent_task_id (nullable, one level deep only), title, description (text/markdown), status (backlog|todo|in_progress|done|cancelled), priority (none|low|medium|high|urgent), assignee_id, created_by, due_date, position (float for ordering), created_at, updated_at

-- labels
labels: id, workspace_id, name, color
task_labels: task_id, label_id

-- comments
comments: id, task_id, user_id, content, created_at, updated_at

-- notifications (inbox system)
notifications: id, user_id, workspace_id, type (assigned|mentioned|commented|status_changed|due_soon), task_id, actor_id, read, created_at

-- activity log
activity: id, workspace_id, task_id, user_id, action (created|updated|commented|assigned|status_changed), metadata (jsonb), created_at
```

### Row Level Security
- All tables have RLS enabled
- Users can only access data in workspaces they belong to
- Workspace owners/admins can manage members
- Task assignees and project members have appropriate access

### Core Pages & Features

**1. Layout**
- Collapsible left sidebar with: workspace switcher, navigation (My Tasks, Inbox, Projects list), user menu
- Main content area with breadcrumbs
- Command palette (Cmd+K) for quick navigation and actions

**2. My Tasks (default landing page: /tasks)**
- Shows all tasks assigned to current user across all projects
- Groupable by: project, status, priority, due date
- Sortable by: priority, due date, created date, title
- Inline editing: click to edit title, dropdown for status/priority/assignee
- Quick add: press N or click to add new task
- Filter bar with saved filters

**3. Project Overview (/projects/[slug])**
- Header: project name, description, member avatars
- Progress bar: auto-calculated from (done tasks / total tasks)
- Tab views: List (default), Board (kanban), Timeline
- Task list with expandable sub-tasks (one level deep)
- Sub-tasks show as indented rows under parent
- Click task row to open task detail panel (slide-over, not new page)

**4. Task Detail (slide-over panel)**
- Title (editable inline, large)
- Status, priority, assignee, due date, project, labels — all as dropdowns/selectors in a properties section
- Description with markdown support
- Sub-tasks section: add/remove/reorder sub-tasks
- Comments section with real-time updates
- Activity log at bottom (created, status changes, assignments)

**5. Inbox (/inbox)**
- Notification list grouped by today, this week, older
- Each notification shows: icon by type, actor, action, task title, timestamp
- Click notification → opens relevant task
- Mark as read/unread, archive, mark all as read
- Unread count badge on sidebar "Inbox" item

**6. Board View (/projects/[slug]/board)**
- Kanban columns: Backlog, Todo, In Progress, Done
- Drag and drop tasks between columns
- Quick add task in any column
- Cards show: title, priority indicator, assignee avatar, sub-task count

**7. Settings (/settings)**
- Workspace: name, members (invite, remove, change role)
- Profile: name, avatar, email, notification preferences
- Theme toggle (dark/light)

### Toast Notifications
- Use sonner for all user-facing feedback
- Success: task created, updated, deleted
- Error: failed operations with retry option
- Info: real-time updates from other users ("Alice moved Task X to Done")

### Real-time
- Subscribe to task changes within workspace via Supabase Realtime
- Live updates on board view and task lists
- Show toast when another user makes a change
- Presence indicators (who's online in workspace)

### Keyboard Shortcuts
- Cmd+K: command palette
- N: new task
- Cmd+Enter: submit/save
- Escape: close panel/modal
- Arrow keys: navigate task list
- 1-4: set status (backlog/todo/in progress/done)

### Project Structure
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── (workspace)/
│   │   ├── layout.tsx (sidebar + main area)
│   │   ├── tasks/page.tsx (my tasks)
│   │   ├── inbox/page.tsx
│   │   ├── projects/[slug]/
│   │   │   ├── page.tsx (overview/list)
│   │   │   └── board/page.tsx
│   │   └── settings/page.tsx
│   ├── onboarding/page.tsx (create first workspace)
│   └── layout.tsx
├── components/
│   ├── ui/ (shadcn components)
│   ├── tasks/
│   │   ├── task-list.tsx
│   │   ├── task-row.tsx
│   │   ├── task-detail.tsx
│   │   ├── task-board.tsx
│   │   └── task-quick-add.tsx
│   ├── projects/
│   │   ├── project-sidebar-list.tsx
│   │   └── project-header.tsx
│   ├── inbox/
│   │   └── notification-list.tsx
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── command-palette.tsx
│   │   └── breadcrumbs.tsx
│   └── shared/
│       ├── user-avatar.tsx
│       ├── priority-badge.tsx
│       └── status-select.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts (browser client)
│   │   ├── server.ts (server client)
│   │   ├── middleware.ts
│   │   └── types.ts (generated from supabase)
│   ├── hooks/
│   │   ├── use-tasks.ts
│   │   ├── use-projects.ts
│   │   ├── use-notifications.ts
│   │   └── use-realtime.ts
│   └── utils.ts
├── styles/
│   └── globals.css
└── supabase/
    └── migrations/ (SQL migration files)
```

### Implementation Order
1. Supabase schema + RLS policies + migration files
2. Auth flow (login, signup, middleware protection)
3. Onboarding (create workspace)
4. Layout with sidebar, command palette
5. My Tasks page with CRUD
6. Task detail panel
7. Project overview + task list with sub-tasks
8. Board view with drag-and-drop
9. Inbox + notification system
10. Real-time subscriptions
11. Settings page
12. Keyboard shortcuts + polish

### Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Constraints
- No KPI dashboards or vanity metrics
- Sub-tasks are ONE level deep only (no recursive nesting)
- Progress bars are always auto-calculated, never manual
- Mobile responsive but desktop-first
- Performance: pages should load in <1s, interactions feel instant
- Use optimistic updates for all mutations
