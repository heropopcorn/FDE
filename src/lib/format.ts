import type { RequestStatus } from "@/lib/types";

export function nowIso() {
  return new Date().toISOString();
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusLabel(status: RequestStatus) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  return "审批中";
}

export function modeLabel(mode: "any" | "all") {
  return mode === "any" ? "或签" : "会签";
}

export function modeHint(mode: "any" | "all") {
  return mode === "any" ? "任一人通过即进入下一节点，任一人驳回则结束" : "所有人都要通过；任一人驳回则结束";
}

export function todayInput() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function oneParam(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? value[0] : value;
  return text?.slice(0, 200) ?? "";
}
