import React, { useEffect, useState } from 'react';

const NumberTicker = ({ value, duration = 1000 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    const targetValue = parseInt(value, 10) || 0;
    const startValue = count;
    
    // If we're already there, do nothing
    if (startValue === targetValue) return;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = currentTime - startTime;
      const t = Math.min(progress / duration, 1);
      
      // easeOutExpo curve
      const easeT = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      
      const currentVal = Math.floor(startValue + (targetValue - startValue) * easeT);
      setCount(currentVal);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(targetValue);
      }
    };

    const animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [value, duration]);

  return <span>{count}</span>;
};

export default NumberTicker;
