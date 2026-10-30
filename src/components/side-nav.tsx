"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const items: { href: string; label: string; exact?: boolean; icon: IconName }[] = [
  { href: "/", label: "工作台", exact: true, icon: "dashboard" },
  { href: "/assistant", label: "审批助手", icon: "sparkles" },
  { href: "/start", label: "发起审批", icon: "plus" },
  { href: "/inbox", label: "待我审批", icon: "inbox" },
  { href: "/mine", label: "我的申请", icon: "files" },
  { href: "/rules", label: "AI 规则", icon: "settings" },
];

const adminItems: typeof items = [
  { href: "/admin/users", label: "用户管理", icon: "users" },
  { href: "/admin/workflows", label: "流程配置", icon: "workflow" },
  { href: "/admin/knowledge", label: "知识库", icon: "book" },
  { href: "/admin/controls", label: "审批控制", icon: "settings" },
];

function active(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ inboxCount, isAdmin }: { inboxCount: number; isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...items, ...adminItems] : items;

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" aria-label="主导航">
      {links.map((item) => {
        const isActive = active(pathname, item.href, "exact" in item && item.exact === true);
        const showDivider = isAdmin && item.href === "/admin/users";
        return (
          <div key={item.href} className={showDivider ? "md:mt-4 md:border-t md:border-white/10 md:pt-4" : undefined}>
            {showDivider ? <div className="mb-2 hidden px-3 text-[11px] text-[#a8c3b8] md:block">管理空间</div> : null}
            <Link href={item.href} className={isActive ? "nav-link nav-link-active" : "nav-link"} aria-current={isActive ? "page" : undefined}>
              <span className="flex items-center gap-3"><Icon name={item.icon} size={17} />{item.label}</span>
              {item.href === "/inbox" && inboxCount > 0 ? (
                <span className="rounded-md bg-[#d6eee4] px-1.5 py-0.5 text-[11px] font-semibold text-deep">{inboxCount}</span>
              ) : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
