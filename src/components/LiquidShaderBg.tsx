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
      { x: width * 0.2, y: height * 0.2, radius: 450, color: 'rgba(124, 58, 237, 0.45)', vx: 0.3, vy: 0.2 },
      { x: width * 0.8, y: height * 0.8, radius: 550, color: 'rgba(236, 72, 153, 0.35)', vx: -0.2, vy: -0.3 },
      { x: width * 0.5, y: height * 0.5, radius: 400, color: 'rgba(59, 130, 246, 0.40)', vx: 0.25, vy: -0.25 },
      { x: width * 0.7, y: height * 0.3, radius: 350, color: 'rgba(241, 254, 200, 0.15)', vx: -0.3, vy: 0.4 },
    ];

    let tick = 0;

    const render = () => {
      if (document.hidden || isProcessing) {
        animId = requestAnimationFrame(render);
        return;
      }

      tick += 0.008;
      
      // Use a very dark, slightly purple cosmic color for the background
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0a0612';
      ctx.fillRect(0, 0, width, height);

      orbs.forEach((orb, i) => {
        orb.x += orb.vx + Math.sin(tick + i * 1.5) * 0.5;
        orb.y += orb.vy + Math.cos(tick + i * 1.5) * 0.5;

        if (orb.x < -200 || orb.x > width + 200) orb.vx *= -1;
        if (orb.y < -200 || orb.y > height + 200) orb.vy *= -1;

        // Mouse reaction pull - subtle
        const dx = mouseX - orb.x;
        const dy = mouseY - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 500) {
          orb.x += (dx / dist) * 0.2;
          orb.y += (dy / dist) * 0.2;
        }

        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius
        );
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(0.5, orb.color.replace(/0\.\d+\)/, '0.15)'));
        gradient.addColorStop(1, 'transparent');

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Add a subtle noise overlay or vignette if desired, for now keeping it clean

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
      className="fixed inset-0 pointer-events-none opacity-100 z-0"
    />
  );
};
