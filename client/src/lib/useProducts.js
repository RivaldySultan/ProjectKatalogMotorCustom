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
          throw new Error(`Permintaan katalog gagal (${response.status})`);
        }

        const data = await response.json();
        if (!data.success || !Array.isArray(data.data)) {
          throw new Error('Format data katalog dari server tidak valid');
        }

        setProducts(data.data);
        setError('');
      } catch (requestError) {
        if (!controller.signal.aborted) {
          console.error('Gagal mengambil data dari server:', requestError);
          setError('Katalog belum dapat dimuat. Silakan coba lagi nanti.');
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
