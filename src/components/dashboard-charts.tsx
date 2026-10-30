"use client";

import { useId, useState } from "react";
import type { DashboardChartData } from "@/lib/queries";
import type { AiOutcome } from "@/lib/types";
import styles from "./dashboard-charts.module.css";

const outcomeStyle: Record<AiOutcome, { label: string; color: string }> = {
  approve: { label: "自动通过", color: "#4b9770" },
  reject: { label: "自动驳回", color: "#c9606c" },
  manual: { label: "转人工", color: "#CB963E" },
  error: { label: "判断失败", color: "#94A3B8" },
};

export function DashboardCharts({ data }: { data: DashboardChartData }) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const periodId = useId();
  const trendId = useId();
  const distributionId = useId();
  const days = data.days.slice(-period);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const maximum = Math.max(1, ...days.map((day) => day.count));
  const ceiling = maximum <= 2 ? maximum : Math.ceil(maximum / 2) * 2;
  const attempts = data.outcomes.reduce((sum, item) => sum + item.count, 0);
  const segments = data.outcomes.flatMap((item, index) => {
    if (item.count === 0) return [];
    const start = data.outcomes.slice(0, index).reduce((sum, outcome) => sum + outcome.count, 0) / attempts * 360;
    const end = start + item.count / attempts * 360;
    return [`${outcomeStyle[item.outcome].color} ${start}deg ${end}deg`];
  });

  return (
    <div className={styles.grid}>
      <section className={`card ${styles.panel}`} aria-labelledby={trendId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={trendId} className="font-semibold">申请趋势</h2>
            <p className="mt-1 text-xs text-muted">按创建日期 · 共 {total} 份</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={periodId}>申请趋势统计时段</label>
            <select id={periodId} value={period} onChange={(event) => setPeriod(Number(event.target.value) as 7 | 30)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-muted">
              <option value={7}>近 7 天</option>
              <option value={30}>近 30 天</option>
            </select>
          </div>
        </div>
        <div className={styles.chart} role="img" aria-label={`近 ${period} 天申请数量，共 ${total} 份。逐日数据见下方明细。`}>
          <div className={styles.axis} aria-hidden="true"><span>{ceiling}</span><span>{ceiling > 1 ? ceiling / 2 : ""}</span><span>0</span></div>
          <div className={styles.bars} aria-hidden="true">
            {days.map((day, index) => (
              <div key={day.date} className={styles.day} title={`${day.date}：${day.count} 份`}>
                <div className={styles.bar} style={{ height: `${day.count / ceiling * 100}%` }}>
                  {day.count > 0 && period === 7 ? <span className={styles.barValue}>{day.count}</span> : null}
                </div>
                {(period === 7 || index === 0 || index === days.length - 1 || (index % 7 === 0 && index < days.length - 4)) ? <span className={styles.dayLabel}>{day.label}</span> : null}
              </div>
            ))}
            {total === 0 ? <div className={styles.emptyChart}>这段时间还没有申请</div> : null}
          </div>
        </div>
        <p className={styles.footnote}>单位：份 · 北京时间 · 仅统计当前账号可见的申请</p>
        <details className={styles.dataDisclosure}>
          <summary>查看逐日数据</summary>
          <div className="max-h-60 overflow-y-auto"><table className={styles.dataTable}><caption className="sr-only">近 {period} 天逐日申请数量</caption><thead><tr><th scope="col">日期</th><th scope="col">申请数（份）</th></tr></thead><tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.count}</td></tr>)}</tbody></table></div>
        </details>
      </section>
      <section className={`card ${styles.panel}`} aria-labelledby={distributionId}>
        <div>
          <h2 id={distributionId} className="font-semibold">AI 判断分布</h2>
          <p className="mt-1 text-xs text-muted">当前可见单据的现存判断记录</p>
        </div>
        <div className={styles.distribution}>
          <div className={styles.donut} style={{ background: segments.length ? `conic-gradient(${segments.join(", ")})` : "var(--color-line)" }} role="img" aria-label={attempts ? `共 ${attempts} 条判断记录。${data.outcomes.map((item) => `${outcomeStyle[item.outcome].label} ${item.count} 条`).join("，")}` : "暂无 AI 判断记录"}>
            <div className={styles.donutCenter}><strong className="text-3xl font-semibold tabular-nums">{attempts}</strong><span className="mt-0.5 text-[11px] text-muted">{attempts ? "判断记录" : "暂无记录"}</span></div>
          </div>
          <ul className={styles.legend}>
            {data.outcomes.map((item) => <li key={item.outcome}><span className={styles.swatch} style={{ background: item.count ? outcomeStyle[item.outcome].color : "var(--color-line)" }} /><span className="text-muted">{outcomeStyle[item.outcome].label}</span><span className={styles.legendCount}>{item.count}</span></li>)}
          </ul>
        </div>
        <p className={styles.footnote}>单位：条 · 重新判断可能替换旧记录，不代表历史调用总次数</p>
      </section>
    </div>
  );
}
