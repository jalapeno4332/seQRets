'use client';

import { useState, useEffect } from 'react';

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isOnline ? 'bg-red-500' : 'bg-green-500'
        }`}
      />
      <span className={isOnline ? 'text-red-500' : 'text-green-500'}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}
