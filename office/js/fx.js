/* Warehouse Office — hiệu ứng pháo giấy (không có âm thanh, không có vòng lặp chạy nền) */
(function (MD) {
  'use strict';
  const FX = {};
  const lowPower = () => (window.matchMedia && (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 760px)').matches));

  FX.sound = () => {};

  FX.confetti = (n = 70) => {
    if (lowPower()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#facc15'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      p.style.animationDelay = Math.random() * 0.35 + 's';
      p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      if (i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  };

  FX.celebrate = () => FX.confetti();

  MD.FX = FX;
})(window.MD);
