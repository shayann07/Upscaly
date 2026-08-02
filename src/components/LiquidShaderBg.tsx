import React, { useEffect, useRef } from 'react';

interface LiquidShaderBgProps {
  isProcessing?: boolean;
}

export const LiquidShaderBg: React.FC<LiquidShaderBgProps> = ({ isProcessing = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = width / 2;
    let mouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    const orbs = [
      { x: width * 0.2, y: height * 0.3, radius: 280, color: '#36255C', vx: 0.4, vy: 0.3 },
      { x: width * 0.8, y: height * 0.7, radius: 320, color: '#23212C', vx: -0.3, vy: -0.4 },
      { x: width * 0.5, y: height * 0.5, radius: 240, color: '#4A3078', vx: 0.2, vy: -0.2 },
    ];

    let tick = 0;

    const render = () => {
      if (document.hidden || isProcessing) {
        animId = requestAnimationFrame(render);
        return;
      }

      tick += 0.01;
      ctx.fillStyle = '#16141D';
      ctx.fillRect(0, 0, width, height);

      orbs.forEach((orb, i) => {
        orb.x += orb.vx + Math.sin(tick + i) * 0.5;
        orb.y += orb.vy + Math.cos(tick + i) * 0.5;

        if (orb.x < -100 || orb.x > width + 100) orb.vx *= -1;
        if (orb.y < -100 || orb.y > height + 100) orb.vy *= -1;

        // Mouse reaction pull
        const dx = mouseX - orb.x;
        const dy = mouseY - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400) {
          orb.x += (dx / dist) * 0.3;
          orb.y += (dy / dist) * 0.3;
        }

        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius
        );
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(1, 'transparent');

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = 'source-over';
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [isProcessing]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
    />
  );
};
