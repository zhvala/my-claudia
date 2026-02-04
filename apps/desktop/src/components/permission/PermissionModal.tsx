import { useState, useEffect } from 'react';

interface PermissionRequest {
  requestId: string;
  toolName: string;
  detail: string;
  timeoutSec: number;
}

interface PermissionModalProps {
  request: PermissionRequest | null;
  onDecision: (requestId: string, allow: boolean, remember?: boolean) => void;
}

export function PermissionModal({ request, onDecision }: PermissionModalProps) {
  const [remainingTime, setRemainingTime] = useState(0);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!request) return;

    setRemainingTime(request.timeoutSec);
    setRemember(false);

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          // Auto-deny on timeout
          onDecision(request.requestId, false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [request, onDecision]);

  if (!request) return null;

  const handleAllow = () => {
    onDecision(request.requestId, true, remember);
  };

  const handleDeny = () => {
    onDecision(request.requestId, false, remember);
  };

  const progressPercent = (remainingTime / request.timeoutSec) * 100;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-50" />

      {/* Modal */}
      <div data-testid="permission-dialog" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] bg-gray-800 rounded-lg shadow-2xl z-50 overflow-hidden">
        {/* Timeout progress bar */}
        <div className="h-1 bg-gray-700">
          <div
            className="h-full bg-yellow-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Permission Required</h2>
              <p className="text-sm text-gray-400">
                Claude wants to use a tool that requires your approval
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-3 border-t border-b border-gray-700">
          {/* Tool name */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-400">Tool:</span>
            <span className="px-2 py-0.5 bg-gray-700 rounded text-sm font-mono">
              {request.toolName}
            </span>
          </div>

          {/* Detail */}
          <div className="bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
              {request.detail}
            </pre>
          </div>

          {/* Timeout warning */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-gray-400">
              Auto-deny in{' '}
              <span className={remainingTime <= 10 ? 'text-red-400 font-semibold' : 'text-yellow-400'}>
                {remainingTime}s
              </span>
            </span>
          </div>
        </div>

        {/* Remember checkbox */}
        <div className="px-5 py-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-300">
              Remember this decision for this session
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 bg-gray-900/30 flex gap-3">
          <button
            onClick={handleDeny}
            className="flex-1 px-4 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium transition-colors"
          >
            Deny
          </button>
          <button
            onClick={handleAllow}
            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </>
  );
}
