"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "工作台", exact: true },
  { href: "/start", label: "发起审批" },
  { href: "/inbox", label: "待我审批" },
  { href: "/mine", label: "我的申请" },
  { href: "/rules", label: "AI 规则" },
];

const adminItems = [
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/workflows", label: "流程配置" },
  { href: "/admin/knowledge", label: "知识库" },
];

function active(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ inboxCount, isAdmin }: { inboxCount: number; isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...items, ...adminItems] : items;

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((item) => {
        const isActive = active(pathname, item.href, "exact" in item && item.exact === true);
        const showDivider = isAdmin && item.href === "/admin/users";
        return (
          <div key={item.href} className={showDivider ? "md:mt-4 md:border-t md:border-white/10 md:pt-4" : undefined}>
            <Link href={item.href} className={isActive ? "nav-link nav-link-active" : "nav-link"}>
              <span>{item.label}</span>
              {item.href === "/inbox" && inboxCount > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-deep">{inboxCount}</span>
              ) : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
