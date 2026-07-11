"use client";

import { useEffect, useRef, useState } from "react";

const noiseCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*+?<>/\\";

type ScrambleTextProps = {
  text: string;
  accentFrom?: number;
  className?: string;
  delay?: number;
  stepDuration?: number;
};

function randomCharacter() {
  return noiseCharacters[Math.floor(Math.random() * noiseCharacters.length)];
}

export function ScrambleText({
  text,
  accentFrom = Number.POSITIVE_INFINITY,
  className = "",
  delay = 180,
  stepDuration = 72
}: ScrambleTextProps) {
  const textCharacters = Array.from(text);
  const rootRef = useRef<HTMLSpanElement>(null);
  const hasPlayed = useRef(false);
  const [displayText, setDisplayText] = useState(text);
  const [resolvedCount, setResolvedCount] = useState(textCharacters.length);

  useEffect(() => {
    setDisplayText(text);
    setResolvedCount(textCharacters.length);
    hasPlayed.current = false;

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      hasPlayed.current = true;
      return;
    }

    let animationFrame = 0;
    let startTime = 0;
    let lastNoiseFrame = -1;

    const play = () => {
      if (hasPlayed.current) {
        return;
      }

      hasPlayed.current = true;
      setResolvedCount(0);

      const animate = (timestamp: number) => {
        if (!startTime) {
          startTime = timestamp + delay;
        }

        const elapsed = Math.max(0, timestamp - startTime);
        const nextResolved = Math.min(textCharacters.length, Math.floor(elapsed / stepDuration));
        const noiseFrame = Math.floor(elapsed / 38);

        if (noiseFrame !== lastNoiseFrame || nextResolved === text.length) {
          lastNoiseFrame = noiseFrame;
          setResolvedCount(nextResolved);
          setDisplayText(
            textCharacters.map((character, index) => {
              if (character === " " || index < nextResolved) {
                return character;
              }

              return randomCharacter();
            }).join("")
          );
        }

        if (nextResolved < textCharacters.length) {
          animationFrame = window.requestAnimationFrame(animate);
        } else {
          setDisplayText(text);
        }
      };

      animationFrame = window.requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(root);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [delay, stepDuration, text]);

  return (
    <span
      ref={rootRef}
      className={`scramble-text ${className}`.trim()}
      aria-label={text}
    >
      <span aria-hidden="true">
        {Array.from(displayText, (character, index) => (
          <span
            className={`scramble-character${index < resolvedCount ? " is-resolved" : " is-noise"}${index >= accentFrom ? " is-accent" : ""}`}
            key={index}
          >
            <span className="scramble-character-size">{textCharacters[index]}</span>
            <span className="scramble-character-face">{character}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
