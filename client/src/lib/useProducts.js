import { useEffect, useState } from 'react';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const fetchCatalog = async () => {
      try {
        const response = await fetch('/api/products', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Catalog request failed (${response.status})`);
        }

        const data = await response.json();
        if (!data.success || !Array.isArray(data.data)) {
          throw new Error('The catalog data received from the server is invalid.');
        }

        setProducts(data.data);
        setError('');
      } catch (requestError) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch data from the server:', requestError);
          setError('The catalog could not be loaded. Please try again later.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchCatalog();
    return () => controller.abort();
  }, []);

  return { products, isLoading, error };
}
