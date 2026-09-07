// 数字滚动组件：金额变化时从旧值平滑滚动到新值（rAF，原生/Web 通用）
import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

export default function AnimatedNumber({
  value = 0,
  format,
  duration = 700,
  style,
  numberOfLines = 1,
  adjustsFontSizeToFit = false,
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return undefined;
    }
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // 记录当前显示值作为下次动画起点，避免跳变
      fromRef.current = from + (to - from) * Math.min(1, (Date.now() - start) / duration);
    };
  }, [value, duration]);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
    >
      {format ? format(display) : Math.round(display)}
    </Text>
  );
}
