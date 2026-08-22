import { useEffect, useRef, useState } from 'react';

interface ScoreBadgeProps {
  score: number;
  size?: number;
  caption?: string;
}

/**
 * 校徽式分数徽章 —— 学院藏蓝金方向的签名元素。
 * 金色表圈 + 藏蓝底 + 白色粗体数字；挂载时数字滚动到目标值（尊重 prefers-reduced-motion）。
 */
export function ScoreBadge({ score, size = 132, caption = '匹配度' }: ScoreBadgeProps) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(score);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(score * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

  const c = size / 2;
  const rOuter = c - 3;
  const rInner = c - 10;
  // 表圈刻度：每 6° 一格，正方位加粗描金
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${caption} ${score}`}
    >
      <circle cx={c} cy={c} r={rOuter} fill="var(--color-primary)" stroke="var(--color-gold)" strokeWidth="2.5" />
      <circle cx={c} cy={c} r={rInner} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      {ticks.map((deg) => {
        const major = deg % 90 === 0;
        return (
          <line
            key={deg}
            x1={c}
            y1={4.5}
            x2={c}
            y2={major ? 10 : 7.5}
            stroke={major ? 'var(--color-gold)' : 'rgba(255,255,255,0.28)'}
            strokeWidth={major ? 2 : 1}
            transform={`rotate(${deg} ${c} ${c})`}
          />
        );
      })}
      <text
        x={c}
        y={c + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={size * 0.3}
        fontWeight={800}
        className="score-num"
      >
        {display}
      </text>
      <text
        x={c}
        y={c + size * 0.27}
        textAnchor="middle"
        fill="var(--color-gold)"
        fontSize={size * 0.09}
        fontWeight={600}
        letterSpacing={size * 0.02}
      >
        {caption}
      </text>
    </svg>
  );
}
