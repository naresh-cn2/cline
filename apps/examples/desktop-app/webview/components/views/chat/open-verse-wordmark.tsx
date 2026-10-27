"use client";

import { useEffect, useRef } from "react";

interface OpenVerseWordmarkProps {
	className?: string;
}

const LEFT_WORD = ["O", "P", "E", "N"];
const HYPHEN = "-";
const RIGHT_WORD = ["V", "E", "R", "S", "E"];

export function OpenVerseWordmark({ className = "" }: OpenVerseWordmarkProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Check for reduced motion preference
		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (motionQuery.matches) return;

		let rafId: number | null = null;
		let pointerX = -9999;
		let pointerY = -9999;
		let isPointerOver = false;

		const charData: Array<{
			currentOpacity: number;
			targetOpacity: number;
			currentDx: number;
			targetDx: number;
			currentDy: number;
			targetDy: number;
			currentGlow: number;
			targetGlow: number;
		}> = [];

		const totalChars = LEFT_WORD.length + 1 + RIGHT_WORD.length;
		for (let i = 0; i < totalChars; i++) {
			charData.push({
				currentOpacity: 0.35,
				targetOpacity: 0.35,
				currentDx: 0,
				targetDx: 0,
				currentDy: 0,
				targetDy: 0,
				currentGlow: 0,
				targetGlow: 0,
			});
		}

		const PROXIMITY_RADIUS = 180;
		const LERP_FACTOR = 0.18;

		const updateAnimation = () => {
			let needsNextFrame = false;

			charRefs.current.forEach((charEl, idx) => {
				if (!charEl) return;
				const data = charData[idx];

				if (isPointerOver && pointerX > -500) {
					const rect = charEl.getBoundingClientRect();
					const charCenterX = rect.left + rect.width / 2;
					const charCenterY = rect.top + rect.height / 2;

					const dist = Math.hypot(pointerX - charCenterX, pointerY - charCenterY);

					if (dist < PROXIMITY_RADIUS) {
						const factor = 1 - dist / PROXIMITY_RADIUS;
						const easeFactor = factor * factor; // Quad ease-in for sharper local peak

						data.targetOpacity = 0.35 + easeFactor * 0.6; // Up to 0.95
						data.targetGlow = easeFactor;

						// Pixel-snapped micro-displacement (0 to 3.5px quantized)
						const angle = Math.atan2(pointerY - charCenterY, pointerX - charCenterX);
						const pushDist = (1 - factor) * 3 * easeFactor;
						data.targetDx = Math.round(Math.cos(angle) * pushDist);
						data.targetDy = Math.round(Math.sin(angle) * pushDist);
					} else {
						data.targetOpacity = 0.35;
						data.targetGlow = 0;
						data.targetDx = 0;
						data.targetDy = 0;
					}
				} else {
					data.targetOpacity = 0.35;
					data.targetGlow = 0;
					data.targetDx = 0;
					data.targetDy = 0;
				}

				// Smooth interpolation
				data.currentOpacity += (data.targetOpacity - data.currentOpacity) * LERP_FACTOR;
				data.currentDx += (data.targetDx - data.currentDx) * LERP_FACTOR;
				data.currentDy += (data.targetDy - data.currentDy) * LERP_FACTOR;
				data.currentGlow += (data.targetGlow - data.currentGlow) * LERP_FACTOR;

				// Check if still moving
				const diffOpacity = Math.abs(data.targetOpacity - data.currentOpacity);
				const diffDx = Math.abs(data.targetDx - data.currentDx);
				const diffDy = Math.abs(data.targetDy - data.currentDy);
				const diffGlow = Math.abs(data.targetGlow - data.currentGlow);

				if (diffOpacity > 0.005 || diffDx > 0.05 || diffDy > 0.05 || diffGlow > 0.005) {
					needsNextFrame = true;
				}

				// Apply styles directly for maximum performance (no re-renders)
				const transform = `translate3d(${data.currentDx.toFixed(1)}px, ${data.currentDy.toFixed(1)}px, 0)`;
				charEl.style.transform = transform;
				charEl.style.opacity = data.currentOpacity.toFixed(3);

				if (data.currentGlow > 0.05) {
					const glowBlur = (data.currentGlow * 12).toFixed(1);
					const chromaticDx = (data.currentDx * 1.2).toFixed(1);
					const chromaticDy = (data.currentDy * 1.2).toFixed(1);
					charEl.style.textShadow = `${chromaticDx}px ${chromaticDy}px ${glowBlur}px oklch(from var(--primary, #6366f1) 0.85 0.22 h / ${(data.currentGlow * 0.75).toFixed(2)})`;
				} else {
					charEl.style.textShadow = "none";
				}
			});

			if (isPointerOver || needsNextFrame) {
				rafId = window.requestAnimationFrame(updateAnimation);
			} else {
				rafId = null;
			}
		};

		const handlePointerMove = (e: PointerEvent) => {
			pointerX = e.clientX;
			pointerY = e.clientY;
			isPointerOver = true;

			if (!rafId) {
				rafId = window.requestAnimationFrame(updateAnimation);
			}
		};

		const handlePointerLeave = () => {
			isPointerOver = false;
			pointerX = -9999;
			pointerY = -9999;

			if (!rafId) {
				rafId = window.requestAnimationFrame(updateAnimation);
			}
		};

		window.addEventListener("pointermove", handlePointerMove, { passive: true });
		document.addEventListener("mouseleave", handlePointerLeave, { passive: true });

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("mouseleave", handlePointerLeave);
			if (rafId) {
				window.cancelAnimationFrame(rafId);
			}
		};
	}, []);

	let globalCharIndex = 0;

	return (
		<div
			aria-label="OPEN-VERSE"
			className={`relative flex w-full max-w-4xl select-none items-center justify-center font-mono font-black tracking-[0.16em] sm:tracking-[0.22em] text-[clamp(2.75rem,7.5vw,5.25rem)] leading-none text-foreground ${className}`}
			ref={containerRef}
			role="img"
		>
			{/* Left section: OPEN - right aligned so it terminates right before the hyphen */}
			<div className="flex flex-1 items-center justify-end pr-1 sm:pr-2.5">
				{LEFT_WORD.map((char) => {
					const idx = globalCharIndex++;
					return (
						<span
							className="inline-block will-change-transform"
							key={`left-${char}-${idx}`}
							ref={(el) => {
								charRefs.current[idx] = el;
							}}
							style={{ opacity: 0.35 }}
						>
							{char}
						</span>
					);
				})}
			</div>

			{/* Center: - (Hyphen) precisely pinned at the exact 50% horizontal midpoint */}
			<div className="flex shrink-0 items-center justify-center px-1 sm:px-2">
				{(() => {
					const idx = globalCharIndex++;
					return (
						<span
							className="inline-block will-change-transform"
							key={`hyphen-${idx}`}
							ref={(el) => {
								charRefs.current[idx] = el;
							}}
							style={{ opacity: 0.35 }}
						>
							{HYPHEN}
						</span>
					);
				})()}
			</div>

			{/* Right section: VERSE - left aligned so it starts right after the hyphen */}
			<div className="flex flex-1 items-center justify-start pl-1 sm:pl-2.5">
				{RIGHT_WORD.map((char) => {
					const idx = globalCharIndex++;
					return (
						<span
							className="inline-block will-change-transform"
							key={`right-${char}-${idx}`}
							ref={(el) => {
								charRefs.current[idx] = el;
							}}
							style={{ opacity: 0.35 }}
						>
							{char}
						</span>
					);
				})}
			</div>
		</div>
	);
}
