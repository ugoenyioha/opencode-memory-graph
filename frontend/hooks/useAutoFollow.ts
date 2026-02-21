'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseAutoFollowOptions {
  enabled?: boolean;
  scrollContainer?: React.RefObject<HTMLElement>;
  pauseOnUserScroll?: boolean;
  resumeDelay?: number; // Auto-resume after N ms at bottom
}

interface UseAutoFollowResult {
  isFollowing: boolean;
  isPaused: boolean;
  resumeFollowing: () => void;
  pauseFollowing: () => void;
  scrollToBottom: () => void;
}

export function useAutoFollow(options: UseAutoFollowOptions = {}): UseAutoFollowResult {
  const {
    enabled = true,
    scrollContainer,
    pauseOnUserScroll = true,
    resumeDelay = 0,
  } = options;

  const [isFollowing, setIsFollowing] = useState(enabled);
  const [isPaused, setIsPaused] = useState(false);
  const lastScrollTopRef = useRef(0);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef(false);

  // Check if scrolled to bottom (within threshold)
  const isAtBottom = useCallback(() => {
    const container = scrollContainer?.current;
    if (!container) return true;

    const threshold = 50; // pixels from bottom
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    );
  }, [scrollContainer]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback(() => {
    const container = scrollContainer?.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [scrollContainer]);

  // Resume following
  const resumeFollowing = useCallback(() => {
    setIsFollowing(true);
    setIsPaused(false);
    scrollToBottom();
  }, [scrollToBottom]);

  // Pause following
  const pauseFollowing = useCallback(() => {
    setIsFollowing(false);
    setIsPaused(true);
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainer?.current;
    if (!container || !pauseOnUserScroll) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollingUp = currentScrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      // Detect user-initiated scroll (scrolling up or away from bottom)
      if (scrollingUp && isFollowing) {
        isUserScrollingRef.current = true;
        setIsFollowing(false);
        setIsPaused(true);
      }

      // If at bottom and was paused, consider resuming
      if (isAtBottom()) {
        if (userScrollTimeoutRef.current) {
          clearTimeout(userScrollTimeoutRef.current);
        }

        if (isPaused && resumeDelay > 0) {
          userScrollTimeoutRef.current = setTimeout(() => {
            setIsFollowing(true);
            setIsPaused(false);
            isUserScrollingRef.current = false;
          }, resumeDelay);
        } else if (isPaused && resumeDelay === 0) {
          // Immediate resume when at bottom
          setIsFollowing(true);
          setIsPaused(false);
          isUserScrollingRef.current = false;
        }
      }
    };

    // Use passive listener for performance
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [scrollContainer, pauseOnUserScroll, isFollowing, isPaused, isAtBottom, resumeDelay]);

  // Handle wheel events specifically to detect intentional user scrolling
  useEffect(() => {
    const container = scrollContainer?.current;
    if (!container || !pauseOnUserScroll) return;

    const handleWheel = (e: WheelEvent) => {
      // Scrolling up intentionally pauses following
      if (e.deltaY < 0 && isFollowing) {
        setIsFollowing(false);
        setIsPaused(true);
        isUserScrollingRef.current = true;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollContainer, pauseOnUserScroll, isFollowing]);

  return {
    isFollowing,
    isPaused,
    resumeFollowing,
    pauseFollowing,
    scrollToBottom,
  };
}
