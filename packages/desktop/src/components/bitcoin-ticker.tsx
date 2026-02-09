import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import bitcoinLogo from '@/assets/icons/bitcoin-logo.png';

export function BitcoinTicker() {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPrice = async () => {
      if (!isMounted) return;

      // Do not attempt to fetch if the browser is offline.
      if (!navigator.onLine) {
        if (price === null) { // Only set error if we have no price at all
            setError('Could not fetch price. You appear to be offline.');
        }
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/buy');
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const data = await response.json();
        const btcPrice = parseFloat(data?.data?.amount);

        if (isMounted) {
          if (btcPrice) {
            setPrice(btcPrice);
            setError(null);
          } else if (price === null) {
            setError('Price not found in API response.');
          }
        }
      } catch (err) {
        if (isMounted && price === null) {
          setError('Could not fetch price.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPrice();
    const intervalId = setInterval(fetchPrice, 15000);

    return () => {
      isMounted = false; 
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatPrice = (p: number | null) => {
    if (p === null) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(p);
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center gap-2 p-2 rounded-lg bg-muted/50 w-64 mx-auto">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading BTC price...</span>
      </div>
    );
  }

  if (error && price === null) {
    return (
        <div className="flex justify-center items-center gap-2 p-2 rounded-lg bg-destructive/10 w-64 mx-auto">
           <span className="text-sm text-destructive" title={error}>Could not load BTC price.</span>
        </div>
    );
  }

  return (
    <div className="flex justify-center items-center gap-3 p-2 rounded-lg bg-muted/50 w-64 mx-auto shadow-sm">
      <img src={bitcoinLogo} alt="Bitcoin Logo" width={24} height={24} />
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Bitcoin Price</p>
        <p className="text-xl font-bold text-foreground">{formatPrice(price)}</p>
      </div>
    </div>
  );
}
