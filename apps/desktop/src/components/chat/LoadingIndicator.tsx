import { useState, useEffect } from 'react';

interface LoadingIndicatorProps {
  isLoading: boolean;
}

const THINKING_MESSAGES = [
  'Thinking...',
  'Analyzing...',
  'Processing...',
  'Reasoning...',
  'Working on it...',
];

export function LoadingIndicator({ isLoading }: LoadingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  // Rotate through thinking messages
  useEffect(() => {
    if (!isLoading) {
      setMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Animate dots
  useEffect(() => {
    if (!isLoading) {
      setDots('');
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-fade-in">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
        <span className="text-primary text-sm">🤖</span>
      </div>

      {/* Loading content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          {/* Pulsing dots animation */}
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>

          {/* Thinking message */}
          <span className="text-sm text-muted-foreground">
            {THINKING_MESSAGES[messageIndex].replace('...', '')}{dots}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 w-48 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
