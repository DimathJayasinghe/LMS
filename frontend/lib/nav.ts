import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Library,
  ScanLine,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles that may see this item. Backend still enforces the real rules. */
  roles: Role[];
}

export interface NavSection {
  /** Optional group heading; omit for the primary section. */
  title?: string;
  items: NavItem[];
}

const ALL: Role[] = ["SUPER_ADMIN", "TEACHER", "ADMIN", "MARKER", "STUDENT"];

/**
 * Single source of truth for the authenticated sidebar. Filtered per-role by
 * `navForRole`. These are UX affordances only — every route is enforced
 * server-side (see context/frontend/04-api-integration.md §5).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ALL },
      { label: "Classes", href: "/classes", icon: BookOpen, roles: ALL },
      { label: "Timetable", href: "/timetable", icon: CalendarDays, roles: ALL },
      {
        label: "Exams",
        href: "/exams",
        icon: FileText,
        roles: ["STUDENT", "TEACHER", "SUPER_ADMIN"],
      },
      {
        label: "Submissions",
        href: "/submissions",
        icon: ClipboardCheck,
        roles: ["MARKER", "TEACHER", "SUPER_ADMIN"],
      },
      {
        label: "Attendance",
        href: "/attendance",
        icon: ScanLine,
        roles: ["STUDENT", "ADMIN", "TEACHER", "SUPER_ADMIN"],
      },
      {
        label: "Payments",
        href: "/payments",
        icon: CreditCard,
        roles: ["STUDENT", "ADMIN", "SUPER_ADMIN"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Users",
        href: "/admin/users",
        icon: Users,
        roles: ["ADMIN", "SUPER_ADMIN"],
      },
      {
        label: "Subjects",
        href: "/admin/subjects",
        icon: Library,
        roles: ["SUPER_ADMIN"],
      },
      {
        label: "Institutes",
        href: "/admin/institutes",
        icon: Building2,
        roles: ["SUPER_ADMIN"],
      },
      {
        label: "Audit log",
        href: "/admin/audit",
        icon: ClipboardList,
        roles: ["SUPER_ADMIN"],
      },
      {
        label: "Notification settings",
        href: "/admin/notification-settings",
        icon: Bell,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
];

/** Return only the sections/items visible to `role` (drops empty sections). */
export function navForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}
